<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { adaptiveTween, type AdaptiveTweenSample, type TimestampedValue } from '@lib';
import { Subject, type Subscription } from 'rxjs';
import MetricTile from '../../MetricTile.vue';

const adaptiveInputs = new Subject<TimestampedValue<number>>();
const adaptiveValue = ref(50);
const adaptiveCadence = ref(1000 / 30);
const adaptiveDuration = ref(50);
const adaptiveStale = ref(false);
const adaptiveHistory = ref<number[]>([]);
let adaptiveTimers: ReturnType<typeof setTimeout>[] = [];
let adaptiveSubscription: Subscription | null = null;

const adaptivePath = computed(() => {
  const samples = adaptiveHistory.value;
  if (samples.length === 0) return '';
  return samples.map((value, index) => {
    const x = samples.length === 1 ? 0 : (index / (samples.length - 1)) * 320;
    const y = 108 - Math.min(100, Math.max(0, value)) * 0.96;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(' ');
});

function ensureAdaptiveSubscription(): void {
  if (adaptiveSubscription) return;
  adaptiveSubscription = adaptiveInputs.pipe(adaptiveTween<number>({
    minDuration: 20,
    maxDuration: 220,
    durationFactor: 1.5,
    cadenceSmoothing: 0.3,
    initialCadence: 1000 / 30,
    staleAfter: 1_000,
    interpolate: (from, to, progress) => from + (to - from) * progress,
  })).subscribe((sample: AdaptiveTweenSample<number>) => {
    adaptiveValue.value = sample.value;
    adaptiveCadence.value = sample.estimatedCadence;
    adaptiveDuration.value = sample.targetDuration;
    adaptiveStale.value = sample.stale;
    adaptiveHistory.value = [...adaptiveHistory.value, sample.value].slice(-64);
  });
}

function sendAdaptivePattern(pattern: 'fast' | 'slow' | 'jitter'): void {
  stopAdaptiveDemo();
  ensureAdaptiveSubscription();
  adaptiveHistory.value = [];
  adaptiveStale.value = false;
  const intervals = Array.from({ length: 16 }, (_, index) => {
    if (pattern === 'fast') return 16.67;
    if (pattern === 'slow') return 72;
    return [18, 46, 24, 68, 16, 52, 28, 82][index % 8] ?? 33;
  });
  adaptiveInputs.next({ timestamp: performance.now(), value: 50 });
  let elapsed = 0;
  intervals.forEach((interval, index) => {
    elapsed += interval;
    const value = 50 + 38 * Math.sin((index + 1) * 0.62) + ((index % 3) - 1) * 7;
    const timer = setTimeout(() => {
      adaptiveInputs.next({ timestamp: performance.now(), value: Math.min(100, Math.max(0, value)) });
      adaptiveTimers = adaptiveTimers.filter((pending) => pending !== timer);
    }, elapsed);
    adaptiveTimers.push(timer);
  });
}

function stopAdaptiveDemo(): void {
  adaptiveTimers.forEach((timer) => clearTimeout(timer));
  adaptiveTimers = [];
  adaptiveSubscription?.unsubscribe();
  adaptiveSubscription = null;
}

const adaptiveTweenCode = `import { adaptiveTween } from '@re-code/flux';

const values$ = timestampedSamples$.pipe(
  adaptiveTween({
    minDuration: 20,
    maxDuration: 220,
    durationFactor: 1.5,
    cadenceSmoothing: 0.3,
    interpolate: (from, to, progress) => from + (to - from) * progress,
  }),
);

// Each output includes estimatedCadence and targetDuration.
// Timestamps must use the same monotonic origin as requestAnimationFrame.`;

onMounted(() => ensureAdaptiveSubscription());
onBeforeUnmount(() => {
  stopAdaptiveDemo();
  adaptiveInputs.complete();
});
</script>

<template>
  <UiCard variant="outlined" class="motion-playground-card">
  <UiCardTitle class="pa-4">
    <div class="text-overline text-primary">07 / CADENCE-AWARE INTERPOLATION</div>
    <h2 class="text-h6 ma-0">Adaptive tween duration</h2>
    <p class="text-body-2 text-medium-emphasis mt-2 mb-0">Compare fast, slow and irregular timestamped streams. The operator estimates actual sample cadence and adapts each transition duration. Samples are delivered over time, not as a single batch.</p>
  </UiCardTitle>
  <UiDivider />
  <UiCardText class="pa-4 pa-md-5">
    <div class="stream-chart mb-4">
      <svg viewBox="0 0 320 120" preserveAspectRatio="none" role="img" :aria-label="`Adaptive tween history. Current value ${adaptiveValue.toFixed(1)}. Estimated cadence ${adaptiveCadence.toFixed(1)} milliseconds. Tween duration ${adaptiveDuration.toFixed(1)} milliseconds.`">
        <line v-for="y in [12, 36, 60, 84, 108]" :key="y" x1="0" :y1="y" x2="320" :y2="y" class="stream-chart__grid" />
        <polyline v-if="adaptivePath" :points="adaptivePath" class="stream-chart__line" />
        <circle v-if="adaptivePath" cx="310" :cy="108 - Math.min(100, Math.max(0, adaptiveValue)) * 0.96" r="3.5" class="adaptive-chart__point" />
      </svg>
    </div>
    <div class="d-flex flex-wrap ga-2 mb-4">
      <UiButton color="primary" variant="tonal" @click="sendAdaptivePattern('fast')">Simulate fast stream</UiButton>
      <UiButton color="secondary" variant="tonal" @click="sendAdaptivePattern('slow')">Simulate slow stream</UiButton>
      <UiButton variant="outlined" color="primary" @click="sendAdaptivePattern('jitter')">Simulate jitter</UiButton>
      <UiChip :color="adaptiveStale ? 'warning' : 'success'" variant="tonal">{{ adaptiveStale ? 'Input stale' : 'Sampling' }}</UiChip>
    </div>
    <UiRow dense class="mb-4">
      <UiCol cols="6" md="3"><MetricTile label="Value" :value="adaptiveValue.toFixed(2)" /></UiCol>
      <UiCol cols="6" md="3"><MetricTile label="Estimated cadence" :value="`${adaptiveCadence.toFixed(1)} ms`" /></UiCol>
      <UiCol cols="6" md="3"><MetricTile label="Tween duration" :value="`${adaptiveDuration.toFixed(1)} ms`" /></UiCol>
      <UiCol cols="6" md="3"><MetricTile label="Buffer policy" value="Bounded / no prediction" /></UiCol>
    </UiRow>
    <UiAlert density="compact" variant="tonal" type="info" class="mb-4">adaptiveTween adapts the transition duration to the measured cadence. It preserves the rendered value when retargeting, but does not preserve physical velocity; use retargetMotion() for spring momentum.</UiAlert>
    <pre class="motion-code"><code>{{ adaptiveTweenCode }}</code></pre>
  </UiCardText>
</UiCard>

</template>
