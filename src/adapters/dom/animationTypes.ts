import type { EasingOption } from '../../types/easing.js';
import type { TimelineOptions } from '../../types/animation.js';
import type { ValueKeyframe } from '../../types/values.js';

/** A complete snapshot of CSS declarations to apply; values must include units where required. */
export type CssStyleMap = Readonly<Record<string, string | null | undefined>>;

/** A CSS property value. Arrays are interpreted as evenly distributed property keyframes. */
export type CssAnimatableValue = string | number;
/** Values factory evaluated once for a resolved target; must not perform playback-time side effects. */
export type CssPropertyFramesFactory = (target: Element, index: number, total: number) =>
  CssAnimatableValue | readonly CssAnimatableValue[];
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
 * Property-level frames with independent timing. Choose one shape: `from` + `to`, `values`, or `keyframes`.
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
