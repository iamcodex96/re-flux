import { Subscription } from 'rxjs';
import { map } from 'rxjs/operators';
import { Timeline } from '../../core/Timeline.js';
import { Keyframes } from '../../values/Keyframes.js';
import type { TimelineOptions } from '../../types.js';
import type { DOMAnimateOptions, DOMAnimationTarget } from './animationTypes.js';
import { bindStyle } from './styleBinding.js';
import { interpolateCssValue } from './cssInterpolation.js';
import { resolveTargets } from './targets.js';
import { normalizeDOMProperties, resolveDOMPropertyKeyframes, validateAnimateOptions } from './propertyOptions.js';

export { bindStyle } from './styleBinding.js';
export { interpolateCssValue } from './cssInterpolation.js';
export { resolveTargets } from './targets.js';
export type {
  CssStyleMap,
  CssAnimatableValue,
  CssPropertyFrames,
  CssPropertyFramesFactory,
  DOMAnimationTarget,
  DOMPropertyKeyframe,
  DOMPropertyTimingOptions,
  DOMPropertyOptions,
  CssPropertyDefinition,
  DOMAnimateOptions,
} from './animationTypes.js';

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
