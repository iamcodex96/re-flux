<script setup lang="ts">
import { computed } from 'vue';
import { useAppStore } from '../stores/app';
import BrowserBenchmarkSetup from '../components/BrowserBenchmarks/BrowserBenchmarkSetup.vue';
import BrowserBenchmarkResults from '../components/BrowserBenchmarks/BrowserBenchmarkResults.vue';
import BrowserBenchmarkMethodology from '../components/BrowserBenchmarks/BrowserBenchmarkMethodology.vue';
import { useBrowserBenchmarks } from './browser-benchmarks/useBrowserBenchmarks';

const appStore = useAppStore();
const copy = computed(() => appStore.app.view.browserBenchmarks);
const {
  engines, scenarios, renderers, repetitions, selectedScenario, selectedRenderer,
  selectedTargetCount, selectedDurationMs, selectedScenarioMeta, selectedRendererMeta,
  activeRenderer, activeFrameThresholdMs, estimatedRafCadenceHz, frameBudgetReferenceMs,
  calibrationSamples, statusMessage, errorMessage, progressStep, progressPercent,
  isRunning, engineStatus, report, summaries, measuredResultsExist, statusLabel,
  stageHost, runComparison, cancelBenchmark, formatMs, formatCount, barWidth, downloadReport,
} = useBrowserBenchmarks();
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

    <BrowserBenchmarkSetup
      v-model:selected-scenario="selectedScenario"
      v-model:selected-renderer="selectedRenderer"
      v-model:selected-target-count="selectedTargetCount"
      v-model:selected-duration-ms="selectedDurationMs"
      :scenarios="scenarios"
      :renderers="renderers"
      :selected-scenario-meta="selectedScenarioMeta"
      :selected-renderer-meta="selectedRendererMeta"
      :is-running="isRunning"
      :repetitions="repetitions"
      :measured-results-exist="measuredResultsExist"
      :status-message="statusMessage"
      :progress-step="progressStep"
      :progress-percent="progressPercent"
      :error-message="errorMessage"
      :report="report"
      :estimated-raf-cadence-hz="estimatedRafCadenceHz"
      :frame-budget-reference-ms="frameBudgetReferenceMs"
      :calibration-samples="calibrationSamples"
      :format-ms="formatMs"
      @run="runComparison"
      @cancel="cancelBenchmark"
      @export="downloadReport"
    />

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

      <BrowserBenchmarkResults
        :summaries="summaries"
        :engine-status="engineStatus"
        :selected-scenario="selectedScenario"
        :repetitions="repetitions"
        :active-frame-threshold-ms="activeFrameThresholdMs"
        :status-label="statusLabel"
        :is-running="isRunning"
        :measured-results-exist="measuredResultsExist"
        :format-ms="formatMs"
        :format-count="formatCount"
      />
    </section>

    <BrowserBenchmarkMethodology :selected-scenario="selectedScenario" :engines="engines" />
  </div>
</template>
