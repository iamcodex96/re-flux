import type { ValueInterpolator } from '../types/values.js';
import { formatNumber, formatRgba, mixRgba, parseColor, renderNumericTemplate, tokenizeNumbers } from '../utils/valueTemplate.js';

type AnyRecord = Record<string, unknown>;

/** Resolve an interpolator for numbers, compatible numeric templates, colors, arrays and plain objects. */
export function resolveInterpolator<T>(
  from: T,
  to: T,
  customInterpolator?: ValueInterpolator<T>,
  owner = 'Tween',
): ValueInterpolator<T> {
  if (customInterpolator) return customInterpolator;
  if (canInterpolate(from, to)) {
    return ((start: T, end: T, progress: number) => interpolateValue(start, end, progress)) as ValueInterpolator<T>;
  }
  throw new TypeError(`${owner} requires an interpolate function when values are not numbers.`);
}

/** Interpolate supported values without allocating a Tween. Values may overshoot when progress is outside 0..1. */
export function interpolate<T>(from: T, to: T, progress: number): T {
  if (!Number.isFinite(progress)) throw new RangeError('Interpolation progress must be a finite number.');
  if (!canInterpolate(from, to)) {
    throw new TypeError('Values are incompatible. Provide a custom interpolator for this value type.');
  }
  return interpolateValue(from, to, progress);
}

function canInterpolate(from: unknown, to: unknown): boolean {
  if (typeof from === 'number' && typeof to === 'number') return Number.isFinite(from) && Number.isFinite(to);
  if (typeof from === 'string' && typeof to === 'string') {
    if (parseColor(from) && parseColor(to)) return true;
    const a = tokenizeNumbers(from);
    const b = tokenizeNumbers(to);
    return a.values.length > 0 && a.template === b.template && a.values.length === b.values.length;
  }
  if (Array.isArray(from) && Array.isArray(to)) {
    return from.length === to.length && from.every((value, index) => canInterpolate(value, to[index]));
  }
  if (isPlainRecord(from) && isPlainRecord(to)) {
    const fromKeys = Object.keys(from);
    const toKeys = Object.keys(to);
    return fromKeys.length === toKeys.length && fromKeys.every((key) =>
      Object.prototype.hasOwnProperty.call(to, key) && canInterpolate(from[key], to[key]));
  }
  return Object.is(from, to);
}

function interpolateValue<T>(from: T, to: T, progress: number): T {
  if (typeof from === 'number' && typeof to === 'number') {
    return (from + (to - from) * progress) as T;
  }
  if (typeof from === 'string' && typeof to === 'string') {
    const fromColor = parseColor(from);
    const toColor = parseColor(to);
    if (fromColor && toColor) return formatRgba(mixRgba(fromColor, toColor, progress)) as T;
    const a = tokenizeNumbers(from);
    const b = tokenizeNumbers(to);
    return renderNumericTemplate(a.template, (index) => {
      const start = a.values[index] ?? 0;
      const end = b.values[index] ?? start;
      return formatNumber(start + (end - start) * progress);
    }) as T;
  }
  if (Array.isArray(from) && Array.isArray(to)) {
    return from.map((value, index) => interpolateValue(value, to[index], progress)) as T;
  }
  if (isPlainRecord(from) && isPlainRecord(to)) {
    const result: AnyRecord = {};
    for (const key of Object.keys(from)) result[key] = interpolateValue(from[key], to[key], progress);
    return result as T;
  }
  return from;
}

function isPlainRecord(value: unknown): value is AnyRecord {
  if (typeof value !== 'object' || value === null) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
