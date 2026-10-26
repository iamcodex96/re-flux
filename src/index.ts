export { Animation } from './core/Animation.js';
export { Timeline } from './core/Timeline.js';
export { sequence, parallel, staggered } from './core/composition.js';
export { stagger } from './utils/stagger.js';
export type { StaggerOptions, StaggerOrigin, StaggerDelayFunction } from './utils/stagger.js';
export { FrameCoordinator, frameCoordinator } from './core/FrameCoordinator.js';
export type { FrameTask, FrameCoordinatorMetrics, FrameCoordinatorDiagnostics } from './core/FrameCoordinator.js';
export { MotionPreferences } from './core/MotionPreferences.js';
export type { MotionPreferencesOptions, MotionPreferencesSnapshot, MotionPreferencesSource } from './core/MotionPreferences.js';
export { Tween } from './values/Tween.js';
export { Keyframes, keyframes } from './values/Keyframes.js';
export { RetargetableMotion } from './physics/RetargetableMotion.js';
export { DEFAULT_SPRING_OPTIONS, stepSpring, projectInertiaTarget } from './physics/spring.js';
export { Easings, resolveEasing, cubicBezier, steps } from './utils/easings.js';
export { clamp, lerp, mapRange, snap, wrap, random, interpolateRange, pipe, distribute } from './utils/math.js';
export type { NumericRange, SnapTarget, DistributeOptions } from './utils/math.js';
export { interpolate } from './values/interpolate.js';
export { animationFrame$, createAnimationFrameObservable } from './utils/animationFrame.js';
export type {
  AnimatableItem,
  AnimationFrameTick,
  AnimationFrameSource,
  AnimationOptions,
  AnimationMotionOptions,
  ReducedMotionBehavior,
  AnimationState,
  EasingFunction,
  EasingName,
  EasingOption,
  TimelineOffset,
  TimelineOptions,
  TimelineSegment,
  TweenOptions,
  KeyframesOptions,
  ValueKeyframe,
  ValueInterpolator,
  SpringOptions,
  SpringState,
  SpringStepResult,
  RetargetableMotionOptions,
  MotionSample,
  Point2D,
  PointerGestureEvent,
  PointerGestureOptions,
  DragAxis,
  PointBounds,
  DragInertiaOptions,
  DragInertiaSample,
  SlideFollowOptions,
  SlideFollowSample,
  RetargetMotionOperatorOptions,
  TimestampedValue,
  AdaptiveTweenOptions,
  AdaptiveTweenSample,
  SmoothStreamOptions,
  SmoothedStreamSample,
} from './types.js';

export { pointerGestures$, dragInertia, slideFollow } from './operators/gestures.js';
export { retargetMotion } from './operators/retargetMotion.js';
export { smoothStream } from './operators/smoothStream.js';
export { adaptiveTween } from './operators/adaptiveTween.js';

export { addVectors, subtractVectors, scaleVector, vectorMagnitudeSquared, vectorMagnitude, normalizeVector, limitVector, distanceBetween, dotProduct, vectorFromAngle, lerpVector } from './utils/vector2.js';
export type { Vector2 } from './utils/vector2.js';
export { seek, arrive, flee, separate, combineSteering, stepSteeringAgent, followFlowField } from './steering.js';
export type { SteeringAgent, SteeringOptions, ArriveOptions, FleeOptions, SeparationOptions, SteeringStepOptions, FlowFollowingOptions, WeightedSteeringForce } from './steering.js';

export { createFlowField, sampleFlowField } from './flowField.js';
export type { FlowField, FlowFieldCell, FlowFieldOptions, FlowFieldEdgeMode } from './flowField.js';
