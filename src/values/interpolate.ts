import type { ValueInterpolator } from '../types/values.js';

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
    const a = parseNumericTemplate(from);
    const b = parseNumericTemplate(to);
    return a !== null && b !== null && a.template === b.template && a.values.length === b.values.length;
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
    if (fromColor && toColor) return interpolateColor(fromColor, toColor, progress) as T;
    const a = parseNumericTemplate(from)!;
    const b = parseNumericTemplate(to)!;
    let index = 0;
    return a.template.replace(/\u0000/g, () => {
      const start = a.values[index] ?? 0;
      const end = b.values[index] ?? start;
      index += 1;
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

interface NumericTemplate {
  readonly template: string;
  readonly values: readonly number[];
}

function parseNumericTemplate(value: string): NumericTemplate | null {
  const values: number[] = [];
  const template = value.replace(/[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:e[-+]?\d+)?/gi, (match) => {
    const number = Number(match);
    if (!Number.isFinite(number)) return match;
    values.push(number);
    return '\u0000';
  });
  // Purely discrete strings ("open" -> "closed") are deliberately not interpolated.
  if (values.length === 0) return null;
  return { template, values };
}

interface Rgba { readonly r: number; readonly g: number; readonly b: number; readonly a: number }

function parseColor(input: string): Rgba | null {
  const value = input.trim().toLowerCase();
  const hex = /^#([\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/i.exec(value);
  if (hex?.[1]) {
    let raw = hex[1];
    if (raw.length === 3 || raw.length === 4) raw = [...raw].map((part) => `${part}${part}`).join('');
    const hasAlpha = raw.length === 8;
    return {
      r: Number.parseInt(raw.slice(0, 2), 16),
      g: Number.parseInt(raw.slice(2, 4), 16),
      b: Number.parseInt(raw.slice(4, 6), 16),
      a: hasAlpha ? Number.parseInt(raw.slice(6, 8), 16) / 255 : 1,
    };
  }
  const rgb = /^rgba?\(\s*([+-]?[\d.]+)\s*[, ]\s*([+-]?[\d.]+)\s*[, ]\s*([+-]?[\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/i.exec(value);
  if (!rgb) return null;
  const alphaText = rgb[4] ?? '1';
  const alpha = alphaText.endsWith('%') ? Number(alphaText.slice(0, -1)) / 100 : Number(alphaText);
  const channels = [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
  if (![...channels, alpha].every(Number.isFinite)) return null;
  return {
    r: clampChannel(channels[0]!),
    g: clampChannel(channels[1]!),
    b: clampChannel(channels[2]!),
    a: Math.max(0, Math.min(1, alpha)),
  };
}

function interpolateColor(from: Rgba, to: Rgba, progress: number): string {
  const r = clampChannel(Math.round(from.r + (to.r - from.r) * progress));
  const g = clampChannel(Math.round(from.g + (to.g - from.g) * progress));
  const b = clampChannel(Math.round(from.b + (to.b - from.b) * progress));
  const a = from.a + (to.a - from.a) * progress;
  return `rgba(${r}, ${g}, ${b}, ${formatNumber(a)})`;
}

function clampChannel(value: number): number { return Math.max(0, Math.min(255, value)); }
function formatNumber(value: number): string {
  if (Object.is(value, -0)) return '0';
  return String(Number(value.toFixed(5)));
}
function isPlainRecord(value: unknown): value is AnyRecord {
  if (typeof value !== 'object' || value === null) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
