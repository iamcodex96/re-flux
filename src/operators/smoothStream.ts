import { Observable, type OperatorFunction, type Subscription } from 'rxjs';
import type { SmoothedStreamSample, SmoothStreamOptions, TimestampedValue } from '../types.js';
import { frameCoordinator } from '../core/FrameCoordinator.js';

interface NormalizedOptions<T> {
  readonly targetLatency: number;
  readonly staleAfter: number;
  readonly maxBufferSize: number;
  readonly interpolate: SmoothStreamOptions<T>['interpolate'];
}

/**
 * Interpolates timestamped source values against the shared RAF clock.
 * Source timestamps must share the RAF/performance.now() time origin. Display latency intentionally
 * trades a small visual delay for smoother interpolation across irregular sample arrival.
 * Duplicate timestamps replace their sample; out-of-order samples are inserted only while they are not
 * behind the displayed time cursor. The operator never extrapolates.
 */
export function smoothStream<T>(
  options: SmoothStreamOptions<T>,
): OperatorFunction<TimestampedValue<T>, SmoothedStreamSample<T>> {
  const config = normalizeOptions(options);

  return (source) => new Observable<SmoothedStreamSample<T>>((subscriber) => {
    const buffer: TimestampedValue<T>[] = [];
    let sourceSubscription: Subscription | null = null;
    let frameSubscription: Subscription | null = null;
    let sourceCompleted = false;
    let lastDisplayedTime = Number.NEGATIVE_INFINITY;

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

    const insertSample = (sample: TimestampedValue<T>): void => {
      // Samples behind the rendered cursor can no longer affect output and must not rewind history.
      if (sample.timestamp < lastDisplayedTime) return;

      let low = 0;
      let high = buffer.length;
      while (low < high) {
        const middle = (low + high) >>> 1;
        const current = buffer[middle];
        if (current && current.timestamp < sample.timestamp) low = middle + 1;
        else high = middle;
      }

      const atIndex = buffer[low];
      if (atIndex?.timestamp === sample.timestamp) {
        buffer[low] = Object.freeze({ ...sample });
        return;
      }

      // Do not let late packets outside the retained window displace useful interpolation history.
      if (buffer.length >= config.maxBufferSize && low === 0) return;
      buffer.splice(low, 0, Object.freeze({ ...sample }));
      while (buffer.length > config.maxBufferSize) buffer.shift();
    };

    const sampleAt = (frameTimestamp: number): SmoothedStreamSample<T> | null => {
      if (buffer.length === 0) return null;

      const sampleTime = frameTimestamp - config.targetLatency;
      let rightIndex = 0;
      while (rightIndex < buffer.length && (buffer[rightIndex]?.timestamp ?? Infinity) < sampleTime) rightIndex += 1;

      let value: T;
      let sourceStartTimestamp: number;
      let sourceEndTimestamp: number;
      let interpolated = false;

      if (rightIndex === 0) {
        const first = buffer[0];
        if (!first) return null;
        value = first.value;
        sourceStartTimestamp = first.timestamp;
        sourceEndTimestamp = first.timestamp;
      } else if (rightIndex >= buffer.length) {
        const last = buffer[buffer.length - 1];
        if (!last) return null;
        value = last.value;
        sourceStartTimestamp = last.timestamp;
        sourceEndTimestamp = last.timestamp;
      } else {
        const left = buffer[rightIndex - 1];
        const right = buffer[rightIndex];
        if (!left || !right) return null;
        const span = right.timestamp - left.timestamp;
        const progress = span > 0 ? Math.min(1, Math.max(0, (sampleTime - left.timestamp) / span)) : 1;
        value = config.interpolate(left.value, right.value, progress);
        sourceStartTimestamp = left.timestamp;
        sourceEndTimestamp = right.timestamp;
        interpolated = span > 0 && sampleTime > left.timestamp && sampleTime < right.timestamp;
      }

      const latest = buffer[buffer.length - 1];
      return Object.freeze({
        value,
        timestamp: frameTimestamp,
        sampleTime,
        sourceStartTimestamp,
        sourceEndTimestamp,
        interpolated,
        stale: latest !== undefined && frameTimestamp - latest.timestamp > config.staleAfter,
      });
    };

    const ensureClock = (): void => {
      if (subscriber.closed || (frameSubscription && !frameSubscription.closed)) return;
      frameSubscription = frameCoordinator.frames$.subscribe({
        next: (frame) => {
          try {
            const sample = sampleAt(frame.timestamp);
            if (sample) {
              lastDisplayedTime = Math.max(lastDisplayedTime, sample.sampleTime);
              subscriber.next(sample);
            }

            const latest = buffer[buffer.length - 1];
            // Drain a finite source after the display cursor reaches its final input timestamp.
            if (sourceCompleted && (!latest || (sample !== null && sample.sampleTime >= latest.timestamp))) {
              complete();
              return;
            }

            while (buffer.length > 2 && (buffer[1]?.timestamp ?? Infinity) <= frame.timestamp - config.targetLatency) {
              buffer.shift();
            }
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
          fail(new RangeError('Stream sample timestamps must be finite numbers.'));
          return;
        }
        insertSample(sample);
        ensureClock();
      },
      error: fail,
      complete: () => {
        sourceCompleted = true;
        if (buffer.length === 0) {
          complete();
          return;
        }
        ensureClock();
      },
    });

    return () => {
      sourceSubscription?.unsubscribe();
      stopClock();
      buffer.length = 0;
    };
  });
}

function normalizeOptions<T>(options: SmoothStreamOptions<T>): NormalizedOptions<T> {
  const targetLatency = options.targetLatency ?? 100;
  const staleAfter = options.staleAfter ?? 1_000;
  const maxBufferSize = options.maxBufferSize ?? 120;

  if (!Number.isFinite(targetLatency) || targetLatency < 0) {
    throw new RangeError('smoothStream targetLatency must be a finite non-negative number.');
  }
  if (!Number.isFinite(staleAfter) || staleAfter < 0) {
    throw new RangeError('smoothStream staleAfter must be a finite non-negative number.');
  }
  if (!Number.isInteger(maxBufferSize) || maxBufferSize < 2) {
    throw new RangeError('smoothStream maxBufferSize must be an integer greater than or equal to 2.');
  }
  if (typeof options.interpolate !== 'function') {
    throw new TypeError('smoothStream requires an interpolate(from, to, progress) function.');
  }

  return { targetLatency, staleAfter, maxBufferSize, interpolate: options.interpolate };
}
