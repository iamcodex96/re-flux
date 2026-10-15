import type { EasingOption } from './easing.js';
import type { RetargetableMotionOptions } from './physics.js';
import type { ValueInterpolator } from './values.js';

/** Options for the declarative target-stream operator. */
export type RetargetMotionOperatorOptions = Omit<RetargetableMotionOptions, 'onUpdate' | 'onComplete'>;

/** A value paired with a monotonic timestamp in the same time origin as requestAnimationFrame. */
export interface TimestampedValue<T> {
  readonly value: T;
  readonly timestamp: number;
}

/** Configuration for frame-aligned interpolation of irregular input samples. */
export interface SmoothStreamOptions<T> {
  /** Render this many milliseconds behind the current RAF clock. Defaults to 100 ms. */
  readonly targetLatency?: number;
  /** Mark outputs stale when no source sample has arrived within this window. Defaults to 1000 ms. */
  readonly staleAfter?: number;
  /** Maximum retained source samples. Must be an integer >= 2. Defaults to 120. */
  readonly maxBufferSize?: number;
  /** Interpolate a value between the two samples bracketing the display timestamp. */
  readonly interpolate: ValueInterpolator<T>;
}

/** One frame-aligned value produced by smoothStream(). */
export interface SmoothedStreamSample<T> {
  readonly value: T;
  /** Current shared RAF timestamp, in milliseconds. */
  readonly timestamp: number;
  /** Monotonic timestamp the renderer is displaying. It never moves backwards. */
  readonly sampleTime: number;
  readonly sourceStartTimestamp: number;
  readonly sourceEndTimestamp: number;
  readonly interpolated: boolean;
  readonly stale: boolean;
}

/** Options for cadence-aware interpolation between successive targets. */
export interface AdaptiveTweenOptions<T> {
  /** Shortest interpolation duration. Defaults to 20 ms. */
  readonly minDuration?: number;
  /** Longest interpolation duration. Defaults to 240 ms. */
  readonly maxDuration?: number;
  /** Multiplier applied to estimated source cadence to choose tween duration. Defaults to 1.5. */
  readonly durationFactor?: number;
  /** Exponential moving-average weight for new cadence measurements, in (0, 1]. Defaults to 0.25. */
  readonly cadenceSmoothing?: number;
  /** Initial cadence estimate used as the EMA prior. Defaults to 33.333 ms; cadenceSmoothing is applied to the first measurement too. */
  readonly initialCadence?: number;
  /** Easing curve applied over the chosen duration; defaults to linear. */
  readonly easing?: EasingOption;
  /** Mark outputs stale when no source sample has arrived within this window. Defaults to 1000 ms. */
  readonly staleAfter?: number;
  /** Interpolate between values. Required for generic values. */
  readonly interpolate: ValueInterpolator<T>;
}

/** Frame-aligned output of adaptiveTween(), including the active tween duration and cadence estimate. */
export interface AdaptiveTweenSample<T> {
  readonly value: T;
  /** Current shared RAF timestamp, in milliseconds. */
  readonly timestamp: number;
  /** Timestamp of the preceding accepted source sample; paired with sourceEndTimestamp for cadence estimation. */
  readonly sourceStartTimestamp: number;
  /** Timestamp of the most recently accepted target. */
  readonly sourceEndTimestamp: number;
  /** RAF timestamp at which the current value transition began. */
  readonly transitionStartTimestamp: number;
  /** Current raw progress through the active tween, clamped to 0..1. */
  readonly progress: number;
  /** True while an interpolation between targets is in progress. */
  readonly interpolated: boolean;
  readonly stale: boolean;
  /** Exponentially smoothed interval between accepted source timestamps, in milliseconds. */
  readonly estimatedCadence: number;
  /** Duration chosen for the current target transition, in milliseconds. */
  readonly targetDuration: number;
}
