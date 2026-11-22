import { spawnSync } from 'node:child_process';
import { BUSY_LOAD_PER_CORE, emitReport, gcControl, median, round, systemLoad } from './benchmark-utils.mjs';

const scripts = [
  { name: 'frameCoordinator', path: 'benchmarks/frame-coordinator.bench.mjs' },
  { name: 'timeline', path: 'benchmarks/timeline.bench.mjs' },
  { name: 'animationLoad', path: 'benchmarks/animation-load.bench.mjs' },
  { name: 'adapterUpdates', path: 'benchmarks/adapters.bench.mjs' },
  { name: 'interpolate', path: 'benchmarks/interpolate.bench.mjs' },
  { name: 'keyframes', path: 'benchmarks/keyframes.bench.mjs' },
  { name: 'cssInterpolation', path: 'benchmarks/css-interpolation.bench.mjs' },
  { name: 'pathMorph', path: 'benchmarks/path-morph.bench.mjs' },
  { name: 'timelineCompleted', path: 'benchmarks/timeline-completed.bench.mjs' },
  { name: 'memory', path: 'benchmarks/memory.bench.mjs' },
];
const reports = [];

const loadAtStart = systemLoad();
if (loadAtStart.busy) {
  process.stderr.write(`WARNING: this machine is busy (1-minute load average ${loadAtStart.loadAvg1m} on ${loadAtStart.cpuCount} logical cores, ${loadAtStart.loadPerCore} per core; the threshold is ${BUSY_LOAD_PER_CORE}). Timings measured now are not representative: close other builds, editors and agent sessions and re-run before drawing conclusions.\n`);
}

// Subreports must be captured from stdout, so the destination chosen for the aggregate report
// must not leak into the child processes.
const childEnv = { ...process.env };
delete childEnv.BENCH_OUT;

for (const script of scripts) {
  // `node --expose-gc benchmarks/run-all.bench.mjs` must reach the child processes; BENCH_GC=1 is inherited via env.
  const result = spawnSync(process.execPath, [...process.execArgv, script.path], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: childEnv,
    maxBuffer: 10 * 1024 * 1024,
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    if (result.stdout) process.stderr.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    throw new Error(`${script.path} exited with status ${result.status ?? 'unknown'}.`);
  }

  try {
    reports.push({ name: script.name, report: JSON.parse(result.stdout) });
  } catch (error) {
    throw new Error(`Expected ${script.path} to print one valid JSON report.`, { cause: error });
  }
}

/** Collect `cv` values recorded under the given key names anywhere in the reports. */
function collectCv(node, keys, found = []) {
  if (Array.isArray(node)) node.forEach((item) => collectCv(item, keys, found));
  else if (node && typeof node === 'object') {
    for (const [key, value] of Object.entries(node)) {
      if (keys.has(key) && value && typeof value === 'object' && Number.isFinite(value.cv)) found.push(value.cv);
      else if (key !== 'runs') collectCv(value, keys, found);
    }
  }
  return found;
}

// Noise bands are derived from the run-to-run variability measured in this very report: twice the median
// coefficient of variation, with a floor so a lucky quiet run cannot claim a tiny band.
const elapsedCvs = collectCv(reports, new Set(['elapsedMs', 'seekElapsedMs']));
const tailCvs = collectCv(reports, new Set(['p99FrameVariability', 'seekP99Variability']));
const noise = {
  method: 'Twice the median coefficient of variation (stdev / mean across repeated runs) of the workloads in this report; floors of 5% (elapsed/mean metrics) and 10% (p95/p99/worst-frame metrics).',
  thresholdPercent: Math.max(5, round(2 * 100 * median(elapsedCvs), 1)),
  tailThresholdPercent: Math.max(10, round(2 * 100 * median(tailCvs), 1)),
  medianElapsedCv: round(median(elapsedCvs), 4),
  medianTailCv: round(median(tailCvs), 4),
  workloadsMeasured: elapsedCvs.length,
};

emitReport({
  benchmark: 're;Flux benchmark suite',
  runtime: { node: process.version, platform: process.platform, arch: process.arch },
  harness: {
    gcControlled: gcControl.controlled,
    gcControlSource: gcControl.source,
    repeatsDefault: 10,
    system: { atStart: loadAtStart, atEnd: systemLoad(), busyThresholdLoadPerCore: BUSY_LOAD_PER_CORE },
  },
  noise,
  note: 'Subreports contain per-run timings, GC activity and summaries. Benchmarks are descriptive, not pass/fail thresholds.',
  reports,
});
