import type { ValueInterpolator } from '../../types/values.js';
import { withInterpolatorCompiler } from '../../values/compiledInterpolators.js';
import {
  compileColorMix,
  compileColorTemplate,
  compileNumericTemplate,
  compileNumericTemplateJoined,
  formatNumber,
  formatRgba,
  mixRgba,
  parseColor,
  renderNumericTemplate,
  roundChannel,
  tokenizeNumbers,
  type Rgba,
} from '../../utils/valueTemplate.js';
import type { CssAnimatableValue, CssPropertyFrames } from './animationTypes.js';

/** Interpolates CSS values with matching templates and units; incompatible values switch at the endpoint. */
export function interpolateCssValue(from: string, to: string, progress: number): string {
  if (progress === 0) return from;
  if (progress === 1) return to;

  // Colors use the shared color math. When both ends share one rgb()/rgba() template the author's function,
  // spacing and percentages are kept; otherwise the result is rgba(r, g, b, a). Everything else is a numeric template.

  const fromTemplate = tokenizeNumbers(from);
  const toTemplate = tokenizeNumbers(to);
  const compatibleTemplate =
    fromTemplate.template === toTemplate.template && fromTemplate.values.length === toTemplate.values.length;

  const fromColor = parseColor(from);
  const toColor = parseColor(to);
  if (fromColor && toColor) {
    const mixed = mixRgba(fromColor, toColor, progress);
    return compatibleTemplate && !from.trim().startsWith('#')
      ? renderColorFunction(fromTemplate.template, mixed)
      : formatRgba(mixed);
  }
  if (!compatibleTemplate) return progress < 1 ? from : to;

  return renderNumericTemplate(fromTemplate.template, (index) => {
    const start = fromTemplate.values[index]!;
    const end = toTemplate.values[index]!;
    return formatNumber(start + (end - start) * progress);
  });
}

/**
 * Templates with more numbers than this are joined once per frame instead of concatenated. A scratch measurement
 * (1 MB semi-space, 300k frames, loaded machine) gave equal young-generation collections at 3 numbers and 24-32%
 * fewer with `join` from 4 numbers up (6: 647 -> 520, 12: 1327 -> 980, 24: 2700 -> 1913 per million frames) at about
 * the same speed; the concatenated string is also flattened later by whoever writes it (`setProperty`).
 */
const JOINED_TEMPLATE_THRESHOLD = 3;

/**
 * Pre-compile one `from`/`to` pair into a per-frame renderer. Both strings are tokenized and parsed once; every
 * call only mixes numbers and formats them. Output is identical to `interpolateCssValue(from, to, progress)`:
 * the exact input strings at progress 0 and 1, the author's template (units, spacing, `rgb()`/`rgba()`, percentages)
 * for compatible values, `rgba(r, g, b, a)` for other color pairs, and a discrete switch for incompatible values.
 * Non-finite progress takes the one-shot path, so even `NaN` behaves exactly as before.
 */
export function compileCssInterpolator(from: string, to: string): (progress: number) => string {
  const fromTemplate = tokenizeNumbers(from);
  const toTemplate = tokenizeNumbers(to);
  const compatibleTemplate =
    fromTemplate.template === toTemplate.template && fromTemplate.values.length === toTemplate.values.length;

  let render: (progress: number) => string;
  const fromColor = parseColor(from);
  const toColor = parseColor(to);
  if (fromColor && toColor) {
    render =
      compatibleTemplate && !from.trim().startsWith('#')
        ? compileColorTemplate(fromTemplate.template, fromColor, toColor)
        : compileColorMix(fromColor, toColor);
  } else if (!compatibleTemplate) {
    return (progress) => (progress < 1 ? from : to); // 0 and 1 included: the one-shot path returns `from`/`to` there too
  } else {
    render =
      fromTemplate.values.length > JOINED_TEMPLATE_THRESHOLD
        ? compileNumericTemplateJoined(fromTemplate, toTemplate)
        : compileNumericTemplate(fromTemplate, toTemplate);
  }

  return (progress) => {
    if (progress === 0) return from;
    if (progress === 1) return to;
    return Number.isFinite(progress) ? render(progress) : interpolateCssValue(from, to, progress);
  };
}

let cssInterpolator: ValueInterpolator<string> | undefined;

/**
 * @internal The `interpolate` option `animate()` hands to `Keyframes`: a plain one-shot interpolator that carries a
 * compiler, so each keyframe segment is compiled once at construction instead of tokenized on every frame.
 */
export function compiledCssInterpolator(): ValueInterpolator<string> {
  cssInterpolator ??= withInterpolatorCompiler<string>(
    (from, to, progress) => interpolateCssValue(from, to, progress),
    (from, to) => {
      const render = compileCssInterpolator(from, to);
      return (start, end, progress) =>
        start === from && end === to ? render(progress) : interpolateCssValue(start, end, progress);
    },
  );
  return cssInterpolator;
}

/** Re-emit a color in the author's `rgb()`/`rgba()` template, keeping `%` channels and alpha as written. */
function renderColorFunction(template: string, color: Rgba): string {
  const slots = template.split('\u0000');
  const channels = [color.r, color.g, color.b];
  return renderNumericTemplate(template, (index) => {
    const percent = slots[index + 1]!.startsWith('%');
    if (index < 3) {
      const channel = channels[index]!;
      return formatNumber(percent ? (channel / 255) * 100 : roundChannel(channel));
    }
    return formatNumber(percent ? color.a * 100 : color.a);
  });
}

export function resolvePropertyFrames(
  target: Element,
  cssProperty: string,
  propertyFrames: CssPropertyFrames,
  index = 0,
  total = 1,
): CssAnimatableValue[] {
  const resolvedFrames: CssAnimatableValue | readonly CssAnimatableValue[] =
    typeof propertyFrames === 'function'
      ? propertyFrames(target, index, total)
      : (propertyFrames as CssAnimatableValue | readonly CssAnimatableValue[]);
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
  'animation-iteration-count',
  'aspect-ratio',
  'border-image-slice',
  'column-count',
  'fill-opacity',
  'flex',
  'flex-grow',
  'flex-shrink',
  'flood-opacity',
  'font-weight',
  'grid-area',
  'grid-column',
  'grid-column-end',
  'grid-column-start',
  'grid-row',
  'grid-row-end',
  'grid-row-start',
  'line-height',
  'opacity',
  'order',
  'orphans',
  'scale',
  'stop-opacity',
  'stroke-dasharray',
  'stroke-dashoffset',
  'stroke-miterlimit',
  'stroke-opacity',
  'tab-size',
  'widows',
  'z-index',
  'zoom',
]);
