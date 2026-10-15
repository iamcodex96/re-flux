import type { MotionPreferencesSource } from '../core/MotionPreferences.js';
import type { EasingOption } from './easing.js';

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
