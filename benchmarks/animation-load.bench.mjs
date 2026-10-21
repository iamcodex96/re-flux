import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { Animation } from '../dist/core/Animation.js';
import { frameCoordinator } from '../dist/core/FrameCoordinator.js';

const frameIntervalMs = 1000 / 60;
const measuredFrameCount = positiveInteger(process.env.BENCH_ANIMATION_FRAMES, 180);
const animationCounts = parseCounts(process.env.BENCH_ANIMATION_COUNTS ?? '100,1000,5000');
const callbackWorkIterations = nonNegativeInteger(process.env.BENCH_ANIMATION_CALLBACK_WORK, 0);
const results = [];
let nextRafId = 1;
let pendingRafCallbacks = new Map();
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

function positiveInteger(raw, fallback) {
  const value = raw === undefined ? fallback : Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0) throw new RangeError(`Expected a positive integer, received ${raw}.`);
  return value;
}

function nonNegativeInteger(raw, fallback) {
  const value = raw === undefined ? fallback : Number(raw);
  if (!Number.isSafeInteger(value) || value < 0) throw new RangeError(`Expected a non-negative integer, received ${raw}.`);
  return value;
}

function parseCounts(raw) {
  const counts = raw.split(',').map((part) => positiveInteger(part.trim(), undefined));
  if (counts.length === 0) throw new RangeError('BENCH_ANIMATION_COUNTS must include at least one count.');
  return [...new Set(counts)].sort((left, right) => left - right);
}

function percentile(sortedValues, p) {
  if (sortedValues.length === 0) return 0;
  const index = Math.min(sortedValues.length - 1, Math.ceil(p * sortedValues.length) - 1);
  return sortedValues[index] ?? 0;
}

function summarize(samples) {
  const sorted = [...samples].sort((left, right) => left - right);
  const total = sorted.reduce((sum, sample) => sum + sample, 0);
  return {
    meanFrameMs: Number((total / Math.max(1, sorted.length)).toFixed(4)),
    p50FrameMs: Number(percentile(sorted, 0.50).toFixed(4)),
    p95FrameMs: Number(percentile(sorted, 0.95).toFixed(4)),
    p99FrameMs: Number(percentile(sorted, 0.99).toFixed(4)),
    maxFrameMs: Number((sorted.at(-1) ?? 0).toFixed(4)),
  };
}

function advanceRaf(timestamp) {
  const currentCallbacks = [...pendingRafCallbacks.values()];
  pendingRafCallbacks.clear();
  for (const callback of currentCallbacks) callback(timestamp);
  return currentCallbacks.length;
}

function runScenario(animationCount, observeMetrics) {
  frameCoordinator.assertIdle();
  assert.equal(pendingRafCallbacks.size, 0, 'A scenario must start without queued RAF callbacks.');

  const before = frameCoordinator.metrics;
  const frameSamples = [];
  const metricWorkSamples = [];
  let callbackCount = 0;
  let peakPendingRafCallbacks = 0;
  const metricsSubscription = observeMetrics
    ? frameCoordinator.metrics$.subscribe((sample) => {
      if (sample.totalFrames > before.totalFrames) metricWorkSamples.push(sample.lastFrameWorkMs);
    })
    : null;
  const durationMs = measuredFrameCount * frameIntervalMs;
  const animations = Array.from({ length: animationCount }, () => new Animation({
    duration: durationMs,
    onUpdate: (progress, easedProgress) => {
      callbackCount += 1;
      let local = progress + easedProgress;
      for (let index = 0; index < callbackWorkIterations; index += 1) local = Math.sin(local + index);
      workSink += local;
    },
  }));
  for (const animation of animations) animation.play();

  const startedAt = performance.now();
  for (let frame = 0; frame <= measuredFrameCount; frame += 1) {
    peakPendingRafCallbacks = Math.max(peakPendingRafCallbacks, pendingRafCallbacks.size);
    const frameStartedAt = performance.now();
    const callbacksRun = advanceRaf(frame * frameIntervalMs);
    const frameElapsedMs = performance.now() - frameStartedAt;
    if (frame > 0) frameSamples.push(frameElapsedMs);
    assert(callbacksRun <= 1, `Expected the shared RAF source to schedule at most one callback, received ${callbacksRun}.`);
  }
  const elapsedMs = performance.now() - startedAt;
  const after = frameCoordinator.metrics;
  const diagnostics = frameCoordinator.getDiagnostics();
  metricsSubscription?.unsubscribe();

  assert.equal(peakPendingRafCallbacks, 1, `Expected one shared RAF callback for ${animationCount} animations.`);
  assert.equal(pendingRafCallbacks.size, 0, 'The completed animations must cancel the pending RAF callback.');
  assert.equal(diagnostics.isIdle, true, 'The shared coordinator must be idle after all animations complete.');
  assert(callbackCount >= animationCount * measuredFrameCount, 'Every animation should update on each measured frame.');

  return {
    animationCount,
    instrumentation: observeMetrics ? 'metrics-observed' : 'metrics-disabled',
    callbackWorkIterations,
    completedWithinFrames: diagnostics.activeFrameSubscribers === 0,
    callbacks: callbackCount,
    schedulerFrames: after.totalFrames - before.totalFrames,
    peakPendingRafCallbacks,
    pendingRafCallbacksAfterCleanup: pendingRafCallbacks.size,
    elapsedMs: Number(elapsedMs.toFixed(3)),
    ...summarize(frameSamples),
    ...(observeMetrics ? {
      averageMeasuredFrameWorkMs: Number((metricWorkSamples.reduce((sum, sample) => sum + sample, 0) / Math.max(1, metricWorkSamples.length)).toFixed(4)),
      maxMeasuredFrameWorkMs: Number(Math.max(0, ...metricWorkSamples).toFixed(4)),
    } : {}),
  };
}

try {
  for (const count of animationCounts) {
    results.push(runScenario(count, false));
    results.push(runScenario(count, true));
  }

  console.log(JSON.stringify({
    benchmark: 're;Flux concurrent Animation load',
    runtime: { node: process.version, platform: process.platform, arch: process.arch },
    configuration: {
      frameIntervalMs: Number(frameIntervalMs.toFixed(4)),
      measuredFrameCount,
      animationCounts,
      callbackWorkIterations,
      comparison: 'metrics instrumentation disabled vs observed',
    },
    note: 'Results are measurements, not pass/fail thresholds. Compare runs on the same machine and runtime.',
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
