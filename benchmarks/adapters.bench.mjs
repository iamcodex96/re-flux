import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { Subject } from 'rxjs';
import { bindStyle } from '../dist/adapters/dom.js';
import { bindSvgAttributes } from '../dist/adapters/svg.js';
import { bindCanvas } from '../dist/adapters/canvas.js';
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

const targetCounts = parseIntegerList(process.env.BENCH_ADAPTER_TARGETS, '100,1000', { minimum: 1, label: 'BENCH_ADAPTER_TARGETS' });
const frameCount = positiveInteger(process.env.BENCH_ADAPTER_FRAMES, 180, 'BENCH_ADAPTER_FRAMES');
const repeats = positiveInteger(process.env.BENCH_REPEATS, 5, 'BENCH_REPEATS');
const warmupRounds = nonNegativeInteger(process.env.BENCH_WARMUP_ROUNDS, 2, 'BENCH_WARMUP_ROUNDS');
const burstEmissions = positiveInteger(process.env.BENCH_CANVAS_BURST_EMISSIONS, 4, 'BENCH_CANVAS_BURST_EMISSIONS');
const warmupFrames = Math.min(frameCount, 60);
const frameIntervalMs = 1000 / 60;
const originalRaf = Object.getOwnPropertyDescriptor(globalThis, 'requestAnimationFrame');
const originalCancel = Object.getOwnPropertyDescriptor(globalThis, 'cancelAnimationFrame');
const rafCallbacks = new Map();
let nextRafId = 1;
let adapterSink = 0;

Object.defineProperty(globalThis, 'requestAnimationFrame', {
  configurable: true,
  writable: true,
  value: (callback) => {
    const id = nextRafId++;
    rafCallbacks.set(id, callback);
    return id;
  },
});
Object.defineProperty(globalThis, 'cancelAnimationFrame', {
  configurable: true,
  writable: true,
  value: (id) => rafCallbacks.delete(id),
});

function advanceRaf(timestamp) {
  const current = [...rafCallbacks.values()];
  rafCallbacks.clear();
  for (const callback of current) callback(timestamp);
  return current.length;
}

class MockStyleDeclaration {
  values = new Map();
  priorities = new Map();
  operations = 0;

  getPropertyValue(property) { return this.values.get(property) ?? ''; }
  getPropertyPriority(property) { return this.priorities.get(property) ?? ''; }
  setProperty(property, value, priority = '') {
    this.operations += 1;
    this.values.set(property, String(value));
    if (priority) this.priorities.set(property, priority);
    else this.priorities.delete(property);
  }
  removeProperty(property) {
    this.operations += 1;
    const previous = this.getPropertyValue(property);
    this.values.delete(property);
    this.priorities.delete(property);
    return previous;
  }
}

class MockSvgElement {
  attributes = new Map();
  operations = 0;

  hasAttribute(name) { return this.attributes.has(name); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  setAttribute(name, value) {
    this.operations += 1;
    this.attributes.set(name, String(value));
  }
  removeAttribute(name) {
    this.operations += 1;
    this.attributes.delete(name);
  }
}

class MockCanvasContext {
  canvas = { width: 640, height: 480 };
  operations = 0;
  drawCalls = 0;
  stackDepth = 0;

  save() { this.operations += 1; this.stackDepth += 1; }
  restore() { this.operations += 1; this.stackDepth -= 1; }
  setTransform() { this.operations += 1; }
  clearRect() { this.operations += 1; }
  fillRect(x, y, width, height) {
    this.operations += 1;
    this.drawCalls += 1;
    adapterSink += x + y + width + height;
  }
}

const adapterModes = [
  { id: 'dom-style-binding', kind: 'dom' },
  { id: 'svg-attribute-binding', kind: 'svg' },
  { id: 'canvas-one-emission', kind: 'canvas', emissionsPerFrame: 1 },
  { id: 'canvas-burst-coalesced', kind: 'canvas', emissionsPerFrame: burstEmissions },
];

function runStyleBinding(targetCount, framesToRun) {
  const source = new Subject();
  const targets = Array.from({ length: targetCount }, () => ({ style: new MockStyleDeclaration() }));
  const bindings = targets.map((target) => bindStyle(target, source));
  const frameSamples = [];
  let sourceEmissions = 0;
  for (let frame = 0; frame < framesToRun; frame += 1) {
    const startedAt = performance.now();
    source.next({
      transform: `translate3d(${frame}px, ${frame / 2}px, 0)`,
      opacity: String((frame % 60) / 59),
      '--re-flux-frame': String(frame),
    });
    sourceEmissions += 1;
    frameSamples.push(performance.now() - startedAt);
  }
  const operationsDuringMeasurement = targets.reduce((sum, target) => sum + target.style.operations, 0);
  for (const binding of bindings) binding.unsubscribe();
  source.complete();
  assert(targets.every((target) => target.style.values.size === 0), 'DOM style bindings must restore the mock targets after cleanup.');
  return {
    elapsedMs: round(frameSamples.reduce((sum, value) => sum + value, 0), 3),
    frameStats: summarizeSamples(frameSamples),
    sourceEmissions,
    adapterOperations: operationsDuringMeasurement,
    writesPerTargetPerFrame: operationsDuringMeasurement / targetCount / framesToRun,
    cleanupPassed: bindings.every((binding) => binding.closed) && targets.every((target) => target.style.values.size === 0),
  };
}

function runSvgBinding(targetCount, framesToRun) {
  const source = new Subject();
  const targets = Array.from({ length: targetCount }, () => new MockSvgElement());
  const bindings = targets.map((target) => bindSvgAttributes(target, source));
  const frameSamples = [];
  let sourceEmissions = 0;
  for (let frame = 0; frame < framesToRun; frame += 1) {
    const startedAt = performance.now();
    source.next({
      transform: `translate(${frame} ${frame / 2})`,
      opacity: (frame % 60) / 59,
      'data-frame': frame,
    });
    sourceEmissions += 1;
    frameSamples.push(performance.now() - startedAt);
  }
  const operationsDuringMeasurement = targets.reduce((sum, target) => sum + target.operations, 0);
  for (const binding of bindings) binding.unsubscribe();
  source.complete();
  assert(targets.every((target) => target.attributes.size === 0), 'SVG attribute bindings must restore the mock targets after cleanup.');
  return {
    elapsedMs: round(frameSamples.reduce((sum, value) => sum + value, 0), 3),
    frameStats: summarizeSamples(frameSamples),
    sourceEmissions,
    adapterOperations: operationsDuringMeasurement,
    writesPerTargetPerFrame: operationsDuringMeasurement / targetCount / framesToRun,
    cleanupPassed: bindings.every((binding) => binding.closed) && targets.every((target) => target.attributes.size === 0),
  };
}

function runCanvasBinding(targetCount, framesToRun, emissionsPerFrame) {
  frameCoordinator.assertIdle();
  assert.equal(rafCallbacks.size, 0, 'Canvas benchmark scenario must start with no pending RAF callbacks.');
  const source = new Subject();
  const contexts = Array.from({ length: targetCount }, () => new MockCanvasContext());
  const bindings = contexts.map((context) => bindCanvas(context, source, (targetContext, value, frame) => {
    const x = value.x + (frame.frame % 3);
    targetContext.fillRect(x, value.y, 4, 4);
    adapterSink += x + value.y;
  }));
  const frameSamples = [];
  let sourceEmissions = 0;
  let peakPendingRafCallbacks = 0;

  for (let frame = 0; frame < framesToRun; frame += 1) {
    const startedAt = performance.now();
    for (let emission = 0; emission < emissionsPerFrame; emission += 1) {
      source.next({ x: frame + emission, y: frame / 2 + emission });
      sourceEmissions += 1;
    }
    peakPendingRafCallbacks = Math.max(peakPendingRafCallbacks, rafCallbacks.size);
    const callbacksRun = advanceRaf((frame + 1) * frameIntervalMs);
    assert.equal(callbacksRun, 1, 'Canvas targets should share one coordinator RAF callback per frame.');
    frameSamples.push(performance.now() - startedAt);
    assert.equal(rafCallbacks.size, 0, 'The canvas coordinator should not retain a RAF callback after flushing writes.');
  }

  const drawCallsDuringMeasurement = contexts.reduce((sum, context) => sum + context.drawCalls, 0);
  const operationsDuringMeasurement = contexts.reduce((sum, context) => sum + context.operations, 0);
  for (const binding of bindings) binding.unsubscribe();
  source.complete();
  frameCoordinator.assertIdle();

  const expectedDrawCalls = targetCount * framesToRun;
  assert.equal(drawCallsDuringMeasurement, expectedDrawCalls, 'Canvas should draw once per target and frame, even when multiple values arrive before the frame.');
  assert(contexts.every((context) => context.stackDepth === 0), 'Mock Canvas save/restore calls must stay balanced.');
  assert.equal(rafCallbacks.size, 0, 'Canvas teardown must leave no pending RAF callbacks.');

  return {
    elapsedMs: round(frameSamples.reduce((sum, value) => sum + value, 0), 3),
    frameStats: summarizeSamples(frameSamples),
    sourceEmissions,
    emissionsPerFrame,
    drawCalls: drawCallsDuringMeasurement,
    expectedDrawCalls,
    adapterOperations: operationsDuringMeasurement,
    operationsPerTargetPerFrame: operationsDuringMeasurement / targetCount / framesToRun,
    peakPendingRafCallbacks,
    pendingRafCallbacksAfterCleanup: rafCallbacks.size,
    cleanupPassed: bindings.every((binding) => binding.closed) && frameCoordinator.getDiagnostics().isIdle,
  };
}

function runMode(mode, targetCount, framesToRun) {
  if (mode.kind === 'dom') return runStyleBinding(targetCount, framesToRun);
  if (mode.kind === 'svg') return runSvgBinding(targetCount, framesToRun);
  return runCanvasBinding(targetCount, framesToRun, mode.emissionsPerFrame);
}

function summariseMode(runs) {
  return {
    elapsedMs: summarizeRuns(runs, (run) => run.elapsedMs),
    medianOfRunMeanFrameMs: round(median(runs.map((run) => run.frameStats.meanMs))),
    medianOfRunP50FrameMs: round(median(runs.map((run) => run.frameStats.p50Ms))),
    medianOfRunP95FrameMs: round(median(runs.map((run) => run.frameStats.p95Ms))),
    medianOfRunP99FrameMs: round(median(runs.map((run) => run.frameStats.p99Ms))),
    worstFrameAcrossRunsMs: round(Math.max(...runs.map((run) => run.frameStats.maxMs))),
    cleanupPassed: runs.every((run) => run.cleanupPassed),
  };
}

const results = [];
try {
  for (const targetCount of targetCounts) {
    for (let warmup = 0; warmup < warmupRounds; warmup += 1) {
      for (const mode of rotateOrder(adapterModes, warmup)) runMode(mode, targetCount, warmupFrames);
    }

    const observations = Object.fromEntries(adapterModes.map(({ id }) => [id, []]));
    for (let repetition = 0; repetition < repeats; repetition += 1) {
      for (const mode of rotateOrder(adapterModes, repetition)) {
        const result = runMode(mode, targetCount, frameCount);
        observations[mode.id].push({ repetition: repetition + 1, result });
      }
    }

    results.push({
      targetCount,
      measuredFrames: frameCount,
      modes: adapterModes.map((mode) => ({
        mode: mode.id,
        emissionsPerFrame: mode.emissionsPerFrame ?? 1,
        summary: summariseMode(observations[mode.id].map(({ result }) => result)),
        runs: observations[mode.id].map(({ repetition, result }) => ({
          repetition,
          elapsedMs: result.elapsedMs,
          meanFrameMs: result.frameStats.meanMs,
          p50FrameMs: result.frameStats.p50Ms,
          p95FrameMs: result.frameStats.p95Ms,
          p99FrameMs: result.frameStats.p99Ms,
          maxFrameMs: result.frameStats.maxMs,
          sourceEmissions: result.sourceEmissions,
          adapterOperations: result.adapterOperations,
          ...(result.drawCalls === undefined ? {} : {
            drawCalls: result.drawCalls,
            expectedDrawCalls: result.expectedDrawCalls,
            peakPendingRafCallbacks: result.peakPendingRafCallbacks,
            pendingRafCallbacksAfterCleanup: result.pendingRafCallbacksAfterCleanup,
          }),
          cleanupPassed: result.cleanupPassed,
        })),
      })),
    });
  }

  console.log(JSON.stringify({
    benchmark: 're;Flux DOM-style, SVG-attribute and Canvas adapter update workloads',
    runtime: { node: process.version, platform: process.platform, arch: process.arch },
    configuration: { targetCounts, frameCount, frameIntervalMs: round(frameIntervalMs, 4), warmupRounds, warmupFrames, repeats, canvasBurstEmissions: burstEmissions },
    note: 'Targets are lightweight mocks. This measures RxJS binding, value conversion, task scheduling and callback dispatch; it does not measure browser layout, SVG paint or Canvas rasterization.',
    results,
    adapterSink,
  }, null, 2));
} finally {
  rafCallbacks.clear();
  if (originalRaf) Object.defineProperty(globalThis, 'requestAnimationFrame', originalRaf);
  else Reflect.deleteProperty(globalThis, 'requestAnimationFrame');
  if (originalCancel) Object.defineProperty(globalThis, 'cancelAnimationFrame', originalCancel);
  else Reflect.deleteProperty(globalThis, 'cancelAnimationFrame');
}
