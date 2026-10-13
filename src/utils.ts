/** Easing, math, stagger and animation-frame utilities. */
export { Easings, resolveEasing, cubicBezier, steps } from './utils/easings.js';
export { clamp, lerp, mapRange, snap, wrap, random, interpolateRange, pipe, distribute } from './utils/math.js';
export { stagger } from './utils/stagger.js';
export { animationFrame$, createAnimationFrameObservable } from './utils/animationFrame.js';
export type { NumericRange, SnapTarget, DistributeOptions } from './utils/math.js';
export type { StaggerOptions, StaggerOrigin, StaggerDelayFunction } from './utils/stagger.js';
export type { EasingFunction, EasingName, EasingOption, AnimationFrameTick, AnimationFrameSource } from './types.js';
