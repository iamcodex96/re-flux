/** Shared helpers for reproducible, descriptive (non-gating) microbenchmarks. */
import { mkdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import { dirname, resolve } from 'node:path';
import { PerformanceObserver, constants as perfConstants, performance } from 'node:perf_hooks';
import v8 from 'node:v8';
import vm from 'node:vm';

/**
 * Resolve the optional report destination from `--out <file>` / `--out=<file>` or `BENCH_OUT`.
 * Returns `null` when the report should go to stdout.
 */
export function resolveOutPath(argv = process.argv.slice(2), env = process.env) {
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--out') {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) throw new RangeError('--out requires a file path.');
      return resolve(value);
    }
    if (argument.startsWith('--out=')) {
      const value = argument.slice('--out='.length);
      if (!value) throw new RangeError('--out requires a file path.');
      return resolve(value);
    }
  }
  const fromEnv = env.BENCH_OUT;
  return fromEnv ? resolve(fromEnv) : null;
}

/**
 * Emit one JSON report. With `--out`/`BENCH_OUT` the report is written to that file (no stdout noise,
 * so it parses without stripping npm banners); otherwise it is printed to stdout as before.
 */
export function emitReport(report, options = {}) {
  const json = JSON.stringify(report, null, 2);
  const out = resolveOutPath(options.argv, options.env);
  if (out === null) {
    console.log(json);
    return;
  }
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, `${json}\n`);
  process.stderr.write(`Wrote benchmark report to ${out}\n`);
}

export function positiveInteger(raw, fallback, label = 'value') {
  const value = raw === undefined ? fallback : Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`Expected ${label} to be a positive integer, received ${raw}.`);
  }
  return value;
}

export function nonNegativeInteger(raw, fallback, label = 'value') {
  const value = raw === undefined ? fallback : Number(raw);
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`Expected ${label} to be a non-negative integer, received ${raw}.`);
  }
  return value;
}

export function parseIntegerList(raw, fallback, { minimum = 1, label = 'values' } = {}) {
  const source = raw === undefined ? fallback : raw;
  const values = source.split(',').map((part) => {
    const value = Number(part.trim());
    if (!Number.isSafeInteger(value) || value < minimum) {
      throw new RangeError(`Expected ${label} to contain integers >= ${minimum}, received "${part}".`);
    }
    return value;
  });
  if (values.length === 0) throw new RangeError(`Expected at least one ${label} value.`);
  return [...new Set(values)].sort((left, right) => left - right);
}

export function round(value, digits = 4) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function median(values) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  const result =
    sorted.length % 2 === 0 ? ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2 : (sorted[middle] ?? 0);
  return result;
}

export function percentile(values, fraction) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(fraction * sorted.length) - 1));
  return sorted[index] ?? 0;
}

/** Summarize samples from one run (usually one measured frame per sample). */
export function summarizeSamples(values) {
  if (values.length === 0) {
    return { sampleCount: 0, meanMs: 0, p50Ms: 0, p95Ms: 0, p99Ms: 0, minMs: 0, maxMs: 0 };
  }
  const total = values.reduce((sum, value) => sum + value, 0);
  return {
    sampleCount: values.length,
    meanMs: round(total / values.length),
    p50Ms: round(percentile(values, 0.5)),
    p95Ms: round(percentile(values, 0.95)),
    p99Ms: round(percentile(values, 0.99)),
    minMs: round(Math.min(...values)),
    maxMs: round(Math.max(...values)),
  };
}

/** Sample standard deviation (n − 1); 0 for fewer than two values. */
export function standardDeviation(values) {
  if (values.length < 2) return 0;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  return Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1));
}

/**
 * Run-to-run variability of one metric: coefficient of variation (`cv`, stdev / mean, a ratio such as
 * 0.12 for 12%) and the min / median / max spread across runs.
 */
export function variability(values) {
  if (values.length === 0) return { cv: 0, stdev: 0, min: 0, median: 0, max: 0, maxOverMin: 1 };
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const stdev = standardDeviation(values);
  const min = Math.min(...values);
  const max = Math.max(...values);
  return {
    cv: mean === 0 ? 0 : round(stdev / Math.abs(mean), 4),
    stdev: round(stdev, 4),
    min: round(min, 4),
    median: round(median(values), 4),
    max: round(max, 4),
    maxOverMin: min > 0 ? round(max / min, 3) : null,
  };
}

/** Summarize per-run metrics without pooling unrelated frame samples. */
export function summarizeRuns(runs, selector) {
  const values = runs.map(selector);
  const spread = variability(values);
  return {
    runCount: values.length,
    meanMs: round(values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length)),
    medianMs: round(median(values)),
    minMs: round(Math.min(...values)),
    maxMs: round(Math.max(...values)),
    stdevMs: spread.stdev,
    cv: spread.cv,
    maxOverMin: spread.maxOverMin,
  };
}

/** Rotate execution order between repetitions to reduce systematic order bias. */
export function rotateOrder(items, repetition) {
  if (items.length <= 1) return [...items];
  const offset = repetition % items.length;
  return [...items.slice(offset), ...items.slice(0, offset)];
}

export function restoreGlobalDescriptor(name, descriptor) {
  if (descriptor) Object.defineProperty(globalThis, name, descriptor);
  else Reflect.deleteProperty(globalThis, name);
}

// ───────────────────────── GC observation and control ─────────────────────────

const GC_KIND_NAMES = new Map([
  [perfConstants.NODE_PERFORMANCE_GC_MINOR, 'scavenge'],
  [perfConstants.NODE_PERFORMANCE_GC_MAJOR, 'markCompact'],
  [perfConstants.NODE_PERFORMANCE_GC_INCREMENTAL, 'incremental'],
  [perfConstants.NODE_PERFORMANCE_GC_WEAKCB, 'weakCallbacks'],
]);

function resolveGc() {
  if (typeof globalThis.gc === 'function') return { collect: globalThis.gc, source: 'node --expose-gc' };
  if (process.env.BENCH_GC === '1') {
    v8.setFlagsFromString('--expose-gc');
    return { collect: vm.runInNewContext('gc'), source: 'BENCH_GC=1' };
  }
  return { collect: null, source: 'none' };
}

const gcHandle = resolveGc();

/**
 * Whether an explicit collection runs before every measured run. Enable it with `node --expose-gc …` or
 * `BENCH_GC=1`. It is opt-in because it changes what is measured (each run starts from a clean heap).
 */
export const gcControl = Object.freeze({ controlled: gcHandle.collect !== null, source: gcHandle.source });

let gcObserver = null;
const pendingGcEntries = [];

function ensureGcObserver() {
  if (gcObserver) return;
  gcObserver = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) pendingGcEntries.push(entry);
  });
  gcObserver.observe({ entryTypes: ['gc'] });
}

// Node delivers GC performance entries only after the event loop turns, so a synchronous benchmark loop must
// yield once before reading them.
function yieldToEventLoop() {
  return new Promise((resolve) => setImmediate(resolve));
}

function drainGcEntries() {
  ensureGcObserver();
  for (const entry of gcObserver.takeRecords()) pendingGcEntries.push(entry);
  return pendingGcEntries.splice(0).map((entry) => ({
    kind: GC_KIND_NAMES.get(entry.detail?.kind ?? entry.kind) ?? 'other',
    startTime: entry.startTime,
    duration: entry.duration,
  }));
}

function summarizeGcEntries(entries) {
  const byKind = {};
  let totalPauseMs = 0;
  let maxPauseMs = 0;
  for (const entry of entries) {
    byKind[entry.kind] = (byKind[entry.kind] ?? 0) + 1;
    totalPauseMs += entry.duration;
    maxPauseMs = Math.max(maxPauseMs, entry.duration);
  }
  return { count: entries.length, totalPauseMs: round(totalPauseMs, 4), maxPauseMs: round(maxPauseMs, 4), byKind };
}

/**
 * Which frames overlap a garbage collection? Compares the slowest 1% of frames (at least three) with all frames,
 * so a lift above 1 means slow frames coincide with GC more often than chance. Needs the frame start times and
 * durations recorded with `performance.now()`.
 */
function correlateFramesWithGc(frameStarts, frameDurations, gcEntries) {
  const frameCount = frameDurations.length;
  const overlaps = (index) => {
    const start = frameStarts[index];
    const end = start + frameDurations[index];
    return gcEntries.some((entry) => entry.startTime < end && entry.startTime + entry.duration > start);
  };
  const slowCount = Math.min(frameCount, Math.max(3, Math.ceil(frameCount * 0.01)));
  const slowest = frameDurations
    .map((duration, index) => ({ duration, index }))
    .sort((left, right) => right.duration - left.duration)
    .slice(0, slowCount);
  let allOverlapping = 0;
  for (let index = 0; index < frameCount; index += 1) if (overlaps(index)) allOverlapping += 1;
  const slowestOverlapping = slowest.filter(({ index }) => overlaps(index)).length;
  return {
    frameCount,
    framesOverlappingGc: allOverlapping,
    slowestFrameCount: slowCount,
    slowestFramesOverlappingGc: slowestOverlapping,
  };
}

/**
 * Run one measured repetition with GC observation (async: it yields to the event loop so Node can deliver GC entries). Before the run an explicit GC is requested when GC control is
 * enabled; afterwards the run object receives `gc` (count / pause / kinds), `heap` (used bytes before/after) and,
 * when the run exposes `frameStarts` and `frameSamples`, a `gcTail` correlation. Those two raw arrays are removed.
 */
export async function observeRun(runFn) {
  ensureGcObserver();
  gcHandle.collect?.();
  await yieldToEventLoop();
  drainGcEntries(); // discard the pre-run collection and anything left over from earlier work
  const heapBefore = process.memoryUsage().heapUsed;
  const run = runFn();
  await yieldToEventLoop();
  const entries = drainGcEntries();
  const heapAfter = process.memoryUsage().heapUsed;
  run.gc = summarizeGcEntries(entries);
  run.heap = { beforeBytes: heapBefore, afterBytes: heapAfter, deltaBytes: heapAfter - heapBefore };
  if (Array.isArray(run.frameStarts) && Array.isArray(run.frameSamples)) {
    run.gcTail = correlateFramesWithGc(run.frameStarts, run.frameSamples, entries);
  }
  delete run.frameStarts;
  delete run.frameSamples;
  return run;
}

/** Compact per-run GC fields to copy into the published `runs` arrays. */
export function gcRunFields(run) {
  return {
    gc: run.gc,
    heapDeltaBytes: run.heap?.deltaBytes ?? 0,
    ...(run.gcTail ? { gcTail: run.gcTail } : {}),
  };
}

/** Workload-level GC summary over runs produced by `observeRun`. */
export function summarizeGcRuns(runs) {
  const counts = runs.map((run) => run.gc?.count ?? 0);
  const pauses = runs.map((run) => run.gc?.totalPauseMs ?? 0);
  const heapDeltas = runs.map((run) => (run.heap?.deltaBytes ?? 0) / (1024 * 1024));
  const tail = runs.map((run) => run.gcTail).filter(Boolean);
  const sum = (key) => tail.reduce((total, entry) => total + entry[key], 0);
  const slowTotal = sum('slowestFrameCount');
  const frameTotal = sum('frameCount');
  const slowRate = slowTotal > 0 ? sum('slowestFramesOverlappingGc') / slowTotal : null;
  const allRate = frameTotal > 0 ? sum('framesOverlappingGc') / frameTotal : null;
  return {
    gcControlled: gcControl.controlled,
    gcMedianCount: median(counts),
    gcMedianPauseMs: round(median(pauses), 4),
    gcMaxPauseMs: round(Math.max(0, ...runs.map((run) => run.gc?.maxPauseMs ?? 0)), 4),
    heapMedianDeltaMb: round(median(heapDeltas), 3),
    ...(tail.length === 0
      ? {}
      : {
          tailCorrelation: {
            slowestFramesOverlappingGcRate: round(slowRate, 3),
            allFramesOverlappingGcRate: round(allRate, 3),
            lift: allRate > 0 ? round(slowRate / allRate, 2) : null,
            slowestFramesSampled: slowTotal,
            framesSampled: frameTotal,
          },
        }),
  };
}

/**
 * Label a paired difference against the run-to-run noise of the two workloads: the band is twice the larger
 * coefficient of variation (at least 5%). Differences inside the band are "within noise".
 */
export function classifyDelta(deltaPercent, leftCv, rightCv) {
  const bandPercent = Math.max(5, 2 * 100 * Math.max(leftCv ?? 0, rightCv ?? 0));
  if (deltaPercent === null || !Number.isFinite(deltaPercent))
    return { label: 'not comparable', noiseBandPercent: round(bandPercent, 2) };
  if (Math.abs(deltaPercent) <= bandPercent) return { label: 'within noise', noiseBandPercent: round(bandPercent, 2) };
  return { label: deltaPercent > 0 ? 'second slower' : 'second faster', noiseBandPercent: round(bandPercent, 2) };
}

/** A machine counts as busy when its 1-minute load average exceeds this fraction of its logical cores. */
export const BUSY_LOAD_PER_CORE = 0.5;

/**
 * Snapshot of machine load. Timings taken while other processes compete for the CPU (builds, other editor or agent
 * sessions, browsers) are not representative, so every report records the load it was measured under.
 */
export function systemLoad() {
  const cpuCount = os.cpus().length || 1;
  const loadAvg1m = os.loadavg()[0];
  return {
    cpuCount,
    loadAvg1m: round(loadAvg1m, 2),
    loadPerCore: round(loadAvg1m / cpuCount, 2),
    busy: loadAvg1m / cpuCount > BUSY_LOAD_PER_CORE,
  };
}

const loadAtStart = systemLoad();

/** Harness description recorded in every report so readers can see how the numbers were produced. */
export function harnessInfo(repeats) {
  return {
    repeats,
    gcControlled: gcControl.controlled,
    gcControlSource: gcControl.source,
    gcObserver: 'PerformanceObserver(gc)',
    system: { atStart: loadAtStart, atEnd: systemLoad(), busyThresholdLoadPerCore: BUSY_LOAD_PER_CORE },
    performanceTimer: typeof performance.now === 'function' ? 'performance.now' : 'unknown',
  };
}

// ───────────────────────── Micro-benchmark harness ─────────────────────────

/**
 * Turn any benchmark result (number, string, array, plain object) into a deterministic number so a loop can
 * accumulate a checksum. Consuming every result keeps the engine from eliminating the measured call as dead code.
 */
export function consume(value) {
  switch (typeof value) {
    case 'number':
      return Number.isFinite(value) ? value : 1;
    case 'string':
      return value.length * 31 + value.charCodeAt(value.length - 1) + value.charCodeAt(0);
    case 'boolean':
      return value ? 1 : 0;
    case 'object': {
      if (value === null) return 0;
      let total = 0;
      for (const entry of Array.isArray(value) ? value : Object.values(value)) total += consume(entry);
      return total;
    }
    default:
      return 0;
  }
}

/** Deterministic pseudo-random sequence (LCG) for scrub patterns; identical on every run and machine. */
export function createSequence(seed = 1) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

/**
 * Measure one micro-benchmark case.
 *
 * `op(index, context)` must return a number (use `consume()`); results are summed into a checksum that must be
 * identical on every repeat and non-zero, so a no-op or a non-deterministic implementation fails loudly.
 * `prepare()` runs before every warm-up and measured repetition, outside the timed region, and its return value is
 * passed to `op` (use it to build fresh state for stateful operations).
 *
 * Allocation is reported as young-generation collections per million operations (`scavengesPerMillionOps`), a
 * proxy that needs no heap snapshots: short-lived garbage fills the new space at a rate proportional to bytes
 * allocated per operation. It is only a relative measure; compare it between two runs of the same case.
 */
export async function measureMicro({
  name,
  group = '',
  iterations,
  repeats,
  warmupRounds,
  op,
  prepare = () => undefined,
  allowZeroChecksum = false,
}) {
  const warmupIterations = Math.min(iterations, 20_000);
  for (let warmup = 0; warmup < warmupRounds; warmup += 1) {
    const context = prepare();
    let sink = 0;
    for (let index = 0; index < warmupIterations; index += 1) sink += op(index, context);
    if (!Number.isFinite(sink)) throw new Error(`${name}: warm-up produced a non-finite checksum.`);
  }

  const runs = [];
  for (let repetition = 0; repetition < repeats; repetition += 1) {
    const context = prepare();
    const run = await observeRun(() => {
      let checksum = 0;
      const startedAt = performance.now();
      for (let index = 0; index < iterations; index += 1) checksum += op(index, context);
      const elapsedMs = performance.now() - startedAt;
      return { elapsedMs, checksum };
    });
    run.repetition = repetition + 1;
    runs.push(run);
  }

  const checksum = runs[0].checksum;
  if (!Number.isFinite(checksum)) throw new Error(`${name}: checksum is not finite.`);
  if (!allowZeroChecksum && checksum === 0)
    throw new Error(`${name}: checksum is zero; the measured operation appears to do nothing.`);
  for (const run of runs) {
    if (run.checksum !== checksum)
      throw new Error(
        `${name}: checksum changed between repeats (${run.checksum} vs ${checksum}); the operation is not deterministic.`,
      );
  }

  const opsPerMs = runs.map((run) => iterations / Math.max(1e-6, run.elapsedMs));
  const scavengesPerMillionOps = runs.map((run) => ((run.gc.byKind.scavenge ?? 0) / iterations) * 1e6);
  return {
    name,
    ...(group ? { group } : {}),
    iterations,
    checksum: round(checksum, 6),
    summary: {
      elapsedMs: summarizeRuns(runs, (run) => run.elapsedMs),
      medianOpsPerMs: round(median(opsPerMs), 2),
      opsPerMsVariability: variability(opsPerMs),
      scavengesPerMillionOps: round(median(scavengesPerMillionOps), 2),
      ...summarizeGcRuns(runs),
    },
    runs: runs.map((run) => ({
      repetition: run.repetition,
      elapsedMs: round(run.elapsedMs, 3),
      opsPerMs: round(iterations / Math.max(1e-6, run.elapsedMs), 2),
      ...gcRunFields(run),
    })),
  };
}

/** Run cases one after another (never in parallel). A case may set `scale` to multiply the default iteration count. */
export async function measureMicroCases(cases, defaults) {
  const results = [];
  for (const { scale = 1, ...entry } of cases) {
    results.push(
      await measureMicro({ ...defaults, iterations: Math.max(1, Math.round(defaults.iterations * scale)), ...entry }),
    );
  }
  return results;
}

/** Read the shared micro-benchmark settings from the environment, with per-benchmark default iteration counts. */
export function microSettings(defaultIterations) {
  return {
    iterations: positiveInteger(process.env.BENCH_MICRO_ITERATIONS, defaultIterations, 'BENCH_MICRO_ITERATIONS'),
    repeats: positiveInteger(process.env.BENCH_REPEATS, 10, 'BENCH_REPEATS'),
    warmupRounds: nonNegativeInteger(process.env.BENCH_WARMUP_ROUNDS, 2, 'BENCH_WARMUP_ROUNDS'),
  };
}

/** Force a collection even when GC control was not requested (retained-heap measurements are meaningless without it). */
export function forceGc() {
  if (gcHandle.collect) return gcHandle.collect;
  v8.setFlagsFromString('--expose-gc');
  return vm.runInNewContext('gc');
}
