import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import { Subject } from 'rxjs';
import { adaptiveTween } from '../../src/operators/adaptiveTween.js';
import type { TimestampedValue } from '../../src/types.js';
import { RafController } from '../helpers/RafController.js';

const raf = new RafController();
const interpolateNumber = (from: number, to: number, progress: number): number => from + (to - from) * progress;

beforeEach(() => raf.install());
afterEach(() => raf.uninstall());

describe('adaptiveTween', () => {
  it('adapts tween duration to observed cadence and clamps it to configured limits', () => {
    const source = new Subject<TimestampedValue<number>>();
    const samples: import('../../src/types.js').AdaptiveTweenSample<number>[] = [];
    const subscription = source.pipe(adaptiveTween({
      minDuration: 10,
      maxDuration: 100,
      durationFactor: 2,
      cadenceSmoothing: 0.5,
      initialCadence: 20,
      interpolate: interpolateNumber,
    })).subscribe((sample) => samples.push(sample));

    source.next({ timestamp: 0, value: 0 });
    raf.advance(0);
    source.next({ timestamp: 20, value: 20 });
    raf.advance(20);
    expect(samples.at(-1)).toMatchObject({ estimatedCadence: 20, targetDuration: 40 });

    expect(samples.at(-1)?.value).toBeCloseTo(10, 5);
    source.next({ timestamp: 120, value: 120 });  
    raf.advance(60);
    expect(samples.at(-1)?.estimatedCadence).toBeCloseTo(60, 6);
    expect(samples.at(-1)?.targetDuration).toBe(100);

    subscription.unsubscribe();
    expect(raf.pendingCount).toBe(0);
  });

  it('retargets from the current rendered value without a positional jump', () => {
    const source = new Subject<TimestampedValue<number>>();
    const samples: import('../../src/types.js').AdaptiveTweenSample<number>[] = [];
    const subscription = source.pipe(adaptiveTween({
      minDuration: 100,
      maxDuration: 100,
      durationFactor: 1,
      initialCadence: 100,
      interpolate: interpolateNumber,
    })).subscribe((sample) => samples.push(sample));

    source.next({ timestamp: 0, value: 0 });
    raf.advance(0);
    source.next({ timestamp: 100, value: 100 });
    raf.advance(0);
    raf.advance(50);
    const beforeRetarget = samples.at(-1)?.value ?? 0;
    expect(beforeRetarget).toBeCloseTo(50, 5);

    source.next({ timestamp: 200, value: 0 });
    raf.advance(50);
    expect(samples.at(-1)?.value).toBeCloseTo(beforeRetarget, 5);
    expect(samples.at(-1)?.targetDuration).toBe(100);
    expect(samples.at(-1)?.transitionStartTimestamp).toBe(50);

    subscription.unsubscribe();
    expect(raf.pendingCount).toBe(0);
  });

  it('ignores duplicate and out-of-order source timestamps', () => {
    const source = new Subject<TimestampedValue<number>>();
    const samples: import('../../src/types.js').AdaptiveTweenSample<number>[] = [];
    const subscription = source.pipe(adaptiveTween({
      minDuration: 100,
      maxDuration: 100,
      initialCadence: 100,
      interpolate: interpolateNumber,
    })).subscribe((sample) => samples.push(sample));

    source.next({ timestamp: 10, value: 10 });
    raf.advance(10);
    source.next({ timestamp: 20, value: 20 });
    raf.advance(20);
    const beforeInvalidSamples = samples.length;
    source.next({ timestamp: 20, value: 900 });
    source.next({ timestamp: 15, value: -900 });
    raf.advance(30);

    expect(samples.length).toBeGreaterThan(beforeInvalidSamples);
    expect(samples.at(-1)?.value).toBeLessThan(100);
    expect(samples.at(-1)?.sourceEndTimestamp).toBe(20);
    subscription.unsubscribe();
    expect(raf.pendingCount).toBe(0);
  });

  it('supports a zero-duration transition without retaining a frame loop after source completion', () => {
    const source = new Subject<TimestampedValue<number>>();
    const samples: import('../../src/types.js').AdaptiveTweenSample<number>[] = [];
    let completed = false;
    source.pipe(adaptiveTween({
      minDuration: 0,
      maxDuration: 0,
      durationFactor: 0,
      interpolate: interpolateNumber,
    })).subscribe({ next: (sample) => samples.push(sample), complete: () => { completed = true; } });

    source.next({ timestamp: 0, value: 4 });
    raf.advance(0);
    source.next({ timestamp: 16, value: 8 });
    source.complete();
    raf.advance(16);
    expect(samples.at(-1)?.value).toBe(8);
    expect(completed).toBe(true);
    expect(raf.pendingCount).toBe(0);
  });

  it('emits a baseline value for a finite source that completes before the first RAF', () => {
    const source = new Subject<TimestampedValue<number>>();
    const samples: import('../../src/types.js').AdaptiveTweenSample<number>[] = [];
    let completed = false;
    source.pipe(adaptiveTween({ interpolate: interpolateNumber })).subscribe({
      next: (sample) => samples.push(sample),
      complete: () => { completed = true; },
    });

    source.next({ timestamp: 0, value: 42 });
    source.complete();
    expect(completed).toBe(false);
    raf.advance(16);
    expect(samples.at(-1)?.value).toBe(42);
    expect(completed).toBe(true);
    expect(raf.pendingCount).toBe(0);
  });

  it('forwards invalid timestamps as errors and releases the frame clock', () => {
    const source = new Subject<TimestampedValue<number>>();
    let receivedError: unknown;
    const subscription = source.pipe(adaptiveTween({ interpolate: interpolateNumber }))
      .subscribe({ error: (error: unknown) => { receivedError = error; } });

    source.next({ timestamp: Number.NaN, value: 1 });
    expect(receivedError).toBeInstanceOf(RangeError);
    expect(raf.pendingCount).toBe(0);
    subscription.unsubscribe();
  });

  it('forwards interpolation errors and releases the frame clock', () => {
    const source = new Subject<TimestampedValue<number>>();
    let receivedError: unknown;
    const subscription = source.pipe(adaptiveTween<number>({
      interpolate: () => { throw new Error('interpolator failed'); },
    })).subscribe({ error: (error: unknown) => { receivedError = error; } });

    source.next({ timestamp: 0, value: 0 });
    raf.advance(0);
    source.next({ timestamp: 20, value: 20 });
    raf.advance(10);

    expect(receivedError).toBeInstanceOf(Error);
    expect(raf.pendingCount).toBe(0);
    subscription.unsubscribe();
  });

  it('validates adaptive duration and cadence settings', () => {
    expect(() => adaptiveTween({ minDuration: 80, maxDuration: 20, interpolate: interpolateNumber })).toThrow(RangeError);
    expect(() => adaptiveTween({ cadenceSmoothing: 0, interpolate: interpolateNumber })).toThrow(RangeError);
    expect(() => adaptiveTween({ initialCadence: 0, interpolate: interpolateNumber })).toThrow(RangeError);
  });


  it('waits for the final active transition before completing a finite source', () => {
    const source = new Subject<TimestampedValue<number>>();
    const samples: import('../../src/types.js').AdaptiveTweenSample<number>[] = [];
    let completed = false;
    source.pipe(adaptiveTween({ minDuration: 20, maxDuration: 20, interpolate: interpolateNumber }))
      .subscribe({ next: (sample) => samples.push(sample), complete: () => { completed = true; } });

    source.next({ timestamp: 0, value: 0 });
    raf.advance(0);
    source.next({ timestamp: 10, value: 10 });
    source.complete();
    raf.advance(10);
    expect(samples.at(-1)?.value).toBeCloseTo(5, 5);
    expect(completed).toBe(false);
    raf.advance(20);
    expect(samples.at(-1)?.value).toBe(10);
    expect(completed).toBe(true);
    expect(raf.pendingCount).toBe(0);
  });
});
