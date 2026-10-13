/** RxJS operators for gestures, stream smoothing and retargetable/adaptive motion. */
export { pointerGestures$, dragInertia, slideFollow } from './operators/gestures.js';
export { retargetMotion } from './operators/retargetMotion.js';
export { smoothStream } from './operators/smoothStream.js';
export { adaptiveTween } from './operators/adaptiveTween.js';
export type {
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
  Point2D,
  MotionSample,
} from './types.js';
