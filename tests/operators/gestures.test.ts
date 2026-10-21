import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import { Subject } from 'rxjs';
import { dragInertia, pointerGestures$, slideFollow } from '../../src/operators/gestures.js';
import type { DragInertiaSample, Point2D, PointerGestureEvent, SlideFollowSample } from '../../src/types.js';
import { RafController } from '../helpers/RafController.js';

const raf = new RafController();

beforeEach(() => raf.install());
afterEach(() => raf.uninstall());

describe('Given pointerGestures$', () => {
  describe('When a pointer gesture stream is observed', () => {
    describe('And When pointer down, move, and up events arrive', () => {
      it('Then it normalizes down, move, and up events and unsubscribes pointer tracking after release', () => {
        const target = new EventTarget();
        const samples: PointerGestureEvent[] = [];
        const subscription = pointerGestures$(target).subscribe((sample) => samples.push(sample));

        target.dispatchEvent(pointerEvent('pointerdown', { pointerId: 4, x: 10, y: 20, timestamp: 10 }));
        target.dispatchEvent(pointerEvent('pointermove', { pointerId: 4, x: 30, y: 45, timestamp: 26 }));
        target.dispatchEvent(pointerEvent('pointerup', { pointerId: 4, x: 30, y: 45, timestamp: 30 }));
        target.dispatchEvent(pointerEvent('pointermove', { pointerId: 4, x: 90, y: 90, timestamp: 46 }));

        expect(samples.map((sample) => sample.type)).toEqual(['down', 'move', 'up']);
        expect(samples[1]).toMatchObject({ x: 30, y: 45, timestamp: 26, pointerId: 4 });

        subscription.unsubscribe();
        expect(raf.pendingCount).toBe(0);
      });
    });
    describe('And When a non-primary pointer or non-left mouse button is used', () => {
      it('Then it ignores non-primary pointers and non-left mouse buttons', () => {
        const target = new EventTarget();
        const samples: PointerGestureEvent[] = [];
        const subscription = pointerGestures$(target).subscribe((sample) => samples.push(sample));

        target.dispatchEvent(pointerEvent('pointerdown', { pointerId: 2, x: 0, y: 0, timestamp: 0, isPrimary: false }));
        target.dispatchEvent(pointerEvent('pointerdown', { pointerId: 3, x: 0, y: 0, timestamp: 0, button: 2 }));
        expect(samples).toHaveLength(0);
        subscription.unsubscribe();
      });
    });
    describe('And When the owning window loses focus', () => {
      it('Then it emits cancel and releases pointer capture when the owning window loses focus', () => {
        class CapturingTarget extends EventTarget {
          readonly captured = new Set<number>();
          setPointerCapture(pointerId: number): void { this.captured.add(pointerId); }
          hasPointerCapture(pointerId: number): boolean { return this.captured.has(pointerId); }
          releasePointerCapture(pointerId: number): void { this.captured.delete(pointerId); }
        }
        const moveTarget = new EventTarget();
        const docTarget = new EventTarget() as EventTarget & { defaultView: Window | null; visibilityState: DocumentVisibilityState };
        Object.defineProperty(docTarget, 'defaultView', { value: moveTarget });
        Object.defineProperty(docTarget, 'visibilityState', { get: () => 'visible' });
        const target = new CapturingTarget() as CapturingTarget & { ownerDocument: Document };
        Object.defineProperty(target, 'ownerDocument', { value: docTarget as unknown as Document });
        const samples: PointerGestureEvent[] = [];
        const subscription = pointerGestures$(target).subscribe((sample) => samples.push(sample));

        target.dispatchEvent(pointerEvent('pointerdown', { pointerId: 7, x: 12, y: 24, timestamp: 1 }));
        moveTarget.dispatchEvent(pointerEvent('pointermove', { pointerId: 7, x: 18, y: 30, timestamp: 8 }));
        moveTarget.dispatchEvent(new Event('blur'));

        expect(samples.map(({ type }) => type)).toEqual(['down', 'move', 'cancel']);
        expect(samples.at(-1)).toMatchObject({ pointerId: 7, x: 18, y: 30 });
        expect(target.captured.has(7)).toBe(false);
        subscription.unsubscribe();
      });
    });
    describe('And When the owning window loses focus', () => {
      it('Then it emits cancel and releases pointer capture on pointercancel', () => {
        class CapturingTarget extends EventTarget {
          readonly captured = new Set<number>();
          setPointerCapture(pointerId: number): void { this.captured.add(pointerId); }
          hasPointerCapture(pointerId: number): boolean { return this.captured.has(pointerId); }
          releasePointerCapture(pointerId: number): void { this.captured.delete(pointerId); }
        }
        const target = new CapturingTarget();
        const samples: PointerGestureEvent[] = [];
        const subscription = pointerGestures$(target).subscribe((sample) => samples.push(sample));

        target.dispatchEvent(pointerEvent('pointerdown', { pointerId: 11, x: 4, y: 8, timestamp: 1 }));
        target.dispatchEvent(pointerEvent('pointercancel', { pointerId: 11, x: 6, y: 9, timestamp: 2 }));

        expect(samples.map(({ type }) => type)).toEqual(['down', 'cancel']);
        expect(target.captured.has(11)).toBe(false);
        subscription.unsubscribe();
      });
    });
    describe('And When the owning document becomes hidden', () => {
      it('Then it cancels an active gesture when the owning document becomes hidden', () => {
        const moveTarget = new EventTarget();
        let visibilityState: DocumentVisibilityState = 'visible';
        const docTarget = new EventTarget() as EventTarget & { defaultView: Window | null; visibilityState: DocumentVisibilityState };
        Object.defineProperty(docTarget, 'defaultView', { value: moveTarget });
        Object.defineProperty(docTarget, 'visibilityState', { get: () => visibilityState });
        const target = new EventTarget() as EventTarget & { ownerDocument: Document };
        Object.defineProperty(target, 'ownerDocument', { value: docTarget as unknown as Document });
        const samples: PointerGestureEvent[] = [];
        const subscription = pointerGestures$(target).subscribe((sample) => samples.push(sample));

        target.dispatchEvent(pointerEvent('pointerdown', { pointerId: 12, x: 2, y: 3, timestamp: 1 }));
        visibilityState = 'hidden';
        docTarget.dispatchEvent(new Event('visibilitychange'));

        expect(samples.map(({ type }) => type)).toEqual(['down', 'cancel']);
        subscription.unsubscribe();
      });
    });
    describe('And When a down-event consumer subscribes re-entrantly', () => {
      it('Then it attaches session listeners before emitting down to re-entrant consumers', () => {
        const target = new EventTarget();
        const samples: PointerGestureEvent[] = [];
        const subscription = pointerGestures$(target).subscribe((sample) => {
          samples.push(sample);
          if (sample.type === 'down') {
            target.dispatchEvent(pointerEvent('pointermove', { pointerId: sample.pointerId, x: 4, y: 5, timestamp: 2 }));
          }
        });
        target.dispatchEvent(pointerEvent('pointerdown', { pointerId: 8, x: 1, y: 1, timestamp: 1 }));
        expect(samples.map(({ type }) => type)).toEqual(['down', 'move']);
        subscription.unsubscribe();
      });
    });
    describe('And When the active pointer capture is lost', () => {
      it('Then it treats lost pointer capture as a cancelled gesture', () => {
        const target = new EventTarget();
        const samples: PointerGestureEvent[] = [];
        const subscription = pointerGestures$(target).subscribe((sample) => samples.push(sample));
        target.dispatchEvent(pointerEvent('pointerdown', { pointerId: 9, x: 1, y: 2, timestamp: 3 }));
        target.dispatchEvent(pointerEvent('lostpointercapture', { pointerId: 9, x: 1, y: 2, timestamp: 4 }));
        expect(samples.map(({ type }) => type)).toEqual(['down', 'cancel']);
        subscription.unsubscribe();
      });
    });
  });
});

describe('Given dragInertia', () => {
  describe('When drag inertia is enabled', () => {
    describe('And When pointer samples are followed by a release', () => {
      it('Then it estimates release velocity and decays it using the shared frame clock', () => {
        const gestures = new Subject<PointerGestureEvent>();
        const samples: DragInertiaSample[] = [];
        const subscription = gestures.pipe(dragInertia({ friction: 5, minVelocity: 5, velocitySmoothing: 0, maxVelocity: 5000 })).subscribe((sample) => samples.push(sample));

        gestures.next(gesture('down', 0, 0, 1, 0));
        gestures.next(gesture('move', 100, 0, 1, 20));
        expect(samples.at(-1)).toMatchObject({ phase: 'dragging', x: 100, vx: 5000 });
        gestures.next(gesture('up', 100, 0, 1, 21));
        expect(samples.at(-1)?.phase).toBe('inertia');

        raf.advance(0);
        raf.advance(16);
        expect(samples.at(-1)?.phase).toBe('inertia');
        expect(samples.at(-1)?.x).toBeGreaterThan(100);
        expect(samples.at(-1)?.vx).toBeLessThan(5000);

        subscription.unsubscribe();
        expect(raf.pendingCount).toBe(0);
      });
    });
    describe('And When a new pointer down occurs while inertia is active', () => {
      it('Then it cancels inertia on a new pointer down and clamps values at configured bounds', () => {
        const gestures = new Subject<PointerGestureEvent>();
        const samples: DragInertiaSample[] = [];
        const subscription = gestures.pipe(dragInertia({ friction: 4, minVelocity: 1, velocitySmoothing: 0, bounds: { minX: 0, maxX: 50, minY: 0, maxY: 50 } })).subscribe((sample) => samples.push(sample));

        gestures.next(gesture('down', 10, 10, 1, 0));
        gestures.next(gesture('move', 60, 10, 1, 10));
        expect(samples.at(-1)?.x).toBe(50);
        gestures.next(gesture('up', 60, 10, 1, 11));
        gestures.next(gesture('down', 20, 20, 2, 12));
        expect(samples.at(-1)).toMatchObject({ phase: 'dragging', x: 20, y: 20, vx: 0, vy: 0 });
        expect(raf.pendingCount).toBe(0);

        subscription.unsubscribe();
      });
    });
    describe('And When irrelevant or out-of-order input arrives', () => {
      it('Then it ignores stale pointer timestamps and clears velocity for duplicate timestamps', () => {
        const gestures = new Subject<PointerGestureEvent>();
        const samples: DragInertiaSample[] = [];
        const subscription = gestures.pipe(dragInertia({ velocitySmoothing: 0, minVelocity: 1 }))
          .subscribe((sample) => samples.push(sample));

        gestures.next(gesture('down', 0, 0, 1, 10));
        gestures.next(gesture('move', 10, 0, 1, 30));
        expect(samples.at(-1)).toMatchObject({ x: 10, vx: 500, phase: 'dragging' });

        gestures.next(gesture('move', 500, 0, 1, 15));
        expect(samples.at(-1)).toMatchObject({ x: 10, vx: 500, phase: 'dragging' });

        gestures.next(gesture('move', 20, 0, 1, 30));
        expect(samples.at(-1)).toMatchObject({ x: 20, vx: 0, phase: 'dragging' });
        gestures.next(gesture('up', 20, 0, 1, 31));
        expect(samples.at(-1)?.phase).toBe('rest');

        subscription.unsubscribe();
        expect(raf.pendingCount).toBe(0);
      });
    });
    describe('And When the frame clock reports a large hidden-tab gap', () => {
      it('Then it caps large inertia frame deltas rather than advancing across the whole hidden-tab gap', () => {
        const gestures = new Subject<PointerGestureEvent>();
        const samples: DragInertiaSample[] = [];
        const subscription = gestures.pipe(dragInertia({ friction: 6, minVelocity: 1, velocitySmoothing: 0, maxDeltaMs: 64 }))
          .subscribe((sample) => samples.push(sample));

        gestures.next(gesture('down', 0, 0, 1, 0));
        gestures.next(gesture('move', 10, 0, 1, 10));
        gestures.next(gesture('up', 10, 0, 1, 11));
        const releaseX = samples.at(-1)?.x ?? 0;

        raf.advance(0);
        raf.advance(10_000);
        const afterGap = samples.at(-1);
        expect(afterGap?.x).toBeGreaterThan(releaseX);
        expect((afterGap?.x ?? 0) - releaseX).toBeLessThan(100);
        expect(afterGap?.vx).toBeLessThan(1_000);

        subscription.unsubscribe();
        expect(raf.pendingCount).toBe(0);
      });
    });
    describe('And When dynamic bounds change during pointer movement or inertia', () => {
      it('Then it re-resolves dynamic bounds during pointer samples and inertia frames', () => {
        const gestures = new Subject<PointerGestureEvent>();
        const samples: DragInertiaSample[] = [];
        let minX = 0;
        let maxX = 100;
        const subscription = gestures.pipe(dragInertia({
          minVelocity: 1,
          velocitySmoothing: 0,
          getBounds: () => ({ minX, maxX, minY: 0, maxY: 100 }),
        })).subscribe((sample) => samples.push(sample));

        gestures.next(gesture('down', 10, 50, 1, 0));
        gestures.next(gesture('move', 80, 50, 1, 10));
        expect(samples.at(-1)).toMatchObject({ x: 80, y: 50, phase: 'dragging' });


        maxX = 40;
        gestures.next(gesture('move', 70, 50, 1, 20));
        expect(samples.at(-1)).toMatchObject({ x: 40, y: 50, phase: 'dragging' });
        gestures.next(gesture('move', 30, 50, 1, 30));
        gestures.next(gesture('up', 30, 50, 1, 31));


        minX = 35;
        raf.advance(0);
        raf.advance(16);
        expect(samples.at(-1)).toMatchObject({ x: 35, vx: 0, phase: 'rest' });

        subscription.unsubscribe();
        expect(raf.pendingCount).toBe(0);
      });
    });
    describe('And When a pointer move hits a hard boundary', () => {
      it('Then it zeros filtered release velocity when a pointer move hits a hard boundary', () => {
        const gestures = new Subject<PointerGestureEvent>();
        const samples: DragInertiaSample[] = [];
        const subscription = gestures.pipe(dragInertia({ bounds: { minX: 0, maxX: 50 }, velocitySmoothing: 0, minVelocity: 1 }))
          .subscribe((sample) => samples.push(sample));

        gestures.next(gesture('down', 10, 0, 3, 0));
        gestures.next(gesture('move', 200, 0, 3, 10));
        expect(samples.at(-1)).toMatchObject({ x: 50, vx: 0, phase: 'dragging' });
        gestures.next(gesture('up', 200, 0, 3, 11));
        expect(samples.at(-1)?.phase).toBe('rest');
        expect(raf.pendingCount).toBe(0);
        subscription.unsubscribe();
      });
    });
    describe('And When a pointer move lands exactly on a hard boundary', () => {
      it('Then it zeros outward velocity when a move lands exactly on a hard boundary', () => {
        const gestures = new Subject<PointerGestureEvent>();
        const samples: DragInertiaSample[] = [];
        const subscription = gestures.pipe(dragInertia({
          bounds: { minX: 0, maxX: 50 },
          velocitySmoothing: 0,
          minVelocity: 1,
        })).subscribe((sample) => samples.push(sample));

        gestures.next(gesture('down', 10, 0, 5, 0));
        gestures.next(gesture('move', 50, 0, 5, 10));
        expect(samples.at(-1)).toMatchObject({ x: 50, vx: 0, phase: 'dragging' });
        gestures.next(gesture('up', 50, 0, 5, 11));
        expect(samples.at(-1)?.phase).toBe('rest');
        expect(raf.pendingCount).toBe(0);
        subscription.unsubscribe();
      });
    });
    describe('And When the dynamic bounds provider returns invalid values', () => {
      it('Then it routes invalid dynamic bounds through the observable error channel and tears down frame work', () => {
        const gestures = new Subject<PointerGestureEvent>();
        let invalid = false;
        let capturedError: unknown;
        const subscription = gestures.pipe(dragInertia({
          getBounds: () => invalid ? { minX: 10, maxX: 0 } : { minX: 0, maxX: 100 },
        })).subscribe({ error: (error: unknown) => { capturedError = error; } });

        gestures.next(gesture('down', 5, 0, 1, 0));
        invalid = true;
        gestures.next(gesture('move', 6, 0, 1, 10));
        expect(capturedError).toBeInstanceOf(RangeError);
        expect(raf.pendingCount).toBe(0);
        subscription.unsubscribe();
      });
    });
    describe('And When the active pointer gesture is cancelled', () => {
      it('Then it does not launch inertia after pointer cancellation', () => {
        const gestures = new Subject<PointerGestureEvent>();
        const samples: DragInertiaSample[] = [];
        const subscription = gestures.pipe(dragInertia()).subscribe((sample) => samples.push(sample));

        gestures.next(gesture('down', 0, 0, 1, 0));
        gestures.next(gesture('move', 30, 0, 1, 10));
        gestures.next(gesture('cancel', 30, 0, 1, 11));

        expect(samples.at(-1)?.phase).toBe('rest');
        expect(raf.pendingCount).toBe(0);
        subscription.unsubscribe();
      });
    });
    describe('And When the input completes during inertia', () => {
      it('Then it completes and cancels the frame loop when the input completes during inertia', () => {
        const gestures = new Subject<PointerGestureEvent>();
        let completed = false;
        const subscription = gestures.pipe(dragInertia({ velocitySmoothing: 0, minVelocity: 1 })).subscribe({ complete: () => { completed = true; } });

        gestures.next(gesture('down', 0, 0, 1, 0));
        gestures.next(gesture('move', 40, 0, 1, 8));
        gestures.next(gesture('up', 40, 0, 1, 9));
        expect(raf.pendingCount).toBe(1);
        gestures.complete();

        expect(completed).toBe(true);
        expect(raf.pendingCount).toBe(0);
        subscription.unsubscribe();
      });
    });
  });
});

describe('Given slideFollow', () => {
  describe('When a slide-follow stream is configured', () => {
    describe('And When target points change over time', () => {
      it('Then it smooths target points and settles without a permanent RAF subscription', () => {
        const targets = new Subject<Point2D>();
        const samples: SlideFollowSample[] = [];
        const subscription = targets.pipe(slideFollow({ initialValue: { x: 0, y: 0 }, stiffness: 260, damping: 32 })).subscribe((sample) => samples.push(sample));

        targets.next({ x: 100, y: 40 });
        expect(samples.at(-1)).toMatchObject({ targetX: 100, targetY: 40, settled: false });
        raf.advance(0);
        for (let timestamp = 16; timestamp <= 2400; timestamp += 16) raf.advance(timestamp);

        expect(samples.at(-1)).toMatchObject({ x: 100, y: 40, vx: 0, vy: 0, settled: true });
        expect(raf.pendingCount).toBe(0);

        targets.next({ x: 25, y: 15 });
        expect(raf.pendingCount).toBe(1);
        subscription.unsubscribe();
        expect(raf.pendingCount).toBe(0);
      });
    });
    describe('And When the target changes while spring motion is active', () => {
      it('Then it preserves position and velocity on retarget, then reverses naturally under spring force', () => {
        const targets = new Subject<Point2D>();
        const samples: SlideFollowSample[] = [];
        const subscription = targets.pipe(slideFollow({ initialValue: { x: 0, y: 0 }, stiffness: 100, damping: 8 })).subscribe((sample) => samples.push(sample));

        targets.next({ x: 100, y: 0 });
        raf.advance(0);
        raf.advance(16);
        raf.advance(32);
        const before = samples.at(-1);
        expect(before?.vx).toBeGreaterThan(0);

        targets.next({ x: -50, y: 0 });
        const retargeted = samples.at(-1);
        expect(retargeted?.targetX).toBe(-50);
        expect(retargeted?.x).toBe(before?.x);
        expect(retargeted?.vx).toBe(before?.vx);


        let timestamp = 48;
        while (timestamp <= 1600 && (samples.at(-1)?.vx ?? 0) >= 0) {
          raf.advance(timestamp);
          timestamp += 16;
        }
        const reversed = samples.at(-1);
        expect(reversed?.vx).toBeLessThan(0);
        const positionAfterReversal = reversed?.x ?? 0;
        raf.advance(timestamp);
        expect(samples.at(-1)?.x).toBeLessThan(positionAfterReversal);

        subscription.unsubscribe();
        expect(raf.pendingCount).toBe(0);
      });
    });
    describe('And When the source completes before the final target settles', () => {
      it('Then it completes only after the source completes and the final target settles', () => {
        const targets = new Subject<Point2D>();
        let completed = false;
        const subscription = targets.pipe(slideFollow({ initialValue: { x: 0, y: 0 }, stiffness: 300, damping: 40 })).subscribe({ complete: () => { completed = true; } });

        targets.next({ x: 12, y: 8 });
        targets.complete();
        expect(completed).toBe(false);

        raf.advance(0);
        for (let timestamp = 16; timestamp <= 1600 && !completed; timestamp += 16) raf.advance(timestamp);
        expect(completed).toBe(true);
        expect(raf.pendingCount).toBe(0);
        subscription.unsubscribe();
      });
    });
  });
});

function gesture(type: PointerGestureEvent['type'], x: number, y: number, pointerId: number, timestamp: number): PointerGestureEvent {
  return Object.freeze({ type, x, y, pointerId, timestamp });
}

function pointerEvent(
  type: string,
  values: { pointerId: number; x: number; y: number; timestamp: number; isPrimary?: boolean; button?: number },
): Event {
  const event = new Event(type);
  Object.defineProperties(event, {
    pointerId: { configurable: true, value: values.pointerId },
    clientX: { configurable: true, value: values.x },
    clientY: { configurable: true, value: values.y },
    timeStamp: { configurable: true, value: values.timestamp },
    isPrimary: { configurable: true, value: values.isPrimary ?? true },
    button: { configurable: true, value: values.button ?? 0 },
  });
  return event;
}

describe('Given gesture hardening options', () => {
  describe('When gesture hardening options are configured', () => {
    describe('And When a gesture session starts and finishes', () => {
      it('Then it captures and releases the pointer when the gesture session finishes', () => {
        class CapturingTarget extends EventTarget {
          readonly captured = new Set<number>();
          readonly captureCalls: number[] = [];
          readonly releaseCalls: number[] = [];
          setPointerCapture(pointerId: number): void {
            this.captureCalls.push(pointerId);
            this.captured.add(pointerId);
          }
          hasPointerCapture(pointerId: number): boolean {
            return this.captured.has(pointerId);
          }
          releasePointerCapture(pointerId: number): void {
            this.releaseCalls.push(pointerId);
            this.captured.delete(pointerId);
          }
        }

        const target = new CapturingTarget();
        const samples: PointerGestureEvent[] = [];
        const subscription = pointerGestures$(target).subscribe((sample) => samples.push(sample));
        target.dispatchEvent(pointerEvent('pointerdown', { pointerId: 12, x: 10, y: 20, timestamp: 1 }));
        expect(target.captureCalls).toEqual([12]);
        expect(target.hasPointerCapture(12)).toBe(true);
        target.dispatchEvent(pointerEvent('pointerup', { pointerId: 12, x: 10, y: 20, timestamp: 2 }));
        expect(target.releaseCalls).toEqual([12]);
        expect(target.hasPointerCapture(12)).toBe(false);
        expect(samples.map((sample) => sample.type)).toEqual(['down', 'up']);
        target.dispatchEvent(pointerEvent('pointerdown', { pointerId: 13, x: 5, y: 7, timestamp: 3 }));
        subscription.unsubscribe();
        expect(target.releaseCalls).toEqual([12, 13]);
      });
    });
    describe('And When custom event sources disable pointer capture', () => {
      it('Then it allows pointer capture to be disabled for custom event sources', () => {
        class CapturingTarget extends EventTarget {
          captured = 0;
          setPointerCapture(): void { this.captured += 1; }
        }
        const target = new CapturingTarget();
        const subscription = pointerGestures$(target, { capturePointer: false }).subscribe();
        target.dispatchEvent(pointerEvent('pointerdown', { pointerId: 2, x: 0, y: 0, timestamp: 0 }));
        expect(target.captured).toBe(0);
        subscription.unsubscribe();
      });
    });
    describe('And When an axis-lock option is selected', () => {
      it('Then it locks drag position and velocity to the selected axis', () => {
        const gestures = new Subject<PointerGestureEvent>();
        const samples: DragInertiaSample[] = [];
        const subscription = gestures.pipe(dragInertia({ axis: 'x', velocitySmoothing: 0, minVelocity: 1 }))
          .subscribe((sample) => samples.push(sample));

        gestures.next(gesture('down', 10, 20, 1, 0));
        gestures.next(gesture('move', 30, 90, 1, 20));
        expect(samples.at(-1)).toMatchObject({ x: 30, y: 20, vx: 1000, vy: 0, phase: 'dragging' });

        subscription.unsubscribe();
        expect(raf.pendingCount).toBe(0);
      });
    });
  });
});
