import type { AnimationOptions } from './animation.js';
import type { EasingOption } from './easing.js';

/** Interpolates values at eased progress; elastic curves can intentionally overshoot 0..1. */
export type ValueInterpolator<T> = (from: T, to: T, progress: number) => T;

/** Options for a framework-agnostic value tween. */
export type TweenOptions<T> = Omit<AnimationOptions, 'onUpdate'> & {
  readonly from: T;
  readonly to: T;
  /** Overrides built-in number/string/color/array/plain-object interpolation. */
  readonly interpolate?: ValueInterpolator<T>;
  /** Receives the emitted value, raw progress and eased progress. */
  readonly onUpdate?: (value: T, progress: number, easedProgress: number) => void;
};

/** A value at a normalized point in a keyframe sequence. Offset is in the inclusive 0..1 range. */
export interface ValueKeyframe<T> {
  readonly value: T;
  readonly offset?: number;
  /** Easing applied while moving from this frame to the next one. */
  readonly easing?: EasingOption;
}

/** Options for generic, headless keyframe animation. */
export type KeyframesOptions<T> = Omit<AnimationOptions, 'onUpdate' | 'easing'> & {
  readonly keyframes: readonly ValueKeyframe<T>[];
  /** Default easing for each segment unless that segment's starting keyframe overrides it. */
  readonly easing?: EasingOption;
  /** Overrides built-in interpolation for custom value types. */
  readonly interpolate?: ValueInterpolator<T>;
  /** Called whenever the interpolated value changes, including timeline-driven seeks. */
  readonly onUpdate?: (value: T, progress: number) => void;
};
