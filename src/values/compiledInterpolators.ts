import type { ValueInterpolator } from '../types/values.js';

/**
 * Internal hook that lets an adapter hand `Keyframes` a per-segment compiler without changing the public
 * `interpolate` option. A compiler receives the two fixed endpoints of one segment once, at construction, and
 * returns the interpolator `Keyframes` calls for every frame of that segment. This module is not re-exported from
 * any package entry point.
 */
export type InterpolatorCompiler<T> = (from: T, to: T) => ValueInterpolator<T>;

const compilers = new WeakMap<object, unknown>();

/**
 * Return `interpolator` after associating a compiler with it. Anything that only calls it as a plain
 * `ValueInterpolator` keeps working (it must remain a correct one-shot implementation); `Keyframes` prefers the compiler.
 */
export function withInterpolatorCompiler<T>(
  interpolator: ValueInterpolator<T>,
  compiler: InterpolatorCompiler<T>,
): ValueInterpolator<T> {
  compilers.set(interpolator, compiler);
  return interpolator;
}

/** The compiler registered for `interpolator`, if any. */
export function getInterpolatorCompiler<T>(
  interpolator: ValueInterpolator<T> | undefined,
): InterpolatorCompiler<T> | undefined {
  return interpolator === undefined ? undefined : (compilers.get(interpolator) as InterpolatorCompiler<T> | undefined);
}
