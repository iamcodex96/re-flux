import { describe, expect, it } from '@jest/globals';
import { interpolate, resolveInterpolator } from '../../src/values/interpolate.js';

/**
 * PERF-002: `resolveInterpolator()` compiles its endpoints once, while the public one-shot `interpolate()` keeps
 * the legacy parse-every-call path. The one-shot function is therefore the oracle for the compiled closure.
 */

function mulberry32(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const random = mulberry32(20261123);
const int = (max: number): number => Math.floor(random() * max);
const decimal = (): number => Math.round((random() * 400 - 200) * 1000) / 1000;
const pick = <T>(items: readonly T[]): T => items[int(items.length)]!;
const hex = (): string => `#${Array.from({ length: 6 }, () => int(16).toString(16)).join('')}`;
const shortHex = (): string => `#${Array.from({ length: 3 }, () => int(16).toString(16)).join('')}`;
const alphaHex = (): string => `#${Array.from({ length: 8 }, () => int(16).toString(16)).join('')}`;
const channel = (): number => int(300) - 20; // includes out-of-range channels
const rgba = (): string => `rgba(${channel()}, ${channel()}, ${channel()}, ${Math.round(random() * 120) / 100})`;
const rgbSpace = (): string => `rgb(${channel()} ${channel()} ${channel()} / ${int(120)}%)`;
const rgbPercent = (): string => `rgb(${int(100)}% ${int(100)}% ${int(100)}%)`;

type Pair = readonly [unknown, unknown];

const generators: ReadonlyArray<() => Pair> = [
  () => [decimal(), decimal()],
  () => [
    pick([hex, shortHex, alphaHex, rgba, rgbSpace, rgbPercent])(),
    pick([hex, shortHex, alphaHex, rgba, rgbSpace, rgbPercent])(),
  ],
  () => {
    const unit = pick(['px', 'em', '%', 'deg', '']);
    return [`${decimal()}${unit}`, `${decimal()}${unit}`];
  },
  () => [
    `translate(${decimal()}px, ${decimal()}px) scale(${decimal()})`,
    `translate(${decimal()}px, ${decimal()}px) scale(${decimal()})`,
  ],
  () => [`${decimal()}e-3px`, `${decimal()}e-2px`],
  () => [`+${int(50)}px`, `-${int(50)}px`],
  () => [
    [decimal(), decimal(), decimal()],
    [decimal(), decimal(), decimal()],
  ],
  () => [
    [hex(), `${int(40)}px`],
    [hex(), `${int(40)}px`],
  ],
  () => [
    { x: decimal(), y: decimal(), color: hex() },
    { x: decimal(), y: decimal(), color: rgba() },
  ],
  () => [{ nested: { a: [decimal(), `${int(9)}px`] } }, { nested: { a: [decimal(), `${int(9)}px`] } }],
];

const PROGRESS = [-0.5, 0, 0.1, 0.25, 0.5, 0.75, 1, 1.2, random(), random(), random()];

describe('Given a compiled interpolator from resolveInterpolator()', () => {
  describe('When it is compared with the one-shot interpolate() on random pairs', () => {
    it('Then it returns identical values for at least 1000 pairs at every sampled progress', () => {
      let compared = 0;
      for (let round = 0; round < 120; round += 1) {
        for (const generate of generators) {
          const [from, to] = generate();
          let compiled;
          try {
            compiled = resolveInterpolator(from, to);
          } catch {
            expect(() => interpolate(from, to, 0.5)).toThrow();
            continue;
          }
          for (const progress of PROGRESS) {
            expect(compiled(from, to, progress)).toEqual(interpolate(from, to, progress));
          }
          compared += 1;
        }
      }
      expect(compared).toBeGreaterThanOrEqual(1000);
    });
  });

  describe('When the closure is called repeatedly with the same endpoints', () => {
    it('Then every call gives the same answer as the first (no state leaks between frames)', () => {
      const interpolator = resolveInterpolator('rgba(10, 20, 30, 0.2)', 'rgba(240, 220, 200, 0.9)');
      const first = Array.from({ length: 11 }, (_unused, i) =>
        interpolator('rgba(10, 20, 30, 0.2)', 'rgba(240, 220, 200, 0.9)', i / 10),
      );
      const second = Array.from({ length: 11 }, (_unused, i) =>
        interpolator('rgba(10, 20, 30, 0.2)', 'rgba(240, 220, 200, 0.9)', i / 10),
      );
      expect(second).toEqual(first);
    });
  });

  describe('When it is called with endpoints other than the ones it was resolved with', () => {
    it('Then strings are re-read and numbers use the arguments, matching interpolate()', () => {
      const interpolator = resolveInterpolator('0px', '100px');
      expect(interpolator('0px', '100px', 0.5)).toBe('50px');
      expect(interpolator('10px', '20px', 0.5)).toBe(interpolate('10px', '20px', 0.5));
      expect(interpolator('#000000', '#ffffff', 0.5)).toBe(interpolate('#000000', '#ffffff', 0.5));
      expect(interpolator('0px', '100px', 0.25)).toBe('25px');

      const numbers = resolveInterpolator(0, 10);
      expect(numbers(100, 200, 0.5)).toBe(150);
    });

    it('Then array and object leaves follow later mutations of the same containers', () => {
      const from = [0, '0px', { x: 0 }];
      const to = [10, '10px', { x: 10 }];
      const interpolator = resolveInterpolator(from, to);
      expect(interpolator(from, to, 0.5)).toEqual([5, '5px', { x: 5 }]);

      from[0] = 100;
      from[1] = '20px';
      (from[2] as { x: number }).x = 50;
      expect(interpolator(from, to, 0.5)).toEqual(interpolate(from, to, 0.5));
    });

    it('Then a container of a different shape falls back to the generic path', () => {
      const interpolator = resolveInterpolator([0, 1], [10, 11]);
      expect(interpolator([0, 1, 2], [10, 11, 12], 0.5)).toEqual(interpolate([0, 1, 2], [10, 11, 12], 0.5));
      const objects = resolveInterpolator<Record<string, number>>({ a: 0 }, { a: 10 });
      expect(objects({ a: 0, b: 5 }, { a: 10, b: 15 }, 0.5)).toEqual(
        interpolate({ a: 0, b: 5 }, { a: 10, b: 15 }, 0.5),
      );
    });
  });

  describe('When the endpoints are incompatible or custom', () => {
    it('Then incompatible endpoints still throw at resolve time and a custom interpolator is returned as is', () => {
      expect(() => resolveInterpolator('a', 'b')).toThrow('requires an interpolate function');
      expect(() => resolveInterpolator('translateX(0px)', 'scale(1)')).toThrow('requires an interpolate function');
      const custom = (): string => 'x';
      expect(resolveInterpolator('a', 'b', custom)).toBe(custom);
    });
  });
});
