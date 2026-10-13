import type { Observable } from 'rxjs';
import type { MotionPreferencesSource } from './core/MotionPreferences.js';

export type EasingFunction = (progress: number) => number;
export type EasingName =
  | 'linear'
  | 'easeInSine' | 'easeOutSine' | 'easeInOutSine'
  | 'easeInQuad' | 'easeOutQuad' | 'easeInOutQuad'
  | 'easeInCubic' | 'easeOutCubic' | 'easeInOutCubic'
  | 'easeInQuart' | 'easeOutQuart' | 'easeInOutQuart'
  | 'easeInQuint' | 'easeOutQuint' | 'easeInOutQuint'
  | 'easeInCirc' | 'easeOutCirc' | 'easeInOutCirc'
  | 'easeInExpo' | 'easeOutExpo' | 'easeInOutExpo'
  | 'easeInBack' | 'easeOutBack' | 'easeInOutBack'
  | 'easeInElastic' | 'easeOutElastic'
  | 'easeInBounce' | 'easeOutBounce' | 'easeInOutBounce';
export type EasingOption = EasingFunction | EasingName | string;

export type AnimationState = 'idle' | 'running' | 'paused' | 'completed';

export interface AnimationOptions {
  /** Duration of one cycle, in milliseconds. */
  duration: number;
  /** Interpolation curve; unknown names fall back to linear. */
  easing?: EasingOption;
  /** Initial delay, in milliseconds. */
  delay?: number;
  /** Additional repeats; Infinity keeps the cycle active. */
  repeat?: number;
  /** Reverses direction on alternating iterations. */
  yoyo?: boolean;
  onStart?: () => void;
  onUpdate?: (progress: number, easedProgress: number) => void;
  onComplete?: () => void;
  onPause?: () => void;
  onResume?: () => void;
  onStop?: () => void;
  /** Optional lifecycle policy for direct playback; for timeline-driven children, configure the parent Timeline. */
  motion?: AnimationMotionOptions;
}

export interface TimelineOptions {
  onStart?: () => void;
  onUpdate?: (progress: number, easedProgress: number) => void;
  onComplete?: () => void;
  onPause?: () => void;
  onResume?: () => void;
  onStop?: () => void;
  /** Optional lifecycle policy for this composed timeline; the policy controls its children as one scene. */
  motion?: AnimationMotionOptions;
}

export type ReducedMotionBehavior = 'finish' | 'ignore';

/** Opt-in policy for a directly played Animation or a Timeline controlling a composed scene. */
export interface AnimationMotionOptions {
  readonly preferences: MotionPreferencesSource;
  /** `finish` skips the temporal motion while preserving the final state; defaults to `finish`. */
  readonly reducedMotion?: ReducedMotionBehavior;
  /** Pauses while the document is hidden and resumes only if visibility caused the pause. Defaults to false. */
  readonly pauseWhenHidden?: boolean;
}

/** Minimal API an item must implement to participate in a Timeline. */
export interface AnimatableItem {
  readonly duration: number;
  /** @internal `true` updates values without forcing a running playback state (used for manual scrubbing). */
  seekLocal(ms: number, preservePlaybackState?: boolean): void;
  /** @internal Propagate a parent timeline pause to an active child without owning a clock. */
  pauseFromParent?(): void;
  resetInternal(): void;
}

export interface TimelineSegment {
  readonly item: AnimatableItem;
  readonly startTime: number;
  readonly endTime: number;
  readonly duration: number;
}

/** Position may be absolute milliseconds, a relative offset (`+=120`/`-=80`), `<`, or a timeline label (`intro+=100`). */
export type TimelineOffset = number | string;

export interface AnimationFrameSource {
  readonly observable: Observable<number>;
}


/** Frame data emitted by the shared requestAnimationFrame coordinator. */
export interface AnimationFrameTick {
  readonly timestamp: number;
  readonly delta: number;
  readonly frame: number;
}

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

/** Physical parameters for the damped spring integrator. Units are pixels (or user units), seconds, and milliseconds. */
export interface SpringOptions {
  /** Spring stiffness. Larger values pull the sample toward the target more strongly. */
  readonly stiffness?: number;
  /** Velocity-proportional damping. */
  readonly damping?: number;
  /** Effective mass; must be positive. */
  readonly mass?: number;
  /** Maximum distance from target before the spring may settle. */
  readonly restDelta?: number;
  /** Maximum absolute velocity before the spring may settle, in units per second. */
  readonly restSpeed?: number;
  /** Maximum integration substep, in milliseconds. */
  readonly maxSubstepMs?: number;
  /** Large frame gaps are capped to keep hidden-tab resumes stable. */
  readonly maxDeltaMs?: number;
}

/** One-dimensional physical state. Velocity uses units per second. */
export interface SpringState {
  readonly value: number;
  readonly velocity: number;
}

export interface SpringStepResult extends SpringState {
  readonly settled: boolean;
}

/** Framework-independent sample emitted by a physical motion. */
export interface MotionSample extends SpringState {
  /** Timestamp from the shared requestAnimationFrame clock, in milliseconds. */
  readonly timestamp: number;
}

export interface RetargetableMotionOptions extends SpringOptions {
  /** Initial value; defaults to zero. */
  readonly initialValue?: number;
  readonly onUpdate?: (sample: MotionSample) => void;
  readonly onComplete?: (sample: MotionSample) => void;
}


/** Two-dimensional point expressed in CSS pixels or another caller-defined unit. */
export interface Point2D {
  readonly x: number;
  readonly y: number;
}

/** Optional browser behavior for pointerGestures$(). */
export interface PointerGestureOptions {
  /** Capture the active pointer on the target when Pointer Events are available. Defaults to true. */
  readonly capturePointer?: boolean;
}

/** Normalized pointer event emitted by pointerGestures$(); x/y are viewport client coordinates. */
export interface PointerGestureEvent extends Point2D {
  readonly type: 'down' | 'move' | 'up' | 'cancel';
  readonly pointerId: number;
  /** PointerEvent.timeStamp in milliseconds. */
  readonly timestamp: number;
}

export interface PointBounds {
  readonly minX?: number;
  readonly maxX?: number;
  readonly minY?: number;
  readonly maxY?: number;
}

export type DragAxis = 'both' | 'x' | 'y';

/** Options for dragInertia(); velocities are measured in units per second. */
export interface DragInertiaOptions {
  /** Exponential velocity decay coefficient in 1/seconds. Defaults to 6. */
  readonly friction?: number;
  /** Motion settles when the velocity magnitude reaches this units/second threshold. */
  readonly minVelocity?: number;
  /** Weight of the previous velocity sample, clamped to 0..0.99. */
  readonly velocitySmoothing?: number;
  /** Maximum absolute velocity for each axis, in units per second. */
  readonly maxVelocity?: number;
  /** Restrict movement and velocity estimation to one axis. Defaults to both axes. */
  readonly axis?: DragAxis;
  /** Maximum integration delta for a single frame, in milliseconds. */
  readonly maxDeltaMs?: number;
  /** Pointer samples separated by a larger gap reset estimated velocity. */
  readonly maxVelocitySampleMs?: number;
  /** Static coordinate bounds. Velocity is stopped at a clamped edge. */
  readonly bounds?: PointBounds;
  /**
   * Resolve coordinate bounds dynamically, for example from a resizable container.
   * When provided, this takes precedence over `bounds` and is evaluated on each sample/frame.
   */
  readonly getBounds?: () => PointBounds;
}

export interface DragInertiaSample extends Point2D {
  readonly vx: number;
  readonly vy: number;
  readonly phase: 'dragging' | 'inertia' | 'rest';
  readonly timestamp: number;
  readonly pointerId: number | null;
}

/** Options for slideFollow(); spring constants are shared with RetargetableMotion. */
export interface SlideFollowOptions extends SpringOptions {
  readonly initialValue?: Point2D;
}

export interface SlideFollowSample extends Point2D {
  readonly vx: number;
  readonly vy: number;
  readonly targetX: number;
  readonly targetY: number;
  readonly timestamp: number;
  readonly settled: boolean;
}


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
