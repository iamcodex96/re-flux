import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { FrameCoordinator, openWriteChannel } from '../../src/core/FrameCoordinator.js';
import { RafController } from '../helpers/RafController.js';

/**
 * Characterization of the per-phase delivery semantics of the frame coordinator (PERF-007).
 * Written against the implementation that copied the subscriber set every frame and removed tasks with
 * indexOf/splice; the same tests must keep passing after that bookkeeping is replaced.
 */
const raf = new RafController();

beforeEach(() => raf.install());
afterEach(() => {
  raf.uninstall();
  jest.restoreAllMocks();
});

describe('Given the per-phase delivery rules of FrameCoordinator', () => {
  describe('When a frame subscriber is added', () => {
    it('Then a subscriber added inside a read task receives that same frame', () => {
      const coordinator = new FrameCoordinator();
      const received: string[] = [];
      let late: { unsubscribe(): void } | undefined;
      coordinator.scheduleRead(() => {
        late = coordinator.frames$.subscribe(() => received.push('late'));
      });

      raf.advance(10);
      expect(received).toEqual(['late']);
      late?.unsubscribe();
    });

    it('Then a subscriber added by another consumer does not receive the frame being delivered', () => {
      const coordinator = new FrameCoordinator();
      const received: string[] = [];
      let late: { unsubscribe(): void } | undefined;
      const first = coordinator.frames$.subscribe(() => {
        received.push('first');
        late ??= coordinator.frames$.subscribe(() => received.push('late'));
      });

      raf.advance(10);
      expect(received).toEqual(['first']);
      raf.advance(20);
      expect(received).toEqual(['first', 'first', 'late']);
      first.unsubscribe();
      late?.unsubscribe();
    });

    it('Then a subscriber added inside a write task does not receive the frame, only the next', () => {
      const coordinator = new FrameCoordinator();
      const received: string[] = [];
      let late: { unsubscribe(): void } | undefined;
      coordinator.scheduleWrite(() => {
        late = coordinator.frames$.subscribe(() => received.push('late'));
      });

      raf.advance(10);
      expect(received).toEqual([]);
      raf.advance(20);
      expect(received).toEqual(['late']);
      late?.unsubscribe();
    });
  });

  describe('When a subscriber unsubscribes during a frame', () => {
    it('Then it receives no later callback in that frame, whichever order they were added in', () => {
      const coordinator = new FrameCoordinator();
      const received: string[] = [];
      const subscriptions: Array<{ unsubscribe(): void }> = [];
      subscriptions.push(coordinator.frames$.subscribe(() => {
        received.push('a');
        subscriptions[2]!.unsubscribe();
      }));
      subscriptions.push(coordinator.frames$.subscribe(() => received.push('b')));
      subscriptions.push(coordinator.frames$.subscribe(() => received.push('c')));

      raf.advance(10);
      expect(received).toEqual(['a', 'b']);
      expect(coordinator.getDiagnostics().activeFrameSubscribers).toBe(2);
      raf.advance(20);
      expect(received).toEqual(['a', 'b', 'a', 'b']);
      subscriptions.forEach((subscription) => subscription.unsubscribe());
      expect(coordinator.getDiagnostics().isIdle).toBe(true);
    });

    it('Then a subscriber that unsubscribes itself and one added in the same callback behave per the add rule', () => {
      const coordinator = new FrameCoordinator();
      const received: string[] = [];
      let replacement: { unsubscribe(): void } | undefined;
      const original = coordinator.frames$.subscribe(() => {
        received.push('original');
        original.unsubscribe();
        replacement = coordinator.frames$.subscribe(() => received.push('replacement'));
      });

      raf.advance(10);
      raf.advance(20);
      expect(received).toEqual(['original', 'replacement']);
      replacement?.unsubscribe();
      expect(coordinator.getDiagnostics().isIdle).toBe(true);
    });

    it('Then membership changes between frames are reflected without stale entries', () => {
      const coordinator = new FrameCoordinator();
      const received: string[] = [];
      const a = coordinator.frames$.subscribe(() => received.push('a'));
      const b = coordinator.frames$.subscribe(() => received.push('b'));
      raf.advance(10);
      a.unsubscribe();
      const c = coordinator.frames$.subscribe(() => received.push('c'));
      raf.advance(20);
      expect(received).toEqual(['a', 'b', 'b', 'c']);
      b.unsubscribe();
      c.unsubscribe();
    });
  });

  describe('When writes and reads are scheduled from different phases', () => {
    it('Then a write scheduled in the consumer phase runs in the same frame', () => {
      const coordinator = new FrameCoordinator();
      const order: string[] = [];
      const subscription = coordinator.frames$.subscribe(() => {
        order.push('consumer');
        coordinator.scheduleWrite(() => order.push('write'));
      });

      raf.advance(10);
      expect(order).toEqual(['consumer', 'write']);
      subscription.unsubscribe();
    });

    it('Then a write scheduled inside a write task runs next frame', () => {
      const coordinator = new FrameCoordinator();
      const order: string[] = [];
      coordinator.scheduleWrite(() => {
        order.push('first');
        coordinator.scheduleWrite(() => order.push('second'));
      });

      raf.advance(10);
      expect(order).toEqual(['first']);
      expect(coordinator.getDiagnostics().pendingWriteTasks).toBe(1);
      raf.advance(20);
      expect(order).toEqual(['first', 'second']);
      expect(coordinator.getDiagnostics().isIdle).toBe(true);
    });

    it('Then a read scheduled after the read phase runs next frame', () => {
      const coordinator = new FrameCoordinator();
      const order: string[] = [];
      let scheduled = false;
      const subscription = coordinator.frames$.subscribe(() => {
        order.push('consumer');
        if (scheduled) return;
        scheduled = true;
        coordinator.scheduleRead(() => order.push('read'));
      });

      raf.advance(10);
      expect(order).toEqual(['consumer']);
      raf.advance(20);
      expect(order).toEqual(['consumer', 'read', 'consumer']);
      subscription.unsubscribe();
      expect(coordinator.getDiagnostics().isIdle).toBe(true);
    });

    it('Then tasks run in scheduling order and pending counts drop to zero while they run', () => {
      const coordinator = new FrameCoordinator();
      const order: number[] = [];
      const pendingSeen: number[] = [];
      for (let index = 0; index < 5; index += 1) {
        coordinator.scheduleWrite(() => {
          order.push(index);
          pendingSeen.push(coordinator.getDiagnostics().pendingWriteTasks);
        });
      }
      expect(coordinator.getDiagnostics().pendingWriteTasks).toBe(5);

      raf.advance(10);
      expect(order).toEqual([0, 1, 2, 3, 4]);
      expect(pendingSeen).toEqual([0, 0, 0, 0, 0]);
    });
  });

  describe('When tasks are cancelled', () => {
    it('Then a task cancelled by an earlier task in the same batch never runs', () => {
      const coordinator = new FrameCoordinator();
      const order: string[] = [];
      const later = jest.fn(() => order.push('later'));
      let laterSubscription: { unsubscribe(): void } | undefined;
      coordinator.scheduleWrite(() => {
        order.push('canceller');
        laterSubscription?.unsubscribe();
      });
      laterSubscription = coordinator.scheduleWrite(later);
      coordinator.scheduleWrite(() => order.push('last'));

      raf.advance(10);
      expect(order).toEqual(['canceller', 'last']);
      expect(later).not.toHaveBeenCalled();
      expect(coordinator.getDiagnostics().isIdle).toBe(true);
    });

    it('Then cancelling a task from a frame consumer keeps the other tasks in order', () => {
      const coordinator = new FrameCoordinator();
      const order: string[] = [];
      const subscriptions = [
        coordinator.scheduleWrite(() => order.push('w0')),
        coordinator.scheduleWrite(() => order.push('w1')),
        coordinator.scheduleWrite(() => order.push('w2')),
        coordinator.scheduleWrite(() => order.push('w3')),
      ];
      subscriptions[1]!.unsubscribe();
      expect(coordinator.getDiagnostics().pendingWriteTasks).toBe(3);
      subscriptions[2]!.unsubscribe();
      expect(coordinator.getDiagnostics().pendingWriteTasks).toBe(2);

      raf.advance(10);
      expect(order).toEqual(['w0', 'w3']);
    });

    it('Then cancelling one of two kinds keeps the clock alive for the other', () => {
      const coordinator = new FrameCoordinator();
      const write = jest.fn();
      const readSubscription = coordinator.scheduleRead(() => undefined);
      coordinator.scheduleWrite(write);
      readSubscription.unsubscribe();
      expect(raf.pendingCount).toBe(1);
      expect(coordinator.getDiagnostics()).toMatchObject({ pendingReadTasks: 0, pendingWriteTasks: 1, isIdle: false });

      raf.advance(10);
      expect(write).toHaveBeenCalledTimes(1);
      expect(coordinator.getDiagnostics().isIdle).toBe(true);
    });

    it('Then cancelling every pending task of a large batch leaves the coordinator idle', () => {
      const coordinator = new FrameCoordinator();
      const ran = jest.fn();
      const subscriptions = Array.from({ length: 10_000 }, (_, index) => (index % 2 === 0
        ? coordinator.scheduleWrite(ran)
        : coordinator.scheduleRead(ran)));
      expect(coordinator.getDiagnostics()).toMatchObject({ pendingReadTasks: 5_000, pendingWriteTasks: 5_000 });

      for (const subscription of subscriptions) subscription.unsubscribe();

      expect(coordinator.getDiagnostics().isIdle).toBe(true);
      expect(coordinator.getDiagnostics()).toMatchObject({ pendingReadTasks: 0, pendingWriteTasks: 0, clockActive: false });
      expect(raf.pendingCount).toBe(0);
      raf.advance(10);
      expect(ran).not.toHaveBeenCalled();
    });

    it('Then a partly cancelled large batch runs exactly the survivors, in order', () => {
      const coordinator = new FrameCoordinator();
      const order: number[] = [];
      const subscriptions = Array.from({ length: 2_000 }, (_, index) => coordinator.scheduleWrite(() => order.push(index)));
      subscriptions.forEach((subscription, index) => { if (index % 3 !== 0) subscription.unsubscribe(); });

      expect(coordinator.getDiagnostics().pendingWriteTasks).toBe(667);
      raf.advance(10);
      expect(order).toEqual(Array.from({ length: 667 }, (_, index) => index * 3));
      expect(coordinator.getDiagnostics().isIdle).toBe(true);
    });

    it('Then tasks scheduled after a mass cancel are queued and run normally', () => {
      const coordinator = new FrameCoordinator();
      const cancelled = Array.from({ length: 500 }, () => coordinator.scheduleWrite(() => undefined));
      cancelled.forEach((subscription) => subscription.unsubscribe());
      const ran = jest.fn();
      coordinator.scheduleWrite(ran);

      expect(coordinator.getDiagnostics().pendingWriteTasks).toBe(1);
      raf.advance(10);
      expect(ran).toHaveBeenCalledTimes(1);
      expect(coordinator.getDiagnostics().isIdle).toBe(true);
    });

    it('Then disposing a write channel that is queued among cancelled tasks keeps counts exact', () => {
      const coordinator = new FrameCoordinator();
      const drawn = jest.fn();
      const channel = openWriteChannel(drawn, coordinator);
      const others = Array.from({ length: 100 }, () => coordinator.scheduleWrite(() => undefined));
      channel.request();
      others.forEach((subscription) => subscription.unsubscribe());
      expect(coordinator.getDiagnostics().pendingWriteTasks).toBe(1);
      channel.dispose();
      expect(coordinator.getDiagnostics().isIdle).toBe(true);
      channel.request();
      raf.advance(10);
      expect(drawn).not.toHaveBeenCalled();
    });
  });

  describe('When a task throws', () => {
    it('Then the other tasks of the phase still run and the error is rethrown asynchronously', () => {
      const coordinator = new FrameCoordinator();
      const uncaught: unknown[] = [];
      const original = globalThis.queueMicrotask;
      globalThis.queueMicrotask = ((task: () => void) => { try { task(); } catch (error) { uncaught.push(error); } }) as typeof queueMicrotask;
      try {
        const order: string[] = [];
        coordinator.scheduleRead(() => { order.push('read-1'); throw new Error('read failed'); });
        coordinator.scheduleRead(() => order.push('read-2'));
        const subscription = coordinator.frames$.subscribe(() => order.push('consumer'));
        coordinator.scheduleWrite(() => { order.push('write-1'); throw new Error('write failed'); });
        coordinator.scheduleWrite(() => order.push('write-2'));

        raf.advance(10);
        expect(order).toEqual(['read-1', 'read-2', 'consumer', 'write-1', 'write-2']);
        expect(uncaught.map((error) => (error as Error).message)).toEqual(['read failed', 'write failed']);
        subscription.unsubscribe();
        expect(coordinator.getDiagnostics().isIdle).toBe(true);
      } finally {
        globalThis.queueMicrotask = original;
      }
    });
  });

  describe('When the clock stops and starts again', () => {
    it('Then a fresh subscriber after a fully idle period still receives frames with a zero first delta', () => {
      const coordinator = new FrameCoordinator();
      const first = coordinator.frames$.subscribe(() => undefined);
      raf.advance(10);
      first.unsubscribe();
      expect(coordinator.getDiagnostics().isIdle).toBe(true);

      const deltas: number[] = [];
      const second = coordinator.frames$.subscribe((frame) => deltas.push(frame.delta));
      raf.advance(500);
      raf.advance(516);
      expect(deltas).toEqual([0, 16]);
      second.unsubscribe();
    });
  });

  describe('When requestAnimationFrame fails while work is queued', () => {
    it('Then every queued task is released and every subscriber receives the error', () => {
      const coordinator = new FrameCoordinator();
      const task = jest.fn();
      const errors: unknown[] = [];
      raf.uninstall();
      Reflect.deleteProperty(globalThis, 'requestAnimationFrame');
      Reflect.deleteProperty(globalThis, 'cancelAnimationFrame');

      expect(() => coordinator.scheduleWrite(task)).toThrow();
      expect(() => coordinator.scheduleRead(task)).toThrow();
      coordinator.frames$.subscribe({ error: (error: unknown) => errors.push(error) });
      expect(errors).toHaveLength(1);
      expect(coordinator.getDiagnostics().isIdle).toBe(true);
      raf.install();
    });
  });
});
