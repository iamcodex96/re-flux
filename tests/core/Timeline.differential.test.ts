import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import { Animation } from '../../src/core/Animation.js';
import { frameCoordinator } from '../../src/core/FrameCoordinator.js';
import { Timeline } from '../../src/core/Timeline.js';
import { Keyframes } from '../../src/values/Keyframes.js';
import { Tween } from '../../src/values/Tween.js';
import type { AnimatableItem, TimelineOffset, TimelineOptions } from '../../src/types/animation.js';
import { LegacyTimeline } from '../helpers/legacy/LegacyTimeline.js';
import { RafController } from '../helpers/RafController.js';

/**
 * PERF-009: the optimized Timeline must be indistinguishable from the version that visited every segment on every
 * update. Random timelines (Animations, Tweens, Keyframes, nested Timelines, call markers and custom items at random
 * and overlapping offsets) are driven by random seeks, progress seeks and clock frames in both directions, restarts and
 * structure edits; every child callback, every custom-item call and the playhead state after each step must match.
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

interface TimelineLike extends AnimatableItem {
  readonly currentTime: number;
  readonly progress$: { readonly value: number };
  readonly state$: { readonly value: string };
  add(item: AnimatableItem, offset?: TimelineOffset): this;
  call(callback: () => void, offset?: TimelineOffset): this;
  addLabel(name: string, offset?: TimelineOffset): this;
  seek(ms: number): this;
  seekProgress(progress: number): this;
  play(): this;
  pause(): this;
  stop(): this;
  restart(): this;
  reverse(): this;
  timeScale(value: number): this;
}
type TimelineCtor = new (options?: TimelineOptions) => TimelineLike;

const pick = <T>(random: () => number, values: readonly T[]): T => values[Math.floor(random() * values.length)]!;
const int = (random: () => number, min: number, max: number): number => min + Math.floor(random() * (max - min + 1));

function randomOffset(random: () => number, labels: readonly string[]): TimelineOffset | undefined {
  const roll = random();
  if (roll < 0.35) return undefined;
  if (roll < 0.6) return int(random, 0, 12) * 25;
  if (roll < 0.7) return '<';
  if (roll < 0.8) return `+=${int(random, 0, 60)}`;
  if (roll < 0.88) return `-=${int(random, 0, 60)}`;
  if (roll < 0.94 && labels.length > 0) return pick(random, labels);
  return int(random, 0, 300);
}

function fill(Ctor: TimelineCtor, random: () => number, log: string[], prefix: string, depth: number): TimelineLike {
  const note = (event: string) => (): void => {
    log.push(`${prefix}:${event}`);
  };
  const timeline = new Ctor({
    onStart: note('T.start'),
    onUpdate: (progress) => log.push(`${prefix}:T.update:${progress}`),
    onComplete: note('T.complete'),
    onPause: note('T.pause'),
    onResume: note('T.resume'),
    onStop: note('T.stop'),
  });
  const labels: string[] = [];
  const count = int(random, 1, depth === 0 ? 14 : 5);
  for (let index = 0; index < count; index += 1) {
    const id = `${prefix}.${index}`;
    const kind = pick(random, [
      'anim',
      'anim',
      'anim',
      'tween',
      'keyframes',
      'call',
      'call',
      'custom',
      depth < 2 ? 'nested' : 'anim',
    ] as const);
    const offset = randomOffset(random, labels);
    const duration = random() < 0.1 ? 0 : int(random, 1, 160);
    const options = {
      duration,
      ...(random() < 0.3 ? { delay: int(random, 0, 40) } : {}),
      ...(random() < 0.2 ? { repeat: int(random, 1, 2), yoyo: random() < 0.5 } : {}),
      onStart: note(`${id}.start`),
      onComplete: note(`${id}.complete`),
      onStop: note(`${id}.stop`),
      onPause: note(`${id}.pause`),
      onResume: note(`${id}.resume`),
    };
    try {
      if (kind === 'anim') {
        timeline.add(
          new Animation({ ...options, onUpdate: (progress, eased) => log.push(`${id}.update:${progress}:${eased}`) }),
          offset,
        );
      } else if (kind === 'tween') {
        timeline.add(
          new Tween({
            ...options,
            from: 0,
            to: 100,
            onUpdate: (value, progress) => log.push(`${id}.update:${value}:${progress}`),
          }),
          offset,
        );
      } else if (kind === 'keyframes') {
        timeline.add(
          new Keyframes({
            ...options,
            keyframes: [{ value: 0 }, { value: 10, offset: 0.3 }, { value: 40 }],
            onUpdate: (value, progress) => log.push(`${id}.update:${value}:${progress}`),
          }),
          offset,
        );
      } else if (kind === 'call') {
        timeline.call(note(`${id}.call`), offset);
      } else if (kind === 'custom') {
        timeline.add(
          {
            duration: int(random, 0, 120),
            seekLocal: (local, preserve) => {
              log.push(`${id}.seekLocal:${local}:${String(preserve)}`);
            },
            resetInternal: () => {
              log.push(`${id}.reset`);
            },
          },
          offset,
        );
      } else {
        timeline.add(fill(Ctor, random, log, id, depth + 1), offset);
      }
    } catch (error) {
      log.push(`${id}.add-error:${(error as Error).message}`);
    }
    if (random() < 0.15) {
      const name = `label${labels.length}`;
      try {
        timeline.addLabel(name, randomOffset(random, labels));
        labels.push(name);
      } catch {
        /* duplicate or invalid */
      }
    }
  }
  return timeline;
}

function run(Ctor: TimelineCtor, seed: number): string[] {
  const random = mulberry32(seed);
  const log: string[] = [];
  const timeline = fill(Ctor, random, log, 'root', 0);
  const duration = timeline.duration;
  const span = Number.isFinite(duration) && duration > 0 ? duration : 400;
  let now = 0;
  const snapshot = (step: string): void => {
    log.push(`#${step} t=${timeline.currentTime} p=${timeline.progress$.value} s=${timeline.state$.value}`);
  };
  const guarded = (step: string, action: () => void): void => {
    try {
      action();
    } catch (error) {
      log.push(`#${step} error:${(error as Error).message}`);
    }
    snapshot(step);
  };
  const operations = int(random, 8, 40);
  for (let step = 0; step < operations; step += 1) {
    const roll = random();
    if (roll < 0.34) {
      const target = random() < 0.35 ? int(random, 0, Math.ceil(span / 25)) * 25 : random() * span * 1.15;
      guarded(`${step}:seek:${target}`, () => {
        timeline.seek(target);
      });
    } else if (roll < 0.42) {
      const progress = random() * 1.2 - 0.1;
      guarded(`${step}:seekProgress:${progress}`, () => {
        timeline.seekProgress(progress);
      });
    } else if (roll < 0.74) {
      guarded(`${step}:play`, () => {
        timeline.play();
      });
      const frames = int(random, 1, 14);
      for (let frame = 0; frame < frames; frame += 1) {
        now += random() < 0.15 ? 0 : int(random, 1, 70);
        guarded(`${step}:frame:${now}`, () => {
          raf.advance(now);
        });
      }
    } else if (roll < 0.8) {
      guarded(`${step}:reverse`, () => {
        timeline.reverse();
      });
      const frames = int(random, 1, 10);
      for (let frame = 0; frame < frames; frame += 1) {
        now += int(random, 1, 70);
        guarded(`${step}:frame:${now}`, () => {
          raf.advance(now);
        });
      }
    } else if (roll < 0.85) {
      guarded(`${step}:pause`, () => {
        timeline.pause();
      });
    } else if (roll < 0.9) {
      guarded(`${step}:stop`, () => {
        timeline.stop();
      });
    } else if (roll < 0.94) {
      guarded(`${step}:restart`, () => {
        timeline.restart();
      });
    } else if (roll < 0.97) {
      guarded(`${step}:timeScale`, () => {
        timeline.timeScale(pick(random, [0.5, 1, 2, 3]));
      });
    } else {
      guarded(`${step}:late-add`, () => {
        timeline.stop();
        const id = `late${step}`;
        timeline.add(
          new Animation({
            duration: int(random, 1, 120),
            onUpdate: (progress) => log.push(`${id}.update:${progress}`),
            onComplete: () => log.push(`${id}.complete`),
          }),
          int(random, 0, 200),
        );
      });
    }
  }
  guarded('final:stop', () => {
    timeline.stop();
  });
  frameCoordinator.assertIdle();
  return log;
}

describe('Given random timelines driven by seeks, frames and structure edits', () => {
  describe('When the optimized Timeline is compared with the pre-PERF-009 implementation', () => {
    it.each(Array.from({ length: 250 }, (_, index) => index + 1))(
      'Then seed %i produces an identical trace',
      (seed) => {
        const legacy = run(LegacyTimeline as unknown as TimelineCtor, seed);
        const actual = run(Timeline as unknown as TimelineCtor, seed);
        expect(actual).toEqual(legacy);
        expect(legacy.length).toBeGreaterThan(10);
      },
    );
  });
});
