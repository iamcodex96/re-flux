import { describe, expect, it } from '@jest/globals';
import { clamp as basicsClamp } from '@re-code/basics/number/clamp';
import { formatDecimal } from '@re-code/basics/number/formatDecimal';
import { interpolateRange as basicsInterpolateRange } from '@re-code/basics/number/interpolateRange';
import { lerp as basicsLerp } from '@re-code/basics/number/lerp';
import { mapRange as basicsMapRange } from '@re-code/basics/number/mapRange';
import { percentile as basicsPercentile } from '@re-code/basics/number/percentile';
import { randomBetween } from '@re-code/basics/number/randomBetween';
import { snap as basicsSnap } from '@re-code/basics/number/snap';
import { wrapRange } from '@re-code/basics/number/wrapRange';
import { clamp, interpolateRange, lerp, mapRange, random, snap, wrap } from '../../src/utils/math.js';
import { formatNumber } from '../../src/utils/valueTemplate.js';
import {
  median as benchmarkMedian,
  percentile as benchmarkPercentile,
  standardDeviation as benchmarkStandardDeviation,
  variability,
} from '../../benchmarks/benchmark-utils.mjs';
import { median as docsMedian } from '../../apps/docs/src/benchmarks/statistics.js';

/**
 * CHORE-011 evidence, kept as tests: re;Flux's own helpers are compared with the `@re-code/basics` functions that look
 * like them. Where the contracts are the same the two agree bit for bit (`Object.is`) on thousands of inputs; where they
 * differ the difference is pinned here, because it is the reason the helper was not swapped. If a Basics release changes
 * one of these results, this file fails and the adoption decision in `roadmap/CHORE-011-adopt-re-code-basics.md` must be
 * re-examined.
 */

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SPECIAL = [0, -0, 1, -1, 0.5, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, 1e-9, 1e21, -1e21];

/** Deterministic mix of special values, fractions, large magnitudes and out-of-range progress. */
function sampleValues(count: number, seed: number): number[] {
  const next = mulberry32(seed);
  const values = [...SPECIAL];
  while (values.length < count) {
    const kind = next();
    if (kind < 0.1) values.push(SPECIAL[Math.floor(next() * SPECIAL.length)]!);
    else if (kind < 0.5) values.push((next() - 0.5) * 4);
    else if (kind < 0.8) values.push((next() - 0.5) * 2000);
    else values.push((next() - 0.5) * 1e12);
  }
  return values;
}

const VALUES = sampleValues(2400, 1);
const triples = (): Array<[number, number, number]> =>
  Array.from({ length: 2400 }, (_, index) => [
    VALUES[index]!,
    VALUES[(index * 7 + 3) % 2400]!,
    VALUES[(index * 13 + 5) % 2400]!,
  ]);

describe('Given re;Flux helpers and the similar @re-code/basics functions', () => {
  describe('When lerp is compared on random triples including NaN, Infinity and out-of-range progress', () => {
    it('Then both return the same bits', () => {
      for (const [from, to, progress] of triples()) {
        expect(Object.is(lerp(from, to, progress), basicsLerp(from, to, progress))).toBe(true);
      }
    });
  });

  describe('When mapRange is compared with and without clamping', () => {
    it('Then both return the same bits, including the degenerate input range', () => {
      const values = VALUES;
      for (let index = 0; index < 2000; index += 1) {
        const args = [
          values[index]!,
          values[(index * 3 + 1) % 2400]!,
          values[(index * 5 + 2) % 2400]!,
          values[(index * 11 + 4) % 2400]!,
          values[(index * 17 + 6) % 2400]!,
        ] as const;
        for (const shouldClamp of [false, true]) {
          expect(Object.is(mapRange(...args, shouldClamp), basicsMapRange(...args, shouldClamp))).toBe(true);
        }
      }
      expect(mapRange(5, 3, 3, 7, 9)).toBe(basicsMapRange(5, 3, 3, 7, 9));
    });
  });

  describe('When wrap is compared with wrapRange', () => {
    it('Then both return the same bits for finite, different bounds and both throw RangeError otherwise', () => {
      for (const [value, min, max] of triples()) {
        if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) {
          expect(() => wrap(value, min, max)).toThrow(RangeError);
          expect(() => wrapRange(value, min, max)).toThrow(RangeError);
        } else {
          expect(Object.is(wrap(value, min, max), wrapRange(value, min, max))).toBe(true);
        }
      }
    });
  });

  describe('When snap is compared with Basics snap', () => {
    it('Then both agree numerically on intervals and lists, and both throw RangeError for invalid targets', () => {
      for (const [value, interval] of triples()) {
        if (!(interval > 0) || !Number.isFinite(interval)) {
          expect(() => snap(value, interval)).toThrow(RangeError);
          expect(() => basicsSnap(value, interval)).toThrow(RangeError);
        } else {
          // `===` on purpose: the sign of zero is pinned separately below.
          expect(snap(value, interval) === basicsSnap(value, interval) || Number.isNaN(snap(value, interval))).toBe(
            true,
          );
        }
      }
      for (const [value, first, second] of triples()) {
        expect(Object.is(snap(value, [first, second]), basicsSnap(value, [first, second]))).toBe(true);
      }
      expect(() => snap(1, [])).toThrow(RangeError);
      expect(() => basicsSnap(1, [])).toThrow(RangeError);
    });
    it('Then the one difference is the sign of zero: Basics normalises -0 to 0, re;Flux keeps it', () => {
      expect(Object.is(snap(-0.1, 1), -0)).toBe(true);
      expect(Object.is(basicsSnap(-0.1, 1), 0)).toBe(true);
    });
  });

  describe('When random is compared with randomBetween under the same injected source', () => {
    it('Then both return the same bits', () => {
      const first = mulberry32(7);
      const second = mulberry32(7);
      for (const [min, max] of triples().filter(([min, max]) => Number.isFinite(min) && Number.isFinite(max))) {
        expect(Object.is(random(min, max, first), randomBetween(min, max, second))).toBe(true);
      }
    });
  });

  describe('When formatNumber is compared with formatDecimal(value, 5)', () => {
    it('Then both return the same string, including NaN, Infinity, -0 and exponent notation', () => {
      for (const value of VALUES) expect(formatNumber(value)).toBe(formatDecimal(value, 5));
      for (const value of [-0, 1e-7, -1e-7, 0.000005, 0.999995, 1e21, 123.456789012345]) {
        expect(formatNumber(value)).toBe(formatDecimal(value, 5));
      }
    });
  });

  describe('When the public clamp is compared with Basics clamp', () => {
    it('Then they agree for ordered bounds but only re;Flux accepts inverted bounds', () => {
      for (const [value, lower, upper] of triples()) {
        if (lower <= upper) expect(Object.is(clamp(value, lower, upper), basicsClamp(value, lower, upper))).toBe(true);
      }
      expect(clamp(5, 10, 0)).toBe(5);
      expect(() => basicsClamp(5, 10, 0)).toThrow(RangeError);
      expect(clamp(2)).toBe(1);
    });
  });

  describe('When interpolateRange is compared with Basics interpolateRange', () => {
    it('Then they agree on finite inputs but differ for a NaN input, which Basics propagates', () => {
      const input = [0, 10, 20, 50];
      const output = [100, 0, 50, 75];
      for (const shouldClamp of [false, true]) {
        const own = interpolateRange(input, output, shouldClamp);
        const other = basicsInterpolateRange(input, output, shouldClamp);
        for (let value = -30; value <= 80; value += 0.37) expect(own(value)).toBeCloseTo(other(value), 9);
      }
      expect(interpolateRange(input, output)(Number.NaN)).toBe(75);
      expect(basicsInterpolateRange(input, output)(Number.NaN)).toBeNaN();
    });
  });

  describe('When the benchmark statistics now delegate to Basics', () => {
    it('Then empty and single-sample inputs keep the results the reports have always shown (0 or null, never NaN)', () => {
      expect(benchmarkMedian([])).toBe(0);
      expect(docsMedian([])).toBeNull();
      expect(benchmarkStandardDeviation([])).toBe(0);
      expect(benchmarkStandardDeviation([4])).toBe(0);
      expect(variability([])).toEqual({ cv: 0, stdev: 0, min: 0, median: 0, max: 0, maxOverMin: 1 });
      expect(variability([4]).cv).toBe(0);
      expect(variability([-2, 2]).cv).toBe(0);
    });
    it('Then non-empty samples match the textbook formulas', () => {
      const samples = [3, 1, 4, 1, 5, 9, 2, 6];
      const mean = samples.reduce((sum, value) => sum + value, 0) / samples.length;
      const stdev = Math.sqrt(samples.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (samples.length - 1));
      expect(benchmarkMedian(samples)).toBe(3.5);
      expect(docsMedian(samples)).toBe(3.5);
      expect(benchmarkStandardDeviation(samples)).toBe(stdev);
      expect(variability(samples).cv).toBeCloseTo(stdev / mean, 4);
    });
  });

  describe('When the benchmark percentile is compared with Basics percentile', () => {
    it('Then they differ: the benchmarks use nearest rank, Basics interpolates (R-7)', () => {
      expect(benchmarkPercentile([1, 2, 3, 4], 0.5)).toBe(2);
      expect(basicsPercentile([1, 2, 3, 4], 0.5)).toBe(2.5);
      expect(benchmarkPercentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.95)).toBe(10);
      expect(basicsPercentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.95)).toBeCloseTo(9.55, 12);
    });
  });
});
