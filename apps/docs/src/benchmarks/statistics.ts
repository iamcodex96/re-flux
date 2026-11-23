import { median as basicsMedian } from '@re-code/basics/number/median';
import { percentile as basicsPercentile } from '@re-code/basics/number/percentile';
import { ENGINE_CATALOG } from './config';
import type { BrowserRunResult, EngineId, EngineMeta, EngineSummary } from './types';

export function round(value: number, digits = 3): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function median(values: readonly number[]): number | null {
  return values.length === 0 ? null : round(basicsMedian(values));
}

/** Nearest-rank percentile (`quantile` in [0, 1]). */
export function percentile(values: readonly number[], quantile: number): number | null {
  return values.length === 0 ? null : round(basicsPercentile(values, quantile, { method: 'nearest-rank' }));
}

/** Whole display refreshes a callback interval most likely skipped, given the calibrated reference interval. */
export function estimateMissedRefreshes(intervalMs: number, referenceIntervalMs: number): number {
  if (!Number.isFinite(intervalMs) || !Number.isFinite(referenceIntervalMs) || referenceIntervalMs <= 0) return 0;
  return Math.max(0, Math.round(intervalMs / referenceIntervalMs) - 1);
}

const present = (values: ReadonlyArray<number | null>): number[] =>
  values.flatMap((value) => (value === null ? [] : [value]));

/** Median of every metric over one engine's measured runs. Diagnostics a browser cannot report stay `null`, never 0. */
export function summarizeEngine(engine: EngineMeta, runs: BrowserRunResult[]): EngineSummary {
  const reported = runs.filter((run) => run.cleanupPassed !== null);
  return {
    id: engine.id,
    name: engine.name,
    version: engine.version,
    subtitle: engine.subtitle,
    href: engine.href,
    runs,
    medianCompletionMs: median(runs.map((run) => run.elapsedMs)) ?? 0,
    medianRendererP95Ms: median(present(runs.map((run) => run.rendererWork.p95Ms))),
    medianRendererTotalMs: median(present(runs.map((run) => run.rendererWork.totalMs))),
    medianRenderCallbacks: median(runs.map((run) => run.renderCallbacks)),
    medianFrameP95Ms: median(present(runs.map((run) => run.frameIntervals.p95Ms))),
    medianFrameP99Ms: median(present(runs.map((run) => run.frameIntervals.p99Ms))),
    medianFrameIntervalMs: median(present(runs.map((run) => run.frameIntervals.medianMs))),
    medianStretchedFrameCount: median(runs.map((run) => run.frameIntervals.stretchedFrameCount)) ?? 0,
    medianEstimatedMissedRefreshCount: median(runs.map((run) => run.frameIntervals.estimatedMissedRefreshCount)) ?? 0,
    medianLongTaskCount: median(present(runs.map((run) => run.longTaskCount))),
    medianLongAnimationFrameCount: median(present(runs.map((run) => run.longAnimationFrameCount))),
    cleanupPassed: reported.length > 0 ? reported.every((run) => run.cleanupPassed === true) : null,
  };
}

/** Three rotating engine orders so no engine always runs first or last; repetition index starts at 0. */
const RUN_PERMUTATIONS: readonly (readonly EngineId[])[] = [
  ['re-flux', 'gsap', 'animejs'],
  ['animejs', 'gsap', 're-flux'],
  ['gsap', 're-flux', 'animejs'],
];

export function engineRunOrder(repetitionIndex: number): readonly EngineId[] {
  return RUN_PERMUTATIONS[repetitionIndex % RUN_PERMUTATIONS.length]!;
}

export function engineName(id: EngineId): string {
  return ENGINE_CATALOG.find((engine) => engine.id === id)?.name ?? id;
}
