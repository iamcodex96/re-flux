import type { EngineId, BenchmarkRendererId, ScenarioId, EngineModules, BrowserRunResult, FrameStats } from './types';
import { round, median, percentile } from './statistics';
import { createScene, createObjectScene } from './sceneFactory';
import { createRunner } from './runnerFactory';
import { delay, estimateMissedRefreshes, throwIfAborted } from './frameCalibration';

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
  host: HTMLElement | null;
  engineLabel: string;
  messages: {
    stageUnavailable: string;
    canvasUnavailable: string;
    noTargets: string;
  };
}

export async function measureRun({
  engine, renderer, scenario, targetCount, durationMs, repetition, modules, signal,
  frameIntervalReferenceMs, host, engineLabel, messages,
}: MeasureRunOptions): Promise<BrowserRunResult> {
  throwIfAborted(signal);
  if (!host) throw new Error(messages.stageUnavailable);
  const scene = renderer === 'none'
    ? createObjectScene(host, targetCount)
    : createScene(host, renderer, targetCount, messages.canvasUnavailable);
  const intervals: number[] = [];
  const longTaskDurations: number[] = [];
  const longAnimationFrameDurations: number[] = [];
  let longTaskSupported = false;
  let longAnimationFrameSupported = false;
  let longTaskObserver: PerformanceObserver | null = null;
  let longAnimationFrameObserver: PerformanceObserver | null = null;
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
    const startedAt = measuring && scenario === 'shared-renderer' ? performance.now() : 0;
    renderScene(progress);
    if (measuring && scenario === 'shared-renderer') {
      renderCallbacks += 1;
      rendererWorkSamples.push(performance.now() - startedAt);
    }
  };
  let startTime = Number.NaN;
  let endTime = Number.POSITIVE_INFINITY;
  let completionResolver: (() => void) | null = null;
  const completionPromise = new Promise<void>((resolve) => { completionResolver = resolve; });
  const runner = createRunner(engine, scene, durationMs, () => completionResolver?.(), modules, scenario, messages.noTargets);
  const supportedEntryTypes = typeof PerformanceObserver !== 'undefined'
    ? (PerformanceObserver.supportedEntryTypes ?? [])
    : [];

  if (supportedEntryTypes.includes('longtask')) {
    try {
      longTaskObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (Number.isFinite(startTime) && entry.startTime >= startTime && (endTime === Number.POSITIVE_INFINITY || entry.startTime <= endTime + 100)) longTaskDurations.push(entry.duration);
        }
      });
      longTaskObserver.observe({ type: 'longtask', buffered: false });
      longTaskSupported = true;
    } catch { longTaskObserver?.disconnect(); longTaskObserver = null; }
  }
  if (supportedEntryTypes.includes('long-animation-frame')) {
    try {
      longAnimationFrameObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (Number.isFinite(startTime) && entry.startTime >= startTime && (endTime === Number.POSITIVE_INFINITY || entry.startTime <= endTime + 100)) longAnimationFrameDurations.push(entry.duration);
        }
      });
      longAnimationFrameObserver.observe({ type: 'long-animation-frame', buffered: false } as PerformanceObserverInit);
      longAnimationFrameSupported = true;
    } catch { longAnimationFrameObserver?.disconnect(); longAnimationFrameObserver = null; }
  }

  let timeoutId = 0;
  let abortListener: (() => void) | null = null;
  const outcomePromise = new Promise<'completed' | 'timeout' | 'aborted'>((resolve) => {
    timeoutId = window.setTimeout(() => resolve('timeout'), durationMs + 5000);
    abortListener = () => resolve('aborted');
    signal.addEventListener('abort', abortListener, { once: true });
    void completionPromise.then(() => resolve('completed'));
  });

  const sampleFrame = (timestamp: number): void => {
    if (previousTimestamp !== null) intervals.push(timestamp - previousTimestamp);
    previousTimestamp = timestamp;
    if (measuring) rafId = window.requestAnimationFrame(sampleFrame);
  };

  try {
    startTime = performance.now();
    measuring = true;
    rafId = window.requestAnimationFrame(sampleFrame);
    runner.start();
    const outcome = await outcomePromise;
    endTime = performance.now();
    if (outcome === 'aborted') throw new DOMException('Benchmark canceled.', 'AbortError');
    if (outcome === 'timeout') throw new Error(`${engineLabel} did not complete within the expected time.`);
    // Capture one final scheduling opportunity so the last visual update is included in browser observations.
    await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
    measuring = false;
    window.cancelAnimationFrame(rafId);
    rafId = 0;
    await delay(60);
    const elapsedMs = endTime - startTime;
    const stats: FrameStats = {
      sampleCount: intervals.length,
      medianMs: median(intervals),
      p95Ms: percentile(intervals, 0.95),
      p99Ms: percentile(intervals, 0.99),
      maxMs: intervals.length ? round(Math.max(...intervals)) : null,
      stretchedFrameCount: intervals.filter((value) => value > frameIntervalReferenceMs * 1.5).length,
      estimatedMissedRefreshCount: intervals.reduce((total, value) => total + estimateMissedRefreshes(value, frameIntervalReferenceMs), 0),
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
    clearTimeout(timeoutId);
    if (abortListener) signal.removeEventListener('abort', abortListener);
    measuring = false;
    if (rafId) window.cancelAnimationFrame(rafId);
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
          window.clearTimeout(probeTimeoutId);
          if (probeRafId) window.cancelAnimationFrame(probeRafId);
          resolve();
        };
        probeTimeoutId = window.setTimeout(finishProbe, 50);
        if (document.visibilityState === 'visible') {
          probeRafId = window.requestAnimationFrame(finishProbe);
        }
      });
      if (resultForCleanup) resultForCleanup.cleanupPassed = scenario === 'shared-renderer'
        ? postCleanupRenderCallbacks === 0
        : null;
    } finally {
      longTaskObserver?.disconnect();
      longAnimationFrameObserver?.disconnect();
      scene.cleanup();
    }
  }
}
