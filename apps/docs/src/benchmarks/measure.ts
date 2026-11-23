import { CALIBRATION_INTERVAL_COUNT, FALLBACK_FRAME_INTERVAL_MS } from './config';
import type { BenchmarkEnvironment } from './environment';
import { createObjectScene, createScene } from './scenes';
import { createRunner } from './runners';
import { engineName, estimateMissedRefreshes, median, percentile, round } from './statistics';
import type {
  AnimationRunner,
  BenchmarkMessages,
  BenchmarkRendererId,
  BrowserRunResult,
  EngineId,
  EngineModules,
  FrameStats,
  RenderScene,
  RendererId,
  ScenarioId,
} from './types';

export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

export function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw new DOMException('Benchmark canceled.', 'AbortError');
}

/** Resolve with `promise`, or reject with an AbortError as soon as `signal` aborts. */
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

export interface FrameCalibration {
  intervalMs: number;
  sampleCount: number;
  source: 'raf-calibration' | '60hz-fallback';
}

/**
 * Estimate the active requestAnimationFrame interval from the median of consecutive callback timestamps. It reports the
 * callback cadence, not the physical display mode. Falls back to 60 Hz when samples are too few or implausible.
 */
export async function calibrateFrameInterval(signal: AbortSignal, env: BenchmarkEnvironment): Promise<FrameCalibration> {
  throwIfAborted(signal);
  const samples: number[] = [];
  let previousTimestamp: number | null = null;
  let rafId = 0;
  let abortHandler: (() => void) | null = null;
  const sampling = new Promise<void>((resolve, reject) => {
    const finish = () => {
      if (abortHandler) signal.removeEventListener('abort', abortHandler);
      if (rafId) env.cancelFrame(rafId);
      rafId = 0;
      resolve();
    };
    abortHandler = () => {
      if (rafId) env.cancelFrame(rafId);
      rafId = 0;
      signal.removeEventListener('abort', abortHandler!);
      reject(new DOMException('Benchmark canceled.', 'AbortError'));
    };
    signal.addEventListener('abort', abortHandler, { once: true });
    const sample = (timestamp: number) => {
      if (previousTimestamp !== null) samples.push(timestamp - previousTimestamp);
      previousTimestamp = timestamp;
      if (samples.length >= CALIBRATION_INTERVAL_COUNT) {
        finish();
        return;
      }
      rafId = env.requestFrame(sample);
    };
    rafId = env.requestFrame(sample);
  });
  await awaitWithAbort(sampling, signal);
  throwIfAborted(signal);

  const plausible = samples.filter((value) => Number.isFinite(value) && value > 0);
  const preliminaryMedian = median(plausible);
  if (preliminaryMedian === null || plausible.length < 20) {
    return { intervalMs: FALLBACK_FRAME_INTERVAL_MS, sampleCount: plausible.length, source: '60hz-fallback' };
  }
  // Drop cadence outliers caused by occasional missed callbacks; the median remains robust to a few outliers.
  const stableSamples = plausible.filter((value) => value >= preliminaryMedian * 0.5 && value <= preliminaryMedian * 1.5);
  const calibrated = median(stableSamples);
  if (calibrated === null || calibrated < 4 || calibrated > 50) {
    return { intervalMs: FALLBACK_FRAME_INTERVAL_MS, sampleCount: stableSamples.length, source: '60hz-fallback' };
  }
  return { intervalMs: calibrated, sampleCount: stableSamples.length, source: 'raf-calibration' };
}

/** The scene and runner factories `measureRun` uses; tests substitute fakes. */
export interface WorkloadFactories {
  createScene(host: HTMLElement, renderer: RendererId, targetCount: number, messages: BenchmarkMessages): RenderScene;
  createObjectScene(host: HTMLElement, targetCount: number): RenderScene;
  createRunner(
    engine: EngineId,
    scene: RenderScene,
    durationMs: number,
    onComplete: () => void,
    modules: EngineModules,
    scenario: ScenarioId,
    messages: BenchmarkMessages,
  ): AnimationRunner;
}

export const defaultWorkloadFactories: WorkloadFactories = { createScene, createObjectScene, createRunner };

export interface MeasureRunOptions {
  engine: EngineId;
  renderer: BenchmarkRendererId;
  scenario: ScenarioId;
  targetCount: number;
  durationMs: number;
  repetition: number;
  modules: EngineModules;
  signal: AbortSignal;
  frameIntervalReferenceMs: number;
  /** Element that hosts the scene; `null` when the page has no stage (reported as an error). */
  host: HTMLElement | null;
  messages: BenchmarkMessages;
  env: BenchmarkEnvironment;
  factories?: WorkloadFactories;
}

/**
 * One measured run of one engine: build the scene, start the engine, sample requestAnimationFrame intervals, renderer
 * callback cost and (where supported) long tasks until it completes, then clean up and probe for stale render callbacks.
 */
export async function measureRun(options: MeasureRunOptions): Promise<BrowserRunResult> {
  const { engine, renderer, scenario, targetCount, durationMs, repetition, modules, signal, env, messages } = options;
  const frameIntervalReferenceMs = options.frameIntervalReferenceMs;
  const factories = options.factories ?? defaultWorkloadFactories;
  throwIfAborted(signal);
  const host = options.host;
  if (!host) throw new Error(messages.theBenchmarkStageIsNotAvailable);
  const scene =
    renderer === 'none'
      ? factories.createObjectScene(host, targetCount)
      : factories.createScene(host, renderer, targetCount, messages);
  const intervals: number[] = [];
  const longTaskDurations: number[] = [];
  const longAnimationFrameDurations: number[] = [];
  let longTaskSupported = false;
  let longAnimationFrameSupported = false;
  let longTaskObserver: { disconnect(): void } | null = null;
  let longAnimationFrameObserver: { disconnect(): void } | null = null;
  let rafId = 0;
  let previousTimestamp: number | null = null;
  let renderCallbacks = 0;
  let measuring = false;
  const rendererWorkSamples: number[] = [];
  let runnerCleaned = false;
  let postCleanupRenderCallbacks = 0;
  let resultForCleanup: BrowserRunResult | null = null;
  const renderScene = scene.render.bind(scene);
  scene.render = (progress: number) => {
    if (runnerCleaned) postCleanupRenderCallbacks += 1;
    const startedAt = measuring && scenario === 'shared-renderer' ? env.now() : 0;
    renderScene(progress);
    if (measuring && scenario === 'shared-renderer') {
      renderCallbacks += 1;
      rendererWorkSamples.push(env.now() - startedAt);
    }
  };
  let startTime = Number.NaN;
  let endTime = Number.POSITIVE_INFINITY;
  let completionResolver: (() => void) | null = null;
  const completionPromise = new Promise<void>((resolve) => {
    completionResolver = resolve;
  });
  const runner = factories.createRunner(engine, scene, durationMs, () => completionResolver?.(), modules, scenario, messages);
  const supportedEntryTypes = env.supportedEntryTypes();
  const withinRun = (entry: { startTime: number }): boolean =>
    Number.isFinite(startTime) &&
    entry.startTime >= startTime &&
    (endTime === Number.POSITIVE_INFINITY || entry.startTime <= endTime + 100);

  if (supportedEntryTypes.includes('longtask')) {
    try {
      longTaskObserver = env.observeEntries('longtask', (entries) => {
        for (const entry of entries) if (withinRun(entry)) longTaskDurations.push(entry.duration);
      });
      longTaskSupported = true;
    } catch {
      longTaskObserver = null;
    }
  }
  if (supportedEntryTypes.includes('long-animation-frame')) {
    try {
      longAnimationFrameObserver = env.observeEntries('long-animation-frame', (entries) => {
        for (const entry of entries) if (withinRun(entry)) longAnimationFrameDurations.push(entry.duration);
      });
      longAnimationFrameSupported = true;
    } catch {
      longAnimationFrameObserver = null;
    }
  }

  let timeoutId = 0;
  let abortListener: (() => void) | null = null;
  const outcomePromise = new Promise<'completed' | 'timeout' | 'aborted'>((resolve) => {
    timeoutId = env.setTimer(() => resolve('timeout'), durationMs + 5000);
    abortListener = () => resolve('aborted');
    signal.addEventListener('abort', abortListener, { once: true });
    void completionPromise.then(() => resolve('completed'));
  });

  const sampleFrame = (timestamp: number): void => {
    if (previousTimestamp !== null) intervals.push(timestamp - previousTimestamp);
    previousTimestamp = timestamp;
    if (measuring) rafId = env.requestFrame(sampleFrame);
  };
  const nextTimer = (milliseconds: number): Promise<void> => new Promise((resolve) => env.setTimer(resolve, milliseconds));

  try {
    startTime = env.now();
    measuring = true;
    rafId = env.requestFrame(sampleFrame);
    runner.start();
    const outcome = await outcomePromise;
    endTime = env.now();
    if (outcome === 'aborted') throw new DOMException('Benchmark canceled.', 'AbortError');
    if (outcome === 'timeout') throw new Error(`${engineName(engine)} did not complete within the expected time.`);
    // Capture one final scheduling opportunity so the last visual update is included in browser observations.
    await new Promise<void>((resolve) => env.requestFrame(() => resolve()));
    measuring = false;
    env.cancelFrame(rafId);
    rafId = 0;
    await nextTimer(60);
    const elapsedMs = endTime - startTime;
    const stats: FrameStats = {
      sampleCount: intervals.length,
      medianMs: median(intervals),
      p95Ms: percentile(intervals, 0.95),
      p99Ms: percentile(intervals, 0.99),
      maxMs: intervals.length ? round(Math.max(...intervals)) : null,
      stretchedFrameCount: intervals.filter((value) => value > frameIntervalReferenceMs * 1.5).length,
      estimatedMissedRefreshCount: intervals.reduce(
        (total, value) => total + estimateMissedRefreshes(value, frameIntervalReferenceMs),
        0,
      ),
    };
    resultForCleanup = {
      engine,
      repetition,
      scenario,
      renderer,
      targetCount,
      configuredDurationMs: durationMs,
      completed: true,
      elapsedMs: round(elapsedMs),
      renderCallbacks,
      renderedTargetsPerCallback: scenario === 'shared-renderer' ? targetCount : 0,
      rendererWork: {
        medianMs: median(rendererWorkSamples),
        p95Ms: percentile(rendererWorkSamples, 0.95),
        p99Ms: percentile(rendererWorkSamples, 0.99),
        totalMs: scenario === 'shared-renderer' ? round(rendererWorkSamples.reduce((total, value) => total + value, 0)) : null,
      },
      frameIntervals: stats,
      longTaskCount: longTaskSupported ? longTaskDurations.length : null,
      longTaskDurationMs: longTaskSupported ? round(longTaskDurations.reduce((total, value) => total + value, 0)) : null,
      longAnimationFrameCount: longAnimationFrameSupported ? longAnimationFrameDurations.length : null,
      cleanupPassed: false,
    };
    return resultForCleanup;
  } finally {
    env.clearTimer(timeoutId);
    if (abortListener) signal.removeEventListener('abort', abortListener);
    measuring = false;
    if (rafId) env.cancelFrame(rafId);
    try {
      runner.cleanup();
      runnerCleaned = true;
      // Probe the next browser scheduling opportunity for stale render callbacks.
      await new Promise<void>((resolve) => {
        let probeRafId = 0;
        let probeTimeoutId = 0;
        let settled = false;
        const finishProbe = () => {
          if (settled) return;
          settled = true;
          env.clearTimer(probeTimeoutId);
          if (probeRafId) env.cancelFrame(probeRafId);
          resolve();
        };
        probeTimeoutId = env.setTimer(finishProbe, 50);
        if (env.isVisible()) {
          probeRafId = env.requestFrame(finishProbe);
        }
      });
      if (resultForCleanup) resultForCleanup.cleanupPassed = scenario === 'shared-renderer' ? postCleanupRenderCallbacks === 0 : null;
    } finally {
      longTaskObserver?.disconnect();
      longAnimationFrameObserver?.disconnect();
      scene.cleanup();
    }
  }
}
