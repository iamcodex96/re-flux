import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { FrameCoordinator } from '../dist/core/FrameCoordinator.js';
import { createAnimationFrameObservable } from '../dist/utils/animationFrame.js';
import {
  nonNegativeInteger,
  positiveInteger,
  median,
  rotateOrder,
  round,
  summarizeRuns,
  summarizeSamples,
} from './benchmark-utils.mjs';

const consumerCount = positiveInteger(process.env.BENCH_CONSUMERS, 1000, 'BENCH_CONSUMERS');
const frameCount = positiveInteger(process.env.BENCH_FRAMES, 180, 'BENCH_FRAMES');
const repeats = positiveInteger(process.env.BENCH_REPEATS, 5, 'BENCH_REPEATS');
const warmupRounds = nonNegativeInteger(process.env.BENCH_WARMUP_ROUNDS, 2, 'BENCH_WARMUP_ROUNDS');
const warmupFrameCount = Math.min(frameCount, 60);
const frameIntervalMs = 1000 / 60;
const originalRaf = Object.getOwnPropertyDescriptor(globalThis, 'requestAnimationFrame');
const originalCancel = Object.getOwnPropertyDescriptor(globalThis, 'cancelAnimationFrame');
let nextId = 1;
const callbacks = new Map();

Object.defineProperty(globalThis, 'requestAnimationFrame', {
  configurable: true,
  writable: true,
  value: (callback) => {
    const id = nextId++;
    callbacks.set(id, callback);
    return id;
  },
});
Object.defineProperty(globalThis, 'cancelAnimationFrame', {
  configurable: true,
  writable: true,
  value: (id) => callbacks.delete(id),
});

function advance(timestamp) {
  const current = [...callbacks.entries()];
  callbacks.clear();
  for (const [, callback] of current) callback(timestamp);
  return current.length;
}

function runShared(observeMetrics, framesToRun) {
  assert.equal(callbacks.size, 0, 'Every coordinator run must start with no pending RAF callbacks.');
  const coordinator = new FrameCoordinator();
  const subscriptions = [];
  const metricsSubscription = observeMetrics ? coordinator.metrics$.subscribe(() => undefined) : null;
  let callbackCount = 0;
  let peakRafCallbacks = 0;
  for (let index = 0; index < consumerCount; index += 1) {
    subscriptions.push(coordinator.frames$.subscribe(() => { callbackCount += 1; }));
  }

  const frameSamples = [];
  const startedAt = performance.now();
  for (let frame = 0; frame < framesToRun; frame += 1) {
    peakRafCallbacks = Math.max(peakRafCallbacks, callbacks.size);
    const frameStartedAt = performance.now();
    const callbackBatchSize = advance(frame * frameIntervalMs);
    frameSamples.push(performance.now() - frameStartedAt);
    assert(callbackBatchSize <= 1, `The shared coordinator scheduled ${callbackBatchSize} RAF callbacks in one frame.`);
  }
  const elapsedMs = performance.now() - startedAt;

  for (const subscription of subscriptions) subscription.unsubscribe();
  const diagnostics = coordinator.getDiagnostics();
  coordinator.assertIdle();
  metricsSubscription?.unsubscribe();
  assert.equal(callbacks.size, 0, 'The shared coordinator must leave no RAF callback after cleanup.');
  assert.equal(diagnostics.isIdle, true, 'The shared coordinator must return to idle after cleanup.');

  return {
    mode: observeMetrics ? 'shared-with-metrics' : 'shared-without-metrics',
    elapsedMs: round(elapsedMs, 3),
    frameStats: summarizeSamples(frameSamples),
    callbackCount,
    peakRafCallbacks,
    diagnostics,
    pendingRafCallbacksAfterCleanup: callbacks.size,
  };
}

function runIndependent(framesToRun) {
  assert.equal(callbacks.size, 0, 'Every independent run must start with no pending RAF callbacks.');
  const subscriptions = [];
  let callbackCount = 0;
  let peakRafCallbacks = 0;
  for (let index = 0; index < consumerCount; index += 1) {
    subscriptions.push(createAnimationFrameObservable().subscribe(() => { callbackCount += 1; }));
  }

  const frameSamples = [];
  const startedAt = performance.now();
  for (let frame = 0; frame < framesToRun; frame += 1) {
    peakRafCallbacks = Math.max(peakRafCallbacks, callbacks.size);
    const frameStartedAt = performance.now();
    const callbackBatchSize = advance(frame * frameIntervalMs);
    frameSamples.push(performance.now() - frameStartedAt);
    assert.equal(callbackBatchSize, consumerCount, 'Each independent observable should schedule one callback per consumer.');
  }
  const elapsedMs = performance.now() - startedAt;

  for (const subscription of subscriptions) subscription.unsubscribe();
  assert.equal(callbacks.size, 0, 'Independent observables must leave no RAF callback after cleanup.');

  return {
    mode: 'independent-raf-per-consumer',
    elapsedMs: round(elapsedMs, 3),
    frameStats: summarizeSamples(frameSamples),
    callbackCount,
    peakRafCallbacks,
    pendingRafCallbacksAfterCleanup: callbacks.size,
  };
}

const modes = [
  { id: 'shared-without-metrics', run: (frames) => runShared(false, frames) },
  { id: 'shared-with-metrics', run: (frames) => runShared(true, frames) },
  { id: 'independent-raf-per-consumer', run: (frames) => runIndependent(frames) },
];
const observations = Object.fromEntries(modes.map(({ id }) => [id, []]));

try {
  for (let warmup = 0; warmup < warmupRounds; warmup += 1) {
    for (const mode of rotateOrder(modes, warmup)) mode.run(warmupFrameCount);
  }

  for (let repetition = 0; repetition < repeats; repetition += 1) {
    const executionOrder = rotateOrder(modes, repetition);
    for (const mode of executionOrder) {
      observations[mode.id].push({ repetition: repetition + 1, result: mode.run(frameCount) });
    }
  }

  const results = modes.map(({ id }) => {
    const runs = observations[id];
    const rawRuns = runs.map(({ repetition, result }) => ({
      repetition,
      elapsedMs: result.elapsedMs,
      meanFrameMs: result.frameStats.meanMs,
      p50FrameMs: result.frameStats.p50Ms,
      p95FrameMs: result.frameStats.p95Ms,
      p99FrameMs: result.frameStats.p99Ms,
      maxFrameMs: result.frameStats.maxMs,
      callbackCount: result.callbackCount,
      peakRafCallbacks: result.peakRafCallbacks,
      pendingRafCallbacksAfterCleanup: result.pendingRafCallbacksAfterCleanup,
      diagnostics: result.diagnostics,
    }));
    return {
      mode: id,
      summary: {
        elapsedMs: summarizeRuns(runs, ({ result }) => result.elapsedMs),
        medianOfRunMeanFrameMs: round(summarizeRuns(runs, ({ result }) => result.frameStats.meanMs).medianMs),
        medianOfRunP95FrameMs: round(summarizeRuns(runs, ({ result }) => result.frameStats.p95Ms).medianMs),
        medianOfRunP99FrameMs: round(summarizeRuns(runs, ({ result }) => result.frameStats.p99Ms).medianMs),
        worstFrameAcrossRunsMs: round(Math.max(...runs.map(({ result }) => result.frameStats.maxMs)), 4),
        peakRafCallbacks: Math.max(...runs.map(({ result }) => result.peakRafCallbacks)),
        pendingRafCallbacksAfterCleanup: Math.max(...runs.map(({ result }) => result.pendingRafCallbacksAfterCleanup)),
      },
      runs: rawRuns,
    };
  });

  const byMode = Object.fromEntries(results.map((result) => [result.mode, result]));
  const sharedMedian = byMode['shared-without-metrics'].summary.elapsedMs.medianMs;
  const observedMedian = byMode['shared-with-metrics'].summary.elapsedMs.medianMs;
  const independentMedian = byMode['independent-raf-per-consumer'].summary.elapsedMs.medianMs;
  const pairedMetricsDeltas = observations['shared-with-metrics'].map(({ repetition, result }, index) => {
    const unobserved = observations['shared-without-metrics'].find((entry) => entry.repetition === repetition)?.result;
    return unobserved ? { repetition, deltaMs: round(result.elapsedMs - unobserved.elapsedMs, 4) } : null;
  }).filter(Boolean);

  console.log(JSON.stringify({
    benchmark: 're;Flux FrameCoordinator vs independent RAF observables',
    runtime: { node: process.version, platform: process.platform, arch: process.arch },
    configuration: { consumerCount, frameCount, frameIntervalMs: round(frameIntervalMs, 4), warmupRounds, warmupFrameCount, repeats },
    comparison: {
      sharedSpeedupVsIndependent: sharedMedian > 0 ? round(independentMedian / sharedMedian, 3) : null,
      observedVsUnobservedElapsedDeltaMs: round(observedMedian - sharedMedian, 4),
      observedVsUnobservedElapsedDeltaPercent: sharedMedian > 0 ? round(((observedMedian - sharedMedian) / sharedMedian) * 100, 2) : null,
      pairedElapsedDeltasMs: pairedMetricsDeltas,
      medianPairedElapsedDeltaMs: round(pairedMetricsDeltas.length ? median(pairedMetricsDeltas.map((entry) => entry.deltaMs)) : 0, 4),
      interpretation: 'Deltas include run-to-run variance and metrics-observer work; compare repeated results on the same machine.',
    },
    note: 'Timings are descriptive, not pass/fail thresholds. Setup and teardown are outside the timed frame loop.',
    results,
  }, null, 2));
} finally {
  callbacks.clear();
  if (originalRaf) Object.defineProperty(globalThis, 'requestAnimationFrame', originalRaf);
  else Reflect.deleteProperty(globalThis, 'requestAnimationFrame');
  if (originalCancel) Object.defineProperty(globalThis, 'cancelAnimationFrame', originalCancel);
  else Reflect.deleteProperty(globalThis, 'cancelAnimationFrame');
}
