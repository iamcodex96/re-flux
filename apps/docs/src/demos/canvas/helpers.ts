import type { CanvasDemoSize } from './types.js';

/** Validate phase and CSS-pixel dimensions shared by time-driven Canvas scenes. */
export function validateFrame(phase: number, size: CanvasDemoSize): void {
  if (!Number.isFinite(phase)) throw new RangeError('Canvas effect phase must be finite.');
  if (!Number.isFinite(size.width) || !Number.isFinite(size.height) || size.width < 0 || size.height < 0) {
    throw new RangeError('Canvas effect dimensions must be finite and non-negative.');
  }
}
