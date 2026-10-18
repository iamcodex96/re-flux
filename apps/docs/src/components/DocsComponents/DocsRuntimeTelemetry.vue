<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { frameCoordinator, RetargetableMotion } from '@lib';
import type { Subscription } from 'rxjs';
import { useAppStore } from '../../stores/app';
import type { FrameCoordinatorMetrics } from '@lib';

const appStore = useAppStore();
const copy = computed(() => appStore.app.view.docs);
const text = computed(() => copy.value.runtimeTelemetry);
const metrics = ref<FrameCoordinatorMetrics>({
  totalFrames: 0,
  lastFrameWorkMs: 0,
  averageFrameWorkMs: 0,
  maxFrameWorkMs: 0,
  activeFrameSubscribers: 0,
  pendingReadTasks: 0,
  pendingWriteTasks: 0,
  clockActive: false,
});
const value = ref(0);
const history = ref<number[]>([]);
const isRunning = ref(false);
const hasMeasuredSample = ref(false);
const sampleState = computed(() => isRunning.value ? text.value.running : text.value.idle);
const bars = computed(() => history.value.slice(-44));
let motion: RetargetableMotion | undefined;
let valueSub: Subscription | undefined;
let metricsSub: Subscription | undefined;
let target = 160;

onMounted(() => {
  motion = new RetargetableMotion({
    initialValue: 0,
    stiffness: 220,
    damping: 26,
    mass: 1.1,
    onUpdate: (sample) => { value.value = sample.value; },
    onComplete: () => { isRunning.value = false; },
  });
  valueSub = motion.value$.subscribe((next) => { value.value = next; });
  metricsSub = frameCoordinator.metrics$.subscribe((snapshot) => {
    metrics.value = snapshot;
    if (isRunning.value && snapshot.totalFrames > 0 && snapshot.clockActive) {
      hasMeasuredSample.value = true;
      history.value = [...history.value, snapshot.lastFrameWorkMs].slice(-44);
    }
  });
});

function runSample(): void {
  if (!motion) return;
  target = target === 160 ? -120 : 160;
  history.value = [];
  hasMeasuredSample.value = false;
  isRunning.value = true;
  motion.to(target, { stiffness: 220, damping: 26, mass: 1.1 });
}

function pauseSample(): void {
  motion?.pause();
  isRunning.value = false;
}

function resetHistory(): void {
  history.value = [];
}

onBeforeUnmount(() => {
  metricsSub?.unsubscribe();
  valueSub?.unsubscribe();
  motion?.dispose();
});
</script>

<template>
  <section id="runtime-measurements" class="docs-anchor docs-runtime-telemetry">
    <header class="docs-section-heading">
      <span class="docs-section-heading__icon"><UiIcon icon="mdi-chart-line-variant" size="22" /></span>
      <div><p class="docs-section-eyebrow">{{ text.eyebrow }}</p><h2>{{ text.title }}</h2></div>
    </header>
    <p class="docs-section-intro">{{ text.description }}</p>

    <div class="docs-runtime-telemetry__panel">
      <div class="docs-runtime-telemetry__toolbar">
        <div><span class="docs-runtime-telemetry__live-dot" :class="{ 'docs-runtime-telemetry__live-dot--active': isRunning }" /><span>{{ text.status }}: <strong>{{ sampleState }}</strong></span></div>
        <div class="docs-runtime-telemetry__actions">
          <button type="button" class="docs-inline-button" @click="runSample"><UiIcon icon="mdi-play" size="14" /> {{ text.run }}</button>
          <button type="button" class="docs-inline-button" @click="pauseSample"><UiIcon icon="mdi-pause" size="14" /> {{ text.pause }}</button>
          <button type="button" class="docs-inline-button" @click="resetHistory"><UiIcon icon="mdi-refresh" size="14" /> {{ text.clearHistory }}</button>
        </div>
      </div>

      <div class="docs-runtime-telemetry__metrics">
        <div><span>{{ text.lastFrame }}</span><strong>{{ hasMeasuredSample ? `${metrics.lastFrameWorkMs.toFixed(3)} ms` : '—' }}</strong></div>
        <div><span>{{ text.averageFrame }}</span><strong>{{ hasMeasuredSample ? `${metrics.averageFrameWorkMs.toFixed(3)} ms` : '—' }}</strong></div>
        <div><span>{{ text.maxFrame }}</span><strong>{{ hasMeasuredSample ? `${metrics.maxFrameWorkMs.toFixed(3)} ms` : '—' }}</strong></div>
        <div><span>{{ text.activeSubscribers }}</span><strong>{{ metrics.activeFrameSubscribers }}</strong></div>
      </div>

      <div class="docs-runtime-telemetry__chart" role="img" :aria-label="text.chartAriaLabel">
        <div v-if="history.length === 0" class="docs-runtime-telemetry__empty">{{ text.chartEmpty }}</div>
        <div v-else class="docs-runtime-telemetry__bars" aria-hidden="true">
          <span v-for="(sample, index) in bars" :key="`${index}-${sample}`" :style="{ height: `${Math.max(4, Math.min(100, sample / Math.max(metrics.maxFrameWorkMs, 0.001) * 100))}%` }" />
        </div>
      </div>
      <p class="docs-runtime-telemetry__note">{{ text.note }}</p>
    </div>

    <section class="docs-paradigm-shift" aria-labelledby="docs-paradigm-title">
      <div class="docs-paradigm-shift__heading"><p class="docs-section-eyebrow">{{ text.paradigmEyebrow }}</p><h3 id="docs-paradigm-title">{{ text.paradigmTitle }}</h3></div>
      <div class="docs-paradigm-shift__grid">
        <article class="docs-paradigm-card docs-paradigm-card--active">
          <div class="docs-paradigm-card__title"><h4>{{ text.refluxModel }}</h4><span>{{ text.refluxTag }}</span></div>
          <dl><div><dt>{{ text.compositionLabel }}</dt><dd>{{ text.compositionDescription }}</dd></div><div><dt>{{ text.renderTargetsLabel }}</dt><dd>{{ text.renderTargetsDescription }}</dd></div><div><dt>{{ text.lifecycleLabel }}</dt><dd>{{ text.lifecycleDescription }}</dd></div></dl>
        </article>
        <article class="docs-paradigm-card">
          <div class="docs-paradigm-card__title"><h4>{{ text.imperativeModel }}</h4><span>{{ text.comparisonTag }}</span></div>
          <dl><div><dt>{{ text.compositionLabel }}</dt><dd>{{ text.imperativeCompositionDescription }}</dd></div><div><dt>{{ text.renderTargetsLabel }}</dt><dd>{{ text.imperativeTargetsDescription }}</dd></div><div><dt>{{ text.lifecycleLabel }}</dt><dd>{{ text.imperativeLifecycleDescription }}</dd></div></dl>
        </article>
      </div>
      <p class="docs-paradigm-shift__footnote">{{ text.paradigmNote }}</p>
    </section>
  </section>
</template>
