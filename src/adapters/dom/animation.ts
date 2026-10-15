import { Observable, Subscription } from 'rxjs';
import { map } from 'rxjs/operators';
import { Timeline } from '../../core/Timeline.js';
import { Keyframes } from '../../values/Keyframes.js';
import type { EasingOption, TimelineOptions, ValueKeyframe } from '../../types.js';

/** A complete snapshot of CSS declarations to apply; values must include units where required. */
export type CssStyleMap = Readonly<Record<string, string | null | undefined>>;

interface OriginalStyle {
  readonly value: string;
  readonly priority: string;
}


/** A CSS property value. Arrays are interpreted as evenly distributed property keyframes. */
export type CssAnimatableValue = string | number;
/**
 * Returns property values for one resolved target. The callback runs once per target when
 * `animate()` is created, so it should be deterministic and free of playback-time side effects.
 */
export type CssPropertyFramesFactory = (target: Element, index: number, total: number) =>
  CssAnimatableValue | readonly CssAnimatableValue[];
/** Arrays are interpreted as evenly distributed property keyframes. A factory can customize values per target. */
export type CssPropertyFrames = CssAnimatableValue | readonly CssAnimatableValue[] | CssPropertyFramesFactory;
export type DOMAnimationTarget = string | Element | Iterable<Element>;

/** A CSS keyframe can define its own normalized offset and the easing for its outgoing segment. */
export type DOMPropertyKeyframe = ValueKeyframe<CssAnimatableValue>;

/** Timing settings that can override the defaults supplied to `animate()`. */
export interface DOMPropertyTimingOptions {
  readonly duration?: number;
  /** Added to the global delay and target stagger; negative values are allowed and clamped at time zero. */
  readonly delay?: number;
  readonly easing?: EasingOption;
  readonly repeat?: number;
  readonly yoyo?: boolean;
}

/**
 * Property-level frames with independent timing. Choose exactly one value definition:
 * `from` + `to`, `values`, or `keyframes`.
 */
export type DOMPropertyOptions = DOMPropertyTimingOptions & (
  | { readonly values: CssPropertyFrames; readonly keyframes?: never; readonly from?: never; readonly to?: never }
  | { readonly keyframes: readonly DOMPropertyKeyframe[]; readonly values?: never; readonly from?: never; readonly to?: never }
  | { readonly from: CssAnimatableValue; readonly to: CssAnimatableValue; readonly values?: never; readonly keyframes?: never }
);

/** A property may use the shorthand syntax or its own keyframes and timing configuration. */
export type CssPropertyDefinition = CssPropertyFrames | DOMPropertyOptions;

/** Options for selector-based DOM animations; kept out of the headless root type surface. */
export interface DOMAnimateOptions extends TimelineOptions {
  readonly properties: Readonly<Record<string, CssPropertyDefinition>>;
  /** Default duration for properties that do not define their own. Omit when every property defines a duration. */
  readonly duration?: number;
  /** Global delay in milliseconds; property-level delay and target stagger are added to it. */
  readonly delay?: number;
  readonly easing?: EasingOption;
  readonly repeat?: number;
  readonly yoyo?: boolean;
  /** Additional per-target delay in milliseconds; negative values move targets earlier, clamped to timeline time zero. */
  readonly stagger?: number | ((index: number, target: Element, total: number) => number);
}

type NormalizedPropertyFrames =
  | { readonly kind: 'values'; readonly values: CssPropertyFrames }
  | { readonly kind: 'keyframes'; readonly keyframes: readonly DOMPropertyKeyframe[] };

interface NormalizedDOMProperty {
  readonly cssProperty: string;
  readonly frames: NormalizedPropertyFrames;
  readonly duration: number;
  readonly delay: number;
  readonly easing?: EasingOption;
  readonly repeat: number;
  readonly yoyo: boolean;
}

/**
 * Binds a stream of CSS property maps to an element. Properties omitted from a later map are restored
 * to their initial inline declarations; unsubscribe restores every declaration touched by this binding.
 */
export function bindStyle(
  target: HTMLElement | SVGElement,
  styles$: Observable<CssStyleMap>,
): Subscription {
  const original = new Map<string, OriginalStyle>();
  let activeKeys = new Set<string>();
  const subscription = new Subscription();
  const upstream = styles$.subscribe((styles) => {
    const nextKeys = new Set(Object.keys(styles));

    for (const key of activeKeys) {
      if (!nextKeys.has(key)) restoreProperty(target, key, original.get(key));
    }

    for (const [key, value] of Object.entries(styles)) {
      if (!original.has(key)) {
        original.set(key, {
          value: target.style.getPropertyValue(key),
          priority: target.style.getPropertyPriority(key),
        });
      }

      if (value === null || value === undefined) {
        restoreProperty(target, key, original.get(key));
      } else {
        target.style.setProperty(key, value);
      }
    }

    activeKeys = nextKeys;
  });

  subscription.add(upstream);
  subscription.add(() => {
    for (const [key, value] of original) restoreProperty(target, key, value);
    original.clear();
    activeKeys.clear();
  });

  return subscription;
}

/**
 * A DOM-backed Timeline. Call dispose() when the animation is no longer needed to restore original
 * inline styles and release its value bindings; completed animations otherwise retain final styles.
 */
export class DOMAnimation extends Timeline {
  private readonly bindings = new Subscription();
  private readonly disposeCallbacks = new Set<() => void>();
  private disposed = false;

  constructor(options: TimelineOptions = {}) {
    super(options);
  }

  /** @internal Register a style binding owned by this DOM animation. */
  attachBinding(binding: Subscription): void {
    if (this.disposed) {
      binding.unsubscribe();
      throw new Error('Cannot attach a binding to a disposed DOMAnimation.');
    }
    this.bindings.add(binding);
  }

  override play(): this {
    this.assertActive();
    super.play();
    return this;
  }

  override restart(): this {
    this.assertActive();
    super.restart();
    return this;
  }

  /** Register teardown work owned by this animation (for example, temporary text wrappers). */
  addDisposeCallback(callback: () => void): this {
    if (typeof callback !== 'function') throw new TypeError('Dispose callback must be a function.');
    if (this.disposed) callback();
    else this.disposeCallbacks.add(callback);
    return this;
  }

  /** Cancel active motion and restore every inline declaration captured by the bindings. */
  dispose(): void {
    if (this.disposed) return;
    const errors: unknown[] = [];
    try {
      if (this.state$.value === 'running' || this.state$.value === 'paused') this.stop();
    } catch (error) { errors.push(error); }
    try { this.bindings.unsubscribe(); } catch (error) { errors.push(error); }
    this.disposed = true;
    for (const callback of this.disposeCallbacks) {
      try { callback(); } catch (error) { errors.push(error); }
    }
    this.disposeCallbacks.clear();
    if (errors.length > 0) throw new AggregateError(errors, 'DOMAnimation disposal failed.');
  }

  private assertActive(): void {
    if (this.disposed) throw new Error('This DOMAnimation has been disposed. Create a new animation to play it again.');
  }
}

/**
 * Animate CSS properties on a selector, one element, or an iterable of elements.
 * The returned Timeline shares one playhead across every target and property.
 * Numeric CSS values use px unless the property is unitless; provide strings for custom units.
 */
export function animate(targets: DOMAnimationTarget, options: DOMAnimateOptions): DOMAnimation {
  validateAnimateOptions(options);
  const propertyEntries = normalizeDOMProperties(options);
  const propertyNames = new Set<string>();
  for (const entry of propertyEntries) {
    if (propertyNames.has(entry.cssProperty)) {
      throw new RangeError(`CSS property "${entry.cssProperty}" was provided more than once. Use either camelCase or kebab-case, not both.`);
    }
    propertyNames.add(entry.cssProperty);
  }
  const elements = resolveTargets(targets);

  const { properties: _properties, duration: _duration, delay = 0, easing: _easing, repeat: _repeat, yoyo: _yoyo, stagger = 0, ...timelineOptions } = options;
  const animation = new DOMAnimation(timelineOptions);

  try {
    elements.forEach((element, elementIndex) => {
      // A numeric stagger is the delay step between targets, not a fixed delay for every target.
      const staggerDelay = typeof stagger === 'function' ? stagger(elementIndex, element, elements.length) : elementIndex * stagger;
      if (!Number.isFinite(staggerDelay)) {
        throw new RangeError(`stagger must return a finite number of milliseconds for target ${elementIndex}.`);
      }

      for (const property of propertyEntries) {
        const keyframes = resolveDOMPropertyKeyframes(element, property, elementIndex, elements.length);
        const keyframeItem = new Keyframes<string>({
          duration: property.duration,
          repeat: property.repeat,
          yoyo: property.yoyo,
          ...(property.easing === undefined ? {} : { easing: property.easing }),
          keyframes,
          interpolate: interpolateCssValue,
        });

        const cssStream = keyframeItem.value$.pipe(
          map((value) => ({ [property.cssProperty]: value })),
        );
        animation.attachBinding(bindStyle(element as HTMLElement | SVGElement, cssStream));
        const startTime = Math.max(0, delay + property.delay + staggerDelay);
        animation.add(keyframeItem, startTime);
      }
    });
  } catch (error) {
    animation.dispose();
    throw error;
  }

  return animation;
}



function normalizeDOMProperties(options: DOMAnimateOptions): NormalizedDOMProperty[] {
  const entries: NormalizedDOMProperty[] = [];
  for (const [propertyName, definition] of Object.entries(options.properties)) {
    const cssProperty = toCssPropertyName(propertyName);
    const isOptions = isDOMPropertyOptions(definition);
    let frames: NormalizedPropertyFrames;
    if (!isOptions) {
      frames = { kind: 'values', values: definition as CssPropertyFrames };
    } else {
      const hasValues = 'values' in definition && definition.values !== undefined;
      const hasKeyframes = 'keyframes' in definition && definition.keyframes !== undefined;
      const hasFrom = 'from' in definition && definition.from !== undefined;
      const hasTo = 'to' in definition && definition.to !== undefined;
      if (hasValues && hasKeyframes) {
        throw new TypeError(`CSS property "${cssProperty}" must define exactly one of "values" or "keyframes".`);
      }
      if (hasFrom !== hasTo || ((hasFrom || hasTo) && (hasValues || hasKeyframes)) || (!hasValues && !hasKeyframes && !hasFrom)) {
        throw new TypeError(`CSS property "${cssProperty}" must define exactly one of "values", "keyframes", or both "from" and "to".`);
      }
      frames = hasKeyframes
        ? { kind: 'keyframes', keyframes: definition.keyframes as readonly DOMPropertyKeyframe[] }
        : hasFrom && hasTo
          ? { kind: 'values', values: [definition.from as CssAnimatableValue, definition.to as CssAnimatableValue] }
          : { kind: 'values', values: definition.values as CssPropertyFrames };
    }
    const propertyOptions = isOptions ? definition : undefined;
    const duration = propertyOptions?.duration ?? options.duration;

    if (duration === undefined) {
      throw new RangeError(`CSS property "${cssProperty}" requires a duration when animate() has no global duration.`);
    }
    validateDuration(duration, `duration for CSS property "${cssProperty}"`);

    const propertyDelay = propertyOptions?.delay ?? 0;
    if (!Number.isFinite(propertyDelay)) {
      throw new RangeError(`delay for CSS property "${cssProperty}" must be finite.`);
    }
    const repeat = propertyOptions?.repeat ?? options.repeat ?? 0;
    validateRepeat(repeat, `repeat for CSS property "${cssProperty}"`);

    if (frames.kind === 'values' && Array.isArray(frames.values) && frames.values.length === 0) {
      throw new RangeError(`CSS property "${cssProperty}" cannot have an empty keyframe array.`);
    }
    if (frames.kind === 'keyframes' && frames.keyframes.length === 0) {
      throw new RangeError(`CSS property "${cssProperty}" cannot have an empty keyframe array.`);
    }

    const easing = propertyOptions?.easing ?? options.easing;
    entries.push({
      cssProperty,
      frames,
      duration,
      delay: propertyDelay,
      ...(easing === undefined ? {} : { easing }),
      repeat,
      yoyo: propertyOptions?.yoyo ?? options.yoyo ?? false,
    });
  }

  if (entries.length === 0) throw new RangeError('animate() requires at least one CSS property in options.properties.');
  return entries;
}

function isDOMPropertyOptions(definition: CssPropertyDefinition): definition is DOMPropertyOptions {
  return typeof definition === 'object' && definition !== null && !Array.isArray(definition);
}

function resolveDOMPropertyKeyframes(
  target: Element,
  property: NormalizedDOMProperty,
  targetIndex: number,
  targetCount: number,
): Array<{ value: string; offset?: number; easing?: EasingOption }> {
  if (property.frames.kind === 'keyframes') {
    return property.frames.keyframes.map((frame) => ({
      value: toCssValue(property.cssProperty, frame.value),
      ...(frame.offset === undefined ? {} : { offset: frame.offset }),
      ...(frame.easing === undefined ? {} : { easing: frame.easing }),
    }));
  }

  const values = resolvePropertyFrames(target, property.cssProperty, property.frames.values, targetIndex, targetCount);
  return values.map((value, valueIndex) => ({
    value: toCssValue(property.cssProperty, value),
    offset: values.length === 1 ? 1 : valueIndex / (values.length - 1),
  }));
}

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

function resolvePropertyFrames(
  target: Element,
  cssProperty: string,
  propertyFrames: CssPropertyFrames,
  targetIndex: number,
  targetCount: number,
): CssAnimatableValue[] {
  const resolved = typeof propertyFrames === 'function'
    ? propertyFrames(target, targetIndex, targetCount)
    : propertyFrames;

  if (Array.isArray(resolved)) {
    const frames = [...resolved] as CssAnimatableValue[];
    if (frames.length === 0) throw new RangeError(`CSS property "${cssProperty}" cannot have an empty keyframe array.`);
    if (frames.some((value) => typeof value !== 'string' && typeof value !== 'number')) {
      throw new TypeError(`Every value for CSS property "${cssProperty}" must be a string or number.`);
    }
    if (frames.length === 1) return [readComputedValue(target, cssProperty), frames[0]!];
    return frames;
  }
  if (typeof resolved !== 'string' && typeof resolved !== 'number') {
    throw new TypeError(`The values factory for CSS property "${cssProperty}" must return a string, number, or array of strings/numbers.`);
  }
  return [readComputedValue(target, cssProperty), resolved];
}

function readComputedValue(target: Element, cssProperty: string): string {
  const styleTarget = target as HTMLElement | SVGElement;
  const computed = target.ownerDocument?.defaultView?.getComputedStyle(target).getPropertyValue(cssProperty).trim();
  const inline = styleTarget.style?.getPropertyValue(cssProperty).trim();
  const value = computed || inline;
  if (value) return value;
  throw new TypeError(
    `Cannot infer a starting value for CSS property "${cssProperty}". Provide an explicit [from, to] keyframe array.`,
  );
}

function toCssValue(property: string, value: CssAnimatableValue): string {
  if (typeof value === 'string') return value;
  if (property.startsWith('--') || UNIT_LESS_PROPERTIES.has(property)) return String(value);
  return `${value}px`;
}

function toCssPropertyName(property: string): string {
  if (property.startsWith('--')) return property;
  return property.replace(/[A-Z]/g, (character) => `-${character.toLowerCase()}`);
}

export function resolveTargets(targets: DOMAnimationTarget): Element[] {
  if (typeof targets === 'string') {
    if (typeof document === 'undefined') {
      throw new Error('animate() cannot resolve a CSS selector without a document. Pass an Element or an iterable of Elements for non-browser environments.');
    }
    const matches = Array.from(document.querySelectorAll(targets));
    if (matches.length === 0) throw new RangeError(`animate() selector did not match any elements: ${targets}`);
    return matches;
  }

  if (isElementLike(targets)) return [targets];
  if (isIterableElementCollection(targets)) {
    const elements = Array.from(targets);
    if (elements.length === 0) throw new RangeError('animate() requires at least one target element.');
    if (elements.some((element) => !isElementLike(element))) {
      throw new TypeError('Every item passed to animate() must be a DOM Element.');
    }
    return Array.from(new Set(elements));
  }
  throw new TypeError('animate() targets must be a CSS selector, an Element, or an iterable of Elements.');
}

function isElementLike(value: unknown): value is Element {
  return typeof value === 'object' && value !== null && 'nodeType' in value && (value as { nodeType?: unknown }).nodeType === 1;
}

function isIterableElementCollection(value: unknown): value is Iterable<Element> {
  return typeof value === 'object'
    && value !== null
    && Symbol.iterator in value
    && typeof (value as { [Symbol.iterator]?: unknown })[Symbol.iterator] === 'function';
}

function validateAnimateOptions(options: DOMAnimateOptions): void {
  if (options.duration !== undefined) validateDuration(options.duration, 'animate() duration');
  if (options.delay !== undefined && !Number.isFinite(options.delay)) {
    throw new RangeError('animate() delay must be finite.');
  }
  if (typeof options.stagger === 'number' && !Number.isFinite(options.stagger)) {
    throw new RangeError('animate() stagger must be finite.');
  }
  if (options.repeat !== undefined) validateRepeat(options.repeat, 'animate() repeat');
}

function validateDuration(duration: number, label: string): void {
  if (!Number.isFinite(duration) || duration < 0) {
    throw new RangeError(`${label} must be a finite, non-negative number.`);
  }
}

function validateRepeat(repeat: number, label: string): void {
  if (repeat !== Infinity && (!Number.isFinite(repeat) || repeat < 0)) {
    throw new RangeError(`${label} must be a non-negative number or Infinity.`);
  }
}

const UNIT_LESS_PROPERTIES = new Set([
  'animation-iteration-count', 'aspect-ratio', 'border-image-slice', 'column-count', 'fill-opacity',
  'flex', 'flex-grow', 'flex-shrink', 'flood-opacity', 'font-weight', 'grid-area', 'grid-column',
  'grid-column-end', 'grid-column-start', 'grid-row', 'grid-row-end', 'grid-row-start', 'line-height',
  'opacity', 'order', 'orphans', 'scale', 'stop-opacity', 'stroke-dasharray', 'stroke-dashoffset',
  'stroke-miterlimit', 'stroke-opacity', 'tab-size', 'widows', 'z-index', 'zoom',
]);

function restoreProperty(target: HTMLElement | SVGElement, key: string, value: OriginalStyle | undefined): void {
  if (!value || value.value === '') target.style.removeProperty(key);
  else target.style.setProperty(key, value.value, value.priority);
}
