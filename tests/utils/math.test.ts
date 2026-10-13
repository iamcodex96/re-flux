import { describe, expect, it } from '@jest/globals';
import { clamp, distribute, interpolateRange, lerp, mapRange, random, snap, wrap } from '../../src/utils/math.js';
import { cubicBezier, steps } from '../../src/utils/easings.js';

describe('math and easing utilities', () => {
  it('provides range, snapping and wrapping helpers', () => {
    expect(clamp(12, 0, 10)).toBe(10);
    expect(lerp(10, 20, 0.5)).toBe(15);
    expect(mapRange(5, 0, 10, 0, 100)).toBe(50);
    expect(mapRange(15, 0, 10, 0, 100, true)).toBe(100);
    expect(snap(17, 10)).toBe(20);
    expect(snap(17, [0, 12, 20])).toBe(20);
    expect(wrap(-1, 0, 360)).toBe(359);
    expect(random(10, 20, () => 0.25)).toBe(12.5);
  });

  it('creates piecewise range interpolation and distributed values', () => {
    const scale = interpolateRange([0, 50, 100], [0, 1, 10]);
    expect(scale(25)).toBe(0.5);
    expect(scale(75)).toBe(5.5);
    const delay = distribute({ from: [0, 100] });
    expect([delay(0, 3), delay(1, 3), delay(2, 3)]).toEqual([0, 50, 100]);
  });

  it('supports cubic bezier and discrete steps', () => {
    expect(cubicBezier(0.42, 0, 1, 1)(0)).toBe(0);
    expect(cubicBezier(0.42, 0, 1, 1)(1)).toBe(1);
    expect(steps(4)(0.49)).toBe(0.25);
    expect(steps(4, 'start')(0)).toBe(0.25);
  });
});
