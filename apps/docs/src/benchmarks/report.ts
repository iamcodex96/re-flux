import { CDN_URLS, REPETITIONS } from './config';
import type { BenchmarkEnvironment } from './environment';
import { round } from './statistics';
import type {
  BenchmarkMessages,
  BenchmarkRendererId,
  BenchmarkReport,
  EngineMeta,
  EngineSummary,
  ScenarioId,
} from './types';

export interface ReportInput {
  messages: BenchmarkMessages;
  env: Pick<BenchmarkEnvironment, 'describe'>;
  engines: readonly EngineMeta[];
  summaries: readonly EngineSummary[];
  scenario: ScenarioId;
  renderer: BenchmarkRendererId;
  targetCount: number;
  durationMs: number;
  frameBudgetReferenceMs: number;
  frameBudgetSource: 'raf-calibration' | '60hz-fallback';
  calibrationSamples: number;
  now?: Date;
}

/** The exported report (`schemaVersion: 2`). Engines without measured runs are left out of `results`. */
export function buildBenchmarkReport(input: ReportInput): BenchmarkReport {
  const { messages, scenario } = input;
  return {
    benchmark: messages.publicBrowserBenchmark,
    schemaVersion: 2,
    createdAt: (input.now ?? new Date()).toISOString(),
    environment: input.env.describe(),
    configuration: {
      scenario,
      renderer: input.renderer,
      targetCount: input.targetCount,
      durationMs: input.durationMs,
      repetitions: REPETITIONS,
      frameBudgetReferenceMs: round(input.frameBudgetReferenceMs, 4),
      frameBudgetSource: input.frameBudgetSource,
      estimatedRafCadenceHz: round(1000 / input.frameBudgetReferenceMs, 2),
      calibrationSamples: input.calibrationSamples,
      stretchedFrameThresholdMs: round(input.frameBudgetReferenceMs * 1.5, 4),
    },
    libraries: input.engines.map((engine) => ({
      id: engine.id,
      name: engine.name,
      version: engine.version,
      source: engine.id === 're-flux' ? messages.localSiteBuild : CDN_URLS[engine.id],
    })),
    methodology: [
      messages.competitorModulesFetchedBeforeMeasurements,
      scenario === 'shared-renderer'
        ? messages.sharedRendererMethodology
        : scenario === 'engine-only'
          ? messages.engineOnlyMethodology
          : messages.perTargetDomMethodology,
      messages.sharedRendererMethodologyReport,
      messages.warmUpMethodologyReport,
      messages.calibrationMethodologyReport,
      messages.runOrderMethodologyReport,
      messages.postRunCleanupProbe,
      messages.rendererCallbackTimeNote,
      messages.frameIntervalNote,
      messages.estimatedMissedRefreshesNote,
      messages.stretchedIntervalsNote,
      messages.longTasksSupportNote,
    ],
    results: input.summaries.filter((summary) => summary.runs.length > 0) as EngineSummary[],
    caveats: [messages.browserDeviceCaveat, messages.sharedCallbackCaveat, messages.cdnCaveat, messages.noUploadCaveat],
  };
}
