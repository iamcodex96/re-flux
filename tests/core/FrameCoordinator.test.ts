import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { FrameCoordinator } from '../../src/core/FrameCoordinator.js';
import { RafController } from '../helpers/RafController.js';

const raf = new RafController();

beforeEach(() => raf.install());
afterEach(() => {
  raf.uninstall();
  jest.restoreAllMocks();
});

describe('FrameCoordinator', () => {
  it('runs reads before frame consumers and writes after them', () => {
    const coordinator = new FrameCoordinator();
    const order: string[] = [];
    const subscription = coordinator.frames$.subscribe(() => {
      order.push('frame');
      coordinator.scheduleWrite(() => order.push('write from frame'));
    });

    coordinator.scheduleRead(() => {
      order.push('read');
      coordinator.scheduleWrite(() => order.push('write from read'));
    });
    coordinator.scheduleWrite(() => order.push('scheduled write'));

    raf.advance(10);
    expect(order).toEqual([
      'read',
      'frame',
      'scheduled write',
      'write from read',
      'write from frame',
    ]);
    expect(raf.pendingCount).toBe(1);

    subscription.unsubscribe();
    expect(raf.pendingCount).toBe(0);
  });

  it('shares the timestamp delta between frame subscribers and clamps negative deltas', () => {
    const coordinator = new FrameCoordinator();
    const frames: Array<{ timestamp: number; delta: number; frame: number }> = [];
    const subscription = coordinator.frames$.subscribe((frame) => frames.push(frame));

    raf.advance(100);
    raf.advance(116);
    raf.advance(110);

    expect(frames.map(({ timestamp, delta, frame }) => [timestamp, delta, frame])).toEqual([
      [100, 0, 1],
      [116, 16, 2],
      [110, 0, 3],
    ]);
    subscription.unsubscribe();
    expect(raf.pendingCount).toBe(0);
  });

  it('cancels queued tasks and stops the RAF loop when no work remains', () => {
    const coordinator = new FrameCoordinator();
    const task = jest.fn();
    const subscription = coordinator.scheduleWrite(task);

    expect(raf.pendingCount).toBe(1);
    subscription.unsubscribe();
    expect(raf.pendingCount).toBe(0);

    raf.advance(16);
    expect(task).not.toHaveBeenCalled();
  });

  it('defers re-entrant reads until the next frame and re-entrant writes until the following write phase', () => {
    const coordinator = new FrameCoordinator();
    const events: string[] = [];
    coordinator.scheduleRead(() => {
      events.push('read-1');
      coordinator.scheduleRead(() => events.push('read-2'));
    });
    coordinator.scheduleWrite(() => {
      events.push('write-1');
      coordinator.scheduleWrite(() => events.push('write-2'));
    });

    raf.advance(0);
    expect(events).toEqual(['read-1', 'write-1']);
    expect(raf.pendingCount).toBe(1);
    raf.advance(16);
    expect(events).toEqual(['read-1', 'write-1', 'read-2', 'write-2']);
    expect(raf.pendingCount).toBe(0);
  });

  it('publishes frame-work metrics and exposes leak diagnostics without keeping the clock alive', () => {
    const coordinator = new FrameCoordinator();
    const metrics: Array<{ totalFrames: number; lastFrameWorkMs: number }> = [];
    const metricsSubscription = coordinator.metrics$.subscribe((sample) => metrics.push({
      totalFrames: sample.totalFrames,
      lastFrameWorkMs: sample.lastFrameWorkMs,
    }));
    expect(raf.pendingCount).toBe(0);
    const subscription = coordinator.frames$.subscribe();

    expect(coordinator.getDiagnostics().activeFrameSubscribers).toBe(1);
    expect(() => coordinator.assertIdle()).toThrow('FrameCoordinator is not idle');
    raf.advance(16);
    expect(coordinator.metrics.totalFrames).toBe(1);
    expect(coordinator.metrics.lastFrameWorkMs).toBeGreaterThanOrEqual(0);
    expect(metrics.at(-1)?.totalFrames).toBe(1);

    subscription.unsubscribe();
    expect(coordinator.getDiagnostics().isIdle).toBe(true);
    expect(() => coordinator.assertIdle()).not.toThrow();
    expect(raf.pendingCount).toBe(0);
    const frameCount = coordinator.metrics.totalFrames;
    metricsSubscription.unsubscribe();
    expect(coordinator.metrics.totalFrames).toBe(frameCount);
  });


  it('reports a fresh snapshot to late metrics subscribers and avoids timing samples when unobserved', () => {
    const coordinator = new FrameCoordinator();
    const frameSubscription = coordinator.frames$.subscribe();
    raf.advance(10);
    raf.advance(20);

    expect(coordinator.metrics.totalFrames).toBe(2);
    expect(coordinator.metrics.lastFrameWorkMs).toBe(0);

    const samples: Array<{ totalFrames: number; lastFrameWorkMs: number }> = [];
    const metricsSubscription = coordinator.metrics$.subscribe((sample) => {
      samples.push({ totalFrames: sample.totalFrames, lastFrameWorkMs: sample.lastFrameWorkMs });
    });
    expect(samples[0]?.totalFrames).toBe(2);

    raf.advance(30);
    expect(samples.at(-1)?.totalFrames).toBe(3);
    expect(coordinator.metrics.lastFrameWorkMs).toBeGreaterThanOrEqual(0);
    expect(coordinator.metrics.averageFrameWorkMs).toBe(coordinator.metrics.lastFrameWorkMs);

    metricsSubscription.unsubscribe();
    frameSubscription.unsubscribe();
  });

  it('defers reads scheduled from the write phase until the next frame', () => {
    const coordinator = new FrameCoordinator();
    const events: string[] = [];
    coordinator.scheduleWrite(() => {
      events.push('write');
      coordinator.scheduleRead(() => events.push('next read'));
    });

    raf.advance(0);
    expect(events).toEqual(['write']);
    expect(raf.pendingCount).toBe(1);
    raf.advance(16);
    expect(events).toEqual(['write', 'next read']);
    expect(raf.pendingCount).toBe(0);
  });
});
