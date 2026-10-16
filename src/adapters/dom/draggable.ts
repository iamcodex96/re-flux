import { Observable, Subject, Subscription } from 'rxjs';
import { map } from 'rxjs/operators';
import { Tween } from '../../values/Tween.js';
import type { AnimationState, DragAxis, DragInertiaOptions, DragInertiaSample, EasingOption, Point2D, PointBounds, PointerGestureEvent } from '../../types.js';
import { dragInertia, pointerGestures$ } from '../../operators/gestures.js';

/** Options for a production-oriented draggable DOM element. Bounds are expressed as translation coordinates. */
export interface DraggableOptions extends Omit<DragInertiaOptions, 'getBounds' | 'bounds'> {
  readonly initialPosition?: Point2D;
  readonly bounds?: PointBounds;
  /** Bounds are resolved on pointer samples and inertia frames, so container resizing is supported. */
  readonly getBounds?: () => PointBounds;
  readonly capturePointer?: boolean;
  readonly keyboardStep?: number;
  /** Grid size in CSS pixels, or per-axis grid steps. Snapping is eased after release, not quantized during drag. */
  readonly snapTo?: number | Point2D;
  readonly snapDuration?: number;
  readonly snapEasing?: EasingOption;
  readonly onStart?: (sample: DragInertiaSample, target: HTMLElement) => void;
  readonly onUpdate?: (sample: DragInertiaSample, target: HTMLElement) => void;
  readonly onEnd?: (sample: DragInertiaSample, target: HTMLElement) => void;
  readonly onError?: (error: unknown) => void;
}

/** Handle returned by `draggable()`. It can also be registered with an AnimationScope via `scope.add(handle)`. */
export interface DraggableHandle {
  readonly element: HTMLElement;
  readonly errors$: Observable<unknown>;
  readonly position: Point2D;
  readonly isDragging: boolean;
  destroy(): void;
  dispose(): void;
}

interface StyleDeclarationSnapshot {
  readonly value: string;
  readonly priority: string;
}

/**
 * Make a DOM element draggable with pointer capture, filtered velocity, bounded inertia and keyboard controls.
 * This helper owns the CSS `translate`, `touch-action`, `user-select` and `cursor` declarations while active,
 * restoring their exact original values on `destroy()` / `dispose()`.
 */
export function draggable(target: HTMLElement, options: DraggableOptions = {}): DraggableHandle {
  const requestedInitial = options.initialPosition ?? readInitialTranslate(target);
  if (!Number.isFinite(requestedInitial.x) || !Number.isFinite(requestedInitial.y)) {
    throw new RangeError('draggable() initialPosition must contain finite coordinates.');
  }
  const axis: DragAxis = options.axis ?? 'both';
  if (axis !== 'both' && axis !== 'x' && axis !== 'y') {
    throw new RangeError("draggable() axis must be 'both', 'x', or 'y'.");
  }
  const keyboardStep = options.keyboardStep ?? 10;
  if (!Number.isFinite(keyboardStep) || keyboardStep < 0) {
    throw new RangeError('draggable() keyboardStep must be finite and non-negative.');
  }
  const snapDuration = options.snapDuration ?? 260;
  if (!Number.isFinite(snapDuration) || snapDuration <= 0) {
    throw new RangeError('draggable() snapDuration must be finite and greater than zero.');
  }
  if (options.snapTo !== undefined) {
    const stepX = typeof options.snapTo === 'number' ? options.snapTo : options.snapTo.x;
    const stepY = typeof options.snapTo === 'number' ? options.snapTo : options.snapTo.y;
    if (!Number.isFinite(stepX) || stepX <= 0 || !Number.isFinite(stepY) || stepY <= 0) {
      throw new RangeError('draggable() snapTo must contain positive finite grid steps.');
    }
  }

  const dragOptions: DragInertiaOptions = {
    ...(options.friction === undefined ? {} : { friction: options.friction }),
    ...(options.minVelocity === undefined ? {} : { minVelocity: options.minVelocity }),
    ...(options.velocitySmoothing === undefined ? {} : { velocitySmoothing: options.velocitySmoothing }),
    ...(options.maxVelocity === undefined ? {} : { maxVelocity: options.maxVelocity }),
    ...(options.maxDeltaMs === undefined ? {} : { maxDeltaMs: options.maxDeltaMs }),
    ...(options.maxVelocitySampleMs === undefined ? {} : { maxVelocitySampleMs: options.maxVelocitySampleMs }),
    axis,
    ...(options.bounds === undefined ? {} : { bounds: options.bounds }),
    ...(options.getBounds === undefined ? {} : { getBounds: options.getBounds }),
  };
   
   
  const dragOperator = dragInertia(dragOptions);
  const initialBounds = normalizeDraggableBounds(options.getBounds?.() ?? options.bounds ?? {});
  const initial: Point2D = Object.freeze({
    x: clampDraggableCoordinate(requestedInitial.x, initialBounds.minX, initialBounds.maxX),
    y: clampDraggableCoordinate(requestedInitial.y, initialBounds.minY, initialBounds.maxY),
  });

  const originalStyles = new Map<string, StyleDeclarationSnapshot>();
  const styleProperties = ['translate', 'touch-action', 'user-select', 'cursor'] as const;
  for (const property of styleProperties) {
    originalStyles.set(property, {
      value: target.style.getPropertyValue(property),
      priority: target.style.getPropertyPriority(property),
    });
  }
  const originalTabIndex = target.getAttribute('tabindex');
  if (originalTabIndex === null) target.setAttribute('tabindex', '0');
  target.style.setProperty('cursor', 'grab');
  target.style.setProperty('user-select', 'none');
  target.style.setProperty('touch-action', axis === 'x' ? 'pan-y' : axis === 'y' ? 'pan-x' : 'none');

  let position: Point2D = { x: initial.x, y: initial.y };
  let isDragging = false;
  let gestureStarted = false;
  let gestureAnchor: Point2D = { x: 0, y: 0 };
  let gestureBase: Point2D = { ...position };
  let destroyed = false;
  const errors = new Subject<unknown>();
  let snapTween: Tween<Point2D> | null = null;
  let snapValueSubscription: Subscription | null = null;
  let snapStateSubscription: Subscription | null = null;
  const applyPosition = (next: Point2D): void => {
    position = Object.freeze({ x: next.x, y: next.y });
    target.style.setProperty('translate', `${position.x}px ${position.y}px`);
  };
  const restoreProperty = (property: string, snapshot: StyleDeclarationSnapshot): void => {
    if (snapshot.value) target.style.setProperty(property, snapshot.value, snapshot.priority);
    else target.style.removeProperty(property);
  };
  applyPosition(initial);

  const cancelSnapAnimation = (): void => {
    snapValueSubscription?.unsubscribe();
    snapStateSubscription?.unsubscribe();
    snapValueSubscription = null;
    snapStateSubscription = null;
    const current = snapTween;
    snapTween = null;
    if (current && current.state$.value !== 'completed') current.stop();
  };

  const startSnapAnimation = (point: Point2D): void => {
    if (options.snapTo === undefined || destroyed) return;
    const stepX = typeof options.snapTo === 'number' ? options.snapTo : options.snapTo.x;
    const stepY = typeof options.snapTo === 'number' ? options.snapTo : options.snapTo.y;
    const bounds = normalizeDraggableBounds(options.getBounds?.() ?? options.bounds ?? {});
    const snapped: Point2D = {
      x: axis === 'y' ? point.x : clampDraggableCoordinate(Math.round(point.x / stepX) * stepX, bounds.minX, bounds.maxX),
      y: axis === 'x' ? point.y : clampDraggableCoordinate(Math.round(point.y / stepY) * stepY, bounds.minY, bounds.maxY),
    };
    if (Math.abs(snapped.x - point.x) < 0.001 && Math.abs(snapped.y - point.y) < 0.001) return;

    cancelSnapAnimation();
    const tween = new Tween<Point2D>({
      from: { x: point.x, y: point.y },
      to: snapped,
      duration: snapDuration,
      easing: options.snapEasing ?? 'easeOutCubic',
      interpolate: (from, to, progress) => ({
        x: from.x + (to.x - from.x) * progress,
        y: from.y + (to.y - from.y) * progress,
      }),
    });
    snapTween = tween;
    snapValueSubscription = tween.value$.subscribe((value: Point2D) => applyPosition(value));
    snapStateSubscription = tween.state$.subscribe((state: AnimationState) => {
      if (state !== 'completed' || snapTween !== tween) return;
      snapValueSubscription?.unsubscribe();
      snapStateSubscription?.unsubscribe();
      snapValueSubscription = null;
      snapStateSubscription = null;
      snapTween = null;
    });
    tween.play();
  };

  const mappedGestures$ = pointerGestures$(target, { capturePointer: options.capturePointer ?? true }).pipe(
    map((event: PointerGestureEvent): PointerGestureEvent => {
      if (event.type === 'down') {
        cancelSnapAnimation();
        gestureAnchor = { x: event.x, y: event.y };
        gestureBase = { ...position };
        gestureStarted = false;
        isDragging = true;
        return { ...event, x: position.x, y: position.y };
      }
      const translated = {
        x: axis === 'y' ? gestureBase.x : gestureBase.x + event.x - gestureAnchor.x,
        y: axis === 'x' ? gestureBase.y : gestureBase.y + event.y - gestureAnchor.y,
      };
      if (event.type === 'up' || event.type === 'cancel') {
        isDragging = false;
        target.style.setProperty('cursor', 'grab');
      }
      return { ...event, ...translated };
    }),
  );
  const samples = mappedGestures$.pipe(dragOperator);
  const subscription = new Subscription();
  subscription.add(samples.subscribe({
    next: (sample: DragInertiaSample) => {
      applyPosition(sample);
      if (sample.phase === 'dragging' && !gestureStarted) {
        gestureStarted = true;
        target.style.setProperty('cursor', 'grabbing');
        options.onStart?.(sample, target);
      }
      options.onUpdate?.(sample, target);
      if (sample.phase === 'rest') {
        isDragging = false;
        options.onEnd?.(sample, target);
        try { startSnapAnimation(sample); }
        catch (error: unknown) {
          errors.next(error);
          try { options.onError?.(error); } finally { destroy(); }
        }
      }
    },
    error: (error: unknown) => {
      errors.next(error);
      try { options.onError?.(error); } finally { destroy(); }
    },
  }));

  const onKeyDown = (event: KeyboardEvent): void => {
    if (destroyed || keyboardStep === 0) return;
    cancelSnapAnimation();
    const direction: Partial<Point2D> = event.key === 'ArrowLeft' ? { x: -1 }
      : event.key === 'ArrowRight' ? { x: 1 }
        : event.key === 'ArrowUp' ? { y: -1 }
          : event.key === 'ArrowDown' ? { y: 1 } : {};
    if (direction.x === undefined && direction.y === undefined) return;
    if ((axis === 'y' && direction.x !== undefined) || (axis === 'x' && direction.y !== undefined)) return;
    event.preventDefault();
    const multiplier = event.shiftKey ? 5 : 1;
    const requested = {
      x: position.x + (direction.x ?? 0) * keyboardStep * multiplier,
      y: position.y + (direction.y ?? 0) * keyboardStep * multiplier,
    };
    let bounded = requested;
    try {
      const bounds = normalizeDraggableBounds(options.getBounds?.() ?? options.bounds ?? {});
      bounded = {
        x: clampDraggableCoordinate(requested.x, bounds.minX, bounds.maxX),
        y: clampDraggableCoordinate(requested.y, bounds.minY, bounds.maxY),
      };
    } catch (error: unknown) {
      errors.next(error);
      try { options.onError?.(error); } finally { destroy(); }
      return;
    }
    const sample: DragInertiaSample = Object.freeze({ ...bounded, vx: 0, vy: 0, phase: 'rest', timestamp: event.timeStamp, pointerId: null });
    applyPosition(sample);
    options.onUpdate?.(sample, target);
  };
  target.addEventListener('keydown', onKeyDown);

  function destroy(): void {
    if (destroyed) return;
    destroyed = true;
    const teardownErrors: unknown[] = [];
    try { cancelSnapAnimation(); } catch (error: unknown) { teardownErrors.push(error); }
    try { subscription.unsubscribe(); } catch (error: unknown) { teardownErrors.push(error); }
    try { target.removeEventListener('keydown', onKeyDown); } catch (error: unknown) { teardownErrors.push(error); }
    isDragging = false;
    for (const [property, snapshot] of originalStyles) {
      try { restoreProperty(property, snapshot); } catch (error: unknown) { teardownErrors.push(error); }
    }
    try {
      if (originalTabIndex === null) target.removeAttribute('tabindex');
      else target.setAttribute('tabindex', originalTabIndex);
    } catch (error: unknown) { teardownErrors.push(error); }
    errors.complete();
    if (teardownErrors.length > 0) throw new AggregateError(teardownErrors, 'Draggable cleanup failed.');
  }

  return {
    element: target,
    errors$: errors.asObservable(),
    get position() { return { ...position }; },
    get isDragging() { return isDragging; },
    destroy,
    dispose: destroy,
  };
}

function readInitialTranslate(target: HTMLElement): Point2D {
  let value = target.style.getPropertyValue('translate');
  try {
    const computed = target.ownerDocument?.defaultView?.getComputedStyle?.(target).getPropertyValue('translate');
    if (computed && computed !== 'none') value = computed;
  } catch {
    
  }
  if (!value.trim() || value.trim() === 'none') return { x: 0, y: 0 };
  const match = value.trim().match(/^(-?(?:\d+\.?\d*|\.\d+))(?:px)?(?:\s+(-?(?:\d+\.?\d*|\.\d+))(?:px)?)?(?:\s+0(?:px)?)?$/i);
  if (!match) {
    throw new RangeError('draggable() cannot infer a non-pixel CSS translate; provide initialPosition explicitly.');
  }
  const x = Number(match[1]);
  const y = match[2] === undefined ? 0 : Number(match[2]);
  if (!Number.isFinite(x) || !Number.isFinite(y)) throw new RangeError('draggable() computed translate must contain finite pixel values.');
  return { x, y };
}

function normalizeDraggableBounds(bounds: PointBounds): Required<PointBounds> {
  const normalized = {
    minX: bounds.minX ?? Number.NEGATIVE_INFINITY,
    maxX: bounds.maxX ?? Number.POSITIVE_INFINITY,
    minY: bounds.minY ?? Number.NEGATIVE_INFINITY,
    maxY: bounds.maxY ?? Number.POSITIVE_INFINITY,
  };
  if ([normalized.minX, normalized.maxX, normalized.minY, normalized.maxY].some(Number.isNaN)
    || normalized.minX > normalized.maxX || normalized.minY > normalized.maxY) {
    throw new RangeError('Draggable bounds must be valid numbers and each minimum must not exceed its maximum.');
  }
  return normalized;
}

function clampDraggableCoordinate(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
