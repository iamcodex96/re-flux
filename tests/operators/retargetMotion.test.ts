import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import { Subject } from 'rxjs';
import { retargetMotion } from '../../src/operators/retargetMotion.js';
import type { MotionSample } from '../../src/types.js';
import { RafController } from '../helpers/RafController.js';

const raf = new RafController();

beforeEach(() => raf.install());
afterEach(() => raf.uninstall());

describe('retargetMotion', () => {
  it('preserves the running value when a new target arrives and completes after settling', () => {
    const targets = new Subject<number>();
    const samples: MotionSample[] = [];
    let completed = false;
    const subscription = targets.pipe(retargetMotion({ initialValue: 0, stiffness: 220, damping: 28 }))
      .subscribe({ next: (sample) => samples.push(sample), complete: () => { completed = true; } });

    expect(samples[0]?.value).toBe(0);
    targets.next(100);
    raf.advance(0);
    raf.advance(16);
    raf.advance(32);
    const beforeRetarget = samples.at(-1);
    expect(beforeRetarget).toBeDefined();
    expect(beforeRetarget?.value).toBeGreaterThan(0);

    targets.next(-40);
    raf.advance(48);
    const afterRetarget = samples.at(-1);
    expect(afterRetarget).toBeDefined();
    expect(Math.abs((afterRetarget?.value ?? 0) - (beforeRetarget?.value ?? 0))).toBeLessThan(30);

    targets.complete();
    for (let timestamp = 64; timestamp <= 6_000 && !completed; timestamp += 16) {
      raf.advance(timestamp);
    }

    expect(completed).toBe(true);
    expect(samples.at(-1)?.value).toBeCloseTo(-40, 0);
    expect(subscription.closed).toBe(true);
    expect(raf.pendingCount).toBe(0);
  });

  it('creates independent motion state for each subscriber while sharing one RAF loop', () => {
    const targets = new Subject<number>();
    const firstSamples: MotionSample[] = [];
    const secondSamples: MotionSample[] = [];
    const first = targets.pipe(retargetMotion({ initialValue: 0, stiffness: 220, damping: 28 }))
      .subscribe((sample) => firstSamples.push(sample));
    const second = targets.pipe(retargetMotion({ initialValue: 20, stiffness: 220, damping: 28 }))
      .subscribe((sample) => secondSamples.push(sample));

    targets.next(100);
    expect(raf.pendingCount).toBe(1);
    first.unsubscribe();
    expect(raf.pendingCount).toBe(1);

    raf.advance(0);
    raf.advance(16);
    expect(secondSamples.at(-1)?.value).toBeGreaterThan(20);
    expect(firstSamples).toHaveLength(1);

    second.unsubscribe();
    expect(raf.pendingCount).toBe(0);
  });

  it('forwards target source errors and releases its frame subscription', () => {
    const targets = new Subject<number>();
    const failure = new Error('target source failed');
    let receivedError: unknown;
    const subscription = targets.pipe(retargetMotion()).subscribe({
      error: (error: unknown) => { receivedError = error; },
    });

    targets.next(100);
    expect(raf.pendingCount).toBe(1);
    targets.error(failure);

    expect(receivedError).toBe(failure);
    expect(subscription.closed).toBe(true);
    expect(raf.pendingCount).toBe(0);
  });

  it('completes immediately when the target stream is empty', () => {
    const targets = new Subject<number>();
    let completed = false;
    const subscription = targets.pipe(retargetMotion()).subscribe({ complete: () => { completed = true; } });

    targets.complete();
    expect(completed).toBe(true);
    subscription.unsubscribe();
    expect(raf.pendingCount).toBe(0);
  });

  it('stops its motion and RAF subscription immediately when the consumer unsubscribes', () => {
    const targets = new Subject<number>();
    const subscription = targets.pipe(retargetMotion({ initialValue: 0 })).subscribe();

    targets.next(100);
    expect(raf.pendingCount).toBe(1);
    subscription.unsubscribe();
    expect(raf.pendingCount).toBe(0);

    targets.next(20);  
    expect(raf.pendingCount).toBe(0);
  });

  it('rejects non-finite targets and cleans up the frame clock', () => {
    const targets = new Subject<number>();
    let receivedError: unknown;
    const subscription = targets.pipe(retargetMotion()).subscribe({ error: (error: unknown) => { receivedError = error; } });

    targets.next(Number.NaN);
    expect(receivedError).toBeInstanceOf(RangeError);
    expect(raf.pendingCount).toBe(0);
    subscription.unsubscribe();
  });
});
