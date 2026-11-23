import type { ValueInterpolator } from '../types/values.js';
import {
  compileColorMix,
  compileNumericTemplate,
  formatNumber,
  formatRgba,
  mixRgba,
  parseColor,
  renderNumericTemplate,
  tokenizeNumbers,
} from '../utils/valueTemplate.js';

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
    return compile(from, to) as unknown as ValueInterpolator<T>;
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
    return (
      fromKeys.length === toKeys.length &&
      fromKeys.every((key) => Object.prototype.hasOwnProperty.call(to, key) && canInterpolate(from[key], to[key]))
    );
  }
  return Object.is(from, to);
}

type CompiledInterpolator = (start: unknown, end: unknown, progress: number) => unknown;

/**
 * Parse the fixed endpoints once and return the per-frame closure. Strings are parsed (colors, numeric templates)
 * at compile time and re-read only when a call passes a different string; plain objects keep their compile-time
 * keys while the container identity is unchanged; anything unexpected falls back to the generic
 * `interpolateValue`, which is also what the public one-shot `interpolate()` uses. Output is identical to it.
 */
function compile(from: unknown, to: unknown): CompiledInterpolator {
  if (typeof from === 'number' && typeof to === 'number') {
    return (start, end, progress) =>
      typeof start === 'number' && typeof end === 'number'
        ? start + (end - start) * progress
        : interpolateValue(start, end, progress);
  }
  if (typeof from === 'string' && typeof to === 'string') {
    const fromColor = parseColor(from);
    const toColor = parseColor(to);
    if (fromColor && toColor) {
      const render = compileColorMix(fromColor, toColor);
      return (start, end, progress) =>
        start === from && end === to ? render(progress) : interpolateValue(start, end, progress);
    }
    const render = compileNumericTemplate(tokenizeNumbers(from), tokenizeNumbers(to));
    return (start, end, progress) =>
      start === from && end === to ? render(progress) : interpolateValue(start, end, progress);
  }
  if (Array.isArray(from) && Array.isArray(to)) {
    const children = from.map((value, index) => compile(value, to[index]));
    const count = children.length;
    return (start, end, progress) => {
      if (!Array.isArray(start) || !Array.isArray(end) || start.length !== count || end.length !== count) {
        return interpolateValue(start, end, progress);
      }
      const result = new Array<unknown>(count);
      for (let index = 0; index < count; index += 1)
        result[index] = children[index]!(start[index], end[index], progress);
      return result;
    };
  }
  if (isPlainRecord(from) && isPlainRecord(to)) {
    const keys = Object.keys(from);
    const children = keys.map((key) => compile(from[key], to[key]));
    return (start, end, progress) => {
      if (start !== from || end !== to) return interpolateValue(start, end, progress);
      const result: AnyRecord = {};
      for (let index = 0; index < keys.length; index += 1) {
        const key = keys[index]!;
        result[key] = children[index]!((start as AnyRecord)[key], (end as AnyRecord)[key], progress);
      }
      return result;
    };
  }
  return (start, end, progress) => interpolateValue(start, end, progress);
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
