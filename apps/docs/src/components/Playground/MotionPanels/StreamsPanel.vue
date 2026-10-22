<script setup lang="ts">
import { useAppStore } from '../../../stores/app';
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { retargetMotion, smoothStream, type MotionSample, type SmoothedStreamSample, type TimestampedValue } from '@lib';
import { bindStyle } from '@lib/dom';
import { map, shareReplay, Subject, type Subscription } from 'rxjs';
import MetricTile from '../../MetricTile.vue';


const appStore = useAppStore();
const copy = computed(() => appStore.app.view.motionPanelStreams);
const streamTargets = new Subject<number>();
const retargetedStream$ = streamTargets.pipe(
  retargetMotion({ initialValue: 36, stiffness: 220, damping: 28 }),
  shareReplay({ bufferSize: 1, refCount: true }),
);
const retargetedValue = ref(36);
const retargetedVelocity = ref(0);
const adapterPreview = ref<HTMLElement | null>(null);
let retargetedSubscription: Subscription | null = null;
let adapterSubscription: Subscription | null = null;

const streamInputs = new Subject<TimestampedValue<number>>();
const streamRawValue = ref(42);
const streamSmoothValue = ref(42);
const streamIsStale = ref(false);
const streamHistory = ref<number[]>([]);
let smoothingSubscription: Subscription | null = null;

const streamPath = computed(() => {
  const samples = streamHistory.value;
  if (samples.length === 0) return '';
  return samples.map((value, index) => {
    const x = samples.length === 1 ? 0 : (index / (samples.length - 1)) * 320;
    const y = 108 - Math.min(100, Math.max(0, value)) * 0.96;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(' ');
});

function startStreamDemo(): void {
  if (retargetedSubscription || smoothingSubscription) return;
  streamHistory.value = [];
  streamIsStale.value = false;
  streamSmoothValue.value = streamRawValue.value;
  retargetedSubscription = retargetedStream$.subscribe((sample: MotionSample) => {
    retargetedValue.value = sample.value;
    retargetedVelocity.value = sample.velocity;
  });
  if (adapterPreview.value) {
    adapterSubscription = bindStyle(adapterPreview.value, retargetedStream$.pipe(map((sample) => ({
      transform: `translateX(${Math.min(166, Math.max(0, sample.value * 1.35))}px)`,
      opacity: String(Math.min(1, Math.max(0.35, 0.35 + sample.value / 150))),
    }))));
  }
  smoothingSubscription = streamInputs.pipe(smoothStream<number>({
    targetLatency: 100,
    staleAfter: 1_200,
    maxBufferSize: 80,
    interpolate: (from, to, progress) => from + (to - from) * progress,
  })).subscribe((sample: SmoothedStreamSample<number>) => {
    streamSmoothValue.value = sample.value;
    streamIsStale.value = sample.stale;
    streamHistory.value = [...streamHistory.value, sample.value].slice(-64);
  });
  streamTargets.next(streamRawValue.value);
  streamInputs.next({ timestamp: performance.now(), value: streamRawValue.value });
}

function stopStreamDemo(): void {
  adapterSubscription?.unsubscribe();
  adapterSubscription = null;
  retargetedSubscription?.unsubscribe();
  retargetedSubscription = null;
  smoothingSubscription?.unsubscribe();
  smoothingSubscription = null;
}

function sendStreamValue(value: number): void {
  streamRawValue.value = value;
  const timestamp = performance.now();
  streamInputs.next({ timestamp, value });
  streamTargets.next(value);
}

const retargetStreamCode = [
  "import { map, Subject, shareReplay } from 'rxjs';",
  "import { retargetMotion } from '@re-code/flux';",
  "import { bindStyle } from '@re-code/flux/dom';",
  '',
  'const targets$ = new Subject<number>();',
  'const motion$ = targets$.pipe(',
  '  retargetMotion({ initialValue: 0, stiffness: 220, damping: 28 }),',
  '  shareReplay({ bufferSize: 1, refCount: true }),',
  ');',
  'const binding = bindStyle(element, motion$.pipe(',
  '  map(({ value }) => ({ transform: `translateX(${value}px)` })),',
  '));',
  '',
  'targets$.next(120); // Retarget without a positional jump.',
  '// Call binding.unsubscribe() when the element is removed.',
].join('\n');
const smoothStreamCode = `import { smoothStream } from '@re-code/flux';

const smooth$ = serverSamples$.pipe(
  smoothStream({
    targetLatency: 100,
    staleAfter: 1_200,
    maxBufferSize: 80,
    interpolate: (from, to, progress) => from + (to - from) * progress,
  }),
);

// Each input timestamp must share performance.now()'s time origin.
// The output is sampled on the shared RAF clock; it does not extrapolate.`;

onMounted(async () => {
  await nextTick();
  startStreamDemo();
});
onBeforeUnmount(() => {
  stopStreamDemo();
  streamInputs.complete();
  streamTargets.complete();
});
</script>

<template>
  <UiRow>
  <UiCol cols="12" lg="6">
    <UiCard variant="outlined" class="motion-playground-card h-100">
      <UiCardTitle class="pa-4">
        <div class="text-overline text-secondary">{{ copy.staticText.text05DECLARATIVERETARGETING }}</div>
        <h2 class="text-h6 ma-0">{{ copy.staticText.retargetFromAnObservable }}</h2>
        <p class="text-body-2 text-medium-emphasis mt-2 mb-0">{{ copy.staticText.eachTargetEntersOneRxJSStreamThedf2d23 }}</p>
      </UiCardTitle>
      <UiDivider />
      <UiCardText class="pa-4 pa-md-5">
        <div class="stream-adapter-stage mb-4" :aria-label="copy.staticText.domStyleAdapterPreview">
          <div ref="adapterPreview" class="stream-adapter-preview">{{ copy.staticText.re }}</div>
        </div>
        <div class="d-flex flex-wrap ga-2 mb-4">
          <UiButton v-for="target in [8, 28, 52, 76, 96]" :key="target" variant="tonal" color="primary" @click="sendStreamValue(target)">{{ copy.staticText.to }} {{ target }}</UiButton>
        </div>
        <UiRow dense class="mb-4">
          <UiCol cols="6"><MetricTile :label="copy.staticText.motionValue" :value="retargetedValue.toFixed(2)" /></UiCol>
          <UiCol cols="6"><MetricTile :label="copy.staticText.velocity" :value="`${retargetedVelocity.toFixed(1)} units/s`" /></UiCol>
        </UiRow>
        <p class="text-caption text-medium-emphasis mb-2">{{ copy.staticText.thePreviewIsAnimatedBy }} <code>bindStyle()</code> {{ copy.staticText.from }} <code>@re-code/flux/dom</code>{{ copy.staticText.notByVueSInlineStyleBinding }}</p>
        <pre class="motion-code"><code>{{ retargetStreamCode }}</code></pre>
      </UiCardText>
    </UiCard>
  </UiCol>
  <UiCol cols="12" lg="6">
    <UiCard variant="outlined" class="motion-playground-card h-100">
      <UiCardTitle class="pa-4">
        <div class="text-overline text-primary">{{ copy.staticText.text06REALTIMESTREAMS }}</div>
        <h2 class="text-h6 ma-0">{{ copy.staticText.smoothIrregularSamples }}</h2>
        <p class="text-body-2 text-medium-emphasis mt-2 mb-0">{{ copy.staticText.sendValuesAtIrregularTimesTheGraphec47eb }}</p>
      </UiCardTitle>
      <UiDivider />
      <UiCardText class="pa-4 pa-md-5">
        <div class="stream-chart mb-3">
          <svg viewBox="0 0 320 120" preserveAspectRatio="none" role="img" :aria-label="copy.staticText.smoothedStreamHistoryAriaLabel.replace('{raw}', String(streamRawValue)).replace('{smoothed}', streamSmoothValue.toFixed(1))">
            <line v-for="y in [12, 36, 60, 84, 108]" :key="y" x1="0" :y1="y" x2="320" :y2="y" class="stream-chart__grid" />
            <line x1="0" :y1="108 - streamRawValue * 0.96" x2="320" :y2="108 - streamRawValue * 0.96" class="stream-chart__target" />
            <polyline v-if="streamPath" :points="streamPath" class="stream-chart__line" />
          </svg>
        </div>
        <div class="d-flex flex-wrap align-center justify-space-between ga-2 mb-4">
          <div class="text-caption text-medium-emphasis">{{ copy.staticText.dashedLatestInputSolidFrameSmoothedValue }}</div>
          <UiChip size="small" :color="streamIsStale ? 'warning' : 'success'" variant="tonal">{{ streamIsStale ? copy.staticText.inputStale : copy.staticText.receivingHolding }}</UiChip>
        </div>
        <div class="d-flex flex-wrap ga-2 mb-4">
          <UiButton v-for="value in [12, 88, 35, 96, 52, 18]" :key="value" variant="tonal" color="secondary" @click="sendStreamValue(value)">{{ copy.staticText.send }} {{ value }}</UiButton>
        </div>
        <UiRow dense class="mb-4">
          <UiCol cols="6"><MetricTile :label="copy.staticText.latestInput" :value="streamRawValue.toFixed(1)" /></UiCol>
          <UiCol cols="6"><MetricTile :label="copy.staticText.smoothedOutput" :value="streamSmoothValue.toFixed(1)" /></UiCol>
        </UiRow>
        <pre class="motion-code"><code>{{ smoothStreamCode }}</code></pre>
      </UiCardText>
    </UiCard>
  </UiCol>
</UiRow>

</template>
