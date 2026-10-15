import { Observable, type OperatorFunction, type Subscription } from 'rxjs';
import type { AdaptiveTweenOptions, AdaptiveTweenSample, TimestampedValue } from '../types/streams.js';
import { resolveEasing } from '../utils/easings.js';
import { frameCoordinator } from '../core/FrameCoordinator.js';

interface NormalizedAdaptiveOptions<T> {
  readonly minDuration: number;
  readonly maxDuration: number;
  readonly durationFactor: number;
  readonly cadenceSmoothing: number;
  readonly initialCadence: number;
  readonly staleAfter: number;
  readonly interpolate: AdaptiveTweenOptions<T>['interpolate'];
  readonly easing: (progress: number) => number;
}

/**
 * Tweens from the last rendered value to each newly received target. Its duration adapts to the
 * estimated interval between accepted source timestamps, while every sample is produced on the shared
 * RAF clock. Position remains continuous when retargeted mid-transition; this operator intentionally
 * does not predict future samples or preserve physical velocity (use retargetMotion for spring motion).
 */
export function adaptiveTween<T>(
  options: AdaptiveTweenOptions<T>,
): OperatorFunction<TimestampedValue<T>, AdaptiveTweenSample<T>> {
  const config = normalizeOptions(options);

  return (source) => new Observable<AdaptiveTweenSample<T>>((subscriber) => {
    let sourceSubscription: Subscription | null = null;
    let frameSubscription: Subscription | null = null;
    let sourceCompleted = false;
    let hasTarget = false;
    let hasTransition = false;
    let lastSourceTimestamp: number | null = null;
    let previousSourceTimestamp: number | null = null;
    let lastEmittedSourceTimestamp: number | null = null;
    let lastFrameTimestamp: number | null = null;
    let estimatedCadence = config.initialCadence;
    let targetDuration = clamp(estimatedCadence * config.durationFactor, config.minDuration, config.maxDuration);
    let segmentStart = 0;
    let transitionStartTimestamp = 0;
    let sourceStartTimestamp = 0;
    let sourceEndTimestamp = 0;
    let progress = 1;
    let currentValue!: T;
    let segmentFrom!: T;
    let targetValue!: T;

    const stopClock = (): void => {
      frameSubscription?.unsubscribe();
      frameSubscription = null;
    };

    const complete = (): void => {
      stopClock();
      if (!subscriber.closed) subscriber.complete();
    };

    const fail = (error: unknown): void => {
      stopClock();
      if (!subscriber.closed) subscriber.error(error);
    };

    const updateCurrentValue = (timestamp: number): void => {
      if (!hasTarget || !hasTransition) return;
      progress = targetDuration <= 0 ? 1 : clamp((timestamp - segmentStart) / targetDuration, 0, 1);
      if (progress >= 1) {
        currentValue = targetValue;
        progress = 1;
        hasTransition = false;
      } else {
        currentValue = config.interpolate(segmentFrom, targetValue, config.easing(progress));
      }
    };

    const sampleOutput = (timestamp: number): AdaptiveTweenSample<T> => Object.freeze({
      value: currentValue,
      timestamp,
      sourceStartTimestamp,
      sourceEndTimestamp,
      transitionStartTimestamp,
      progress,
      interpolated: hasTransition && progress < 1,
      stale: lastSourceTimestamp !== null && timestamp - lastSourceTimestamp > config.staleAfter,
      estimatedCadence,
      targetDuration,
    });

    const ensureClock = (): void => {
      if (subscriber.closed || (frameSubscription && !frameSubscription.closed)) return;
      frameSubscription = frameCoordinator.frames$.subscribe({
        next: (frame) => {
          try {
            lastFrameTimestamp = frame.timestamp;
            updateCurrentValue(frame.timestamp);
            const output = sampleOutput(frame.timestamp);
            subscriber.next(output);
            // Use the emitted snapshot: downstream may synchronously retarget the source from its next handler.
            lastEmittedSourceTimestamp = output.sourceEndTimestamp;
            if (sourceCompleted && progress >= 1 && lastEmittedSourceTimestamp === lastSourceTimestamp) complete();
          } catch (error: unknown) {
            fail(error);
          }
        },
        error: fail,
      });
    };

    sourceSubscription = source.subscribe({
      next: (sample) => {
        if (!Number.isFinite(sample.timestamp)) {
          fail(new RangeError('adaptiveTween source timestamps must be finite numbers.'));
          return;
        }
        // A duplicate or out-of-order source timestamp must not retarget the current motion backwards.
        if (lastSourceTimestamp !== null && sample.timestamp <= lastSourceTimestamp) return;

        try {
          const priorTimestamp = lastSourceTimestamp;
          if (priorTimestamp !== null) {
            const interval = sample.timestamp - priorTimestamp;
            // Treat initialCadence as the EMA prior and smooth the first measurement too.
            estimatedCadence += config.cadenceSmoothing * (interval - estimatedCadence);
          }
          previousSourceTimestamp = priorTimestamp;
          lastSourceTimestamp = sample.timestamp;

          targetDuration = clamp(estimatedCadence * config.durationFactor, config.minDuration, config.maxDuration);
          sourceStartTimestamp = previousSourceTimestamp ?? sample.timestamp;
          sourceEndTimestamp = sample.timestamp;

          if (!hasTarget) {
            // First value establishes a baseline; it does not animate from an arbitrary implicit zero.
            hasTarget = true;
            currentValue = sample.value;
            segmentFrom = sample.value;
            targetValue = sample.value;
            segmentStart = lastFrameTimestamp ?? sample.timestamp;
            transitionStartTimestamp = segmentStart;
            progress = 1;
          } else {
            if (lastFrameTimestamp !== null) updateCurrentValue(lastFrameTimestamp);
            segmentFrom = currentValue;
            targetValue = sample.value;
            segmentStart = lastFrameTimestamp ?? sample.timestamp;
            transitionStartTimestamp = segmentStart;
            progress = targetDuration <= 0 ? 1 : 0;
            hasTransition = progress < 1;
            if (progress >= 1) currentValue = targetValue;
          }

          if (progress >= 1 && targetDuration <= 0) currentValue = targetValue;
          ensureClock();
          if (sourceCompleted && progress >= 1) complete();
        } catch (error: unknown) {
          fail(error);
        }
      },
      error: fail,
      complete: () => {
        sourceCompleted = true;
        if (!hasTarget) {
          complete();
          return;
        }
        // A finite source may complete before the first RAF. Emit the baseline once before completing.
        if (progress >= 1 && lastFrameTimestamp !== null && lastEmittedSourceTimestamp === lastSourceTimestamp) {
          complete();
          return;
        }
        ensureClock();
      },
    });

    return () => {
      sourceSubscription?.unsubscribe();
      stopClock();
    };
  });
}

function normalizeOptions<T>(options: AdaptiveTweenOptions<T>): NormalizedAdaptiveOptions<T> {
  const minDuration = options.minDuration ?? 20;
  const maxDuration = options.maxDuration ?? 240;
  const durationFactor = options.durationFactor ?? 1.5;
  const cadenceSmoothing = options.cadenceSmoothing ?? 0.25;
  const initialCadence = options.initialCadence ?? 1000 / 30;
  const staleAfter = options.staleAfter ?? 1_000;

  validateNonNegativeFinite(minDuration, 'adaptiveTween minDuration');
  validateNonNegativeFinite(maxDuration, 'adaptiveTween maxDuration');
  validateNonNegativeFinite(durationFactor, 'adaptiveTween durationFactor');
  validateNonNegativeFinite(staleAfter, 'adaptiveTween staleAfter');
  if (maxDuration < minDuration) throw new RangeError('adaptiveTween maxDuration must be >= minDuration.');
  if (!Number.isFinite(cadenceSmoothing) || cadenceSmoothing <= 0 || cadenceSmoothing > 1) {
    throw new RangeError('adaptiveTween cadenceSmoothing must be in (0, 1].');
  }
  if (!Number.isFinite(initialCadence) || initialCadence <= 0) throw new RangeError('adaptiveTween initialCadence must be finite and > 0.');
  if (typeof options.interpolate !== 'function') throw new TypeError('adaptiveTween requires an interpolate(from, to, progress) function.');

  return {
    minDuration,
    maxDuration,
    durationFactor,
    cadenceSmoothing,
    initialCadence,
    staleAfter,
    interpolate: options.interpolate,
    easing: resolveEasing(options.easing),
  };
}

function validateNonNegativeFinite(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) throw new RangeError(`${label} must be a finite non-negative number.`);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
