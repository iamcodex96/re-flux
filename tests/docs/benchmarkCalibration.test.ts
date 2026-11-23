import { describe, expect, it } from '@jest/globals';
import { CALIBRATION_INTERVAL_COUNT, FALLBACK_FRAME_INTERVAL_MS } from '../../apps/docs/src/benchmarks/config';
import { awaitWithAbort, calibrateFrameInterval } from '../../apps/docs/src/benchmarks/measure';
import { FakeBenchmarkEnvironment } from '../helpers/benchmarkEnvironment';

/** Drive the calibration with the given frame intervals, one rendered frame per interval. */
async function calibrationFor(intervals: readonly number[]) {
  const env = new FakeBenchmarkEnvironment();
  const controller = new AbortController();
  const pending = calibrateFrameInterval(controller.signal, env);
  const first = intervals[0] ?? 16;
  env.tick(first);
  for (const interval of intervals) {
    env.tick(interval);
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  return { result: await Promise.race([pending, Promise.resolve(null)]), env, pending };
}

describe('Given the frame-interval calibration', () => {
  describe('When requestAnimationFrame runs at a steady cadence', () => {
    it('Then it samples CALIBRATION_INTERVAL_COUNT intervals and reports their median', async () => {
      const { pending } = await calibrationFor(Array.from({ length: CALIBRATION_INTERVAL_COUNT + 5 }, () => 8.3));

      expect(CALIBRATION_INTERVAL_COUNT).toBe(60);
      const calibration = await pending;
      expect(calibration.source).toBe('raf-calibration');
      expect(calibration.sampleCount).toBe(CALIBRATION_INTERVAL_COUNT);
      expect(calibration.intervalMs).toBeCloseTo(8.3, 5);
    });

    it('Then occasional missed callbacks do not move the median', async () => {
      const intervals = Array.from({ length: 70 }, (_, index) => (index % 10 === 0 ? 50 : 16.7));
      const { pending } = await calibrationFor(intervals);

      const calibration = await pending;
      expect(calibration.source).toBe('raf-calibration');
      expect(calibration.intervalMs).toBeCloseTo(16.7, 5);
      expect(calibration.sampleCount).toBeLessThan(CALIBRATION_INTERVAL_COUNT);
    });

    it('Then it stops asking for frames once it has enough samples', async () => {
      const { env, pending } = await calibrationFor(Array.from({ length: 70 }, () => 16.7));
      await pending;

      expect(env.pendingFrames).toBe(0);
    });
  });

  describe('When the cadence is not plausible', () => {
    it('Then it falls back to 60 Hz for intervals shorter than 4 ms', async () => {
      const { pending } = await calibrationFor(Array.from({ length: 70 }, () => 2));

      expect(await pending).toMatchObject({ source: '60hz-fallback', intervalMs: FALLBACK_FRAME_INTERVAL_MS });
    });

    it('Then it falls back to 60 Hz for intervals longer than 50 ms', async () => {
      const { pending } = await calibrationFor(Array.from({ length: 70 }, () => 80));

      expect(await pending).toMatchObject({ source: '60hz-fallback', intervalMs: FALLBACK_FRAME_INTERVAL_MS });
    });
  });

  describe('When the run is canceled', () => {
    it('Then the calibration rejects with an AbortError and cancels its pending frame', async () => {
      const env = new FakeBenchmarkEnvironment();
      const controller = new AbortController();
      const pending = calibrateFrameInterval(controller.signal, env);
      env.tick(16);
      controller.abort();

      await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
      expect(env.pendingFrames).toBe(0);
    });

    it('Then a signal that is already aborted rejects without scheduling any frame', async () => {
      const env = new FakeBenchmarkEnvironment();
      const controller = new AbortController();
      controller.abort();

      await expect(calibrateFrameInterval(controller.signal, env)).rejects.toMatchObject({ name: 'AbortError' });
      expect(env.pendingFrames).toBe(0);
    });
  });
});

describe('Given awaitWithAbort()', () => {
  it('Then it resolves with the promise value and removes its abort listener', async () => {
    const controller = new AbortController();

    await expect(awaitWithAbort(Promise.resolve(7), controller.signal)).resolves.toBe(7);
  });

  it('Then it passes a rejection through unchanged', async () => {
    const controller = new AbortController();

    await expect(awaitWithAbort(Promise.reject(new Error('boom')), controller.signal)).rejects.toThrow('boom');
  });

  it('Then it rejects with an AbortError when the signal aborts first', async () => {
    const controller = new AbortController();
    const never = new Promise<number>(() => undefined);
    const pending = awaitWithAbort(never, controller.signal);
    controller.abort();

    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  });
});
