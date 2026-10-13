import {
  Observable,
  type OperatorFunction,
  Subscription,
  filter,
  fromEvent,
  map,
  merge,
  switchMap,
  takeWhile,
} from 'rxjs';
import type {
  DragInertiaOptions,
  DragInertiaSample,
  Point2D,
  PointBounds,
  PointerGestureEvent,
  PointerGestureOptions,
  SlideFollowOptions,
  SlideFollowSample,
  SpringState,
} from '../types.js';
import { frameCoordinator } from '../core/FrameCoordinator.js';
import { DEFAULT_SPRING_OPTIONS, stepSpring } from '../physics/spring.js';

/**
 * Converts pointerdown/move/up/cancel into one normalized gesture stream.
 * Move and release events are observed on the owning window so a drag can continue
 * when the pointer leaves the original element.
 */
export function pointerGestures$(target: EventTarget, options: PointerGestureOptions = {}): Observable<PointerGestureEvent> {
  const moveTarget = resolvePointerTarget(target);
  const documentRef = resolvePointerDocument(target);

  return fromEvent<PointerEvent>(target, 'pointerdown').pipe(
    filter((event) => event.isPrimary !== false && (event.button === 0 || event.button === -1)
      && Number.isFinite(event.pointerId) && isValidPoint(event.clientX, event.clientY)),
    switchMap((down) => {
      const pointerId = down.pointerId;
      const captured = options.capturePointer !== false && tryCapturePointer(target, pointerId);
      const firstSample = normalizePointerEvent(down, 'down');
      let lastSample = firstSample;
      const remember = (sample: PointerGestureEvent): PointerGestureEvent => {
        lastSample = sample;
        return sample;
      };
      const cancelFromLastSample = (): PointerGestureEvent => Object.freeze({
        ...lastSample,
        type: 'cancel' as const,
      });
      const moves$ = fromEvent<PointerEvent>(moveTarget, 'pointermove').pipe(
        filter((event) => event.pointerId === pointerId),
        map((event) => remember(normalizePointerEvent(event, 'move'))),
      );
      const ups$ = fromEvent<PointerEvent>(moveTarget, 'pointerup').pipe(
        filter((event) => event.pointerId === pointerId),
        map((event) => remember(normalizePointerEvent(event, 'up'))),
      );
      const cancels$ = fromEvent<PointerEvent>(moveTarget, 'pointercancel').pipe(
        filter((event) => event.pointerId === pointerId),
        map((event) => remember(normalizePointerEvent(event, 'cancel'))),
      );
      const lostCapture$ = fromEvent<PointerEvent>(target, 'lostpointercapture').pipe(
        filter((event) => event.pointerId === pointerId),
        map(() => remember(cancelFromLastSample())),
      );
      const lostFocus$ = fromEvent(moveTarget, 'blur').pipe(
        map(() => remember(cancelFromLastSample())),
      );
      const visibilityLost$ = documentRef
        ? fromEvent(documentRef, 'visibilitychange').pipe(
          filter(() => documentRef.visibilityState === 'hidden'),
          map(() => remember(cancelFromLastSample())),
        )
        : new Observable<PointerGestureEvent>();

      return new Observable<PointerGestureEvent>((subscriber) => {
        // Attach terminal/move listeners before publishing `down`, so even re-entrant
        // consumers cannot synchronously dispatch a move/up into a subscription gap.
        const trackingSubscription = merge(moves$, ups$, cancels$, lostCapture$, lostFocus$, visibilityLost$)
          .pipe(takeWhile((event) => event.type === 'move', true))
          .subscribe({
            next: (event) => subscriber.next(event),
            error: (error: unknown) => subscriber.error(error),
            complete: () => subscriber.complete(),
          });
        subscriber.next(firstSample);
        return () => {
          trackingSubscription.unsubscribe();
          if (captured) tryReleasePointer(target, pointerId);
        };
      });
    }),
  );
}

/**
 * Maps normalized pointer gestures into drag samples and exponentially decaying inertia.
 * Velocity is measured in CSS pixels per second; friction is an inverse-time coefficient.
 */
export function dragInertia(
  options: DragInertiaOptions = {},
): OperatorFunction<PointerGestureEvent, DragInertiaSample> {
  const config = normalizeDragOptions(options);

  return (source) => new Observable<DragInertiaSample>((subscriber) => {
    let activePointerId: number | null = null;
    let x = 0;
    let y = 0;
    let vx = 0;
    let vy = 0;
    let lastPointerTimestamp: number | null = null;
    let lastFrameTimestamp: number | null = null;
    let inertiaSubscription: Subscription | null = null;

    const stopInertia = (): void => {
      inertiaSubscription?.unsubscribe();
      inertiaSubscription = null;
      lastFrameTimestamp = null;
    };

    const clampPoint = (point: Point2D, bounds: Required<PointBounds> = config.getBounds()): Point2D => {
      return {
        x: clamp(point.x, bounds.minX, bounds.maxX),
        y: clamp(point.y, bounds.minY, bounds.maxY),
      };
    };

    const emit = (phase: DragInertiaSample['phase'], timestamp: number, pointerId: number | null): void => {
      subscriber.next(Object.freeze({ x, y, vx, vy, phase, timestamp, pointerId }));
    };

    const startInertia = (timestamp: number, pointerId: number): void => {
      stopInertia();
      emit('inertia', timestamp, pointerId);
      const subscription = frameCoordinator.frames$.subscribe({
        next: (frame) => {
          if (lastFrameTimestamp === null) {
            lastFrameTimestamp = frame.timestamp;
            return;
          }

          const deltaMs = Math.min(config.maxDeltaMs, Math.max(0, frame.timestamp - lastFrameTimestamp));
          lastFrameTimestamp = frame.timestamp;
          if (deltaMs <= 0) return;

          const deltaSeconds = deltaMs / 1000;
          const decay = Math.exp(-config.friction * deltaSeconds);
          x += vx * (1 - decay) / config.friction;
          y += vy * (1 - decay) / config.friction;
          vx *= decay;
          vy *= decay;

          let bounded: Point2D;
          try {
            bounded = clampPoint({ x, y });
          } catch (error: unknown) {
            stopInertia();
            subscriber.error(error);
            return;
          }
          if (bounded.x !== x) vx = 0;
          if (bounded.y !== y) vy = 0;
          x = bounded.x;
          y = bounded.y;

          if (Math.hypot(vx, vy) <= config.minVelocity) {
            vx = 0;
            vy = 0;
            stopInertia();
            emit('rest', frame.timestamp, pointerId);
            return;
          }
          emit('inertia', frame.timestamp, pointerId);
        },
        error: (error: unknown) => subscriber.error(error),
      });
      inertiaSubscription = subscription.closed ? null : subscription;
    };

    const sourceSubscription = source.subscribe({
      next: (event) => {
        if (!isValidPoint(event.x, event.y) || !Number.isFinite(event.timestamp)) {
          subscriber.error(new RangeError('Pointer gesture coordinates and timestamps must be finite.'));
          return;
        }

        if (event.type === 'down') {
          stopInertia();
          activePointerId = event.pointerId;
          let bounded: Point2D;
          try {
            bounded = clampPoint(event);
          } catch (error: unknown) {
            activePointerId = null;
            subscriber.error(error);
            return;
          }
          x = bounded.x;
          y = bounded.y;
          vx = 0;
          vy = 0;
          lastPointerTimestamp = event.timestamp;
          emit('dragging', event.timestamp, activePointerId);
          return;
        }

        if (activePointerId === null || event.pointerId !== activePointerId) return;
        // Old pointer samples must not rewind coordinates or release/cancel a newer gesture state.
        if (lastPointerTimestamp !== null && event.timestamp < lastPointerTimestamp) return;

        if (event.type === 'move') {
          const previousTime = lastPointerTimestamp;
          let candidate: Point2D;
          let bounded: Point2D;
          let bounds: Required<PointBounds>;
          try {
            // A resized container may have moved the current point outside its new bounds.
            // Normalize that baseline first so the resize itself is not misread as pointer velocity.
            bounds = config.getBounds();
            const normalizedCurrent = clampPoint({ x, y }, bounds);
            if (normalizedCurrent.x !== x) vx = 0;
            if (normalizedCurrent.y !== y) vy = 0;
            x = normalizedCurrent.x;
            y = normalizedCurrent.y;
            candidate = {
              x: config.axis === 'y' ? x : event.x,
              y: config.axis === 'x' ? y : event.y,
            };
            bounded = clampPoint(candidate, bounds);
          } catch (error: unknown) {
            activePointerId = null;
            subscriber.error(error);
            return;
          }
          if (previousTime !== null) {
            const elapsedMs = event.timestamp - previousTime;
            if (elapsedMs > 0 && elapsedMs <= config.maxVelocitySampleMs) {
              const elapsedSeconds = elapsedMs / 1000;
              // Estimate from the actual, bounded displacement rather than the requested point.
              const rawVx = config.axis === 'y' ? 0 : (bounded.x - x) / elapsedSeconds;
              const rawVy = config.axis === 'x' ? 0 : (bounded.y - y) / elapsedSeconds;
              const filteredVx = clampVelocity(vx * config.velocitySmoothing + rawVx * (1 - config.velocitySmoothing), config.maxVelocity);
              const filteredVy = clampVelocity(vy * config.velocitySmoothing + rawVy * (1 - config.velocitySmoothing), config.maxVelocity);
              const pushesPastXBound = (bounded.x <= bounds.minX && filteredVx < 0)
                || (bounded.x >= bounds.maxX && filteredVx > 0);
              const pushesPastYBound = (bounded.y <= bounds.minY && filteredVy < 0)
                || (bounded.y >= bounds.maxY && filteredVy > 0);
              vx = config.axis === 'y' || bounded.x !== candidate.x || pushesPastXBound ? 0 : filteredVx;
              vy = config.axis === 'x' || bounded.y !== candidate.y || pushesPastYBound ? 0 : filteredVy;
            } else {
              // Equal timestamps or long gaps do not provide a reliable velocity estimate.
              vx = 0;
              vy = 0;
            }
          }

          x = bounded.x;
          y = bounded.y;
          lastPointerTimestamp = event.timestamp;
          emit('dragging', event.timestamp, activePointerId);
          return;
        }

        const releasedPointerId = activePointerId;
        activePointerId = null;
        lastPointerTimestamp = null;
        if (event.type === 'cancel' || Math.hypot(vx, vy) <= config.minVelocity) {
          vx = 0;
          vy = 0;
          stopInertia();
          emit('rest', event.timestamp, releasedPointerId);
          return;
        }
        startInertia(event.timestamp, releasedPointerId);
      },
      error: (error: unknown) => subscriber.error(error),
      complete: () => {
        stopInertia();
        subscriber.complete();
      },
    });

    return () => {
      sourceSubscription.unsubscribe();
      stopInertia();
    };
  });
}

/**
 * Smooths a stream of target points with two independent springs on the shared frame clock.
 * Retargeting changes the destination but preserves the currently sampled position and velocity.
 */
export function slideFollow(
  options: SlideFollowOptions = {},
): OperatorFunction<Point2D, SlideFollowSample> {
  const initial = options.initialValue ?? { x: 0, y: 0 };
  if (!isValidPoint(initial.x, initial.y)) {
    throw new RangeError('The initial slide-follow point must contain finite coordinates.');
  }


  return (source) => new Observable<SlideFollowSample>((subscriber) => {
    let x: SpringState = { value: initial.x, velocity: 0 };
    let y: SpringState = { value: initial.y, velocity: 0 };
    let target: Point2D = { x: initial.x, y: initial.y };
    let frameSubscription: Subscription | null = null;
    let lastFrameTimestamp: number | null = null;
    let sourceCompleted = false;

    const restDelta = options.restDelta ?? DEFAULT_SPRING_OPTIONS.restDelta;
    const restSpeed = options.restSpeed ?? DEFAULT_SPRING_OPTIONS.restSpeed;
    const isSettled = (): boolean =>
      Math.abs(x.value - target.x) <= restDelta
      && Math.abs(y.value - target.y) <= restDelta
      && Math.abs(x.velocity) <= restSpeed
      && Math.abs(y.velocity) <= restSpeed;

    const makeSample = (timestamp: number, settled = isSettled()): SlideFollowSample => Object.freeze({
      x: x.value,
      y: y.value,
      vx: x.velocity,
      vy: y.velocity,
      targetX: target.x,
      targetY: target.y,
      timestamp,
      settled,
    });

    const stopClock = (): void => {
      frameSubscription?.unsubscribe();
      frameSubscription = null;
      lastFrameTimestamp = null;
    };

    const completeIfReady = (): void => {
      if (sourceCompleted && frameSubscription === null && isSettled() && !subscriber.closed) {
        subscriber.complete();
      }
    };

    const startClock = (): void => {
      if (frameSubscription && !frameSubscription.closed) return;
      const subscription = frameCoordinator.frames$.subscribe({
        next: (frame) => {
          if (lastFrameTimestamp === null) {
            lastFrameTimestamp = frame.timestamp;
            return;
          }
          const deltaMs = Math.max(0, frame.timestamp - lastFrameTimestamp);
          lastFrameTimestamp = frame.timestamp;
          if (deltaMs <= 0) return;

          const nextX = stepSpring(x, target.x, deltaMs, options);
          const nextY = stepSpring(y, target.y, deltaMs, options);
          x = { value: nextX.value, velocity: nextX.velocity };
          y = { value: nextY.value, velocity: nextY.velocity };

          const settled = nextX.settled && nextY.settled;
          if (settled) {
            x = { value: target.x, velocity: 0 };
            y = { value: target.y, velocity: 0 };
          }
          subscriber.next(makeSample(frame.timestamp, settled));

          if (settled) {
            stopClock();
            completeIfReady();
          }
        },
        error: (error: unknown) => subscriber.error(error),
      });
      frameSubscription = subscription.closed ? null : subscription;
    };

    subscriber.next(makeSample(0));
    const sourceSubscription = source.subscribe({
      next: (nextTarget) => {
        if (!isValidPoint(nextTarget.x, nextTarget.y)) {
          subscriber.error(new RangeError('Slide-follow target coordinates must be finite numbers.'));
          return;
        }
        target = Object.freeze({ x: nextTarget.x, y: nextTarget.y });
        if (isSettled()) {
          x = { value: target.x, velocity: 0 };
          y = { value: target.y, velocity: 0 };
          stopClock();
          subscriber.next(makeSample(lastFrameTimestamp ?? 0, true));
          completeIfReady();
          return;
        }
        subscriber.next(makeSample(lastFrameTimestamp ?? 0, false));
        startClock();
      },
      error: (error: unknown) => {
        stopClock();
        subscriber.error(error);
      },
      complete: () => {
        sourceCompleted = true;
        completeIfReady();
      },
    });

    return () => {
      sourceSubscription.unsubscribe();
      stopClock();
    };
  });
}

function normalizePointerEvent(event: PointerEvent, type: PointerGestureEvent['type']): PointerGestureEvent {
  return Object.freeze({
    type,
    pointerId: event.pointerId,
    x: event.clientX,
    y: event.clientY,
    timestamp: Number.isFinite(event.timeStamp) ? event.timeStamp : Date.now(),
  });
}

function tryCapturePointer(target: EventTarget, pointerId: number): boolean {
  const candidate = target as EventTarget & { setPointerCapture?: (id: number) => void };
  if (typeof candidate.setPointerCapture !== 'function') return false;
  try {
    candidate.setPointerCapture(pointerId);
    return true;
  } catch {
    // Synthetic events, detached targets, and unsupported browsers may reject capture.
    return false;
  }
}

function tryReleasePointer(target: EventTarget, pointerId: number): void {
  const candidate = target as EventTarget & {
    releasePointerCapture?: (id: number) => void;
    hasPointerCapture?: (id: number) => boolean;
  };
  if (typeof candidate.releasePointerCapture !== 'function') return;
  try {
    if (typeof candidate.hasPointerCapture !== 'function' || candidate.hasPointerCapture(pointerId)) {
      candidate.releasePointerCapture(pointerId);
    }
  } catch {
    // The browser may already have released capture after pointerup/pointercancel.
  }
}

function resolvePointerTarget(target: EventTarget): EventTarget {
  const candidate = target as EventTarget & { ownerDocument?: Document | null; defaultView?: Window | null };
  if (candidate.ownerDocument?.defaultView) return candidate.ownerDocument.defaultView;
  if (candidate.defaultView) return candidate.defaultView;
  if (typeof window !== 'undefined') return window;
  return target;
}

function resolvePointerDocument(target: EventTarget): Document | null {
  const candidate = target as EventTarget & { ownerDocument?: Document | null };
  if (candidate.ownerDocument) return candidate.ownerDocument;
  return typeof document !== 'undefined' ? document : null;
}

function normalizeDragOptions(options: DragInertiaOptions): NormalizedDragOptions {
  const getBounds = (): Required<PointBounds> => {
    const bounds = options.getBounds?.() ?? options.bounds ?? {};
    const normalizedBounds = {
      minX: bounds.minX ?? Number.NEGATIVE_INFINITY,
      maxX: bounds.maxX ?? Number.POSITIVE_INFINITY,
      minY: bounds.minY ?? Number.NEGATIVE_INFINITY,
      maxY: bounds.maxY ?? Number.POSITIVE_INFINITY,
    };
    if (Object.values(normalizedBounds).some(Number.isNaN)
      || normalizedBounds.minX > normalizedBounds.maxX
      || normalizedBounds.minY > normalizedBounds.maxY) {
      throw new RangeError('Drag bounds must be valid numbers and each minimum must not exceed its maximum.');
    }
    return normalizedBounds;
  };

  // Validate static or dynamic bounds immediately, then resolve them afresh during motion.
  getBounds();

  const axis = options.axis ?? 'both';
  if (axis !== 'both' && axis !== 'x' && axis !== 'y') {
    throw new RangeError("dragInertia() axis must be 'both', 'x', or 'y'.");
  }

  return {
    axis,
    friction: positive(options.friction, 6),
    minVelocity: nonNegative(options.minVelocity, 8),
    velocitySmoothing: options.velocitySmoothing !== undefined && Number.isFinite(options.velocitySmoothing)
      ? Math.min(0.99, Math.max(0, options.velocitySmoothing))
      : 0.65,
    maxVelocity: positive(options.maxVelocity, 6000),
    maxDeltaMs: positive(options.maxDeltaMs, 64),
    maxVelocitySampleMs: positive(options.maxVelocitySampleMs, 200),
    getBounds,
  };
}

type NormalizedDragOptions = {
  readonly friction: number;
  readonly minVelocity: number;
  readonly velocitySmoothing: number;
  readonly maxVelocity: number;
  readonly maxDeltaMs: number;
  readonly maxVelocitySampleMs: number;
  readonly getBounds: () => Required<PointBounds>;
  readonly axis: 'both' | 'x' | 'y';
};

function clampVelocity(value: number, maxVelocity: number): number {
  return Math.min(maxVelocity, Math.max(-maxVelocity, value));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function positive(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isFinite(value) && value > 0 ? value : fallback;
}

function nonNegative(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isFinite(value) && value >= 0 ? value : fallback;
}

function isValidPoint(x: number, y: number): boolean {
  return Number.isFinite(x) && Number.isFinite(y);
}

