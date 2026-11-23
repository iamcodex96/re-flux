import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import type { Subscription } from 'rxjs';
import { FrameCoordinator } from '../../src/core/FrameCoordinator.js';
import { RafController } from '../helpers/RafController.js';

/**
 * PERF-007: random schedule/cancel/re-schedule traces against a trivially correct reference model of the task queues
 * (one array per phase, a batch detached per frame, cancelled entries skipped). The coordinator must run the same
 * tasks in the same order and report the same pending counts at every step, whatever bookkeeping it uses.
 */
const raf = new RafController();

beforeEach(() => raf.install());
afterEach(() => raf.uninstall());

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Phase = 'read' | 'write';
interface Script {
  readonly spawn: Phase | null;
  readonly cancelOffset: number | null;
}

function createScripts(random: () => number, count: number): Script[] {
  return Array.from({ length: count }, () => {
    const spawnRoll = random();
    const cancelRoll = random();
    return {
      spawn: spawnRoll < 0.2 ? 'read' : spawnRoll < 0.4 ? 'write' : null,
      cancelOffset: cancelRoll < 0.25 ? Math.floor(random() * 40) : null,
    };
  });
}

function runReference(seed: number, frames: number): { trace: string[]; pending: Array<[number, number]> } {
  const random = mulberry32(seed);
  const scripts = createScripts(random, 20_000);
  const trace: string[] = [];
  const pending: Array<[number, number]> = [];
  const queues: Record<Phase, number[]> = { read: [], write: [] };
  const cancelled = new Set<number>();
  const live = new Set<number>();
  let nextId = 0;
  const schedule = (phase: Phase): void => {
    const id = nextId++;
    queues[phase].push(id);
    live.add(id);
  };
  const runBatch = (phase: Phase): void => {
    const batch = queues[phase];
    queues[phase] = [];
    for (const id of batch) {
      if (cancelled.has(id)) continue;
      live.delete(id);
      trace.push(`${phase}${id}`);
      const script = scripts[id]!;
      if (script.cancelOffset !== null) {
        const target = id + 1 + script.cancelOffset;
        if (live.has(target) && !cancelled.has(target)) {
          cancelled.add(target);
          live.delete(target);
        }
      }
      if (script.spawn) schedule(script.spawn);
    }
  };
  for (let frame = 0; frame < frames; frame += 1) {
    const burst = Math.floor(random() * 30);
    for (let index = 0; index < burst; index += 1) schedule(random() < 0.5 ? 'read' : 'write');
    // Pre-frame cancellations by index into the live set, in id order.
    const victims = [...live].sort((a, b) => a - b).filter(() => random() < 0.3);
    for (const id of victims) {
      cancelled.add(id);
      live.delete(id);
    }
    pending.push([
      queues.read.filter((id) => !cancelled.has(id)).length,
      queues.write.filter((id) => !cancelled.has(id)).length,
    ]);
    runBatch('read');
    runBatch('write');
  }
  return { trace, pending };
}

function runCoordinator(seed: number, frames: number): { trace: string[]; pending: Array<[number, number]> } {
  const random = mulberry32(seed);
  const scripts = createScripts(random, 20_000);
  const coordinator = new FrameCoordinator();
  const trace: string[] = [];
  const pending: Array<[number, number]> = [];
  const subscriptions = new Map<number, Subscription>();
  const done = new Set<number>();
  let nextId = 0;
  const schedule = (phase: Phase): void => {
    const id = nextId++;
    const task = (): void => {
      done.add(id);
      subscriptions.delete(id);
      trace.push(`${phase}${id}`);
      const script = scripts[id]!;
      if (script.cancelOffset !== null) {
        const target = id + 1 + script.cancelOffset;
        const subscription = subscriptions.get(target);
        if (subscription) {
          subscription.unsubscribe();
          subscriptions.delete(target);
        }
      }
      if (script.spawn) schedule(script.spawn);
    };
    subscriptions.set(id, phase === 'read' ? coordinator.scheduleRead(task) : coordinator.scheduleWrite(task));
  };
  for (let frame = 0; frame < frames; frame += 1) {
    const burst = Math.floor(random() * 30);
    for (let index = 0; index < burst; index += 1) schedule(random() < 0.5 ? 'read' : 'write');
    const victims = [...subscriptions.keys()].sort((a, b) => a - b).filter(() => random() < 0.3);
    for (const id of victims) {
      subscriptions.get(id)!.unsubscribe();
      subscriptions.delete(id);
    }
    const diagnostics = coordinator.getDiagnostics();
    pending.push([diagnostics.pendingReadTasks, diagnostics.pendingWriteTasks]);
    raf.advance(frame * 16);
  }
  // Drain whatever is still queued so the shared RAF source is released for the next case.
  for (const subscription of subscriptions.values()) subscription.unsubscribe();
  expect(coordinator.getDiagnostics().isIdle).toBe(true);
  return { trace, pending };
}

describe('Given random schedule and cancel traces', () => {
  describe('When the coordinator is compared with a reference model', () => {
    it.each(Array.from({ length: 40 }, (_, index) => index + 1))(
      'Then seed %i runs the same tasks in the same order with the same pending counts',
      (seed) => {
        const reference = runReference(seed, 120);
        const actual = runCoordinator(seed, 120);
        expect(actual.trace).toEqual(reference.trace);
        expect(actual.pending).toEqual(reference.pending);
        expect(reference.trace.length).toBeGreaterThan(100);
      },
    );
  });
});
