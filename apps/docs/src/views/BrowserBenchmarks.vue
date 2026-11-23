<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useAppStore } from '../stores/app';
import {
  COMPETITOR_VERSIONS,
  DURATION_OPTIONS_MS,
  ENGINE_CATALOG,
  FALLBACK_FRAME_INTERVAL_MS,
  RENDERERS,
  REPETITIONS,
  SCENARIOS,
  TARGET_COUNT_OPTIONS,
  WARMUP_ORDER,
} from '../benchmarks/config';
import { browserEnvironment } from '../benchmarks/environment';
import { buildBenchmarkReport } from '../benchmarks/report';
import { runBenchmarkSession } from '../benchmarks/session';
import { engineName, summarizeEngine } from '../benchmarks/statistics';
import type { BenchmarkReport, BenchmarkRendererId, BrowserRunResult, EngineId, EngineMeta, EngineStatus, EngineSummary, RendererId, ScenarioId } from '../benchmarks/types';

const appStore = useAppStore();
const copy = computed(() => appStore.app.view.browserBenchmarks);
const text = copy.value.staticText;
const env = browserEnvironment();
const repetitions = REPETITIONS;
const targetOptions: readonly number[] = TARGET_COUNT_OPTIONS;
const durationOptions: readonly number[] = DURATION_OPTIONS_MS;
const subtitles: Record<EngineId, string> = { 're-flux': text.rxjsDrivenKeyframes, gsap: text.javascriptObjectTween, animejs: text.javascriptObjectAnimation };
const engines: readonly EngineMeta[] = ENGINE_CATALOG.map((engine) => ({
  ...engine,
  subtitle: subtitles[engine.id],
  version: engine.id === 're-flux' ? text.thisSiteBuild : COMPETITOR_VERSIONS[engine.id],
}));
const scenarios = SCENARIOS.map((item) => ({ id: item.id, label: text[item.labelKey], description: text[item.descriptionKey] }));
const renderers = RENDERERS.map((item) => ({ id: item.id, label: text[item.labelKey], description: text[item.descriptionKey] }));

const selectedScenario = ref<ScenarioId>('shared-renderer');
const selectedRenderer = ref<RendererId>('dom');
const selectedTargetCount = ref(500);
const selectedDurationMs = ref(1500);
const frameBudgetReferenceMs = ref(FALLBACK_FRAME_INTERVAL_MS);
const frameBudgetSource = ref<'raf-calibration' | '60hz-fallback'>('60hz-fallback');
const calibrationSamples = ref(0);
const stageHost = ref<HTMLDivElement | null>(null);
const isRunning = ref(false);
const statusMessage = ref(text.readyToCompareKeepThisTabVisibleWhileARunIsInProgress);
const errorMessage = ref<string | null>(null);
const progressStep = ref(0);
const totalSteps = WARMUP_ORDER.length + repetitions * engines.length;
const engineStatus = ref<Record<EngineId, EngineStatus>>({ 're-flux': 'idle', gsap: 'idle', animejs: 'idle' });
const runResults = ref<Partial<Record<EngineId, BrowserRunResult[]>>>({});
const report = ref<BenchmarkReport | null>(null);
const currentEngine = ref<EngineId | null>(null);
let activeController: AbortController | null = null;

const estimatedRafCadenceHz = computed(() => 1000 / frameBudgetReferenceMs.value);
const activeFrameThresholdMs = computed(() => frameBudgetReferenceMs.value * 1.5);
const selectedScenarioMeta = computed(() => scenarios.find((item) => item.id === selectedScenario.value)!);
const activeRenderer = computed<BenchmarkRendererId>(() => selectedScenario.value === 'engine-only' ? 'none' : selectedScenario.value === 'per-target-dom' ? 'dom' : selectedRenderer.value);
const selectedRendererMeta = computed(() => {
  if (selectedScenario.value === 'engine-only') return { id: 'none' as const, label: text.javascriptObjects, description: text.javascriptObjectsDescription };
  if (selectedScenario.value === 'per-target-dom') return { id: 'dom' as const, label: text.perTargetDom, description: text.perTargetDomDescriptionShort };
  return renderers.find((item) => item.id === selectedRenderer.value)!;
});
const progressPercent = computed(() => Math.min(100, Math.round((progressStep.value / totalSteps) * 100)));
const summaries = computed<EngineSummary[]>(() => engines.map((engine) => summarizeEngine(engine, runResults.value[engine.id] ?? [])));
const measuredResultsExist = computed(() => summaries.value.some((summary) => summary.runs.length > 0));
const maxRendererP95Ms = computed(() => Math.max(0, ...summaries.value.map((summary) => summary.medianRendererP95Ms ?? 0)));
const statusLabel = computed(() => isRunning.value
  ? (currentEngine.value ? text.runningEngine.replace('{engine}', engineName(currentEngine.value)) : text.preparingBenchmark)
  : report.value ? text.runComplete : errorMessage.value ? text.runNeedsAttention : text.ready);

watch([selectedScenario, selectedRenderer, selectedTargetCount, selectedDurationMs], () => {
  if (isRunning.value) return;
  runResults.value = {};
  report.value = null;
  progressStep.value = 0;
  errorMessage.value = null;
  engineStatus.value = { 're-flux': 'idle', gsap: 'idle', animejs: 'idle' };
  statusMessage.value = text.configurationChangedReadyForANewBenchmark;
});

function buildReport() {
  return buildBenchmarkReport({
    messages: text, env, engines, summaries: summaries.value, scenario: selectedScenario.value, renderer: activeRenderer.value,
    targetCount: selectedTargetCount.value, durationMs: selectedDurationMs.value, frameBudgetReferenceMs: frameBudgetReferenceMs.value,
    frameBudgetSource: frameBudgetSource.value, calibrationSamples: calibrationSamples.value,
  });
}

async function runComparison(): Promise<void> {
  if (isRunning.value) return;
  if (!env.isVisible()) {
    errorMessage.value = text.bringThisTabToTheForegroundBeforeStartingABenchmark;
    return;
  }
  const controller = new AbortController();
  activeController = controller;
  isRunning.value = true;
  progressStep.value = 0;
  errorMessage.value = null;
  report.value = null;
  runResults.value = {};
  const outcome = await runBenchmarkSession({
    configuration: { scenario: selectedScenario.value, scenarioLabel: selectedScenarioMeta.value.label, renderer: activeRenderer.value, targetCount: selectedTargetCount.value, durationMs: selectedDurationMs.value },
    host: () => stageHost.value,
    messages: text,
    env,
    signal: controller.signal,
    callbacks: {
      status: (message) => { statusMessage.value = message; },
      engineStatuses: (statuses) => { engineStatus.value = statuses; },
      currentEngine: (engine) => { currentEngine.value = engine; },
      progress: () => { progressStep.value += 1; },
      calibrated: (calibration) => {
        frameBudgetReferenceMs.value = calibration.intervalMs;
        frameBudgetSource.value = calibration.source;
        calibrationSamples.value = calibration.sampleCount;
      },
      result: (engine, run) => { runResults.value = { ...runResults.value, [engine]: [...(runResults.value[engine] ?? []), run] }; },
    },
  });
  if (outcome.outcome === 'complete') {
    report.value = buildReport();
  } else {
    if (outcome.outcome === 'error') {
      errorMessage.value = outcome.message;
      if (outcome.engine) engineStatus.value[outcome.engine] = 'error';
    }
    if (measuredResultsExist.value) report.value = buildReport();
  }
  activeController = null;
  isRunning.value = false;
}

function cancelBenchmark(): void {
  activeController?.abort();
}

function formatMs(value: number | null, digits = 2): string {
  return value === null || !Number.isFinite(value) ? '—' : `${value.toFixed(digits)} ms`;
}

function formatCount(value: number | null): string {
  return value === null ? text.notApplicable : value.toLocaleString();
}

function barWidth(value: number | null): string {
  if (value === null || maxRendererP95Ms.value <= 0) return '0%';
  return `${Math.max(2, (value / maxRendererP95Ms.value) * 100)}%`;
}

function downloadReport(): void {
  const data = report.value ?? (measuredResultsExist.value ? buildReport() : null);
  if (!data) return;
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `re-flux-browser-benchmark-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

onBeforeUnmount(() => activeController?.abort());
</script>

<template>
  <div class="browser-benchmarks">
    <section class="browser-benchmarks__hero">
      <div class="browser-benchmarks__eyebrow"><span class="browser-benchmarks__eyebrow-dot" /> {{ copy.staticText.publicPerformanceLab }}</div>
      <h1>{{ copy.staticText.motionMeasured }} <span>{{ copy.staticText.inYourBrowser }}</span></h1>
      <p class="browser-benchmarks__intro">
        {{ copy.staticText.runTheSameBrowserSideWorkloadWithReFluxGsapAndAnimeJsResultsAreProducedOnYourMachineUsingRealDomSvgOrCanvasTargetsNotPrerecordedScores }}
      </p>
      <div class="browser-benchmarks__hero-meta">
        <span><UiIcon icon="mdi-laptop" /> {{ copy.staticText.clientSideExecution }}</span>
        <span><UiIcon icon="mdi-repeat" /> {{ copy.staticText.text10MeasuredRepetitionsPerEngine }}</span>
        <span><UiIcon icon="mdi-download-outline" /> {{ copy.staticText.exportableJson }}</span>
      </div>
    </section>

    <section class="browser-benchmarks__panel browser-benchmarks__configuration" aria-labelledby="benchmark-setup-title">
      <div class="browser-benchmarks__section-heading">
        <div>
          <div class="browser-benchmarks__kicker">{{ copy.staticText.text01Configure }}</div>
          <h2 id="benchmark-setup-title">{{ copy.staticText.chooseAWorkload }}</h2>
        </div>
        <span class="browser-benchmarks__run-count">{{ copy.staticText.runsPerEngine.replace('{count}', String(repetitions)) }}</span>
      </div>

      <div class="browser-benchmarks__controls">
        <label class="browser-benchmarks__field">
          <span>{{ copy.staticText.scenario }}</span>
          <select v-model="selectedScenario" :disabled="isRunning">
            <option v-for="scenario in scenarios" :key="scenario.id" :value="scenario.id">{{ scenario.label }}</option>
          </select>
          <small>{{ selectedScenarioMeta.description }}</small>
        </label>
        <label v-if="selectedScenario === 'shared-renderer'" class="browser-benchmarks__field">
          <span>{{ copy.staticText.renderTarget }}</span>
          <select v-model="selectedRenderer" :disabled="isRunning">
            <option v-for="renderer in renderers" :key="renderer.id" :value="renderer.id">{{ renderer.label }}</option>
          </select>
          <small>{{ selectedRendererMeta.description }}</small>
        </label>
        <div v-else class="browser-benchmarks__field browser-benchmarks__field-note">
          <span>{{ selectedScenario === 'engine-only' ? copy.staticText.rendering : copy.staticText.perTargetUpdate }}</span>
          <small>{{ selectedRendererMeta.description }}</small>
        </div>
        <label class="browser-benchmarks__field">
          <span>{{ copy.staticText.targetCount }}</span>
          <select v-model.number="selectedTargetCount" :disabled="isRunning">
            <option v-for="count in targetOptions" :key="count" :value="count">{{ count.toLocaleString() }} {{ count === 1 ? copy.staticText.target : copy.staticText.targets }}</option>
          </select>
          <small>{{ copy.staticText.identicalTargetCountForAllThreeEngines }}</small>
        </label>
        <label class="browser-benchmarks__field">
          <span>{{ copy.staticText.animationDuration }}</span>
          <select v-model.number="selectedDurationMs" :disabled="isRunning">
            <option v-for="duration in durationOptions" :key="duration" :value="duration">{{ (duration / 1000).toFixed(1) }} {{ copy.staticText.seconds }}</option>
          </select>
          <small>{{ copy.staticText.oneDurationAndTargetCountForAllThreeEngines }}</small>
        </label>
      </div>

      <div class="browser-benchmarks__actions">
        <button class="browser-benchmarks__primary-button" type="button" :disabled="isRunning" @click="runComparison">
          <UiIcon :icon="isRunning ? 'mdi-loading' : 'mdi-play-circle-outline'" />
          {{ isRunning ? copy.staticText.benchmarkRunning : measuredResultsExist ? copy.staticText.runAgain : copy.staticText.runComparison }}
        </button>
        <button v-if="isRunning" class="browser-benchmarks__secondary-button" type="button" @click="cancelBenchmark">{{ copy.staticText.cancel }}</button>
        <button class="browser-benchmarks__secondary-button" type="button" :disabled="!report && !measuredResultsExist" @click="downloadReport">
          <UiIcon icon="mdi-download-outline" /> {{ copy.staticText.exportJson }}
        </button>
        <span class="browser-benchmarks__actions-note">{{ copy.staticText.keepThisTabInTheForegroundLoadingGsapAndAnimeJsRequiresANetworkConnection }}</span>
      </div>

      <div v-if="isRunning || progressStep > 0" class="browser-benchmarks__progress" role="status" aria-live="polite">
        <div class="browser-benchmarks__progress-copy"><span>{{ statusMessage }}</span><strong>{{ progressPercent }}%</strong></div>
        <div class="browser-benchmarks__progress-track"><span :style="{ width: `${progressPercent}%` }" /></div>
      </div>
      <p v-else class="browser-benchmarks__status"><span class="browser-benchmarks__status-dot" /> {{ statusMessage }}</p>
      <p v-if="errorMessage" class="browser-benchmarks__error" role="alert">{{ errorMessage }}</p>
      <p v-if="report" class="browser-benchmarks__calibration-note">
        {{ copy.staticText.estimatedRafCadence }} <strong>{{ estimatedRafCadenceHz.toFixed(1) }} Hz</strong>
        {{ copy.staticText.calibrationDescription.replace('{medianInterval}', formatMs(frameBudgetReferenceMs, 2)).replace('{samples}', String(calibrationSamples)) }}
      </p>
    </section>

    <section class="browser-benchmarks__workspace" :aria-label="copy.staticText.benchmarkAnimationStageAndLiveComparisonResults">
      <div class="browser-benchmarks__panel browser-benchmarks__stage-panel">
        <div class="browser-benchmarks__section-heading">
          <div>
            <div class="browser-benchmarks__kicker">{{ copy.staticText.text02LiveWorkload }}</div>
            <h2>{{ selectedRendererMeta.label }}{{ selectedScenario === 'engine-only' ? ` ${copy.staticText.workload}` : ` ${copy.staticText.scene}` }}</h2>
          </div>
          <span class="browser-benchmarks__stage-targets">{{ selectedTargetCount.toLocaleString() }} {{ selectedScenario === 'engine-only' ? copy.staticText.objects : copy.staticText.targets }}</span>
        </div>
        <div class="browser-benchmarks__stage-frame">
          <div ref="stageHost" class="browser-benchmarks__stage" :data-renderer="activeRenderer" />
          <div v-if="!isRunning && !measuredResultsExist" class="browser-benchmarks__stage-placeholder">
            <span class="browser-benchmarks__stage-orb"><i /><i /><i /></span>
            <p>{{ copy.staticText.readyWhenYouAre }}</p>
            <small>{{ copy.staticText.theSceneIsGeneratedWhenABenchmarkStarts }}</small>
          </div>
        </div>
        <div class="browser-benchmarks__stage-legend">
          <span><i class="browser-benchmarks__legend-swatch browser-benchmarks__legend-swatch--reflux" /> {{ copy.staticText.reFlux }}</span>
          <span><i class="browser-benchmarks__legend-swatch browser-benchmarks__legend-swatch--gsap" /> {{ copy.staticText.gsap }}</span>
          <span><i class="browser-benchmarks__legend-swatch browser-benchmarks__legend-swatch--anime" /> {{ copy.staticText.animeJs }}</span>
        </div>
        <p class="browser-benchmarks__stage-note">{{ selectedScenario === 'shared-renderer' ? copy.staticText.sharedRendererStageNote : selectedScenario === 'engine-only' ? copy.staticText.engineOnlyStageNote : copy.staticText.perTargetStageNote }}</p>

        <div v-if="measuredResultsExist && selectedScenario === 'shared-renderer'" class="browser-benchmarks__comparison-bars" :aria-label="copy.staticText.rendererCallbackTimingComparison">
          <h3>{{ copy.staticText.rendererCallbackP95 }} <span>{{ copy.staticText.sharedDomSvgCanvasWritePath }}</span></h3>
          <div v-for="engine in summaries" :key="engine.id" class="browser-benchmarks__bar-row">
            <span>{{ engine.name }}</span>
            <div class="browser-benchmarks__bar-track"><span :class="`bar-${engine.id}`" :style="{ width: barWidth(engine.medianRendererP95Ms) }" /></div>
            <strong>{{ formatMs(engine.medianRendererP95Ms, 4) }}</strong>
          </div>
        </div>
        <p class="browser-benchmarks__stage-note">{{ selectedScenario === 'shared-renderer' ? copy.staticText.sharedRendererScenarioStageNote : selectedScenario === 'engine-only' ? copy.staticText.engineOnlyScenarioStageNote : copy.staticText.perTargetDomScenarioStageNote }}</p>

        <div v-if="measuredResultsExist && selectedScenario === 'shared-renderer'" class="browser-benchmarks__comparison-bars" :aria-label="copy.staticText.rendererCallbackTimingComparison">
          <h3>{{ copy.staticText.rendererCallbackP95 }} <span>{{ copy.staticText.sharedDomSvgCanvasWritePath }}</span></h3>
          <div v-for="engine in summaries" :key="engine.id" class="browser-benchmarks__bar-row">
            <span>{{ engine.name }}</span>
            <div class="browser-benchmarks__bar-track"><span :class="`bar-${engine.id}`" :style="{ width: barWidth(engine.medianRendererP95Ms) }" /></div>
            <strong>{{ formatMs(engine.medianRendererP95Ms, 4) }}</strong>
          </div>
        </div>
      </div>

      <div class="browser-benchmarks__panel browser-benchmarks__results-panel">
        <div class="browser-benchmarks__section-heading">
          <div>
            <div class="browser-benchmarks__kicker">{{ copy.staticText.text03Results }}</div>
            <h2>{{ copy.staticText.measuredOnThisDevice }}</h2>
          </div>
          <span class="browser-benchmarks__status-pill" :class="{ 'is-active': isRunning }">{{ statusLabel }}</span>
        </div>

        <div class="browser-benchmarks__engine-results">
          <article v-for="engine in summaries" :key="engine.id" class="browser-benchmarks__engine-card" :class="`engine-${engine.id}`">
            <div class="browser-benchmarks__engine-card-heading">
              <div>
                <span class="browser-benchmarks__engine-mark" aria-hidden="true">{{ engine.id === 're-flux' ? 're;' : engine.id === 'gsap' ? 'G' : 'A' }}</span>
                <h3>{{ engine.name }}</h3>
              </div>
              <span class="browser-benchmarks__engine-status">{{ engineStatus[engine.id] === 'complete' ? copy.staticText.complete : engineStatus[engine.id] === 'error' ? copy.staticText.error : engine.runs.length ? `${engine.runs.length}/${repetitions}` : copy.staticText.waiting }}</span>
            </div>
            <p class="browser-benchmarks__engine-version">{{ engine.version }} · {{ engine.runs.length ? copy.staticText.measured : engine.subtitle }}</p>
            <div v-if="selectedScenario === 'shared-renderer'" class="browser-benchmarks__engine-primary">
              <span>{{ copy.staticText.sharedRendererCallbackP95 }}</span>
              <strong>{{ engine.runs.length ? formatMs(engine.medianRendererP95Ms, 4) : '—' }}</strong>
            </div>
            <div v-else class="browser-benchmarks__engine-primary">
              <span>{{ selectedScenario === 'engine-only' ? copy.staticText.mode : copy.staticText.updatePath }}</span>
              <strong>{{ selectedScenario === 'engine-only' ? copy.staticText.jsObjects : copy.staticText.directDom }}</strong>
            </div>
            <div class="browser-benchmarks__engine-metrics">
              <div><span>{{ copy.staticText.completionTime }}</span><strong>{{ engine.runs.length ? formatMs(engine.medianCompletionMs) : '—' }}</strong></div>
              <div><span>{{ copy.staticText.frameIntervalP95 }}</span><strong>{{ formatMs(engine.medianFrameP95Ms) }}</strong></div>
              <div><span>{{ copy.staticText.frameIntervalP99 }}</span><strong>{{ formatMs(engine.medianFrameP99Ms) }}</strong></div>
              <div v-if="selectedScenario === 'shared-renderer'"><span>{{ copy.staticText.sharedRendererCallbacks }}</span><strong>{{ engine.runs.length ? formatCount(engine.medianRenderCallbacks) : '—' }}</strong></div>
              <div><span>{{ copy.staticText.estimatedMissedRefreshes }}</span><strong>{{ engine.runs.length ? formatCount(engine.medianEstimatedMissedRefreshCount) : '—' }}</strong></div>
              <div><span>{{ copy.staticText.intervalThreshold.replace('{threshold}', formatMs(activeFrameThresholdMs, 1)) }}</span><strong>{{ engine.runs.length ? formatCount(engine.medianStretchedFrameCount) : '—' }}</strong></div>
              <div><span>{{ copy.staticText.longTasks }}</span><strong>{{ engine.runs.length ? formatCount(engine.medianLongTaskCount) : '—' }}</strong></div>
              <div><span>{{ copy.staticText.longAnimationFrames }}</span><strong>{{ engine.runs.length ? formatCount(engine.medianLongAnimationFrameCount) : '—' }}</strong></div>
              <div><span>{{ copy.staticText.cleanupProbe }}</span><strong>{{ !engine.runs.length || engine.cleanupPassed === null ? copy.staticText.notApplicable : engine.cleanupPassed ? copy.staticText.passed : copy.staticText.failed }}</strong></div>
            </div>
          </article>
        </div>

        <div v-if="!measuredResultsExist" class="browser-benchmarks__empty-result">
          <UiIcon icon="mdi-chart-timeline-variant-shimmer" />
          <p>{{ copy.staticText.resultsWillAppearHereAfterTheFirstMeasuredRepetition }}</p>
        </div>
      </div>
    </section>

    <section class="browser-benchmarks__methodology">
      <div class="browser-benchmarks__method-copy">
        <div class="browser-benchmarks__kicker">{{ copy.staticText.text04Methodology }}</div>
        <h2>{{ copy.staticText.compareTheWorkNotTheMarketing }}</h2>
        <p v-if="selectedScenario === 'shared-renderer'">{{ copy.staticText.everyEngineAnimatesOneScalarProgressValueFrom0To1TheSameRenderFunctionWritesTheSelectedNumberOfRealDomSvgOrCanvasTargetsSoTheRendererWorkloadStaysConsistentWhileTheAnimationEngineChanges }}</p>
        <p v-else-if="selectedScenario === 'engine-only'">{{ copy.staticText.everyEngineUpdatesTheSameNumberOfJavascriptObjectTargetsWithoutTouchingTheDomTheReportFocusesOnCallbackCadenceCompletionAndMainThreadDiagnosticsRatherThanRendererDuration }}</p>
        <p v-else>{{ copy.staticText.everyEngineUpdatesOpacityOnTheSameNumberOfRealDomElementsReFluxUsesAnAnimationInstancePerTargetGsapAndAnimeJsUseTheirMultiTargetApisTheDifferentNativeApiShapesArePartOfThisWorkloadAndAreDocumentedInTheExport }}</p>
      </div>
      <div class="browser-benchmarks__method-list">
        <div><span>01</span><p><strong>{{ copy.staticText.warmUp }}</strong> {{ copy.staticText.eachEngineGetsOneShortUnreportedRunBeforeMeasurement }}</p></div>
        <div><span>02</span><p><strong>{{ copy.staticText.text10Repetitions }}</strong> {{ copy.staticText.theRunOrderRotatesThroughThreePermutationsCompareResultsOnTheSameMachine }}</p></div>
        <div><span>03</span><p><strong>{{ copy.staticText.refreshCalibration }}</strong> {{ copy.staticText.theMedianRequestanimationframeIntervalEstimatesTheActiveCallbackCadenceItDoesNotQueryThePhysicalDisplayMode }}</p></div>
        <div><span>04</span><p><strong>{{ copy.staticText.percentiles }}</strong> {{ copy.staticText.frameIntervalP95P99AndMissedRefreshEstimatesShowTailBehaviorNotActualDisplayPresentation }}</p></div>
        <div><span>05</span><p><strong>{{ copy.staticText.localReport }}</strong> {{ copy.staticText.jsonIsCreatedInYourBrowserNoBenchmarkResultIsUploaded }}</p></div>
      </div>
    </section>

    <section class="browser-benchmarks__notes" aria-labelledby="benchmark-notes-title">
      <h2 id="benchmark-notes-title">{{ copy.staticText.versionsAndLimitations }}</h2>
      <div class="browser-benchmarks__library-links">
        <a v-for="engine in engines" :key="engine.id" :href="engine.href" target="_blank" rel="noopener noreferrer">
          <span>{{ engine.name }}</span><strong>{{ engine.version }}</strong><UiIcon icon="mdi-open-in-new" />
        </a>
      </div>
      <ul>
        <li>{{ copy.staticText.gsapAndAnimeJsAreLoadedOnDemandFromEsmShAtPinnedVersionsTheirDownloadTimeIsNotIncludedButResultsRequireTheCdnToBeReachable }}</li>
        <li>{{ copy.staticText.theSharedRendererScenarioComparesAScalarProgressCallbackEngineOnlyAndPerTargetDomScenariosCompareEachLibrarySTargetApiShapeReFluxCreatesOneAnimationPerTargetWhileGsapAndAnimeJsUseMultiTargetCalls }}</li>
        <li>{{ copy.staticText.frameCadenceIsCalibratedFromRequestanimationframeTimestampsMissedRefreshValuesAreEstimatesFromCallbackIntervalsNotProofOfDroppedPhysicalPresentations }}</li>
        <li>{{ copy.staticText.longTasksAndLongAnimationFramesDependOnBrowserSupportNAMeansTheRelevantObserverIsUnavailableNotThatTheBrowserExperiencedZeroWork }}</li>
        <li>{{ copy.staticText.resultsVaryWithBrowserRefreshRateOperatingSystemThermalStateExtensionsOtherTabsAndSystemLoadUseMultipleRunsAndCompareTheSameEnvironment }}</li>
      </ul>
    </section>
  </div>
</template>
