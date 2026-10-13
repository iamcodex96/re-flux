import { Observable, type OperatorFunction, type Subscription } from 'rxjs';
import type { MotionSample, RetargetMotionOperatorOptions } from '../types.js';
import { RetargetableMotion } from '../physics/RetargetableMotion.js';

/**
 * Turns a stream of numeric targets into one continuous spring-motion stream.
 * Each downstream subscription owns one motion instance; new targets preserve current value and velocity.
 * When the target source completes, output completes after the latest target settles.
 */
export function retargetMotion(
  options: RetargetMotionOperatorOptions = {},
): OperatorFunction<number, MotionSample> {
  return (source) => new Observable<MotionSample>((subscriber) => {
    const motion = new RetargetableMotion(options);
    let sourceSubscription: Subscription | null = null;
    let sampleSubscription: Subscription | null = null;
    let stateSubscription: Subscription | null = null;
    let sourceCompleted = false;
    let hasTarget = false;

    const completeIfSettled = (): void => {
      if (!sourceCompleted || subscriber.closed) return;
      if (!hasTarget || motion.state$.value === 'completed' || motion.state$.value === 'idle') {
        subscriber.complete();
      }
    };

    sampleSubscription = motion.sample$.subscribe({
      next: (sample) => subscriber.next(sample),
      error: (error: unknown) => subscriber.error(error),
    });
    stateSubscription = motion.state$.subscribe({
      next: () => completeIfSettled(),
      error: (error: unknown) => subscriber.error(error),
    });

    sourceSubscription = source.subscribe({
      next: (target) => {
        if (!Number.isFinite(target)) {
          subscriber.error(new RangeError('Retarget motion targets must be finite numbers.'));
          return;
        }
        hasTarget = true;
        try {
          motion.to(target);
        } catch (error: unknown) {
          subscriber.error(error);
        }
      },
      error: (error: unknown) => subscriber.error(error),
      complete: () => {
        sourceCompleted = true;
        completeIfSettled();
      },
    });

    return () => {
      sourceSubscription?.unsubscribe();
      stateSubscription?.unsubscribe();
      sampleSubscription?.unsubscribe();
      motion.dispose();
    };
  });
}
