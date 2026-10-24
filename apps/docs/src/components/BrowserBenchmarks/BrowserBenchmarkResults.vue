<script setup lang="ts">
import { computed } from 'vue';
import { useAppStore } from '../../stores/app';
import type { EngineId, EngineStatus, EngineSummary, ScenarioId } from '../../views/browser-benchmarks/types';

withDefaults(defineProps<{
  summaries: EngineSummary[];
  engineStatus: Record<EngineId, EngineStatus>;
  selectedScenario: ScenarioId;
  repetitions: number;
  activeFrameThresholdMs: number;
  statusLabel: string;
  isRunning: boolean;
  measuredResultsExist: boolean;
  formatMs: (value: number | null, digits?: number) => string;
  formatCount: (value: number | null) => string;
}>(), {});
const appStore = useAppStore();
const copy = computed(() => appStore.app.view.browserBenchmarks);
</script>

<template>
  <section class="browser-benchmarks__panel browser-benchmarks__results-panel">
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
  </section>
</template>
