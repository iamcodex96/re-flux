/** Core timeline and frame-coordination APIs, independent of rendering adapters. */
export { Animation } from './core/Animation.js';
export { Timeline } from './core/Timeline.js';
export { sequence, parallel, staggered } from './core/composition.js';
export { FrameCoordinator, frameCoordinator } from './core/FrameCoordinator.js';
export { MotionPreferences } from './core/MotionPreferences.js';
export type { FrameTask, FrameCoordinatorMetrics, FrameCoordinatorDiagnostics } from './core/FrameCoordinator.js';
export type {
  AnimatableItem,
  AnimationOptions,
  AnimationMotionOptions,
  ReducedMotionBehavior,
  AnimationState,
  TimelineOffset,
  TimelineOptions,
  TimelineSegment,
} from './types.js';
export type { MotionPreferencesOptions, MotionPreferencesSnapshot, MotionPreferencesSource } from './core/MotionPreferences.js';
