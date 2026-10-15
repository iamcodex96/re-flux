import type { EasingOption } from '../../types/easing.js';
import type {
  CssAnimatableValue,
  CssPropertyDefinition,
  CssPropertyFrames,
  DOMAnimateOptions,
  DOMPropertyKeyframe,
  DOMPropertyOptions,
} from './animationTypes.js';
import { resolvePropertyFrames, toCssPropertyName, toCssValue } from './cssInterpolation.js';

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

export function normalizeDOMProperties(options: DOMAnimateOptions): NormalizedDOMProperty[] {
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
      const hasFromTo = hasFrom && hasTo;
      if (Number(hasValues) + Number(hasKeyframes) + Number(hasFromTo) !== 1 || hasFrom !== hasTo) {
        throw new TypeError(`CSS property "${cssProperty}" must define exactly one of "from" + "to", "values", or "keyframes".`);
      }
      if (hasKeyframes) {
        frames = { kind: 'keyframes', keyframes: definition.keyframes as readonly DOMPropertyKeyframe[] };
      } else if (hasFromTo) {
        frames = { kind: 'values', values: [definition.from as CssAnimatableValue, definition.to as CssAnimatableValue] };
      } else {
        frames = { kind: 'values', values: definition.values as CssPropertyFrames };
      }
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

export function resolveDOMPropertyKeyframes(
  target: Element,
  property: NormalizedDOMProperty,
  index = 0,
  total = 1,
): Array<{ value: string; offset?: number; easing?: EasingOption }> {
  if (property.frames.kind === 'keyframes') {
    return property.frames.keyframes.map((frame) => ({
      value: toCssValue(property.cssProperty, frame.value),
      ...(frame.offset === undefined ? {} : { offset: frame.offset }),
      ...(frame.easing === undefined ? {} : { easing: frame.easing }),
    }));
  }

  const values = resolvePropertyFrames(target, property.cssProperty, property.frames.values, index, total);
  return values.map((value, valueIndex) => ({
    value: toCssValue(property.cssProperty, value),
    offset: values.length === 1 ? 1 : valueIndex / (values.length - 1),
  }));
}

export function validateAnimateOptions(options: DOMAnimateOptions): void {
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


