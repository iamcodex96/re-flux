import type { EasingOption } from '../types.js';
import { resolveEasing } from './easings.js';

export type StaggerOrigin = 'first' | 'last' | 'center' | number;

export interface StaggerOptions {
  /** Target index from which the delay radiates. Defaults to the first target. */
  readonly from?: StaggerOrigin;
  /** Base delay added to every target, in milliseconds. Defaults to zero. */
  readonly start?: number;
  /** Optional easing used to distribute delays between the origin and the farthest target. */
  readonly easing?: EasingOption;
}

/** Signature accepted by animate() and generic staggered compositions. */
export type StaggerDelayFunction = (index: number, target: unknown, total: number) => number;

/**
 * Creates a reusable delay resolver for target arrays.
 * `each` is the base delay scale for the farthest target; easing redistributes the delay range.
 * `from: 'center'` makes the center start first and radiates outward.
 */
export function stagger(each: number, options: StaggerOptions = {}): StaggerDelayFunction {
  if (!Number.isFinite(each) || each < 0) {
    throw new RangeError('stagger() each must be a finite, non-negative number.');
  }
  const start = options.start ?? 0;
  if (!Number.isFinite(start)) {
    throw new RangeError('stagger() start must be a finite number.');
  }
  const origin = options.from ?? 'first';
  if (typeof origin === 'number' && !Number.isFinite(origin)) {
    throw new RangeError('stagger() from index must be finite.');
  }
  const easing = resolveEasing(options.easing);

  return (index, _target, total) => {
    if (!Number.isInteger(total) || total < 1) {
      throw new RangeError('stagger() total must be a positive integer.');
    }
    if (!Number.isInteger(index) || index < 0 || index >= total) {
      throw new RangeError(`stagger() index must be an integer between 0 and ${total - 1}.`);
    }

    let originIndex: number;
    if (origin === 'first') originIndex = 0;
    else if (origin === 'last') originIndex = total - 1;
    else if (origin === 'center') originIndex = (total - 1) / 2;
    else {
      if (origin < 0 || origin > total - 1) {
        throw new RangeError(`stagger() from index must be between 0 and ${total - 1}.`);
      }
      originIndex = origin;
    }

    const farthestDistance = Math.max(originIndex, total - 1 - originIndex);
    if (farthestDistance === 0 || each === 0) return start;

    const distance = Math.abs(index - originIndex);
    const normalizedDistance = distance / farthestDistance;
    // Easing functions such as elastic can overshoot; delay distribution is always bounded.
    const easedDistance = Math.max(0, Math.min(1, easing(normalizedDistance)));
    return start + easedDistance * each * farthestDistance;
  };
}
