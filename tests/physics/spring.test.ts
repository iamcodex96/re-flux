import { describe, expect, it } from '@jest/globals';
import { projectInertiaTarget, stepSpring } from '../../src/physics/spring.js';

describe('spring physics', () => {
  it('accelerates toward the target and eventually settles', () => {
    let state = { value: 0, velocity: 0 };
    let settled = false;
    for (let time = 0; time < 3000 && !settled; time += 16) {
      const result = stepSpring(state, 100, 16);
      state = { value: result.value, velocity: result.velocity };
      settled = result.settled;
    }

    expect(settled).toBe(true);
    expect(state.value).toBe(100);
    expect(state.velocity).toBe(0);
  });

  it('preserves state for zero delta and clamps very large frame gaps', () => {
    const state = { value: 5, velocity: 4 };
    expect(stepSpring(state, 100, 0)).toEqual({ ...state, settled: false });
    const afterGap = stepSpring(state, 100, 60_000);
    const afterCap = stepSpring(state, 100, 64);
    expect(afterGap).toEqual(afterCap);
    expect(Number.isFinite(afterGap.value)).toBe(true);
    expect(Number.isFinite(afterGap.velocity)).toBe(true);
  });

  it('snaps to target only after position and velocity are within rest thresholds', () => {
    expect(stepSpring({ value: 10.001, velocity: 0.001 }, 10, 16)).toEqual({
      value: 10,
      velocity: 0,
      settled: true,
    });
  });

  it('projects inertia using velocity per second and clamps to bounds', () => {
    expect(projectInertiaTarget(100, 120, 6)).toBe(120);
    expect(projectInertiaTarget(100, 120, 6, { max: 110 })).toBe(110);
    expect(projectInertiaTarget(100, -120, 6, { min: 90 })).toBe(90);
  });

  it('rejects invalid physical samples and invalid bounds', () => {
    expect(() => stepSpring({ value: Number.NaN, velocity: 0 }, 1, 16)).toThrow(RangeError);
    expect(() => projectInertiaTarget(0, 1, 6, { min: 10, max: 2 })).toThrow(RangeError);
  });
});
