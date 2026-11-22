import type { TweenOptions, ValueInterpolator } from '../types/values.js';
import { AnimatedValue } from './AnimatedValue.js';
import { resolveInterpolator } from './interpolate.js';

/**
 * Animates a value without knowing anything about the rendering target.
 * Numbers, compatible CSS-like strings/colors, arrays and plain objects interpolate by default; provide a custom interpolator for other types.
 */
export class Tween<T> extends AnimatedValue<T> {
  private readonly to: T;
  private readonly interpolate: ValueInterpolator<T>;
  private readonly onValueUpdate: TweenOptions<T>['onUpdate'];

  constructor(options: TweenOptions<T>) {
    // Resolved before the animation is built so an unusable interpolator is reported first, as it always was.
    const interpolate = resolveInterpolator(options.from, options.to, options.interpolate);
    const { from, to, interpolate: _interpolate, onUpdate, ...animationOptions } = options;
    super(from, animationOptions);
    this.to = to;
    this.interpolate = interpolate;
    this.onValueUpdate = onUpdate;
  }

  protected updateValue(progress: number, easedProgress: number): void {
    const value = this.interpolate(this.initialValue, this.to, easedProgress);
    this.valueSubject.next(value);
    this.onValueUpdate?.(value, progress, easedProgress);
  }
}
