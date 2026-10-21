import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Subject } from 'rxjs';
import { bindCanvas, resizeCanvas } from '../../src/adapters/canvas.js';
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
