<script setup lang="ts">
import { computed } from 'vue';
import { useAppStore } from '../../stores/app';
import type { BenchmarkReport, RendererId, ScenarioId, OptionMeta } from '../../views/browser-benchmarks/types';

const props = defineProps<{
  scenarios: OptionMeta<ScenarioId>[];
  renderers: OptionMeta<RendererId>[];
  selectedScenarioMeta: OptionMeta<ScenarioId>;
  selectedRendererMeta: OptionMeta<RendererId | 'none'>;
  isRunning: boolean;
  repetitions: number;
  measuredResultsExist: boolean;
  statusMessage: string;
  progressStep: number;
  progressPercent: number;
  errorMessage: string | null;
  report: BenchmarkReport | null;
  estimatedRafCadenceHz: number;
  frameBudgetReferenceMs: number;
  calibrationSamples: number;
  formatMs: (value: number | null, digits?: number) => string;
}>();

const emit = defineEmits<{ run: []; cancel: []; export: [] }>();
const selectedScenario = defineModel<ScenarioId>('selectedScenario', { required: true });
const selectedRenderer = defineModel<RendererId>('selectedRenderer', { required: true });
const selectedTargetCount = defineModel<number>('selectedTargetCount', { required: true });
const selectedDurationMs = defineModel<number>('selectedDurationMs', { required: true });
const targetOptions = [100, 250, 500, 1000, 2500, 5000];
const durationOptions = [1000, 1500, 2000, 2500];
const appStore = useAppStore();
const copy = computed(() => appStore.app.view.browserBenchmarks);
</script>

<template>
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
      <button class="browser-benchmarks__primary-button" type="button" :disabled="isRunning" @click="emit('run')">
        <UiIcon :icon="isRunning ? 'mdi-loading' : 'mdi-play-circle-outline'" />
        {{ isRunning ? copy.staticText.benchmarkRunning : measuredResultsExist ? copy.staticText.runAgain : copy.staticText.runComparison }}
      </button>
      <button v-if="isRunning" class="browser-benchmarks__secondary-button" type="button" @click="emit('cancel')">{{ copy.staticText.cancel }}</button>
      <button class="browser-benchmarks__secondary-button" type="button" :disabled="!report && !measuredResultsExist" @click="emit('export')">
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
</template>
