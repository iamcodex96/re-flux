/** Shared helpers for reproducible, descriptive (non-gating) microbenchmarks. */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

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
  const result = sorted.length % 2 === 0
    ? ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
    : (sorted[middle] ?? 0);
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

/** Summarize per-run metrics without pooling unrelated frame samples. */
export function summarizeRuns(runs, selector) {
  const values = runs.map(selector);
  return {
    runCount: values.length,
    meanMs: round(values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length)),
    medianMs: round(median(values)),
    minMs: round(Math.min(...values)),
    maxMs: round(Math.max(...values)),
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
