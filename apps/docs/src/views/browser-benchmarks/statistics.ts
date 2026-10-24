import type { BrowserRunResult, EngineMeta, EngineSummary } from './types';

export function round(value: number, digits = 3): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const value = sorted.length % 2 === 0
    ? ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
    : sorted[middle];
  return value === undefined ? null : round(value);
}

export function percentile(values: readonly number[], quantile: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(quantile * sorted.length) - 1));
  const value = sorted[index];
  return value === undefined ? null : round(value);
}

export function summarizeEngine(engine: EngineMeta, runs: BrowserRunResult[]): EngineSummary {
  return {
    id: engine.id,
    name: engine.name,
    version: engine.version,
    subtitle: engine.subtitle,
    href: engine.href,
    runs,
    medianCompletionMs: median(runs.map((run) => run.elapsedMs)) ?? 0,
    medianRendererP95Ms: median(runs.flatMap((run) => run.rendererWork.p95Ms === null ? [] : [run.rendererWork.p95Ms])),
    medianRendererTotalMs: median(runs.flatMap((run) => run.rendererWork.totalMs === null ? [] : [run.rendererWork.totalMs])),
    medianRenderCallbacks: median(runs.map((run) => run.renderCallbacks)),
    medianFrameP95Ms: median(runs.flatMap((run) => run.frameIntervals.p95Ms === null ? [] : [run.frameIntervals.p95Ms])),
    medianFrameP99Ms: median(runs.flatMap((run) => run.frameIntervals.p99Ms === null ? [] : [run.frameIntervals.p99Ms])),
    medianFrameIntervalMs: median(runs.flatMap((run) => run.frameIntervals.medianMs === null ? [] : [run.frameIntervals.medianMs])),
    medianStretchedFrameCount: median(runs.map((run) => run.frameIntervals.stretchedFrameCount)) ?? 0,
    medianEstimatedMissedRefreshCount: median(runs.map((run) => run.frameIntervals.estimatedMissedRefreshCount)) ?? 0,
    medianLongTaskCount: median(runs.flatMap((run) => run.longTaskCount === null ? [] : [run.longTaskCount])),
    medianLongAnimationFrameCount: median(runs.flatMap((run) => run.longAnimationFrameCount === null ? [] : [run.longAnimationFrameCount])),
    cleanupPassed: runs.length > 0 && runs.some((run) => run.cleanupPassed !== null)
      ? runs.filter((run) => run.cleanupPassed !== null).every((run) => run.cleanupPassed === true)
      : null,
  };
}
