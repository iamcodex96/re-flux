import { describe, expect, it } from '@jest/globals';
import { Easings, cubicBezier, resolveEasing, steps } from '../../src/utils/easings.js';

/**
 * Every built-in easing and its value at t = 0.5. The key set is compared with `Easings`,
 * so adding an easing without listing it here fails the first test.
 */
const MIDPOINT: Readonly<Record<string, number>> = {
  linear: 0.5,
  easeInSine: 1 - Math.cos(Math.PI / 4),
  easeOutSine: Math.sin(Math.PI / 4),
  easeInOutSine: 0.5,
  easeInQuad: 0.25,
  easeOutQuad: 0.75,
  easeInOutQuad: 0.5,
  easeInCubic: 0.125,
  easeOutCubic: 0.875,
  easeInOutCubic: 0.5,
  easeInQuart: 0.0625,
  easeOutQuart: 0.9375,
  easeInOutQuart: 0.5,
  easeInQuint: 0.03125,
  easeOutQuint: 0.96875,
  easeInOutQuint: 0.5,
  easeInCirc: 1 - Math.sqrt(0.75),
  easeOutCirc: Math.sqrt(0.75),
  easeInOutCirc: 0.5,
  easeInExpo: 0.03125,
  easeOutExpo: 0.96875,
  easeInOutExpo: 0.5,
  easeInBack: -0.0876975,
  easeOutBack: 1.0876975,
  easeInOutBack: 0.5,
  easeInElastic: -0.015625,
  easeOutElastic: 1.015625,
  easeInBounce: 0.234375,
  easeOutBounce: 0.765625,
  easeInOutBounce: 0.5,
};

/** Families that overshoot [0, 1] or bounce on purpose, so they are not monotonic or not bounded. */
const NON_MONOTONIC = /Back|Elastic|Bounce/;
const OVERSHOOTING = /Back|Elastic/;
const GRID = Array.from({ length: 101 }, (_, index) => index / 100);

describe('Given the built-in easing functions', () => {
  describe('When the Easings table is inspected', () => {
    it('Then every easing is listed in this test so none is left unexercised', () => {
      expect(Object.keys(Easings).sort()).toEqual(Object.keys(MIDPOINT).sort());
    });
  });

  describe.each(Object.keys(MIDPOINT))('And When %s is evaluated', (name) => {
    const easing = Easings[name]!;

    it('Then it starts at 0 and ends at 1', () => {
      expect(easing(0)).toBeCloseTo(0, 9);
      expect(easing(1)).toBeCloseTo(1, 9);
    });

    it('Then it returns the expected value at the midpoint', () => {
      expect(easing(0.5)).toBeCloseTo(MIDPOINT[name]!, 9);
    });

    it('Then it returns a finite number across the whole [0, 1] range', () => {
      for (const progress of GRID) expect(Number.isFinite(easing(progress))).toBe(true);
    });

    if (NON_MONOTONIC.test(name)) {
      it('Then it is documented as non-monotonic', () => {
        const values = GRID.map((progress) => easing(progress));
        const decreases = values.some((value, index) => index > 0 && value < values[index - 1]! - 1e-12);
        expect(decreases).toBe(true);
      });
    } else {
      it('Then it never decreases as progress increases', () => {
        const values = GRID.map((progress) => easing(progress));
        values.forEach((value, index) => {
          if (index > 0) expect(value).toBeGreaterThanOrEqual(values[index - 1]! - 1e-12);
        });
      });
    }

    if (OVERSHOOTING.test(name)) {
      it('Then it intentionally leaves the [0, 1] interval', () => {
        const values = GRID.map((progress) => easing(progress));
        expect(values.some((value) => value < -1e-9 || value > 1 + 1e-9)).toBe(true);
      });
    } else {
      it('Then it stays within the [0, 1] interval', () => {
        for (const progress of GRID) {
          const value = easing(progress);
          expect(value).toBeGreaterThanOrEqual(-1e-9);
          expect(value).toBeLessThanOrEqual(1 + 1e-9);
        }
      });
    }
  });
});

describe('Given resolveEasing', () => {
  describe('When it receives a function', () => {
    it('Then it returns the same function', () => {
      const custom = (progress: number): number => progress * progress;
      expect(resolveEasing(custom)).toBe(custom);
    });
  });
  describe('When it receives a built-in name', () => {
    it('Then it returns the matching easing', () => {
      expect(resolveEasing('easeInQuad')).toBe(Easings.easeInQuad);
    });
  });
  describe('When it receives nothing or an unknown name', () => {
    it('Then it currently falls back to linear', () => {
      // Pinned as characterization of today's behaviour; roadmap item API-001 may change the policy.
      expect(resolveEasing()(0.3)).toBe(0.3);
      expect(resolveEasing('notAnEasing')(0.3)).toBe(0.3);
      expect(resolveEasing('toString')(0.3)).toBe(0.3);
    });
  });
});

describe('Given cubicBezier', () => {
  const bezier = (curve: readonly number[]) => cubicBezier(curve[0]!, curve[1]!, curve[2]!, curve[3]!);

  /**
   * Reference values come from an independent bisection solver on the same Bezier definition
   * (the CSS `ease`, `ease-in`, `ease-out` and `ease-in-out` keywords).
   */
  const CSS_REFERENCE = [
    { name: 'ease', curve: [0.25, 0.1, 0.25, 1], at: [0.25, 0.5, 0.75], expected: [0.40851, 0.8024, 0.96046] },
    { name: 'ease-in', curve: [0.42, 0, 1, 1], at: [0.25, 0.5, 0.75], expected: [0.09346, 0.31536, 0.62186] },
    { name: 'ease-out', curve: [0, 0, 0.58, 1], at: [0.25, 0.5, 0.75], expected: [0.37814, 0.68464, 0.90654] },
    { name: 'ease-in-out', curve: [0.42, 0, 0.58, 1], at: [0.25, 0.5, 0.75], expected: [0.12916, 0.5, 0.87084] },
  ] as const;

  describe.each(CSS_REFERENCE)('When the CSS $name curve is created', ({ curve, at, expected }) => {
    it('Then it matches the reference values within 1e-4', () => {
      const easing = bezier(curve);
      at.forEach((progress, index) => expect(Math.abs(easing(progress) - expected[index]!)).toBeLessThan(1e-4));
    });
  });

  describe('When progress is outside the open interval (0, 1)', () => {
    it('Then it returns the progress unchanged', () => {
      const easing = cubicBezier(0.25, 0.1, 0.25, 1);
      expect(easing(0)).toBe(0);
      expect(easing(1)).toBe(1);
      expect(easing(-0.5)).toBe(-0.5);
      expect(easing(1.5)).toBe(1.5);
    });
  });

  describe('When the control points describe a straight line', () => {
    it('Then it behaves like linear easing', () => {
      const easing = cubicBezier(0, 0, 1, 1);
      for (const progress of [0.1, 0.33, 0.5, 0.9]) expect(easing(progress)).toBeCloseTo(progress, 6);
    });
  });

  describe('When y control points leave [0, 1]', () => {
    it('Then the curve is allowed to overshoot', () => {
      const easing = cubicBezier(0.34, 1.56, 0.64, 1);
      const values = GRID.map((progress) => easing(progress));
      expect(Math.max(...values)).toBeGreaterThan(1);
    });
  });

  describe('When a steep curve makes Newton iteration unstable', () => {
    it('Then it still converges to a value inside [0, 1] via bisection', () => {
      const easing = cubicBezier(0, 1, 1, 0);
      for (const progress of GRID) {
        const value = easing(progress);
        expect(Number.isFinite(value)).toBe(true);
        expect(value).toBeGreaterThanOrEqual(-1e-9);
        expect(value).toBeLessThanOrEqual(1 + 1e-9);
      }
    });
  });

  describe.each([
    ['x1 below 0', [-0.1, 0, 0.5, 1]],
    ['x1 above 1', [1.1, 0, 0.5, 1]],
    ['x2 below 0', [0.5, 0, -0.1, 1]],
    ['x2 above 1', [0.5, 0, 1.1, 1]],
    ['a NaN control point', [0.5, Number.NaN, 0.5, 1]],
    ['an infinite y control point', [0.5, Infinity, 0.5, 1]],
  ] as const)('When it receives %s', (_label, curve) => {
    it('Then it throws a RangeError', () => {
      expect(() => bezier(curve)).toThrow(RangeError);
    });
  });
});

describe('Given steps', () => {
  describe('When the position is end (default)', () => {
    it('Then each step advances at its end', () => {
      const easing = steps(4);
      expect(easing(0)).toBe(0);
      expect(easing(0.24)).toBe(0);
      expect(easing(0.25)).toBe(0.25);
      expect(easing(0.74)).toBe(0.5);
      expect(easing(1)).toBe(1);
    });
  });
  describe('When the position is start', () => {
    it('Then each step advances at its beginning', () => {
      const easing = steps(4, 'start');
      expect(easing(0)).toBe(0.25);
      expect(easing(0.01)).toBe(0.25);
      expect(easing(0.26)).toBe(0.5);
      expect(easing(1)).toBe(1);
    });
  });
  describe('When progress is below 0', () => {
    it('Then it returns the first step value for the chosen position', () => {
      expect(steps(2, 'end')(-1)).toBe(0);
      expect(steps(2, 'start')(-1)).toBe(0.5);
    });
  });
  describe.each([0, -1, 1.5, Number.NaN, Infinity])('When the step count is %p', (count) => {
    it('Then it throws a RangeError', () => {
      expect(() => steps(count)).toThrow(RangeError);
    });
  });
});
