import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import { Subject } from 'rxjs';
import { smoothStream } from '../../src/operators/smoothStream.js';
import type { SmoothedStreamSample, TimestampedValue } from '../../src/types.js';
import { RafController } from '../helpers/RafController.js';

const raf = new RafController();
const interpolateNumber = (from: number, to: number, progress: number): number => from + (to - from) * progress;

beforeEach(() => raf.install());
afterEach(() => raf.uninstall());

describe('Given smoothStream', () => {
  describe('When a smooth stream is configured', () => {
    describe('And When timestamped samples arrive on the shared frame clock', () => {
      it('Then it interpolates between timestamped samples on the frame clock and drains after completion', () => {
        const source = new Subject<TimestampedValue<number>>();
        const samples: SmoothedStreamSample<number>[] = [];
        let completed = false;
        const subscription = source.pipe(smoothStream({ targetLatency: 10, staleAfter: 100, interpolate: interpolateNumber }))
          .subscribe({ next: (sample) => samples.push(sample), complete: () => { completed = true; } });

        source.next({ timestamp: 0, value: 0 });
        raf.advance(0);
        source.next({ timestamp: 20, value: 20 });
        raf.advance(10);
        raf.advance(20);

        expect(samples.at(-1)).toMatchObject({ value: 10, sampleTime: 10, interpolated: true, stale: false });
        source.complete();
        expect(completed).toBe(false);
        raf.advance(30);
        expect(samples.at(-1)).toMatchObject({ value: 20, sampleTime: 20, interpolated: false });
        expect(completed).toBe(true);
        expect(subscription.closed).toBe(true);
        expect(raf.pendingCount).toBe(0);
      });
    });
    describe('And When samples arrive out of order and with duplicate timestamps', () => {
      it('Then it sorts out-of-order samples and replaces duplicate timestamps', () => {
        const source = new Subject<TimestampedValue<number>>();
        const samples: SmoothedStreamSample<number>[] = [];
        const subscription = source.pipe(smoothStream({ targetLatency: 0, interpolate: interpolateNumber, maxBufferSize: 8 }))
          .subscribe((sample) => samples.push(sample));

        source.next({ timestamp: 0, value: 0 });
        raf.advance(0);
        source.next({ timestamp: 20, value: 20 });
        source.next({ timestamp: 10, value: 10 });
        source.next({ timestamp: 10, value: 12 });
        raf.advance(15);

        expect(samples.at(-1)?.value).toBeCloseTo(16, 5);
        subscription.unsubscribe();
        expect(raf.pendingCount).toBe(0);
      });
    });
    describe('And When a packet arrives behind the displayed time cursor', () => {
      it('Then it ignores packets that arrive behind the displayed time cursor', () => {
        const source = new Subject<TimestampedValue<number>>();
        const samples: SmoothedStreamSample<number>[] = [];
        const subscription = source.pipe(smoothStream({ targetLatency: 0, interpolate: interpolateNumber }))
          .subscribe((sample) => samples.push(sample));

        source.next({ timestamp: 0, value: 0 });
        raf.advance(0);
        source.next({ timestamp: -10, value: -100 });
        source.next({ timestamp: 20, value: 20 });
        raf.advance(10);

        expect(samples.at(-1)).toMatchObject({ value: 10, sampleTime: 10, interpolated: true });
        subscription.unsubscribe();
        expect(raf.pendingCount).toBe(0);
      });
    });
    describe('And When sample arrivals are irregular', () => {
      it('Then it keeps interpolated values finite and bracketed across irregular sample arrivals', () => {
        const source = new Subject<TimestampedValue<number>>();
        const samples: SmoothedStreamSample<number>[] = [];
        const subscription = source.pipe(smoothStream({
          targetLatency: 24,
          staleAfter: 180,
          maxBufferSize: 8,
          interpolate: interpolateNumber,
        })).subscribe((sample) => samples.push(sample));

        source.next({ timestamp: 0, value: 0 });
        raf.advance(0);
        source.next({ timestamp: 33, value: 33 });
        source.next({ timestamp: 16, value: 16 });
        source.next({ timestamp: 49, value: 49 });
        raf.advance(16);
        source.next({ timestamp: 75, value: 75 });
        source.next({ timestamp: 65, value: 65 });
        raf.advance(32);
        raf.advance(48);
        source.next({ timestamp: 96, value: 96 });
        raf.advance(64);
        raf.advance(80);

        expect(samples.length).toBeGreaterThan(3);
        for (const sample of samples) {
          expect(Number.isFinite(sample.value)).toBe(true);
          expect(Number.isFinite(sample.sampleTime)).toBe(true);
          if (sample.interpolated) {
            expect(sample.sourceStartTimestamp).toBeLessThanOrEqual(sample.sampleTime);
            expect(sample.sourceEndTimestamp).toBeGreaterThanOrEqual(sample.sampleTime);
          }
        }

        subscription.unsubscribe();
        expect(raf.pendingCount).toBe(0);
      });
    });
    describe('And When the source remains silent beyond staleAfter', () => {
      it('Then it marks samples stale when the source has not updated within staleAfter', () => {
        const source = new Subject<TimestampedValue<number>>();
        const samples: SmoothedStreamSample<number>[] = [];
        const subscription = source.pipe(smoothStream({ targetLatency: 0, staleAfter: 30, interpolate: interpolateNumber }))
          .subscribe((sample) => samples.push(sample));

        source.next({ timestamp: 0, value: 7 });
        raf.advance(0);
        raf.advance(64);
        expect(samples.at(-1)).toMatchObject({ value: 7, stale: true });

        subscription.unsubscribe();
        expect(raf.pendingCount).toBe(0);
      });
    });
    describe('And When the source or active operation reaches its completion condition', () => {
      it('Then it completes an empty source without starting a frame loop', () => {
        const source = new Subject<TimestampedValue<number>>();
        let completed = false;
        const subscription = source.pipe(smoothStream({ interpolate: interpolateNumber })).subscribe({ complete: () => { completed = true; } });

        source.complete();
        expect(completed).toBe(true);
        subscription.unsubscribe();
        expect(raf.pendingCount).toBe(0);
      });
    });
    describe('And When interpolation throws while a stream is active', () => {
      it('Then it reports interpolation errors and releases the shared frame clock', () => {
        const source = new Subject<TimestampedValue<number>>();
        let receivedError: unknown;
        const subscription = source.pipe(smoothStream<number>({
          targetLatency: 0,
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
    });
    describe('And When an invalid buffer size is configured', () => {
      it('Then it rejects invalid buffer sizes when creating the operator', () => {
        expect(() => smoothStream({ maxBufferSize: 1, interpolate: interpolateNumber })).toThrow(RangeError);
      });
    });
    describe('And When a sample contains a non-finite timestamp', () => {
      it('Then it errors on non-finite timestamps and releases the RAF loop', () => {
        const source = new Subject<TimestampedValue<number>>();
        let receivedError: unknown;
        const subscription = source.pipe(smoothStream({ interpolate: interpolateNumber })).subscribe({ error: (error: unknown) => { receivedError = error; } });

        source.next({ timestamp: Number.POSITIVE_INFINITY, value: 2 });
        expect(receivedError).toBeInstanceOf(RangeError);
        expect(raf.pendingCount).toBe(0);
        subscription.unsubscribe();
      });
    });
  });
});
