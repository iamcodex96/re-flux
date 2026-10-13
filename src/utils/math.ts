import type { EasingFunction } from '../types.js';
import { resolveEasing } from './easings.js';
import { interpolate as interpolateValue } from '../values/interpolate.js';

export type NumericRange = readonly [number, number];
export type SnapTarget = number | readonly number[];

export interface DistributeOptions {
  readonly from?: number | NumericRange;
  readonly to?: number;
  readonly base?: number;
  readonly ease?: EasingFunction | string;
  readonly reverse?: boolean;
}

/** Constrain a number to the inclusive range. Bounds may be supplied in either order. */
export function clamp(value: number, min = 0, max = 1): number {
  const lower = Math.min(min, max);
  const upper = Math.max(min, max);
  return Math.min(upper, Math.max(lower, value));
}

/** Linear interpolation between two numbers. The progress is intentionally not clamped. */
export function lerp(from: number, to: number, progress: number): number {
  return from + (to - from) * progress;
}

/** Map a number from one range to another; degenerate input ranges map to the output start. */
export function mapRange(value: number, inputMin: number, inputMax: number, outputMin: number, outputMax: number, shouldClamp = false): number {
  if (inputMin === inputMax) return outputMin;
  const progress = (value - inputMin) / (inputMax - inputMin);
  const normalized = shouldClamp ? clamp(progress) : progress;
  return lerp(outputMin, outputMax, normalized);
}

/** Snap a value to the nearest interval or to the nearest entry in a supplied list. */
export function snap(value: number, target: SnapTarget): number {
  if (typeof target === 'number') {
    if (!(target > 0) || !Number.isFinite(target)) throw new RangeError('Snap interval must be a finite number greater than zero.');
    return Math.round(value / target) * target;
  }
  if (target.length === 0) throw new RangeError('Snap target list must not be empty.');
  let closest = target[0]!;
  let distance = Math.abs(value - closest);
  for (const candidate of target.slice(1)) {
    const nextDistance = Math.abs(value - candidate);
    if (nextDistance < distance) { closest = candidate; distance = nextDistance; }
  }
  return closest;
}

/** Wrap a value into [min, max), useful for looping angles and indices. */
export function wrap(value: number, min: number, max: number): number {
  if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) throw new RangeError('Wrap bounds must be finite and different.');
  const span = max - min;
  return ((value - min) % span + span) % span + min;
}

/** Generate a random value in [min, max); inject a random source for deterministic tests. */
export function random(min = 0, max = 1, randomSource: () => number = Math.random): number {
  if (!Number.isFinite(min) || !Number.isFinite(max)) throw new RangeError('Random bounds must be finite.');
  return min + (max - min) * randomSource();
}

/** Interpolate supported values, including numeric templates, colors, arrays and plain objects. */
export function interpolate<T>(from: T, to: T, progress: number): T {
  return interpolateValue(from, to, progress);
}

/** Create a piecewise numeric interpolator from an input range and matching output range. */
export function interpolateRange(input: NumericRange | readonly number[], output: readonly number[], shouldClamp = false): (value: number) => number {
  if (input.length < 2 || input.length !== output.length) throw new RangeError('Input and output ranges must have the same length (at least two entries).');
  if (input.some((value, index) => index > 0 && value < input[index - 1]!)) throw new RangeError('Input range must be sorted in ascending order.');
  return (value) => {
    if (shouldClamp) value = clamp(value, input[0]!, input[input.length - 1]!);
    if (value <= input[0]!) return lerp(output[0]!, output[1]!, (value - input[0]!) / (input[1]! - input[0]! || 1));
    const last = input.length - 1;
    if (value >= input[last]!) return lerp(output[last - 1]!, output[last]!, (value - input[last - 1]!) / (input[last]! - input[last - 1]! || 1));
    for (let index = 1; index < input.length; index += 1) {
      if (value <= input[index]!) {
        const span = input[index]! - input[index - 1]!;
        return lerp(output[index - 1]!, output[index]!, span === 0 ? 0 : (value - input[index - 1]!) / span);
      }
    }
    return output[last]!;
  };
}

/** Compose functions left-to-right, passing each result to the next function. */
export function pipe<T>(...functions: readonly ((value: T) => T)[]): (value: T) => T {
  return (value) => functions.reduce((current, fn) => fn(current), value);
}

/** Distribute a numeric value across target indices, optionally eased or reversed. */
export function distribute(options: DistributeOptions = {}): (index: number, total: number) => number {
  const from = options.from ?? 0;
  const start = Array.isArray(from) ? from[0] ?? 0 : from as number;
  const end = options.to ?? (Array.isArray(from) ? from[1] ?? start : start);
  const base = options.base ?? 0;
  const easing = options.ease === undefined ? (value: number) => value : resolveEasing(options.ease);
  return (index, total) => {
    if (!Number.isInteger(index) || !Number.isInteger(total) || total < 1 || index < 0 || index >= total) {
      throw new RangeError('distribute(index, total) requires 0 <= index < total and total >= 1.');
    }
    const orientedIndex = options.reverse ? total - 1 - index : index;
    const progress = total === 1 ? 0 : orientedIndex / (total - 1);
    return base + lerp(start, end, easing(progress));
  };
}
