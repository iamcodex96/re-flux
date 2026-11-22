/**
 * Internal numeric-token, color and number-formatting primitives shared by `interpolate()`,
 * `interpolateCssValue()` and the SVG path morpher. This module is not part of the public API: it is deliberately
 * not re-exported from any package entry point.
 */

/**
 * Source of the one numeric-token pattern: optional sign, decimal digits (`5`, `5.`, `.5`, `5.5`) and an optional
 * exponent (`e-3`). `em`/`ex` units are not exponents because an exponent needs digits after the `e`.
 */
export const NUMERIC_TOKEN_SOURCE = '[-+]?(?:\\d*\\.\\d+|\\d+\\.?\\d*)(?:[eE][-+]?\\d+)?';

const NUMERIC_TOKEN = new RegExp(NUMERIC_TOKEN_SOURCE, 'g');
const SLOT = '\u0000';
const SLOT_PATTERN = /\u0000/g;

/** A value split into its literal text (with one slot per number) and the numbers it contained. */
export interface NumericTemplate {
  readonly template: string;
  readonly values: readonly number[];
}

/**
 * Split a string into a template and its numbers. Units and any other text stay in the template, so two strings
 * are interpolation-compatible when their templates are equal. A token that is not a finite number stays literal.
 */
export function tokenizeNumbers(input: string): NumericTemplate {
  const values: number[] = [];
  const template = input.replace(NUMERIC_TOKEN, (match) => {
    const number = Number(match);
    if (!Number.isFinite(number)) return match;
    values.push(number);
    return SLOT;
  });
  return { template, values };
}

/** Fill every slot of a template, in order, with the text produced for that slot index. */
export function renderNumericTemplate(template: string, produce: (index: number) => string): string {
  let index = 0;
  return template.replace(SLOT_PATTERN, () => produce(index++));
}

/**
 * Pre-compile two compatible templates into a per-frame renderer. The template is split into its literal pieces
 * once, so each call only formats numbers and concatenates; output is identical to
 * `renderNumericTemplate(from.template, i => formatNumber(start + (end - start) * progress))`.
 * A missing end value falls back to its start value, as in the one-shot path.
 */
export function compileNumericTemplate(from: NumericTemplate, to: NumericTemplate): (progress: number) => string {
  const pieces = from.template.split(SLOT);
  const count = from.values.length;
  const starts = Float64Array.from(from.values);
  const ends = Float64Array.from(from.values, (start, index) => to.values[index] ?? start);
  return (progress) => {
    let out = pieces[0]!;
    for (let index = 0; index < count; index += 1) {
      const start = starts[index]!;
      out += formatNumber(start + (ends[index]! - start) * progress) + pieces[index + 1]!;
    }
    return out;
  };
}

/**
 * Same output as `compileNumericTemplate`, built differently for long templates: the literal pieces live in a reused
 * array (even indices), each call writes the formatted numbers into the odd indices and joins once. That yields a
 * flat result without the cons-string node per number that `+=` creates (in the PERF-004 benchmark about 25% fewer
 * young-generation collections per frame than the previous per-slot `replace`, and ~17% fewer than `+=`, at equal or
 * better speed). The array is shared by every call of the
 * returned function, which is safe because the function is synchronous and non-reentrant; it is retained for the
 * lifetime of the function (2 * numbers + 1 slots). Use it for paths with many numbers; for short values
 * `compileNumericTemplate` is simpler.
 */
export function compileNumericTemplateJoined(from: NumericTemplate, to: NumericTemplate): (progress: number) => string {
  const pieces = from.template.split(SLOT);
  const count = from.values.length;
  const starts = Float64Array.from(from.values);
  const ends = Float64Array.from(from.values, (start, index) => to.values[index] ?? start);
  const parts = new Array<string>(count * 2 + 1);
  for (let index = 0; index <= count; index += 1) parts[index * 2] = pieces[index]!;
  return (progress) => {
    for (let index = 0; index < count; index += 1) {
      const start = starts[index]!;
      parts[index * 2 + 1] = formatNumber(start + (ends[index]! - start) * progress);
    }
    return parts.join('');
  };
}

/** Format a number with at most 5 decimals, without trailing zeros and without `-0`. */
export function formatNumber(value: number): string {
  const rounded = Number(value.toFixed(5));
  return Object.is(rounded, -0) ? '0' : String(rounded);
}

/** A color with channels in 0..255 and alpha in 0..1. */
export interface Rgba {
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly a: number;
}

const COLOR_NUMBER = `(${NUMERIC_TOKEN_SOURCE}%?)`;
const HEX_COLOR = /^#([\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/;
const RGB_COLOR = new RegExp(
  `^rgba?\\(\\s*${COLOR_NUMBER}\\s*[,\\s]\\s*${COLOR_NUMBER}\\s*[,\\s]\\s*${COLOR_NUMBER}(?:\\s*[,/]\\s*${COLOR_NUMBER})?\\s*\\)$`,
);

/**
 * Parse a hex (`#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`) or `rgb()`/`rgba()` color (comma, space or slash
 * separated; channels and alpha may be percentages). Channels are clamped to 0..255 and alpha to 0..1.
 * Returns `null` when the whole string is not such a color.
 */
export function parseColor(input: string): Rgba | null {
  const trimmed = input.trim();
  const head = trimmed.charCodeAt(0);
  // Cheap reject for the common non-color case (`10px`, `translate(...)`): colors start with `#` or `rgb`.
  if (head !== 35 /* # */ && head !== 82 /* R */ && head !== 114 /* r */) return null;
  const value = trimmed.toLowerCase();
  const hex = HEX_COLOR.exec(value);
  if (hex?.[1]) {
    let raw = hex[1];
    if (raw.length === 3 || raw.length === 4) raw = [...raw].map((part) => `${part}${part}`).join('');
    return {
      r: Number.parseInt(raw.slice(0, 2), 16),
      g: Number.parseInt(raw.slice(2, 4), 16),
      b: Number.parseInt(raw.slice(4, 6), 16),
      a: raw.length === 8 ? Number.parseInt(raw.slice(6, 8), 16) / 255 : 1,
    };
  }
  const rgb = RGB_COLOR.exec(value);
  if (!rgb) return null;
  const channels = [rgb[1]!, rgb[2]!, rgb[3]!].map((part) => readColorNumber(part, 255));
  const alpha = rgb[4] === undefined ? 1 : readColorNumber(rgb[4], 1);
  if (![...channels, alpha].every(Number.isFinite)) return null;
  return { r: clampChannel(channels[0]!), g: clampChannel(channels[1]!), b: clampChannel(channels[2]!), a: clampAlpha(alpha) };
}

/** Interpolate two colors. Channels and alpha are clamped, so overshooting progress cannot leave the valid range. */
export function mixRgba(from: Rgba, to: Rgba, progress: number): Rgba {
  return {
    r: clampChannel(from.r + (to.r - from.r) * progress),
    g: clampChannel(from.g + (to.g - from.g) * progress),
    b: clampChannel(from.b + (to.b - from.b) * progress),
    a: clampAlpha(from.a + (to.a - from.a) * progress),
  };
}

/** Serialize a color as `rgba(r, g, b, a)` with integer channels. */
export function formatRgba(color: Rgba): string {
  return `rgba(${roundChannel(color.r)}, ${roundChannel(color.g)}, ${roundChannel(color.b)}, ${formatNumber(color.a)})`;
}

/**
 * Pre-compile a color pair into a per-frame renderer that mixes and serializes in one step, without allocating an
 * intermediate `Rgba`. Identical to `formatRgba(mixRgba(from, to, progress))`; when both alphas are equal the
 * alpha text is computed once (`from.a + 0 * progress` is `from.a` for any finite progress).
 */
export function compileColorMix(from: Rgba, to: Rgba): (progress: number) => string {
  const constantAlpha = from.a === to.a ? formatNumber(clampAlpha(from.a)) : null;
  const dr = to.r - from.r;
  const dg = to.g - from.g;
  const db = to.b - from.b;
  const da = to.a - from.a;
  return (progress) => `rgba(${roundChannel(from.r + dr * progress)}, ${roundChannel(from.g + dg * progress)}, ${roundChannel(from.b + db * progress)}, ${constantAlpha ?? formatNumber(clampAlpha(from.a + da * progress))})`;
}

/** Round a channel to the integer 8-bit value a browser would render. */
export function roundChannel(channel: number): number {
  return clampChannel(Math.round(channel));
}

function readColorNumber(text: string, percentScale: number): number {
  return text.endsWith('%') ? (Number(text.slice(0, -1)) * percentScale) / 100 : Number(text);
}

function clampChannel(value: number): number {
  return Math.max(0, Math.min(255, value));
}

function clampAlpha(value: number): number {
  return Math.max(0, Math.min(1, value));
}
