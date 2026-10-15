import type { SpringOptions, SpringState, SpringStepResult } from '../types/physics.js';

export const DEFAULT_SPRING_OPTIONS: Required<SpringOptions> = Object.freeze({
  stiffness: 260,
  damping: 30,
  mass: 1,
  restDelta: 0.01,
  restSpeed: 0.01,
  maxSubstepMs: 1000 / 120,
  maxDeltaMs: 64,
});

/**
 * Advances a damped spring using semi-implicit Euler integration.
 * Large frame gaps are capped and subdivided to keep integration stable after tab throttling.
 */
export function stepSpring(
  state: SpringState,
  target: number,
  deltaMs: number,
  options: SpringOptions = {},
): SpringStepResult {
  if (!Number.isFinite(state.value) || !Number.isFinite(state.velocity) || !Number.isFinite(target)) {
    throw new RangeError('Spring values, velocity, and target must be finite numbers.');
  }

  const config = normalizeSpringOptions(options);
  if (isAtRest(state, target, config)) {
    return Object.freeze({ value: target, velocity: 0, settled: true });
  }
  if (!Number.isFinite(deltaMs) || deltaMs <= 0) {
    return Object.freeze({ value: state.value, velocity: state.velocity, settled: false });
  }

  const boundedDelta = Math.min(deltaMs, config.maxDeltaMs);
  const steps = Math.max(1, Math.ceil(boundedDelta / config.maxSubstepMs));
  const stepSeconds = boundedDelta / steps / 1000;
  let value = state.value;
  let velocity = state.velocity;

  for (let index = 0; index < steps; index += 1) {
    const acceleration = (-config.stiffness * (value - target) - config.damping * velocity) / config.mass;
    velocity += acceleration * stepSeconds;
    value += velocity * stepSeconds;
  }

  const nextState = { value, velocity };
  if (isAtRest(nextState, target, config)) {
    return Object.freeze({ value: target, velocity: 0, settled: true });
  }

  return Object.freeze({ value, velocity, settled: false });
}

/** Projects a release position by assuming exponential velocity decay. */
export function projectInertiaTarget(
  position: number,
  velocity: number,
  friction = 6,
  bounds: Readonly<{ min?: number; max?: number }> = {},
): number {
  if (!Number.isFinite(position) || !Number.isFinite(velocity)) {
    throw new RangeError('Position and velocity must be finite numbers.');
  }
  const safeFriction = Number.isFinite(friction) && friction > 0 ? friction : 6;
  const projected = position + velocity / safeFriction;
  const min = bounds.min ?? Number.NEGATIVE_INFINITY;
  const max = bounds.max ?? Number.POSITIVE_INFINITY;
  if (Number.isNaN(min) || Number.isNaN(max) || min > max) {
    throw new RangeError('Inertia bounds must be valid numbers and the minimum cannot exceed the maximum.');
  }
  return Math.min(max, Math.max(min, projected));
}

function normalizeSpringOptions(options: SpringOptions): Required<SpringOptions> {
  return {
    stiffness: positive(options.stiffness, DEFAULT_SPRING_OPTIONS.stiffness),
    damping: nonNegative(options.damping, DEFAULT_SPRING_OPTIONS.damping),
    mass: positive(options.mass, DEFAULT_SPRING_OPTIONS.mass),
    restDelta: nonNegative(options.restDelta, DEFAULT_SPRING_OPTIONS.restDelta),
    restSpeed: nonNegative(options.restSpeed, DEFAULT_SPRING_OPTIONS.restSpeed),
    maxSubstepMs: positive(options.maxSubstepMs, DEFAULT_SPRING_OPTIONS.maxSubstepMs),
    maxDeltaMs: positive(options.maxDeltaMs, DEFAULT_SPRING_OPTIONS.maxDeltaMs),
  };
}

function isAtRest(state: SpringState, target: number, options: Required<SpringOptions>): boolean {
  return Math.abs(target - state.value) <= options.restDelta && Math.abs(state.velocity) <= options.restSpeed;
}

function positive(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isFinite(value) && value > 0 ? value : fallback;
}

function nonNegative(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isFinite(value) && value >= 0 ? value : fallback;
}
