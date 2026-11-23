/** Shared types of the browser benchmark engine (no Vue, no store). */
export type EngineId = 're-flux' | 'gsap' | 'animejs';
export type RendererId = 'dom' | 'svg' | 'canvas';
export type BenchmarkRendererId = RendererId | 'none';
export type ScenarioId = 'shared-renderer' | 'engine-only' | 'per-target-dom';
export type EngineStatus = 'idle' | 'loading' | 'warming-up' | 'running' | 'complete' | 'error';

export interface EngineMeta {
  id: EngineId;
  name: string;
  version: string;
  subtitle: string;
  href: string;
}

export interface FrameStats {
  sampleCount: number;
  medianMs: number | null;
  p95Ms: number | null;
  p99Ms: number | null;
  maxMs: number | null;
  stretchedFrameCount: number;
  estimatedMissedRefreshCount: number;
}

export interface BrowserRunResult {
  engine: EngineId;
  repetition: number;
  scenario: ScenarioId;
  renderer: BenchmarkRendererId;
  targetCount: number;
  configuredDurationMs: number;
  completed: boolean;
  elapsedMs: number;
  renderCallbacks: number;
  renderedTargetsPerCallback: number;
  rendererWork: { medianMs: number | null; p95Ms: number | null; p99Ms: number | null; totalMs: number | null };
  frameIntervals: FrameStats;
  longTaskCount: number | null;
  longTaskDurationMs: number | null;
  longAnimationFrameCount: number | null;
  cleanupPassed: boolean | null;
}

export interface EngineSummary {
  id: EngineId;
  name: string;
  version: string;
  subtitle: string;
  href: string;
  runs: BrowserRunResult[];
  medianCompletionMs: number;
  medianRendererP95Ms: number | null;
  medianRendererTotalMs: number | null;
  medianRenderCallbacks: number | null;
  medianFrameP95Ms: number | null;
  medianFrameP99Ms: number | null;
  medianFrameIntervalMs: number | null;
  medianStretchedFrameCount: number;
  medianEstimatedMissedRefreshCount: number;
  medianLongTaskCount: number | null;
  medianLongAnimationFrameCount: number | null;
  cleanupPassed: boolean | null;
}

export interface BenchmarkReport {
  benchmark: string;
  schemaVersion: 2;
  createdAt: string;
  environment: {
    userAgent: string;
    platform: string;
    language: string;
    hardwareConcurrency: number | null;
    devicePixelRatio: number;
    viewport: { width: number; height: number };
    visibilityState: DocumentVisibilityState;
  };
  configuration: {
    scenario: ScenarioId;
    renderer: BenchmarkRendererId;
    targetCount: number;
    durationMs: number;
    repetitions: number;
    frameBudgetReferenceMs: number;
    frameBudgetSource: 'raf-calibration' | '60hz-fallback';
    estimatedRafCadenceHz: number;
    calibrationSamples: number;
    stretchedFrameThresholdMs: number;
  };
  libraries: Array<{ id: EngineId; name: string; version: string; source: string }>;
  methodology: string[];
  results: EngineSummary[];
  caveats: string[];
}

export interface GsapTween {
  play(position?: number): unknown;
  kill(): void;
}
export interface GsapApi {
  to(target: object | Element[], vars: Record<string, unknown>): GsapTween;
}
export interface AnimeAnimation {
  play(): unknown;
  cancel(): unknown;
}
export type AnimeAnimate = (target: object, parameters: Record<string, unknown>) => AnimeAnimation;
export interface GsapModuleShape {
  gsap?: GsapApi;
  default?: GsapApi | { gsap?: GsapApi };
}
export interface AnimeModuleShape {
  animate?: AnimeAnimate;
  default?: AnimeAnimate | { animate?: AnimeAnimate };
}
export interface EngineModules {
  gsap: GsapApi;
  animeAnimate: AnimeAnimate;
}
/** One engine's animation of the scene's targets: `start()` begins playback, `cleanup()` releases it. */
export interface AnimationRunner {
  start(): void;
  cleanup(): void;
}
export interface RenderScene {
  render(progress: number): void;
  cleanup(): void;
  targetCount: number;
  domTargets?: HTMLDivElement[];
  objectTargets?: Array<{ value: number }>;
}


/** The localized strings the benchmark engine needs (a subset of the page's `staticText` locale block). */
export interface BenchmarkMessages {
  readonly canvas2dIsNotAvailableInThisBrowser: string;
  readonly theSelectedBenchmarkScenarioHasNoTargets: string;
  readonly theBenchmarkStageIsNotAvailable: string;
  readonly gsapLoadedFromTheCdnButItsAnimationApiWasNotFound: string;
  readonly animeJsLoadedFromTheCdnButItsAnimateApiWasNotFound: string;
  readonly publicBrowserBenchmark: string;
  readonly localSiteBuild: string;
  readonly competitorModulesFetchedBeforeMeasurements: string;
  readonly sharedRendererMethodology: string;
  readonly engineOnlyMethodology: string;
  readonly perTargetDomMethodology: string;
  readonly sharedRendererMethodologyReport: string;
  readonly warmUpMethodologyReport: string;
  readonly calibrationMethodologyReport: string;
  readonly runOrderMethodologyReport: string;
  readonly postRunCleanupProbe: string;
  readonly rendererCallbackTimeNote: string;
  readonly frameIntervalNote: string;
  readonly estimatedMissedRefreshesNote: string;
  readonly stretchedIntervalsNote: string;
  readonly longTasksSupportNote: string;
  readonly browserDeviceCaveat: string;
  readonly sharedCallbackCaveat: string;
  readonly cdnCaveat: string;
  readonly noUploadCaveat: string;
  readonly loadingPinnedComparisonEnginesNetworkLoadingIsExcludedFromTheResults: string;
  readonly calibratingTheBrowserFrameCadence: string;
  readonly warmingUpEachEngineWithASmallUnreportedRun: string;
  readonly repetitionOf: string;
  readonly allMeasuredRunsComplete: string;
  readonly benchmarkCanceledCompletedRunsRemainAvailableBelow: string;
  readonly anUnknownErrorOccurredWhileRunningTheBenchmark: string;
  readonly theComparisonDidNotCompleteCheckConnectivityAndTryAgain: string;
  readonly bringThisTabToTheForegroundBeforeStartingABenchmark: string;
}

