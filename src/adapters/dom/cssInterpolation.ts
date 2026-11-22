import {
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
  const compatibleTemplate = fromTemplate.template === toTemplate.template
    && fromTemplate.values.length === toTemplate.values.length;

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
