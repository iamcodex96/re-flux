import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { Animation } from '../dist/core/Animation.js';
import { frameCoordinator } from '../dist/core/FrameCoordinator.js';
import {
  median,
  nonNegativeInteger,
  parseIntegerList,
  positiveInteger,
  rotateOrder,
  round,
  summarizeRuns,
  summarizeSamples,
} from './benchmark-utils.mjs';

const frameIntervalMs = 1000 / 60;
const measuredFrameCount = positiveInteger(process.env.BENCH_ANIMATION_FRAMES, 180, 'BENCH_ANIMATION_FRAMES');
const animationCounts = parseIntegerList(process.env.BENCH_ANIMATION_COUNTS, '100,1000,5000', { minimum: 1, label: 'BENCH_ANIMATION_COUNTS' });
const repeats = positiveInteger(process.env.BENCH_REPEATS, 5, 'BENCH_REPEATS');
const warmupRounds = nonNegativeInteger(process.env.BENCH_WARMUP_ROUNDS, 2, 'BENCH_WARMUP_ROUNDS');
const warmupFrameCount = Math.min(measuredFrameCount, 60);
const callbackWorkIterations = process.env.BENCH_ANIMATION_CALLBACK_WORK === undefined
  ? null
  : nonNegativeInteger(process.env.BENCH_ANIMATION_CALLBACK_WORK, 0, 'BENCH_ANIMATION_CALLBACK_WORK');
const callbackWorkLevels = callbackWorkIterations === null
  ? parseIntegerList(process.env.BENCH_ANIMATION_WORKLOADS, '0,4', { minimum: 0, label: 'BENCH_ANIMATION_WORKLOADS' })
  : [callbackWorkIterations];
const metricsModes = [
  { id: 'metrics-disabled', observeMetrics: false },
  { id: 'metrics-observed', observeMetrics: true },
];
const results = [];
let nextRafId = 1;
const pendingRafCallbacks = new Map();
let workSink = 0;
const previousRafDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'requestAnimationFrame');
const previousCancelDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'cancelAnimationFrame');

Object.defineProperty(globalThis, 'requestAnimationFrame', {
  configurable: true,
  writable: true,
  value: (callback) => {
    const id = nextRafId++;
    pendingRafCallbacks.set(id, callback);
    return id;
  },
});
Object.defineProperty(globalThis, 'cancelAnimationFrame', {
  configurable: true,
  writable: true,
  value: (id) => pendingRafCallbacks.delete(id),
});

function advanceRaf(timestamp) {
  const currentCallbacks = [...pendingRafCallbacks.values()];
  pendingRafCallbacks.clear();
  for (const callback of currentCallbacks) callback(timestamp);
  return currentCallbacks.length;
}

function runScenario(animationCount, workIterations, observeMetrics, frameCount) {
  frameCoordinator.assertIdle();
  assert.equal(pendingRafCallbacks.size, 0, 'A scenario must start without queued RAF callbacks.');

  const before = frameCoordinator.metrics;
  const frameSamples = [];
  const metricWorkSamples = [];
  let metricNotificationCount = 0;
  let callbackCount = 0;
  let peakPendingRafCallbacks = 0;
  const metricsSubscription = observeMetrics
    ? frameCoordinator.metrics$.subscribe((sample) => {
      if (sample.totalFrames > before.totalFrames + 1) {
        metricNotificationCount += 1;
        metricWorkSamples.push(sample.lastFrameWorkMs);
      }
    })
    : null;
  const durationMs = frameCount * frameIntervalMs;
  const animations = Array.from({ length: animationCount }, () => new Animation({
    duration: durationMs,
    onUpdate: (progress, easedProgress) => {
      callbackCount += 1;
      let local = progress + easedProgress;
      for (let index = 0; index < workIterations; index += 1) local = Math.sin(local + index);
      workSink += local;
    },
  }));
  for (const animation of animations) animation.play();

  let primingRafCallbacks = 0;
  const startedAt = performance.now();
  peakPendingRafCallbacks = Math.max(peakPendingRafCallbacks, pendingRafCallbacks.size);
  primingRafCallbacks = advanceRaf(0);
  assert.equal(primingRafCallbacks, 1, 'Exactly one initial RAF should prime the shared coordinator.');

  for (let frame = 1; frame <= frameCount; frame += 1) {
    peakPendingRafCallbacks = Math.max(peakPendingRafCallbacks, pendingRafCallbacks.size);
    const frameStartedAt = performance.now();
    const callbacksRun = advanceRaf(frame * frameIntervalMs);
    frameSamples.push(performance.now() - frameStartedAt);
    assert(callbacksRun <= 1, `Expected the shared RAF source to schedule at most one callback, received ${callbacksRun}.`);
  }
  const elapsedMs = performance.now() - startedAt;
  const after = frameCoordinator.metrics;
  const diagnostics = frameCoordinator.getDiagnostics();
  metricsSubscription?.unsubscribe();

  assert.equal(peakPendingRafCallbacks, 1, `Expected one shared RAF callback for ${animationCount} animations.`);
  assert.equal(pendingRafCallbacks.size, 0, 'The completed animations must cancel the pending RAF callback.');
  assert.equal(diagnostics.isIdle, true, 'The shared coordinator must be idle after all animations complete.');
  assert.equal(diagnostics.activeFrameSubscribers, 0, 'All Animation frame subscriptions must be cleaned up.');
  if (observeMetrics) assert.equal(metricNotificationCount, frameCount, 'Exactly one metrics sample should be observed per measured frame.');
  assert(callbackCount >= animationCount * frameCount, 'Every animation should update on each measured frame.');

  return {
    animationCount,
    callbackWorkIterations: workIterations,
    instrumentation: observeMetrics ? 'metrics-observed' : 'metrics-disabled',
    elapsedMs: round(elapsedMs, 3),
    frameStats: summarizeSamples(frameSamples),
    internalFrameWorkStats: observeMetrics ? summarizeSamples(metricWorkSamples) : null,
    callbacks: callbackCount,
    primingRafFrames: primingRafCallbacks,
    measuredRafFrames: frameSamples.length,
    schedulerFramesIncludingPriming: after.totalFrames - before.totalFrames,
    metricNotifications: metricNotificationCount,
    peakPendingRafCallbacks,
    pendingRafCallbacksAfterCleanup: pendingRafCallbacks.size,
    diagnostics,
  };
}

function summarizeModeRuns(runs) {
  return {
    elapsedMs: summarizeRuns(runs, (run) => run.elapsedMs),
    medianOfRunMeanFrameMs: round(median(runs.map((run) => run.frameStats.meanMs))),
    medianOfRunP50FrameMs: round(median(runs.map((run) => run.frameStats.p50Ms))),
    medianOfRunP95FrameMs: round(median(runs.map((run) => run.frameStats.p95Ms))),
    medianOfRunP99FrameMs: round(median(runs.map((run) => run.frameStats.p99Ms))),
    worstFrameAcrossRunsMs: round(Math.max(...runs.map((run) => run.frameStats.maxMs))),
    medianInternalFrameWorkMs: round(median(runs.flatMap((run) => run.internalFrameWorkStats?.meanMs === undefined ? [] : [run.internalFrameWorkStats.meanMs])), 4),
    peakPendingRafCallbacks: Math.max(...runs.map((run) => run.peakPendingRafCallbacks)),
    pendingRafCallbacksAfterCleanup: Math.max(...runs.map((run) => run.pendingRafCallbacksAfterCleanup)),
  };
}

try {
  for (const workIterations of callbackWorkLevels) {
    for (const animationCount of animationCounts) {
      for (let warmup = 0; warmup < warmupRounds; warmup += 1) {
        for (const mode of rotateOrder(metricsModes, warmup)) {
          runScenario(animationCount, workIterations, mode.observeMetrics, warmupFrameCount);
        }
      }

      const modeRuns = Object.fromEntries(metricsModes.map(({ id }) => [id, []]));
      for (let repetition = 0; repetition < repeats; repetition += 1) {
        const executionOrder = rotateOrder(metricsModes, repetition);
        for (const mode of executionOrder) {
          const run = runScenario(animationCount, workIterations, mode.observeMetrics, measuredFrameCount);
          run.repetition = repetition + 1;
          run.executionOrder = executionOrder.map(({ id }) => id);
          modeRuns[mode.id].push(run);
        }
      }

      const disabled = summarizeModeRuns(modeRuns['metrics-disabled']);
      const observed = summarizeModeRuns(modeRuns['metrics-observed']);
      const elapsedDelta = observed.elapsedMs.medianMs - disabled.elapsedMs.medianMs;
      const p95Delta = observed.medianOfRunP95FrameMs - disabled.medianOfRunP95FrameMs;
      const pairedElapsedDeltasMs = modeRuns['metrics-disabled'].map((disabledRun) => {
        const observedRun = modeRuns['metrics-observed'].find((candidate) => candidate.repetition === disabledRun.repetition);
        return observedRun ? { repetition: disabledRun.repetition, deltaMs: round(observedRun.elapsedMs - disabledRun.elapsedMs, 3) } : null;
      }).filter(Boolean);
      results.push({
        animationCount,
        callbackWorkIterations: workIterations,
        modes: {
          'metrics-disabled': { summary: disabled, runs: modeRuns['metrics-disabled'].map(compactRun) },
          'metrics-observed': { summary: observed, runs: modeRuns['metrics-observed'].map(compactRun) },
        },
        comparison: {
          observedVsDisabledMedianElapsedDeltaMs: round(elapsedDelta, 3),
          observedVsDisabledMedianElapsedDeltaPercent: disabled.elapsedMs.medianMs > 0 ? round((elapsedDelta / disabled.elapsedMs.medianMs) * 100, 2) : null,
          pairedElapsedDeltasMs,
          medianPairedElapsedDeltaMs: round(median(pairedElapsedDeltasMs.map((entry) => entry.deltaMs)), 3),
          observedVsDisabledMedianP95DeltaMs: round(p95Delta, 4),
          interpretation: 'This paired difference estimates end-to-end observer overhead for this workload; it is not a universal intrinsic instrumentation cost.',
        },
      });
    }
  }

  console.log(JSON.stringify({
    benchmark: 're;Flux concurrent Animation load and metrics-observer overhead',
    runtime: { node: process.version, platform: process.platform, arch: process.arch },
    configuration: {
      frameIntervalMs: round(frameIntervalMs, 4),
      measuredFrameCount,
      primingFramesPerRun: 1,
      warmupRounds,
      warmupFrameCount,
      repeats,
      animationCounts,
      callbackWorkLevels,
      comparison: 'metrics instrumentation disabled vs observed; execution order alternates across repetitions',
    },
    note: 'Timings are descriptive, not pass/fail thresholds. Each run records an explicit priming frame plus the requested measured frame intervals. Compare repeated runs on the same machine and runtime.',
    results,
    workSink,
  }, null, 2));
} finally {
  pendingRafCallbacks.clear();
  if (previousRafDescriptor) Object.defineProperty(globalThis, 'requestAnimationFrame', previousRafDescriptor);
  else Reflect.deleteProperty(globalThis, 'requestAnimationFrame');
  if (previousCancelDescriptor) Object.defineProperty(globalThis, 'cancelAnimationFrame', previousCancelDescriptor);
  else Reflect.deleteProperty(globalThis, 'cancelAnimationFrame');
}

function compactRun(run) {
  return {
    repetition: run.repetition,
    executionOrder: run.executionOrder,
    elapsedMs: run.elapsedMs,
    meanFrameMs: run.frameStats.meanMs,
    p50FrameMs: run.frameStats.p50Ms,
    p95FrameMs: run.frameStats.p95Ms,
    p99FrameMs: run.frameStats.p99Ms,
    maxFrameMs: run.frameStats.maxMs,
    ...(run.internalFrameWorkStats ? { meanInternalFrameWorkMs: run.internalFrameWorkStats.meanMs } : {}),
    callbacks: run.callbacks,
    schedulerFramesIncludingPriming: run.schedulerFramesIncludingPriming,
    measuredRafFrames: run.measuredRafFrames,
    primingRafFrames: run.primingRafFrames,
    peakPendingRafCallbacks: run.peakPendingRafCallbacks,
    pendingRafCallbacksAfterCleanup: run.pendingRafCallbacksAfterCleanup,
  };
}
