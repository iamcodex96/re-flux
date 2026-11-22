import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Subject } from 'rxjs';
import { bindCanvas, resizeCanvas } from '../../src/adapters/canvas.js';
import { frameCoordinator } from '../../src/core/FrameCoordinator.js';
import { RafController } from '../helpers/RafController.js';

const raf = new RafController();

function fakeContext(): CanvasRenderingContext2D & { calls: string[] } {
  const calls: string[] = [];
  const canvas = { width: 320, height: 140 } as HTMLCanvasElement;
  return {
    canvas,
    calls,
    save: () => calls.push('save'),
    restore: () => calls.push('restore'),
    setTransform: () => calls.push('identity'),
    clearRect: (x: number, y: number, width: number, height: number) => calls.push(`clear:${x},${y},${width},${height}`),
    beginPath: () => calls.push('beginPath'),
    arc: (_x: number, _y: number, _r: number) => calls.push('arc'),
    fill: () => calls.push('fill'),
  } as unknown as CanvasRenderingContext2D & { calls: string[] };
}

beforeEach(() => raf.install());
afterEach(() => raf.uninstall());

describe('Given bindCanvas', () => {
  describe('When a Canvas binding is active', () => {
    describe('And When multiple emissions arrive before a frame is flushed', () => {
      it('Then it coalesces emissions to the latest value and draws in the shared write phase', () => {
        const context = fakeContext();
        const source = new Subject<number>();
        const drawn: number[] = [];
        const binding = bindCanvas(context, source, (_context, value, frame) => {
          drawn.push(value);
          context.calls.push(`draw-frame:${frame.frame}`);
        });

        source.next(1);
        source.next(2);
        source.next(3);
        expect(drawn).toEqual([]);
        raf.advance(16);
        expect(drawn).toEqual([3]);
        expect(context.calls).toContain('clear:0,0,320,140');
        expect(context.calls).toContain('draw-frame:1');

        binding.unsubscribe();
        expect(raf.pendingCount).toBe(0);
      });
    });
    describe('And When draw work is queued and the subscription is closed', () => {
      it('Then it cancels queued draws when unsubscribed and optionally clears on teardown', () => {
        const context = fakeContext();
        const source = new Subject<number>();
        const draw = jest.fn();
        const binding = bindCanvas(context, source, draw, { clearOnUnsubscribe: true });
        source.next(42);
        binding.unsubscribe();
        raf.advance(16);

        expect(draw).not.toHaveBeenCalled();
        expect(context.calls.filter((call) => call === 'clear:0,0,320,140')).toHaveLength(1);
        expect(raf.pendingCount).toBe(0);
      });
    });
  });
});

describe('Given many Canvas bindings sharing the coordinator (PERF-008)', () => {
  describe('When 1000 bindings each receive 4 emissions in one frame', () => {
    it('Then each binding draws exactly once with its latest value and the coordinator is idle after teardown', () => {
      const bindings = Array.from({ length: 1000 }, (_unused, index) => {
        const context = fakeContext();
        const source = new Subject<number>();
        const drawn: number[] = [];
        const binding = bindCanvas(context, source, (_context, value) => { drawn.push(value); });
        return { source, drawn, binding, index };
      });

      for (let emission = 1; emission <= 4; emission += 1) {
        for (const { source, index } of bindings) source.next(index * 10 + emission);
      }
      expect(frameCoordinator.getDiagnostics().pendingWriteTasks).toBe(1000);

      raf.advance(16);
      for (const { drawn, index } of bindings) expect(drawn).toEqual([index * 10 + 4]);
      expect(frameCoordinator.getDiagnostics().pendingWriteTasks).toBe(0);

      // A second frame with no emissions must not draw again.
      raf.advance(32);
      for (const { drawn } of bindings) expect(drawn).toHaveLength(1);

      // New emissions after a flush are drawn again, once per binding per frame.
      for (const { source } of bindings) { source.next(-1); source.next(-2); }
      raf.advance(48);
      for (const { drawn } of bindings) expect(drawn.slice(1)).toEqual([-2]);

      for (const { binding } of bindings) binding.unsubscribe();
      expect(frameCoordinator.getDiagnostics().isIdle).toBe(true);
      expect(raf.pendingCount).toBe(0);
    });
  });

  describe('When an emission arrives during the consumer phase of a frame', () => {
    it('Then it is drawn in that same frame write phase, not one frame later', () => {
      const context = fakeContext();
      const source = new Subject<number>();
      const frames: number[] = [];
      const binding = bindCanvas(context, source, (_context, _value, frame) => { frames.push(frame.frame); });

      const consumer = frameCoordinator.frames$.subscribe((frame) => { if (frame.frame === 2) source.next(7); });
      source.next(1);
      raf.advance(16);
      expect(frames).toEqual([1]);

      raf.advance(32); // frame 2: the consumer emits, the write phase of the same frame draws it
      expect(frames).toEqual([1, 2]);

      raf.advance(48);
      expect(frames).toEqual([1, 2]);
      consumer.unsubscribe();
      binding.unsubscribe();
      expect(frameCoordinator.getDiagnostics().isIdle).toBe(true);
    });
  });

  describe('When an emission arrives from inside the draw callback', () => {
    it('Then it is drawn on the next frame, not recursively in the same one', () => {
      const context = fakeContext();
      const source = new Subject<number>();
      const frames: number[] = [];
      const binding = bindCanvas(context, source, (_context, value, frame) => {
        frames.push(frame.frame);
        if (value < 2) source.next(value + 1);
      });

      source.next(0);
      raf.advance(16);
      expect(frames).toEqual([1]);
      raf.advance(32);
      expect(frames).toEqual([1, 2]);
      raf.advance(48);
      expect(frames).toEqual([1, 2, 3]);
      raf.advance(64);
      expect(frames).toEqual([1, 2, 3]);
      binding.unsubscribe();
      expect(frameCoordinator.getDiagnostics().isIdle).toBe(true);
    });
  });

  describe('When a binding is unsubscribed after its draw was queued and another binding is re-created', () => {
    it('Then the old pending draw is dropped and the new binding draws normally', () => {
      const first = new Subject<number>();
      const drawFirst = jest.fn();
      const bindingFirst = bindCanvas(fakeContext(), first, drawFirst);
      first.next(1);
      bindingFirst.unsubscribe();

      const second = new Subject<number>();
      const drawSecond = jest.fn();
      const bindingSecond = bindCanvas(fakeContext(), second, drawSecond);
      second.next(2);
      raf.advance(16);

      expect(drawFirst).not.toHaveBeenCalled();
      expect(drawSecond).toHaveBeenCalledTimes(1);
      bindingSecond.unsubscribe();
      expect(frameCoordinator.getDiagnostics().isIdle).toBe(true);
    });
  });
});


describe('Given resizeCanvas', () => {
  describe('When a Canvas element is resized', () => {
    describe('And When a device-pixel ratio is configured', () => {
      it('Then it scales the backing bitmap for a device-pixel ratio while returning CSS-pixel dimensions', () => {
        const context = fakeContext();
        const canvas = {
          width: 300,
          height: 150,
          clientWidth: 100,
          clientHeight: 50,
          getBoundingClientRect: () => ({ width: 100, height: 50 }),
          getContext: () => context,
        } as unknown as HTMLCanvasElement;
        (context as unknown as { canvas: HTMLCanvasElement }).canvas = canvas;
        const resized = resizeCanvas(canvas, { pixelRatio: 2 });
        expect(canvas.width).toBe(200);
        expect(canvas.height).toBe(100);
        expect(resized.width).toBe(100);
        expect(resized.height).toBe(50);
        expect(resized.pixelRatio).toBe(2);
        expect(context.calls).toContain('identity');
      });
    });
    describe('And When invalid input or a missing required value is supplied', () => {
      it('Then it rejects invalid sizing values', () => {
        const canvas = {
          width: 100,
          height: 100,
          getBoundingClientRect: () => ({ width: 100, height: 100 }),
          getContext: () => fakeContext(),
        } as unknown as HTMLCanvasElement;
        expect(() => resizeCanvas(canvas, { pixelRatio: 0 })).toThrow('pixelRatio');
      });
    });
  });
});
