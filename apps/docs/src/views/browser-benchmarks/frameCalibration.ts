import { median } from './statistics';

export const fallbackFrameIntervalMs = 1000 / 60;
export const calibrationIntervalCount = 60;

export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

export function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw new DOMException('Benchmark canceled.', 'AbortError');
}

export function awaitWithAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  throwIfAborted(signal);
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      signal.removeEventListener('abort', onAbort);
      reject(new DOMException('Benchmark canceled.', 'AbortError'));
    };
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener('abort', onAbort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener('abort', onAbort);
        reject(error);
      },
    );
  });
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export async function calibrateFrameInterval(signal: AbortSignal): Promise<{ intervalMs: number; sampleCount: number; source: 'raf-calibration' | '60hz-fallback'; }> {
  throwIfAborted(signal);
  const samples: number[] = [];
  let previousTimestamp: number | null = null;
  let rafId = 0;
  let abortHandler: (() => void) | null = null;
  const sampling = new Promise<void>((resolve, reject) => {
    const finish = () => {
      if (abortHandler) signal.removeEventListener('abort', abortHandler);
      if (rafId) window.cancelAnimationFrame(rafId);
      rafId = 0;
      resolve();
    };
    abortHandler = () => {
      if (rafId) window.cancelAnimationFrame(rafId);
      rafId = 0;
      signal.removeEventListener('abort', abortHandler!);
      reject(new DOMException('Benchmark canceled.', 'AbortError'));
    };
    signal.addEventListener('abort', abortHandler, { once: true });
    const sample = (timestamp: number) => {
      if (previousTimestamp !== null) samples.push(timestamp - previousTimestamp);
      previousTimestamp = timestamp;
      if (samples.length >= calibrationIntervalCount) {
        finish();
        return;
      }
      rafId = window.requestAnimationFrame(sample);
    };
    rafId = window.requestAnimationFrame(sample);
  });
  await awaitWithAbort(sampling, signal);
  throwIfAborted(signal);

  const plausible = samples.filter((value) => Number.isFinite(value) && value > 0);
  const preliminaryMedian = median(plausible);
  if (preliminaryMedian === null || plausible.length < 20) {
    return { intervalMs: fallbackFrameIntervalMs, sampleCount: plausible.length, source: '60hz-fallback' };
  }
  // Drop cadence outliers caused by occasional missed callbacks; the median remains robust to a few outliers.
  const stableSamples = plausible.filter((value) => value >= preliminaryMedian * 0.5 && value <= preliminaryMedian * 1.5);
  const calibrated = median(stableSamples);
  if (calibrated === null || calibrated < 4 || calibrated > 50) {
    return { intervalMs: fallbackFrameIntervalMs, sampleCount: stableSamples.length, source: '60hz-fallback' };
  }
  return { intervalMs: calibrated, sampleCount: stableSamples.length, source: 'raf-calibration' };
}

export function estimateMissedRefreshes(intervalMs: number, referenceIntervalMs: number): number {
  if (!Number.isFinite(intervalMs) || !Number.isFinite(referenceIntervalMs) || referenceIntervalMs <= 0) return 0;
  return Math.max(0, Math.round(intervalMs / referenceIntervalMs) - 1);
}
