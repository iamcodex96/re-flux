<script setup lang="ts">
import LabeledSlider from '../components/LabeledSlider.vue';
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue';
import { keyframes, stagger, sequence as composeSequence, parallel, staggered, type AnimationState, type Keyframes, type Timeline } from '@lib';
import { animate, type DOMAnimation } from '@lib/dom';

const sequenceCode = `import { keyframes } from '@re-code/flux';

const motion = keyframes({
  duration: 900,
  keyframes: [
    { value: 0, offset: 0 },
    { value: 140, offset: 0.35, easing: 'easeOutCubic' },
    { value: 70, offset: 0.68, easing: 'easeInOutQuad' },
    { value: 180, offset: 1 },
  ],
});

motion.play();
await motion;`;

const domCode = `import { stagger } from '@re-code/flux';
import { animate } from '@re-code/flux/dom';

const entrance = animate('.demo-item', {
  properties: {
    opacity: {
      values: [0.2, 1],
      duration: 280,
      easing: 'easeOutQuad',
    },
    transform: {
      keyframes: [
        { value: 'translateY(14px) scale(0.96)', offset: 0, easing: 'easeOutCubic' },
        { value: 'translateY(0px) scale(1)', offset: 1 },
      ],
      duration: 550,
      delay: 60,
    },
    backgroundColor: {
      values: ['rgb(75, 70, 130)', 'rgb(105, 95, 210)'],
      duration: 420,
      delay: 90,
    },
  },
  // A global duration/easing is optional when each property defines its own.
  stagger: stagger(85, { from: 'center', easing: 'easeOutCubic' }),
});

entrance.play();
await entrance;
entrance.dispose(); // Restores original inline styles and releases bindings.`;

const sequence: Keyframes<number> = keyframes({
  duration: 900,
  easing: 'linear',
  keyframes: [
    { value: 0, offset: 0 },
    { value: 140, offset: 0.35, easing: 'easeOutCubic' },
    { value: 70, offset: 0.68, easing: 'easeInOutQuad' },
    { value: 180, offset: 1 },
  ],
});
const sequenceValue = ref(sequence.value$.value);
const sequenceProgress = ref(0);
const sequenceState = ref<AnimationState>(sequence.state$.value);
const sequenceSubscription = sequence.value$.subscribe((value) => { sequenceValue.value = value; });
const progressSubscription = sequence.progress$.subscribe((value) => { sequenceProgress.value = value; });
const stateSubscription = sequence.state$.subscribe((state) => { sequenceState.value = state; });
 
const sequenceLeft = computed(() => `${8 + (Math.max(0, Math.min(200, sequenceValue.value)) / 200) * 84}%`);

const domAnimation = shallowRef<DOMAnimation | null>(null);
const domState = ref<'ready' | 'playing' | 'completed'>('ready');
const domDuration = ref(550);
const domStagger = ref(85);
const demoCount = 5;

function createDOMAnimation(): void {
  domAnimation.value?.dispose();
  domAnimation.value = animate('.api-demo-item', {
    properties: {
      opacity: {
        values: [0.2, 1],
        duration: Math.max(100, Math.round(domDuration.value * 0.55)),
        easing: 'easeOutQuad',
      },
      transform: {
        keyframes: [
          { value: 'translateY(14px) scale(0.96)', offset: 0, easing: 'easeOutCubic' },
          { value: 'translateY(0px) scale(1)', offset: 1 },
        ],
        duration: domDuration.value,
        delay: 60,
      },
      backgroundColor: {
        values: ['rgb(75, 70, 130)', 'rgb(105, 95, 210)'],
        duration: Math.max(100, Math.round(domDuration.value * 0.78)),
        delay: 90,
      },
    },
    stagger: stagger(domStagger.value, { from: 'center', easing: 'easeOutCubic' }),
    onStart: () => { domState.value = 'playing'; },
    onComplete: () => { domState.value = 'completed'; },
    onStop: () => { domState.value = 'ready'; },
  });
  domState.value = 'ready';
}

function playDOMAnimation(): void {
  if (!domAnimation.value) createDOMAnimation();
  domAnimation.value?.play();
}

function resetDOMAnimation(): void {
  createDOMAnimation();
}

function disposeDOMAnimation(): void {
  domAnimation.value?.dispose();
  domAnimation.value = null;
  domState.value = 'ready';
}

function seekSequence(value: number | number[]): void {
  const progress = Array.isArray(value) ? value[0] ?? 0 : value;
  sequence.seek(progress * sequence.duration);
}
function playSequence(): void { sequence.play(); }
function restartSequence(): void { sequence.restart(); }
function stopSequence(): void { sequence.stop(); }

type CompositionMode = 'sequence' | 'parallel' | 'staggered';
const compositionMode = ref<CompositionMode>('staggered');
const compositionProgress = ref([0, 0, 0]);
const compositionSegments = ref<Array<{ startTime: number; endTime: number }>>([]);
const compositionDuration = ref(0);
const compositionCode = computed(() => ({
  sequence: `import { keyframes, sequence } from '@re-code/flux';

const items = [
  keyframes({ duration: 460, keyframes: [{ value: 0 }, { value: 1 }] }),
  keyframes({ duration: 620, keyframes: [{ value: 0 }, { value: 1 }] }),
  keyframes({ duration: 540, keyframes: [{ value: 0 }, { value: 1 }] }),
];

sequence(items).play();`,
  parallel: `import { keyframes, parallel } from '@re-code/flux';

const items = [
  keyframes({ duration: 460, keyframes: [{ value: 0 }, { value: 1 }] }),
  keyframes({ duration: 620, keyframes: [{ value: 0 }, { value: 1 }] }),
  keyframes({ duration: 540, keyframes: [{ value: 0 }, { value: 1 }] }),
];

parallel(items).play();`,
  staggered: `import { keyframes, staggered } from '@re-code/flux';

const items = [first, second, third];

staggered(items, 100, { from: 'center' }).play();`,
}[compositionMode.value]));
let compositionTimeline: Timeline | null = null;
let compositionItems: Keyframes<number>[] = [];
let compositionSubscriptions: Array<{ unsubscribe(): void }> = [];

function playComposition(mode: CompositionMode): void {
  compositionTimeline?.stop();
  compositionSubscriptions.forEach((subscription) => subscription.unsubscribe());
  compositionItems = [460, 620, 540].map((duration) => keyframes({
    duration,
    easing: 'easeOutCubic',
    keyframes: [{ value: 0, offset: 0 }, { value: 1, offset: 1 }],
  }));
  compositionProgress.value = [0, 0, 0];
  compositionItems.forEach((item, index) => {
    compositionSubscriptions.push(item.progress$.subscribe((progress) => {
      compositionProgress.value = compositionProgress.value.map((current, currentIndex) => currentIndex === index ? progress : current);
    }));
  });
  if (mode === 'sequence') compositionTimeline = composeSequence(compositionItems);
  else if (mode === 'parallel') compositionTimeline = parallel(compositionItems);
  else compositionTimeline = staggered(compositionItems, 100, { from: 'center' });
  compositionMode.value = mode;
  compositionSegments.value = compositionTimeline.segments.map(({ startTime, endTime }) => ({ startTime, endTime }));
  compositionDuration.value = compositionTimeline.duration;
  compositionTimeline.play();
}

onMounted(() => createDOMAnimation());
onBeforeUnmount(() => {
  disposeDOMAnimation();
  sequence.stop();
  compositionTimeline?.stop();
  compositionSubscriptions.forEach((subscription) => subscription.unsubscribe());
  sequenceSubscription.unsubscribe();
  progressSubscription.unsubscribe();
  stateSubscription.unsubscribe();
});
</script>

<template>
  <v-container class="py-8 py-md-12 api-playground" style="max-width: 1200px">
<v-row align="stretch">
      <v-col cols="12" lg="5">
        <v-card variant="outlined" rounded="lg" class="h-100">
          <div class="api-example-header">
            <div class="api-example-eyebrow text-primary">01 / HEADLESS VALUES</div>
            <h2 class="api-example-title">Typed keyframes</h2>
            <p class="api-example-description">Offsets are normalized to 0–1. Each keyframe can override the easing used by its outgoing segment.</p>
          </div>
          <v-divider />
          <v-card-text class="pa-4 pa-md-5">
            <div class="api-keyframe-stage mb-4">
              <div class="api-keyframe-grid" />
              <div class="api-keyframe-track" />
              <div class="api-keyframe-object" :style="{ left: sequenceLeft }">{{ Math.round(sequenceValue) }}</div>
              <div class="api-keyframe-markers"><span>0</span><span>140</span><span>70</span><span>180</span></div>
            </div>
            <v-row dense class="mb-3">
              <v-col cols="4"><v-sheet color="surface-variant" rounded="lg" class="pa-3"><div class="text-caption text-medium-emphasis">Value</div><div class="text-body-1 font-weight-bold">{{ sequenceValue.toFixed(1) }}</div></v-sheet></v-col>
              <v-col cols="4"><v-sheet color="surface-variant" rounded="lg" class="pa-3"><div class="text-caption text-medium-emphasis">Progress</div><div class="text-body-1 font-weight-bold">{{ Math.round(sequenceProgress * 100) }}%</div></v-sheet></v-col>
              <v-col cols="4"><v-sheet color="surface-variant" rounded="lg" class="pa-3"><div class="text-caption text-medium-emphasis">State</div><div class="text-body-1 font-weight-bold">{{ sequenceState }}</div></v-sheet></v-col>
            </v-row>
            <LabeledSlider :model-value="sequenceProgress" label="Seek keyframe sequence" :min="0" :max="1" :step="0.01" class="mb-3" @update:model-value="seekSequence" />
            <div class="d-flex flex-wrap ga-2">
              <v-btn color="primary" prepend-icon="mdi-play" @click="playSequence">Play</v-btn>
              <v-btn color="primary" variant="outlined" prepend-icon="mdi-restart" @click="restartSequence">Restart</v-btn>
              <v-btn variant="outlined" prepend-icon="mdi-stop" @click="stopSequence">Stop</v-btn>
            </div>
            <v-expansion-panels variant="accordion" class="mt-5">
              <v-expansion-panel title="View the TypeScript">
                <v-expansion-panel-text><pre class="api-code"><code>{{ sequenceCode }}</code></pre></v-expansion-panel-text>
              </v-expansion-panel>
            </v-expansion-panels>
          </v-card-text>
        </v-card>
      </v-col>

      <v-col cols="12" lg="7">
        <v-card variant="outlined" rounded="lg" class="h-100">
          <div class="api-example-header">
            <div class="api-example-eyebrow text-secondary">02 / DOM TARGETS</div>
            <h2 class="api-example-title">Selectors, arrays &amp; stagger</h2>
            <p class="api-example-description">Pass a selector, an element, or an iterable such as a NodeList. Every target and property shares one Timeline.</p>
          </div>
          <v-divider />
          <v-card-text class="pa-4 pa-md-5">
            <div class="api-demo-stage mb-4" aria-label="Five elements animated by one selector">
              <div v-for="index in demoCount" :key="index" class="api-demo-item" :data-index="index">{{ String(index).padStart(2, '0') }}</div>
            </div>
            <div class="d-flex flex-wrap align-center ga-2 mb-4">
              <v-chip size="small" variant="tonal" color="primary">selector: .api-demo-item</v-chip>
              <v-chip size="small" variant="tonal" color="secondary">property-specific timing</v-chip>
              <v-chip size="small" variant="tonal" :color="domState === 'playing' ? 'success' : 'default'" role="status" aria-live="polite">{{ domState }}</v-chip>
            </div>
            <v-row dense class="mb-2">
              <v-col cols="6"><LabeledSlider v-model="domDuration" label="Duration (ms)" :min="200" :max="1400" :step="50" /></v-col>
              <v-col cols="6"><LabeledSlider v-model="domStagger" label="Stagger (ms)" :min="0" :max="180" :step="5" /></v-col>
            </v-row>
            <div class="d-flex flex-wrap ga-2 mb-4">
              <v-btn color="primary" prepend-icon="mdi-play" @click="playDOMAnimation">Play</v-btn>
              <v-btn variant="outlined" prepend-icon="mdi-restart" @click="resetDOMAnimation">Apply &amp; reset</v-btn>
              <v-btn variant="outlined" prepend-icon="mdi-broom" @click="disposeDOMAnimation">Dispose</v-btn>
            </div>
            <p class="text-body-2 text-medium-emphasis mb-3">Each property can define its own values or explicit keyframes, duration, delay, easing, repeat and yoyo behavior. Global timing options are fallbacks. A stagger delay is added to each property's delay. Call <code>dispose()</code> to restore inline styles and release bindings.</p>
            <v-expansion-panels variant="accordion">
              <v-expansion-panel title="View the TypeScript">
                <v-expansion-panel-text><pre class="api-code"><code>{{ domCode }}</code></pre></v-expansion-panel-text>
              </v-expansion-panel>
            </v-expansion-panels>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>

    <v-card variant="outlined" rounded="lg" class="mt-6 composition-helper-card">
      <div class="api-example-header">
        <div class="api-example-eyebrow text-secondary">03 / COMPOSITION HELPERS</div>
        <h2 class="api-example-title">Sequence, parallel &amp; staggered timelines</h2>
        <p class="api-example-description">Compose headless AnimatableItems without writing manual offsets. Switch modes to compare each timing model.</p>
      </div>
      <v-divider />
      <v-card-text class="pa-4 pa-md-5">
        <div class="composition-helper-stage mb-4" role="img" aria-label="Three animated tracks showing the selected timeline composition">
          <div v-for="(progress, index) in compositionProgress" :key="index" class="composition-helper-track">
            <span class="composition-helper-track__label">{{ ['A', 'B', 'C'][index] }}</span>
            <span class="composition-helper-track__rail">
              <span class="composition-helper-track__fill" :class="`composition-helper-track__fill--${index + 1}`" :style="{ width: `${Math.max(0, Math.min(1, progress)) * 100}%` }" />
            </span>
            <span class="composition-helper-track__percent">{{ compositionSegments[index] ? compositionSegments[index].startTime + ' ms' : '—' }} · {{ Math.round(progress * 100) }}%</span>
          </div>
        </div>
        <p class="text-caption text-medium-emphasis mb-3">Total duration: {{ compositionDuration }} ms · The same items are composed sequentially, in parallel, or with a center-out stagger.</p>
        <div class="d-flex flex-wrap ga-2 mb-4" role="group" aria-label="Choose timeline composition">
          <v-btn :variant="compositionMode === 'sequence' ? 'flat' : 'outlined'" color="primary" @click="playComposition('sequence')">Sequence</v-btn>
          <v-btn :variant="compositionMode === 'parallel' ? 'flat' : 'outlined'" color="primary" @click="playComposition('parallel')">Parallel</v-btn>
          <v-btn :variant="compositionMode === 'staggered' ? 'flat' : 'outlined'" color="primary" @click="playComposition('staggered')">Staggered from center</v-btn>
        </div>
        <v-expansion-panels variant="accordion">
          <v-expansion-panel title="View the TypeScript"><v-expansion-panel-text><pre class="api-code"><code>{{ compositionCode }}</code></pre></v-expansion-panel-text></v-expansion-panel>
        </v-expansion-panels>
      </v-card-text>
    </v-card>

    <v-alert type="info" variant="tonal" density="comfortable" class="mt-6">
      <strong>Headless by design:</strong> import <code>keyframes</code> from <code>@re-code/flux</code> for generic values. Import <code>animate</code> from <code>@re-code/flux/dom</code> only when you want selector resolution and CSS property binding.
    </v-alert>
  </v-container>
</template>

<style scoped>
.api-example-header {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 5px;
  min-width: 0;
  padding: 18px 20px 16px;
  border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.16);
}
.api-example-eyebrow {
  font-size: 0.66rem;
  font-weight: 700;
  letter-spacing: 0.075em;
  line-height: 1.5;
  overflow-wrap: normal;
}
.api-example-title {
  margin: 0;
  color: rgb(var(--v-theme-on-surface));
  font-size: 1.08rem;
  font-weight: 650;
  line-height: 1.35;
  white-space: normal;
  overflow-wrap: break-word;
}
.api-example-description {
  max-width: 68ch;
  margin: 2px 0 0;
  color: rgba(var(--v-theme-on-surface), 0.72);
  font-size: 0.82rem;
  line-height: 1.55;
  white-space: normal;
  overflow-wrap: break-word;
  word-break: normal;
}
.api-keyframe-stage,
.api-demo-stage {
  position: relative;
  min-width: 0;
  overflow: hidden;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.2);
  border-radius: 8px;
  background: rgba(var(--v-theme-surface-variant), 0.18);
}
.api-keyframe-stage { height: 180px; }
.api-keyframe-grid {
  position: absolute;
  inset: 0;
  background-image: linear-gradient(to right, rgba(var(--v-theme-on-surface), 0.07) 1px, transparent 1px);
  background-size: 10% 100%;
}
.api-keyframe-track {
  position: absolute;
  top: 50%;
  left: 8px;
  right: 8px;
  height: 1px;
  border-top: 1px dashed rgba(var(--v-theme-on-surface), 0.35);
}
.api-keyframe-object {
  position: absolute;
  top: calc(50% - 19px);
  width: 38px;
  height: 38px;
  display: grid;
  place-items: center;
  border-radius: 10px;
  background: rgb(var(--v-theme-primary));
  color: rgb(var(--v-theme-on-primary));
  box-shadow: 0 6px 20px rgba(var(--v-theme-primary), 0.28);
  transform: translateX(-50%);
  font-size: 11px;
  font-weight: 700;
}
.api-keyframe-markers {
  position: absolute;
  inset: auto 10px 8px;
  display: flex;
  justify-content: space-between;
  color: rgb(var(--v-theme-on-surface));
  opacity: 0.65;
  font-size: 10px;
}
.api-demo-stage {
  min-height: 220px;
  padding: 22px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  background-image: radial-gradient(circle at 18% 20%, rgba(var(--v-theme-primary), 0.11), transparent 46%), radial-gradient(circle at 90% 80%, rgba(var(--v-theme-secondary), 0.1), transparent 38%);
}
.api-demo-item {
  flex: 0 1 64px;
  min-width: 0;
  aspect-ratio: 1;
  display: grid;
  place-items: center;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.18);
  background: rgb(105, 95, 210);
  color: #fff;
  box-shadow: 0 8px 22px rgba(var(--v-theme-primary), 0.22);
  font-size: 12px;
  font-weight: 700;
}
.api-code {
  margin: 0;
  padding: 16px;
  max-width: 100%;
  overflow-x: auto;
  color: rgb(var(--v-theme-on-surface));
  background: rgba(var(--v-theme-surface-variant), 0.34);
  border-radius: 8px;
  font-size: 12px;
  line-height: 1.7;
  white-space: pre;
}
</style>
