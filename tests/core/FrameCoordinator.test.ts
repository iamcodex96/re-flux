import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { FrameCoordinator } from '../../src/core/FrameCoordinator.js';
import { RafController } from '../helpers/RafController.js';

const raf = new RafController();

beforeEach(() => raf.install());
afterEach(() => {
  raf.uninstall();
  jest.restoreAllMocks();
});

describe('Given FrameCoordinator', () => {
  describe('When queued reads, frame consumers and writes', () => {
    describe('And When a frame runs', () => {
      it('Then reads precede consumers and writes follow them', () => {
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
    });
  });

  describe('When many consumers subscribe to the shared clock', () => {
    describe('And When one frame is broadcast and every consumer unsubscribes', () => {
      it('Then one RAF loop serves all consumers and teardown leaves no pending work', () => {
        const coordinator = new FrameCoordinator();
        const consumerCount = 250;
        const receivedFrames = Array.from({ length: consumerCount }, () => 0);
        const subscriptions = receivedFrames.map((_, index) => coordinator.frames$.subscribe(() => {
          receivedFrames[index] = (receivedFrames[index] ?? 0) + 1;
        }));

        expect(raf.pendingCount).toBe(1);

        raf.advance(16);

        expect(receivedFrames).toEqual(Array.from({ length: consumerCount }, () => 1));
        expect(raf.pendingCount).toBe(1);

        for (const subscription of subscriptions) subscription.unsubscribe();

        expect(raf.pendingCount).toBe(0);
        expect(coordinator.getDiagnostics()).toMatchObject({
          isIdle: true,
          activeFrameSubscribers: 0,
          pendingReadTasks: 0,
          pendingWriteTasks: 0,
          clockActive: false,
        });
        expect(() => coordinator.assertIdle()).not.toThrow();
      });
    });
  });

  describe('When multiple frame subscribers are active', () => {
    describe('And When timestamps advance or move backward', () => {
      it('Then they share a delta and negative deltas are clamped', () => {
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
    });
  });

  describe('When a task is queued', () => {
    describe('And When its subscription is cancelled', () => {
      it('Then the task and RAF loop are cancelled if no work remains', () => {
        const coordinator = new FrameCoordinator();
        const task = jest.fn();
        const subscription = coordinator.scheduleWrite(task);

        expect(raf.pendingCount).toBe(1);
        subscription.unsubscribe();
        expect(raf.pendingCount).toBe(0);

        raf.advance(16);
        expect(task).not.toHaveBeenCalled();
      });
    });
  });

  describe('When tasks schedule more tasks while executing', () => {
    describe('And When the frame phases finish', () => {
      it('Then re-entrant work is deferred to the next allowed phase', () => {
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
    });
  });

  describe('When frame metrics are observed', () => {
    describe('And When frame work runs and is unsubscribed', () => {
      it('Then diagnostics update without keeping the clock alive', () => {
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
    });
  });

  describe('When metrics are first observed after frames have run', () => {
    describe('And When another frame completes', () => {
      it('Then subscribers receive a fresh snapshot and timing is sampled only while observed', () => {
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
    });
  });

  describe('When a write schedules a read', () => {
    describe('And When the current frame ends', () => {
      it('Then the read runs on the next frame', () => {
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
  });
});
