import { Subscription, type Observable } from 'rxjs';
import type { AnimationFrameTick } from '../types.js';
import { frameCoordinator } from '../core/FrameCoordinator.js';

/** Options for a Canvas 2D value binding. */
export interface CanvasBindingOptions {
  /** Clear the full bitmap before each draw callback. Defaults to true. */
  readonly clearBeforeDraw?: boolean;
  /** Clear the bitmap when unsubscribing. Defaults to false. */
  readonly clearOnUnsubscribe?: boolean;
}

/** Draw callback receives the latest source value and the shared coordinator frame. */
export type CanvasDraw<T> = (
  context: CanvasRenderingContext2D,
  value: T,
  frame: AnimationFrameTick,
) => void;

/**
 * Binds an Observable to a Canvas 2D context. Multiple source emissions in one frame are coalesced
 * to the latest value and drawing runs during the shared coordinator's write phase. The adapter does
 * not own sizing, device-pixel-ratio scaling, or the application's render loop. Canvas pixels cannot
 * be reliably restored to a previous bitmap, so teardown only clears when clearOnUnsubscribe is enabled.
 */
export function bindCanvas<T>(
  context: CanvasRenderingContext2D,
  values$: Observable<T>,
  draw: CanvasDraw<T>,
  options: CanvasBindingOptions = {},
): Subscription {
  const clearBeforeDraw = options.clearBeforeDraw ?? true;
  const clearOnUnsubscribe = options.clearOnUnsubscribe ?? false;
  const binding = new Subscription();
  let latestValue: T | undefined;
  let hasValue = false;
  let pendingWrite: Subscription | null = null;

  const clearBitmap = (): void => {
    const { canvas } = context;
    context.save();
    try {
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.clearRect(0, 0, canvas.width, canvas.height);
    } finally {
      context.restore();
    }
  };

  const upstream = values$.subscribe((value) => {
    latestValue = value;
    hasValue = true;
    if (pendingWrite && !pendingWrite.closed) return;

    const write = frameCoordinator.scheduleWrite((frame) => {
      pendingWrite = null;
      if (binding.closed || !hasValue) return;
      if (clearBeforeDraw) clearBitmap();
      context.save();
      try {
        draw(context, latestValue as T, frame);
      } finally {
        context.restore();
      }
    });
    pendingWrite = write;
    binding.add(write);
  });

  binding.add(upstream);
  binding.add(() => {
    pendingWrite?.unsubscribe();
    pendingWrite = null;
    latestValue = undefined;
    hasValue = false;
    if (clearOnUnsubscribe) clearBitmap();
  });

  return binding;
}


/** Result of sizing a canvas backing bitmap for CSS-pixel drawing on high-density displays. */
export interface CanvasResizeResult {
  readonly context: CanvasRenderingContext2D;
  readonly width: number;
  readonly height: number;
  readonly pixelRatio: number;
}

export interface CanvasResizeOptions {
  /** Logical drawing width in CSS pixels; defaults to the element's current rendered width. */
  readonly width?: number;
  /** Logical drawing height in CSS pixels; defaults to the element's current rendered height. */
  readonly height?: number;
  /** Device scale factor; defaults to devicePixelRatio when available and at least one. */
  readonly pixelRatio?: number;
}

/**
 * Resize a canvas for crisp high-DPI rendering and scale its context so draw callbacks use CSS pixels.
 * Call again after layout changes. `bindCanvas` clears the full backing bitmap while preserving this transform.
 */
export function resizeCanvas(canvas: HTMLCanvasElement, options: CanvasResizeOptions = {}): CanvasResizeResult {
  const rect = canvas.getBoundingClientRect();
  const width = options.width ?? (rect.width || canvas.clientWidth || canvas.width);
  const height = options.height ?? (rect.height || canvas.clientHeight || canvas.height);
  const pixelRatio = options.pixelRatio ?? (typeof window !== 'undefined' ? Math.max(1, window.devicePixelRatio || 1) : 1);
  if (![width, height, pixelRatio].every(Number.isFinite) || width < 0 || height < 0 || pixelRatio <= 0) {
    throw new RangeError('Canvas dimensions must be finite and non-negative, and pixelRatio must be greater than zero.');
  }
  const context = canvas.getContext('2d');
  if (!context) throw new Error('A 2D rendering context is not available for this canvas.');
  const bitmapWidth = Math.round(width * pixelRatio);
  const bitmapHeight = Math.round(height * pixelRatio);
  if (canvas.width !== bitmapWidth) canvas.width = bitmapWidth;
  if (canvas.height !== bitmapHeight) canvas.height = bitmapHeight;
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  return { context, width, height, pixelRatio };
}
