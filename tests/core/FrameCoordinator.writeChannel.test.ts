import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { FrameCoordinator, openWriteChannel } from '../../src/core/FrameCoordinator.js';
import { RafController } from '../helpers/RafController.js';

const raf = new RafController();

beforeEach(() => raf.install());
afterEach(() => {
  raf.uninstall();
  jest.restoreAllMocks();
});

describe('Given a FrameCoordinator write channel (PERF-008)', () => {
  describe('When request() is called several times before a frame', () => {
    it('Then the callback runs once in the write phase, after consumers, and the queue is empty afterwards', () => {
      const coordinator = new FrameCoordinator();
      const order: string[] = [];
      const consumer = coordinator.frames$.subscribe(() => order.push('consumer'));
      const channel = openWriteChannel(() => order.push('channel'), coordinator);

      channel.request();
      channel.request();
      channel.request();
      expect(coordinator.getDiagnostics().pendingWriteTasks).toBe(1);

      raf.advance(10);
      expect(order).toEqual(['consumer', 'channel']);
      expect(coordinator.getDiagnostics().pendingWriteTasks).toBe(0);

      channel.request();
      raf.advance(20);
      expect(order).toEqual(['consumer', 'channel', 'consumer', 'channel']);

      consumer.unsubscribe();
      channel.dispose();
      expect(coordinator.getDiagnostics().isIdle).toBe(true);
    });
  });

  describe('When the callback calls request() on itself', () => {
    it('Then the follow-up run happens in the next frame, not in the current one', () => {
      const coordinator = new FrameCoordinator();
      let runs = 0;
      const channel = openWriteChannel(() => { runs += 1; if (runs < 3) channel.request(); }, coordinator);

      channel.request();
      raf.advance(10);
      expect(runs).toBe(1);
      raf.advance(20);
      expect(runs).toBe(2);
      raf.advance(30);
      expect(runs).toBe(3);
      raf.advance(40);
      expect(runs).toBe(3);
      expect(coordinator.getDiagnostics().isIdle).toBe(true);
    });
  });

  describe('When the channel is disposed', () => {
    it('Then a queued run is dropped, the clock stops, and later requests are ignored', () => {
      const coordinator = new FrameCoordinator();
      const callback = jest.fn();
      const channel = openWriteChannel(callback, coordinator);

      channel.request();
      channel.dispose();
      channel.dispose();
      expect(coordinator.getDiagnostics().isIdle).toBe(true);
      expect(raf.pendingCount).toBe(0);

      channel.request();
      expect(coordinator.getDiagnostics().isIdle).toBe(true);
      raf.advance(10);
      expect(callback).not.toHaveBeenCalled();
    });

    it('Then disposing from inside the callback lets the current run finish and stops the clock', () => {
      const coordinator = new FrameCoordinator();
      const ran: string[] = [];
      const channel = openWriteChannel(() => { ran.push('start'); channel.dispose(); channel.request(); ran.push('end'); }, coordinator);

      channel.request();
      raf.advance(10);

      expect(ran).toEqual(['start', 'end']);
      expect(coordinator.getDiagnostics().isIdle).toBe(true);
      expect(raf.pendingCount).toBe(0);
    });
  });

  describe('When the callback throws', () => {
    it('Then the error is rethrown asynchronously and the channel stays usable', async () => {
      const coordinator = new FrameCoordinator();
      const uncaught: unknown[] = [];
      const original = globalThis.queueMicrotask;
      globalThis.queueMicrotask = ((task: () => void) => { try { task(); } catch (error) { uncaught.push(error); } }) as typeof queueMicrotask;
      try {
        let calls = 0;
        const channel = openWriteChannel(() => { calls += 1; if (calls === 1) throw new Error('draw failed'); }, coordinator);
        channel.request();
        raf.advance(10);
        expect(uncaught).toHaveLength(1);

        channel.request();
        raf.advance(20);
        expect(calls).toBe(2);
        channel.dispose();
      } finally {
        globalThis.queueMicrotask = original;
      }
    });
  });

  describe('When requestAnimationFrame is unavailable', () => {
    it('Then request() throws and leaves nothing queued', () => {
      raf.uninstall();
      Reflect.deleteProperty(globalThis, 'requestAnimationFrame');
      Reflect.deleteProperty(globalThis, 'cancelAnimationFrame');
      const coordinator = new FrameCoordinator();
      const channel = openWriteChannel(() => undefined, coordinator);

      expect(() => channel.request()).toThrow();
      expect(coordinator.getDiagnostics().pendingWriteTasks).toBe(0);
      raf.install();
    });
  });
});
