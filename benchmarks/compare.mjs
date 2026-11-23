#!/usr/bin/env node
/**
 * Compare two benchmark reports written by `npm run bench:save` / `npm run bench -- --out <file>`.
 *
 *   node benchmarks/compare.mjs <baseline.json> <candidate.json> [--noise <percent>] [--allow-runtime-mismatch]
 *
 * The comparison is descriptive: it never fails because a timing got worse. It exits with status 2 only
 * when the two reports were produced by different runtimes (Node version, platform or architecture),
 * because such numbers are not comparable, unless `--allow-runtime-mismatch` is given.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Metric name → true when a higher value is better.
const METRICS = new Map([
  ['medianOfRunMeanFrameMs', false],
  ['medianOfRunP50FrameMs', false],
  ['medianOfRunP95FrameMs', false],
  ['medianOfRunP99FrameMs', false],
  ['worstFrameAcrossRunsMs', false],
  ['medianMeanSeekMs', false],
  ['medianP95SeekMs', false],
  ['medianP99SeekMs', false],
  ['worstSeekAcrossRunsMs', false],
  ['medianReadsPerMs', true],
  ['medianOpsPerMs', true],
  ['scavengesPerMillionOps', false],
  ['medianBytesPerInstance', false],
  ['gcMedianCount', false],
  ['gcMedianPauseMs', false],
  ['gcMaxPauseMs', false],
  ['heapMedianDeltaMb', false],
  ['sharedSpeedupVsIndependent', true],
]);
// `medianMs` is only meaningful under an elapsed-time summary.
const ELAPSED_PARENT = /elapsedMs$/i;
const SKIPPED_KEYS = new Set(['runs', 'pairedElapsedDeltasMs', 'runtime', 'configuration', 'diagnostics', 'noise']);
const GENERIC_KEYS = new Set(['summary', 'modes', 'results', 'reports', 'report']);
const DEFAULT_NOISE_PERCENT = 10;

/** Tail metrics (p95/p99/worst frame, GC pauses) are inherently noisier than means and get a higher floor. */
const isTailMetric = (metric) => /P95|P99|worst|gcMaxPause/i.test(metric);
const BAND_FLOOR_PERCENT = 5;
const TAIL_BAND_FLOOR_PERCENT = 10;

export function parseArguments(argv) {
  const files = [];
  const options = { noisePercent: null, allowRuntimeMismatch: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--allow-runtime-mismatch') options.allowRuntimeMismatch = true;
    else if (argument === '--noise') {
      const value = Number(argv[index + 1]);
      if (!Number.isFinite(value) || value < 0)
        throw new RangeError('--noise requires a non-negative number of percent.');
      options.noisePercent = value;
      index += 1;
    } else if (argument.startsWith('--')) throw new RangeError(`Unknown option ${argument}.`);
    else files.push(argument);
  }
  if (files.length !== 2)
    throw new RangeError(
      'Usage: compare.mjs <baseline.json> <candidate.json> [--noise <percent>] [--allow-runtime-mismatch]',
    );
  return { baselinePath: files[0], candidatePath: files[1], ...options };
}

function labelFor(item, index) {
  if (item === null || typeof item !== 'object') return `#${index}`;
  const parts = [];
  if (item.name !== undefined) parts.push(String(item.name));
  if (item.animationCount !== undefined) parts.push(`animations=${item.animationCount}`);
  if (item.targetCount !== undefined) parts.push(`targets=${item.targetCount}`);
  if (item.callbackWorkIterations !== undefined) parts.push(`work=${item.callbackWorkIterations}`);
  if (item.mode !== undefined) parts.push(String(item.mode));
  return parts.length > 0 ? parts.join(' ') : `#${index}`;
}

/** Flatten a benchmark report into `workload path → { metric: value }` rows. */
export function extractMetrics(report) {
  const rows = new Map();
  const add = (trail, metric, value, cv) => {
    const key = `${trail.join(' › ')}\u0000${metric}`;
    rows.set(key, { workload: trail.join(' › '), metric, value, cv });
  };
  const walk = (node, trail, parentKey) => {
    if (Array.isArray(node)) {
      node.forEach((item, index) => walk(item, [...trail, labelFor(item, index)], parentKey));
      return;
    }
    if (node === null || typeof node !== 'object') return;
    // Run-to-run variability recorded next to the metrics (BENCH-007): used to size each row's own noise band.
    const elapsedCv = node.elapsedMs?.cv ?? node.seekElapsedMs?.cv;
    const tailCv = (node.p99FrameVariability ?? node.seekP99Variability)?.cv ?? elapsedCv;
    const opsCv = node.opsPerMsVariability?.cv ?? elapsedCv;
    const cvFor = (metric) => (metric === 'medianOpsPerMs' ? opsCv : isTailMetric(metric) ? tailCv : elapsedCv);
    for (const [key, value] of Object.entries(node)) {
      if (SKIPPED_KEYS.has(key)) continue;
      if (typeof value === 'number' && Number.isFinite(value)) {
        if (METRICS.has(key)) add(trail, key, value, cvFor(key));
        else if (key === 'medianMs' && ELAPSED_PARENT.test(parentKey ?? ''))
          add(trail, 'elapsedMedianMs', value, node.cv);
      } else if (value !== null && typeof value === 'object') {
        walk(value, GENERIC_KEYS.has(key) || Array.isArray(value) ? trail : [...trail, key], key);
      }
    }
  };
  walk(report, [], undefined);
  return rows;
}

function isHigherBetter(metric) {
  return METRICS.get(metric) === true;
}

function runtimeOf(report) {
  const runtime = report?.runtime ?? report?.reports?.[0]?.report?.runtime;
  return runtime ? `${runtime.node} ${runtime.platform}/${runtime.arch}` : null;
}

function format(value) {
  if (!Number.isFinite(value)) return 'n/a';
  return Math.abs(value) >= 100 ? value.toFixed(1) : value.toFixed(4);
}

/**
 * Noise band for one row: twice the larger run-to-run coefficient of variation recorded for that workload in either
 * report (floors of 5% for means and 10% for tail metrics). Rows without recorded variability fall back to the
 * report-wide band (or the default).
 */
function bandFor(metric, left, right, fallbackPercent, fallbackTailPercent) {
  const floor = isTailMetric(metric) ? TAIL_BAND_FLOOR_PERCENT : BAND_FLOOR_PERCENT;
  if (left.cv === undefined && right.cv === undefined)
    return isTailMetric(metric) ? fallbackTailPercent : fallbackPercent;
  return Math.max(floor, 2 * 100 * Math.max(left.cv ?? 0, right.cv ?? 0));
}

export function compareReports(
  baseline,
  candidate,
  noisePercent = DEFAULT_NOISE_PERCENT,
  tailNoisePercent = noisePercent,
) {
  const left = extractMetrics(baseline);
  const right = extractMetrics(candidate);
  const rows = [];
  for (const [key, base] of left) {
    const next = right.get(key);
    if (!next) {
      rows.push({
        ...base,
        baseline: base.value,
        candidate: null,
        deltaPercent: null,
        bandPercent: null,
        verdict: 'only in baseline',
      });
      continue;
    }
    const deltaPercent =
      base.value === 0 ? (next.value === 0 ? 0 : Infinity) : ((next.value - base.value) / Math.abs(base.value)) * 100;
    const worse = isHigherBetter(base.metric) ? deltaPercent < 0 : deltaPercent > 0;
    const bandPercent = bandFor(base.metric, base, next, noisePercent, tailNoisePercent);
    const verdict = Math.abs(deltaPercent) <= bandPercent ? 'within noise' : worse ? 'slower/worse' : 'faster/better';
    rows.push({
      workload: base.workload,
      metric: base.metric,
      baseline: base.value,
      candidate: next.value,
      deltaPercent,
      bandPercent,
      verdict,
    });
  }
  for (const [key, next] of right) {
    if (!left.has(key))
      rows.push({
        workload: next.workload,
        metric: next.metric,
        baseline: null,
        candidate: next.value,
        deltaPercent: null,
        bandPercent: null,
        verdict: 'only in candidate',
      });
  }
  return rows;
}

function renderTable(rows) {
  const header = ['workload', 'metric', 'baseline', 'candidate', 'change', 'band', 'verdict'];
  const body = rows.map((row) => [
    row.workload || '(root)',
    row.metric,
    row.baseline === null ? '—' : format(row.baseline),
    row.candidate === null ? '—' : format(row.candidate),
    row.deltaPercent === null
      ? '—'
      : `${row.deltaPercent >= 0 ? '+' : ''}${Number.isFinite(row.deltaPercent) ? row.deltaPercent.toFixed(2) : '∞'}%`,
    row.bandPercent === null ? '—' : `±${row.bandPercent.toFixed(1)}%`,
    row.verdict,
  ]);
  const widths = header.map((title, column) => Math.max(title.length, ...body.map((line) => line[column].length)));
  const line = (cells) => cells.map((cell, column) => cell.padEnd(widths[column])).join('  ');
  return [line(header), line(widths.map((width) => '-'.repeat(width))), ...body.map(line)].join('\n');
}

function main() {
  let args;
  try {
    args = parseArguments(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exit(64);
  }
  const baseline = JSON.parse(readFileSync(args.baselinePath, 'utf8'));
  const candidate = JSON.parse(readFileSync(args.candidatePath, 'utf8'));

  const baselineRuntime = runtimeOf(baseline);
  const candidateRuntime = runtimeOf(candidate);
  const mismatch = baselineRuntime !== candidateRuntime;
  if (mismatch) {
    process.stderr.write(
      `WARNING: runtimes differ — baseline ${baselineRuntime ?? 'unknown'} vs candidate ${candidateRuntime ?? 'unknown'}. These numbers are not comparable.\n`,
    );
    if (!args.allowRuntimeMismatch) {
      process.stderr.write(
        'Refusing to compare (exit 2). Re-run on the baseline machine/Node version or pass --allow-runtime-mismatch.\n',
      );
      process.exit(2);
    }
  }

  for (const [label, report] of [
    ['baseline', baseline],
    ['candidate', candidate],
  ]) {
    const system = report.harness?.system;
    if (system === undefined) {
      process.stderr.write(
        `NOTE: the ${label} report has no machine-load record (recorded before load tracking existed); its timings may have been measured on a busy machine.\n`,
      );
    } else if (system.atStart?.busy || system.atEnd?.busy) {
      process.stderr.write(
        `WARNING: the ${label} report was recorded on a busy machine (load per core ${system.atStart?.loadPerCore} at start, ${system.atEnd?.loadPerCore} at end; threshold ${system.busyThresholdLoadPerCore}). Do not draw conclusions from it.\n`,
      );
    }
  }

  const noise = args.noisePercent ?? candidate.noise?.thresholdPercent ?? DEFAULT_NOISE_PERCENT;
  const tailNoise = args.noisePercent ?? candidate.noise?.tailThresholdPercent ?? noise;
  const rows = compareReports(baseline, candidate, noise, tailNoise);
  process.stdout.write(`Baseline : ${args.baselinePath} (${baselineRuntime ?? 'unknown runtime'})\n`);
  process.stdout.write(`Candidate: ${args.candidatePath} (${candidateRuntime ?? 'unknown runtime'})\n`);
  process.stdout.write(
    `Fallback noise band: ±${noise}% for means/elapsed, ±${tailNoise}% for tail metrics, used for rows whose report recorded no variability (${args.noisePercent !== null ? 'from --noise' : candidate.noise?.thresholdPercent !== undefined ? 'from the report' : 'default'}). Rows with recorded run-to-run variability use their own band: twice the larger coefficient of variation, floors 5% / 10%. Benchmarks are descriptive and never gate CI.\n\n`,
  );
  process.stdout.write(`${renderTable(rows)}\n`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main();
