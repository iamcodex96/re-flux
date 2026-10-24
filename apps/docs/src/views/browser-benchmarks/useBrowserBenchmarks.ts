import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useAppStore } from '../../stores/app';
import type { EngineId, RendererId, BenchmarkRendererId, ScenarioId, EngineStatus, EngineMeta, BrowserRunResult, EngineSummary, BenchmarkReport, OptionMeta } from './types';
import { round, summarizeEngine } from './statistics';
import { calibrateFrameInterval, awaitWithAbort, isAbortError, throwIfAborted, fallbackFrameIntervalMs } from './frameCalibration';
import { measureRun } from './measureRun';
import { benchmarkEngineConfig, benchmarkEngineSources, loadCompetitorModules } from './engineLoader';

export function useBrowserBenchmarks() {
  const appStore = useAppStore();
  const copy = computed(() => appStore.app.view.browserBenchmarks);

  const engines: readonly EngineMeta[] = [
    {
      id: 're-flux', name: 're;Flux', version: copy.value.staticText.thisSiteBuild,
      subtitle: copy.value.staticText.rxjsDrivenKeyframes, href: 'https://github.com/iamcodex96/re-flux',
    },
    {
      id: 'gsap', name: 'GSAP', version: benchmarkEngineConfig.gsap.version,
      subtitle: copy.value.staticText.javascriptObjectTween, href: 'https://gsap.com/',
    },
    {
      id: 'animejs', name: 'Anime.js', version: benchmarkEngineConfig.animejs.version,
      subtitle: copy.value.staticText.javascriptObjectAnimation, href: 'https://animejs.com/',
    },
  ];

  const scenarios: OptionMeta<ScenarioId>[] = [
    { id: 'engine-only', label: copy.value.staticText.engineOverhead, description: copy.value.staticText.engineOverheadDescription },
    { id: 'per-target-dom', label: copy.value.staticText.perTargetDom, description: copy.value.staticText.perTargetDomDescription },
    { id: 'shared-renderer', label: copy.value.staticText.sharedRenderer, description: copy.value.staticText.sharedRendererDescription },
  ];
  const renderers: OptionMeta<RendererId>[] = [
    { id: 'dom', label: copy.value.staticText.domRenderer, description: copy.value.staticText.domRendererDescription },
    { id: 'svg', label: copy.value.staticText.svgRenderer, description: copy.value.staticText.svgRendererDescription },
    { id: 'canvas', label: copy.value.staticText.canvas2dRenderer, description: copy.value.staticText.canvas2dRendererDescription },
  ];
  const repetitions = 10;
  const warmupTargets = 80;
  const warmupDurationMs = 250;
  const selectedScenario = ref<ScenarioId>('shared-renderer');
  const selectedRenderer = ref<RendererId>('dom');
  const frameBudgetReferenceMs = ref(fallbackFrameIntervalMs);
  const frameBudgetSource = ref<'raf-calibration' | '60hz-fallback'>('60hz-fallback');
  const calibrationSamples = ref(0);
  const estimatedRafCadenceHz = computed(() => 1000 / frameBudgetReferenceMs.value);
  const stretchedFrameThresholdMs = computed(() => frameBudgetReferenceMs.value * 1.5);
  const selectedTargetCount = ref(500);
  const selectedDurationMs = ref(1500);
  const stageHost = ref<HTMLDivElement | null>(null);
  const isRunning = ref(false);
  const currentEngine = ref<EngineId | null>(null);
  const statusMessage = ref(copy.value.staticText.readyToCompareKeepThisTabVisibleWhileARunIsInProgress);
  const errorMessage = ref<string | null>(null);
  const progressStep = ref(0);
  const totalSteps = 3 + repetitions * engines.length;
  const engineStatus = ref<Record<EngineId, EngineStatus>>({
    're-flux': 'idle', gsap: 'idle', animejs: 'idle',
  });
  const runResults = ref<Partial<Record<EngineId, BrowserRunResult[]>>>({});
  const report = ref<BenchmarkReport | null>(null);
  let activeController: AbortController | null = null;

  const selectedScenarioMeta = computed(() => scenarios.find((item) => item.id === selectedScenario.value)!);
  const selectedRendererMeta = computed(() => {
    if (selectedScenario.value === 'engine-only') return { id: 'none' as const, label: copy.value.staticText.javascriptObjects, description: copy.value.staticText.javascriptObjectsDescription };
    if (selectedScenario.value === 'per-target-dom') return { id: 'dom' as const, label: copy.value.staticText.perTargetDom, description: copy.value.staticText.perTargetDomDescriptionShort };
    return renderers.find((item) => item.id === selectedRenderer.value)!;
  });
  const activeRenderer = computed<BenchmarkRendererId>(() => selectedScenario.value === 'engine-only' ? 'none' : selectedScenario.value === 'per-target-dom' ? 'dom' : selectedRenderer.value);
  const activeFrameThresholdMs = computed(() => stretchedFrameThresholdMs.value);
  const progressPercent = computed(() => totalSteps > 0 ? Math.min(100, Math.round((progressStep.value / totalSteps) * 100)) : 0);
  const summaries = computed<EngineSummary[]>(() => engines.map((engine) => summarizeEngine(engine, runResults.value[engine.id] ?? [])));
  const measuredResultsExist = computed(() => summaries.value.some((summary) => summary.runs.length > 0));
  const maxRendererP95Ms = computed(() => Math.max(0, ...summaries.value.map((summary) => summary.medianRendererP95Ms ?? 0)));
  const statusLabel = computed(() => isRunning.value
    ? (currentEngine.value ? copy.value.staticText.runningEngine.replace('{engine}', engineName(currentEngine.value)) : copy.value.staticText.preparingBenchmark)
    : report.value ? copy.value.staticText.runComplete : errorMessage.value ? copy.value.staticText.runNeedsAttention : copy.value.staticText.ready);

  watch([selectedScenario, selectedRenderer, selectedTargetCount, selectedDurationMs], () => {
    if (isRunning.value) return;
    runResults.value = {};
    report.value = null;
    progressStep.value = 0;
    errorMessage.value = null;
    engineStatus.value = { 're-flux': 'idle', gsap: 'idle', animejs: 'idle' };
    statusMessage.value = copy.value.staticText.configurationChangedReadyForANewBenchmark;
  });

  function engineName(id: EngineId): string {
    return engines.find((engine) => engine.id === id)?.name ?? id;
  }

  function buildReport(): BenchmarkReport {
    return {
      benchmark: copy.value.staticText.publicBrowserBenchmark,
      schemaVersion: 2,
      createdAt: new Date().toISOString(),
      environment: {
        userAgent: navigator.userAgent,
        platform: navigator.platform,
        language: navigator.language,
        hardwareConcurrency: navigator.hardwareConcurrency ?? null,
        devicePixelRatio: window.devicePixelRatio,
        viewport: { width: window.innerWidth, height: window.innerHeight },
        visibilityState: document.visibilityState,
      },
      configuration: {
        scenario: selectedScenario.value,
        renderer: activeRenderer.value,
        targetCount: selectedTargetCount.value,
        durationMs: selectedDurationMs.value,
        repetitions,
        frameBudgetReferenceMs: round(frameBudgetReferenceMs.value, 4),
        frameBudgetSource: frameBudgetSource.value,
        estimatedRafCadenceHz: round(estimatedRafCadenceHz.value, 2),
        calibrationSamples: calibrationSamples.value,
        stretchedFrameThresholdMs: round(stretchedFrameThresholdMs.value, 4),
      },
      libraries: engines.map((engine) => ({
        id: engine.id,
        name: engine.name,
        version: engine.version,
        source: engine.id === 're-flux' ? copy.value.staticText.localSiteBuild : benchmarkEngineSources[engine.id as 'gsap' | 'animejs'],
      })),
      methodology: [
        copy.value.staticText.competitorModulesFetchedBeforeMeasurements,
        selectedScenario.value === 'shared-renderer'
          ? copy.value.staticText.sharedRendererMethodology
          : selectedScenario.value === 'engine-only'
            ? copy.value.staticText.engineOnlyMethodology
            : copy.value.staticText.perTargetDomMethodology,
        copy.value.staticText.sharedRendererMethodologyReport,
        copy.value.staticText.warmUpMethodologyReport,
        copy.value.staticText.calibrationMethodologyReport,
        copy.value.staticText.runOrderMethodologyReport,
        copy.value.staticText.postRunCleanupProbe,
        copy.value.staticText.rendererCallbackTimeNote,
        copy.value.staticText.frameIntervalNote,
        copy.value.staticText.estimatedMissedRefreshesNote,
        copy.value.staticText.stretchedIntervalsNote,
        copy.value.staticText.longTasksSupportNote,
      ],
      results: summaries.value.filter((summary) => summary.runs.length > 0),
      caveats: [
        copy.value.staticText.browserDeviceCaveat,
        copy.value.staticText.sharedCallbackCaveat,
        copy.value.staticText.cdnCaveat,
        copy.value.staticText.noUploadCaveat,
      ],
    };
  }

  async function runComparison(): Promise<void> {
    if (isRunning.value) return;
    if (document.visibilityState !== 'visible') {
      errorMessage.value = copy.value.staticText.bringThisTabToTheForegroundBeforeStartingABenchmark;
      return;
    }

    const controller = new AbortController();
    activeController = controller;
    isRunning.value = true;
    currentEngine.value = null;
    progressStep.value = 0;
    errorMessage.value = null;
    report.value = null;
    runResults.value = {};
    engineStatus.value = { 're-flux': 'loading', gsap: 'loading', animejs: 'loading' };

    try {
      statusMessage.value = copy.value.staticText.loadingPinnedComparisonEnginesNetworkLoadingIsExcludedFromTheResults;
      const modules = await awaitWithAbort(loadCompetitorModules({ gsapApiMissing: copy.value.staticText.gsapLoadedFromTheCdnButItsAnimationApiWasNotFound, animeApiMissing: copy.value.staticText.animeJsLoadedFromTheCdnButItsAnimateApiWasNotFound }), controller.signal);
      throwIfAborted(controller.signal);

      statusMessage.value = copy.value.staticText.calibratingTheBrowserFrameCadence;
      const calibration = await calibrateFrameInterval(controller.signal);
      frameBudgetReferenceMs.value = calibration.intervalMs;
      frameBudgetSource.value = calibration.source;
      calibrationSamples.value = calibration.sampleCount;

      statusMessage.value = copy.value.staticText.warmingUpEachEngineWithASmallUnreportedRun;
      const warmupOrder: EngineId[] = ['animejs', 'gsap', 're-flux'];
      for (const engine of warmupOrder) {
        throwIfAborted(controller.signal);
        currentEngine.value = engine;
        engineStatus.value[engine] = 'warming-up';
        await measureRun({
          engine, renderer: activeRenderer.value, scenario: selectedScenario.value, targetCount: warmupTargets,
          durationMs: warmupDurationMs, repetition: 0, modules, signal: controller.signal,
          frameIntervalReferenceMs: frameBudgetReferenceMs.value, host: stageHost.value, engineLabel: engineName(engine),
          messages: {
            stageUnavailable: copy.value.staticText.theBenchmarkStageIsNotAvailable,
            canvasUnavailable: copy.value.staticText.canvas2dIsNotAvailableInThisBrowser,
            noTargets: copy.value.staticText.theSelectedBenchmarkScenarioHasNoTargets,
          },
        });
        progressStep.value += 1;
      }

      const runOrders: EngineId[][] = Array.from({ length: repetitions }, (_, index) => {
        const permutations: EngineId[][] = [
          ['re-flux', 'gsap', 'animejs'],
          ['animejs', 'gsap', 're-flux'],
          ['gsap', 're-flux', 'animejs'],
        ];
        return permutations[index % permutations.length]!;
      });
      engineStatus.value = { 're-flux': 'running', gsap: 'running', animejs: 'running' };
      for (let repetition = 1; repetition <= repetitions; repetition += 1) {
        for (const engine of runOrders[repetition - 1]!) {
          throwIfAborted(controller.signal);
          currentEngine.value = engine;
          statusMessage.value = copy.value.staticText.repetitionOf.replace('{current}', String(repetition)).replace('{total}', String(repetitions)).replace('{engine}', engineName(engine)).replace('{scenario}', selectedScenarioMeta.value.label);
          const result = await measureRun({
            engine, renderer: activeRenderer.value, scenario: selectedScenario.value,
            targetCount: selectedTargetCount.value, durationMs: selectedDurationMs.value, repetition,
            modules, signal: controller.signal, frameIntervalReferenceMs: frameBudgetReferenceMs.value,
            host: stageHost.value, engineLabel: engineName(engine),
            messages: {
              stageUnavailable: copy.value.staticText.theBenchmarkStageIsNotAvailable,
              canvasUnavailable: copy.value.staticText.canvas2dIsNotAvailableInThisBrowser,
              noTargets: copy.value.staticText.theSelectedBenchmarkScenarioHasNoTargets,
            },
          });
          runResults.value = {
            ...runResults.value,
            [engine]: [...(runResults.value[engine] ?? []), result],
          };
          progressStep.value += 1;
        }
      }

      engineStatus.value = { 're-flux': 'complete', gsap: 'complete', animejs: 'complete' };
      report.value = buildReport();
      statusMessage.value = copy.value.staticText.allMeasuredRunsComplete.replace('{count}', String(repetitions * engines.length));
    } catch (error) {
      if (isAbortError(error)) {
        statusMessage.value = copy.value.staticText.benchmarkCanceledCompletedRunsRemainAvailableBelow;
      } else {
        const message = error instanceof Error ? error.message : copy.value.staticText.anUnknownErrorOccurredWhileRunningTheBenchmark;
        errorMessage.value = message;
        statusMessage.value = copy.value.staticText.theComparisonDidNotCompleteCheckConnectivityAndTryAgain;
        if (currentEngine.value) engineStatus.value[currentEngine.value] = 'error';
      }
      if (measuredResultsExist.value) report.value = buildReport();
    } finally {
      activeController = null;
      isRunning.value = false;
      currentEngine.value = null;
    }
  }

  function cancelBenchmark(): void {
    activeController?.abort();
  }

  function formatMs(value: number | null, digits = 2): string {
    return value === null || !Number.isFinite(value) ? '—' : `${value.toFixed(digits)} ms`;
  }

  function formatCount(value: number | null): string {
    return value === null ? copy.value.staticText.notApplicable : value.toLocaleString();
  }

  function barWidth(value: number | null): string {
    if (value === null || maxRendererP95Ms.value <= 0) return '0%';
    return `${Math.max(2, (value / maxRendererP95Ms.value) * 100)}%`;
  }

  function downloadReport(): void {
    const data = report.value ?? (measuredResultsExist.value ? buildReport() : null);
    if (!data) return;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `re-flux-browser-benchmark-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  onBeforeUnmount(() => activeController?.abort());

  return {
    copy,
    engines,
    scenarios,
    renderers,
    repetitions,
    selectedScenario,
    selectedRenderer,
    selectedTargetCount,
    selectedDurationMs,
    selectedScenarioMeta,
    selectedRendererMeta,
    activeRenderer,
    activeFrameThresholdMs,
    estimatedRafCadenceHz,
    frameBudgetReferenceMs,
    calibrationSamples,
    statusMessage,
    errorMessage,
    progressStep,
    progressPercent,
    isRunning,
    currentEngine,
    engineStatus,
    runResults,
    report,
    summaries,
    measuredResultsExist,
    maxRendererP95Ms,
    statusLabel,
    stageHost,
    runComparison,
    cancelBenchmark,
    formatMs,
    formatCount,
    barWidth,
    downloadReport,
  };
}
