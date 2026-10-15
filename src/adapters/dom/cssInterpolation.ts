import type { CssAnimatableValue, CssPropertyFrames } from './animationTypes.js';

/** Interpolates CSS values with matching templates and units; incompatible values switch at the endpoint. */
export function interpolateCssValue(from: string, to: string, progress: number): string {
  if (progress === 0) return from;
  if (progress === 1) return to;

  const fromTokens = tokenizeCssValue(from);
  const toTokens = tokenizeCssValue(to);
  const compatibleTemplate = fromTokens.template === toTokens.template
    && fromTokens.numbers.length === toTokens.numbers.length
    && !fromTokens.units.some((unit, index) => unit !== toTokens.units[index]);
  if (!compatibleTemplate) {
    const fromColor = parseCssColor(from);
    const toColor = parseCssColor(to);
    if (fromColor && toColor) return interpolateColor(fromColor, toColor, progress);
    return progress < 1 ? from : to;
  }

  let tokenIndex = 0;
  const interpolated = from.replace(NUMERIC_CSS_TOKEN, () => {
    const start = fromTokens.numbers[tokenIndex]!;
    const end = toTokens.numbers[tokenIndex]!;
    const unit = fromTokens.units[tokenIndex]!;
    tokenIndex += 1;
    const value = start + (end - start) * progress;
    const rounded = Math.round(value * 10000) / 10000;
    return `${rounded}${unit}`;
  });
  return interpolated;
}

const NUMERIC_CSS_TOKEN = /(-?(?:\d+\.?\d*|\.\d+))(?:([a-zA-Z%]+))?/g;

type RgbaColor = readonly [red: number, green: number, blue: number, alpha: number];

function parseCssColor(value: string): RgbaColor | null {
  const hex = /^#([\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})$/i.exec(value.trim());
  if (hex) {
    const raw = hex[1]!;
    const expanded = raw.length <= 4 ? [...raw].map((character) => `${character}${character}`).join('') : raw;
    const red = Number.parseInt(expanded.slice(0, 2), 16);
    const green = Number.parseInt(expanded.slice(2, 4), 16);
    const blue = Number.parseInt(expanded.slice(4, 6), 16);
    const alpha = expanded.length === 8 ? Number.parseInt(expanded.slice(6, 8), 16) / 255 : 1;
    return [red, green, blue, alpha];
  }

  const rgb = /^rgba?\((.*)\)$/i.exec(value.trim());
  if (!rgb) return null;
  const parts = rgb[1]!.replace('/', ' ').split(/[\s,]+/).filter(Boolean);
  if (parts.length < 3 || parts.length > 4) return null;
  const channels = parts.slice(0, 3).map((part) => part.endsWith('%')
    ? Number.parseFloat(part) * 2.55
    : Number.parseFloat(part));
  const alphaPart = parts[3];
  const alpha = alphaPart === undefined ? 1 : alphaPart.endsWith('%')
    ? Number.parseFloat(alphaPart) / 100
    : Number.parseFloat(alphaPart);
  if ([...channels, alpha].some((channel) => !Number.isFinite(channel))) return null;
  return [channels[0]!, channels[1]!, channels[2]!, alpha];
}

function interpolateColor(from: RgbaColor, to: RgbaColor, progress: number): string {
  const red = clampCssChannel(from[0] + (to[0] - from[0]) * progress);
  const green = clampCssChannel(from[1] + (to[1] - from[1]) * progress);
  const blue = clampCssChannel(from[2] + (to[2] - from[2]) * progress);
  const alpha = Math.max(0, Math.min(1, from[3] + (to[3] - from[3]) * progress));
  return `rgba(${red}, ${green}, ${blue}, ${Math.round(alpha * 10000) / 10000})`;
}

function clampCssChannel(channel: number): number {
  return Math.max(0, Math.min(255, Math.round(channel)));
}

function tokenizeCssValue(value: string): { template: string; numbers: number[]; units: string[] } {
  const numbers: number[] = [];
  const units: string[] = [];
  const template = value.replace(NUMERIC_CSS_TOKEN, (_token, rawNumber: string, rawUnit: string | undefined) => {
    numbers.push(Number(rawNumber));
    units.push(rawUnit ?? '');
    return '\u0000';
  });
  return { template, numbers, units };
}

export function resolvePropertyFrames(
  target: Element,
  cssProperty: string,
  propertyFrames: CssPropertyFrames,
  index = 0,
  total = 1,
): CssAnimatableValue[] {
  const resolvedFrames: CssAnimatableValue | readonly CssAnimatableValue[] = typeof propertyFrames === 'function'
    ? propertyFrames(target, index, total)
    : propertyFrames as CssAnimatableValue | readonly CssAnimatableValue[];
  if (Array.isArray(resolvedFrames)) {
    const frames = [...resolvedFrames] as CssAnimatableValue[];
    if (frames.length === 0) throw new RangeError(`CSS property "${cssProperty}" cannot have an empty keyframe array.`);
    if (frames.length === 1) return [readComputedValue(target, cssProperty), frames[0]!];
    return frames;
  }
  return [readComputedValue(target, cssProperty), resolvedFrames as CssAnimatableValue];
}

function readComputedValue(target: Element, cssProperty: string): string {
  const styleTarget = target as HTMLElement | SVGElement;
  const computed = target.ownerDocument?.defaultView?.getComputedStyle(target).getPropertyValue(cssProperty).trim();
  const inline = styleTarget.style?.getPropertyValue(cssProperty).trim();
  const value = computed || inline;
  if (value) return value;
  throw new TypeError(
    `Cannot infer a starting value for CSS property "${cssProperty}". Provide explicit { from, to } values or a [from, to] keyframe array.`,
  );
}

export function toCssValue(property: string, value: CssAnimatableValue): string {
  if (typeof value === 'string') return value;
  if (property.startsWith('--') || UNIT_LESS_PROPERTIES.has(property)) return String(value);
  return `${value}px`;
}

export function toCssPropertyName(property: string): string {
  if (property.startsWith('--')) return property;
  return property.replace(/[A-Z]/g, (character) => `-${character.toLowerCase()}`);
}


const UNIT_LESS_PROPERTIES = new Set([
  'animation-iteration-count', 'aspect-ratio', 'border-image-slice', 'column-count', 'fill-opacity',
  'flex', 'flex-grow', 'flex-shrink', 'flood-opacity', 'font-weight', 'grid-area', 'grid-column',
  'grid-column-end', 'grid-column-start', 'grid-row', 'grid-row-end', 'grid-row-start', 'line-height',
  'opacity', 'order', 'orphans', 'scale', 'stop-opacity', 'stroke-dasharray', 'stroke-dashoffset',
  'stroke-miterlimit', 'stroke-opacity', 'tab-size', 'widows', 'z-index', 'zoom',
]);
