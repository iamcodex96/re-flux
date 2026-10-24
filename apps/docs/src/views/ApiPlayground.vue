<script setup lang="ts">
import LabeledSlider from '../components/LabeledSlider.vue';
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue';
import { useAppStore } from '../stores/app';
import { keyframes, stagger, sequence as composeSequence, parallel, staggered, type AnimationState, type Keyframes, type Timeline } from '@lib';
import { animate, type DOMAnimation } from '@lib/dom';

const appStore = useAppStore();
const copy = computed(() => appStore.app.view.apiPlayground);

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
const sequenceStateLabel = computed(() => {
  const labels: Record<string, string> = { idle: copy.value.staticText.idle, running: copy.value.staticText.running, paused: copy.value.staticText.paused, completed: copy.value.staticText.completed, stopped: copy.value.staticText.stopped };
  return labels[sequenceState.value] ?? sequenceState.value;
});
const sequenceSubscription = sequence.value$.subscribe((value) => { sequenceValue.value = value; });
const progressSubscription = sequence.progress$.subscribe((value) => { sequenceProgress.value = value; });
const stateSubscription = sequence.state$.subscribe((state) => { sequenceState.value = state; });
 
const sequenceLeft = computed(() => `${8 + (Math.max(0, Math.min(200, sequenceValue.value)) / 200) * 84}%`);

const domAnimation = shallowRef<DOMAnimation | null>(null);
const domState = ref<'ready' | 'playing' | 'completed'>('ready');
const domStateLabel = computed(() => ({ ready: copy.value.staticText.ready, playing: copy.value.staticText.playing, completed: copy.value.staticText.completed }[domState.value]));
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
  <div class="playground-route playground-route--api api-playground">
<UiRow align="stretch">
      <UiCol cols="12" lg="5">
        <UiCard variant="outlined" rounded="lg" class="h-100">
          <div class="api-example-header">
            <div class="api-example-eyebrow text-primary">{{ copy.staticText.text01HeadlessValues }}</div>
            <h2 class="api-example-title">{{ copy.staticText.typedKeyframes }}</h2>
            <p class="api-example-description">{{ copy.staticText.offsetsAreNormalizedTo01EachKeyframeCanOverrideTheEasingUsedByItsOutgoingSegment }}</p>
          </div>
          <UiDivider />
          <UiCardText class="pa-4 pa-md-5">
            <div class="api-keyframe-stage mb-4">
              <div class="api-keyframe-grid" />
              <div class="api-keyframe-track" />
              <div class="api-keyframe-object" :style="{ left: sequenceLeft }">{{ Math.round(sequenceValue) }}</div>
              <div class="api-keyframe-markers"><span>0</span><span>140</span><span>70</span><span>180</span></div>
            </div>
            <UiRow dense class="mb-3">
              <UiCol cols="4"><UiSheet color="surface-variant" rounded="lg" class="pa-3"><div class="text-caption text-medium-emphasis">{{ copy.staticText.value }}</div><div class="text-body-1 font-weight-bold">{{ sequenceValue.toFixed(1) }}</div></UiSheet></UiCol>
              <UiCol cols="4"><UiSheet color="surface-variant" rounded="lg" class="pa-3"><div class="text-caption text-medium-emphasis">{{ copy.staticText.progress }}</div><div class="text-body-1 font-weight-bold">{{ Math.round(sequenceProgress * 100) }}%</div></UiSheet></UiCol>
              <UiCol cols="4"><UiSheet color="surface-variant" rounded="lg" class="pa-3"><div class="text-caption text-medium-emphasis">{{ copy.staticText.state }}</div><div class="text-body-1 font-weight-bold">{{ sequenceStateLabel }}</div></UiSheet></UiCol>
            </UiRow>
            <LabeledSlider :model-value="sequenceProgress" :label="copy.staticText.seekKeyframeSequence" :min="0" :max="1" :step="0.01" class="mb-3" @update:model-value="seekSequence" />
            <div class="d-flex flex-wrap ga-2">
              <UiButton color="primary" prepend-icon="mdi-play" @click="playSequence">{{ copy.staticText.play }}</UiButton>
              <UiButton color="primary" variant="outlined" prepend-icon="mdi-restart" @click="restartSequence">{{ copy.staticText.restart }}</UiButton>
              <UiButton variant="outlined" prepend-icon="mdi-stop" @click="stopSequence">{{ copy.staticText.stop }}</UiButton>
            </div>
            <UiExpansionPanels variant="accordion" class="mt-5">
              <UiExpansionPanel :title="copy.staticText.viewTheTypescript">
                <UiExpansionPanelText><pre class="api-code"><code>{{ sequenceCode }}</code></pre></UiExpansionPanelText>
              </UiExpansionPanel>
            </UiExpansionPanels>
          </UiCardText>
        </UiCard>
      </UiCol>

      <UiCol cols="12" lg="7">
        <UiCard variant="outlined" rounded="lg" class="h-100">
          <div class="api-example-header">
            <div class="api-example-eyebrow text-secondary">{{ copy.staticText.text02DomTargets }}</div>
            <h2 class="api-example-title">{{ copy.staticText.selectorsArraysAndStagger }}</h2>
            <p class="api-example-description">{{ copy.staticText.passASelectorAnElementOrAnIterableSuchAsANodelistEveryTargetAndPropertySharesOneTimeline }}</p>
          </div>
          <UiDivider />
          <UiCardText class="pa-4 pa-md-5">
            <div class="api-demo-stage mb-4" :aria-label="copy.staticText.fiveElementsAnimatedByOneSelector">
              <div v-for="index in demoCount" :key="index" class="api-demo-item" :data-index="index">{{ String(index).padStart(2, '0') }}</div>
            </div>
            <div class="d-flex flex-wrap align-center ga-2 mb-4">
              <UiChip size="small" variant="tonal" color="primary">{{ copy.staticText.selectorApiDemoItem }}</UiChip>
              <UiChip size="small" variant="tonal" color="secondary">{{ copy.staticText.propertySpecificTiming }}</UiChip>
              <UiChip size="small" variant="tonal" :color="domState === 'playing' ? 'success' : 'default'" role="status" aria-live="polite">{{ domStateLabel }}</UiChip>
            </div>
            <UiRow dense class="mb-2">
              <UiCol cols="6"><LabeledSlider v-model="domDuration" :label="copy.staticText.durationMs" :min="200" :max="1400" :step="50" /></UiCol>
              <UiCol cols="6"><LabeledSlider v-model="domStagger" :label="copy.staticText.staggerMs" :min="0" :max="180" :step="5" /></UiCol>
            </UiRow>
            <div class="d-flex flex-wrap ga-2 mb-4">
              <UiButton color="primary" prepend-icon="mdi-play" @click="playDOMAnimation">{{ copy.staticText.play }}</UiButton>
              <UiButton variant="outlined" prepend-icon="mdi-restart" @click="resetDOMAnimation">{{ copy.staticText.applyAndReset }}</UiButton>
              <UiButton variant="outlined" prepend-icon="mdi-broom" @click="disposeDOMAnimation">{{ copy.staticText.dispose }}</UiButton>
            </div>
            <p class="text-body-2 text-medium-emphasis mb-3">{{ copy.staticText.eachPropertyCanDefineItsOwnValuesOrExplicitKeyframesDurationDelayEasingRepeatAndYoyoBehaviorGlobalTimingOptionsAreFallbacksAStaggerDelayIsAddedToEachPropertySDelayCall }} <code>dispose()</code> {{ copy.staticText.toRestoreInlineStylesAndReleaseBindings }}</p>
            <UiExpansionPanels variant="accordion">
              <UiExpansionPanel :title="copy.staticText.viewTheTypescript">
                <UiExpansionPanelText><pre class="api-code"><code>{{ domCode }}</code></pre></UiExpansionPanelText>
              </UiExpansionPanel>
            </UiExpansionPanels>
          </UiCardText>
        </UiCard>
      </UiCol>
    </UiRow>

    <UiCard variant="outlined" rounded="lg" class="mt-6 composition-helper-card">
      <div class="api-example-header">
        <div class="api-example-eyebrow text-secondary">{{ copy.staticText.text03CompositionHelpers }}</div>
        <h2 class="api-example-title">{{ copy.staticText.sequenceParallelAndStaggeredTimelines }}</h2>
        <p class="api-example-description">{{ copy.staticText.composeHeadlessAnimatableitemsWithoutWritingManualOffsetsSwitchModesToCompareEachTimingModel }}</p>
      </div>
      <UiDivider />
      <UiCardText class="pa-4 pa-md-5">
        <div class="composition-helper-stage mb-4" role="img" :aria-label="copy.staticText.threeAnimatedTracksShowingTheSelectedTimelineComposition">
          <div v-for="(progress, index) in compositionProgress" :key="index" class="composition-helper-track">
            <span class="composition-helper-track__label">{{ ['A', 'B', 'C'][index] }}</span>
            <span class="composition-helper-track__rail">
              <span class="composition-helper-track__fill" :class="`composition-helper-track__fill--${index + 1}`" :style="{ width: `${Math.max(0, Math.min(1, progress)) * 100}%` }" />
            </span>
            <span class="composition-helper-track__percent">{{ compositionSegments[index] ? compositionSegments[index].startTime + ' ' + copy.staticText.millisecondsAbbreviation : '—' }} · {{ Math.round(progress * 100) }}%</span>
          </div>
        </div>
        <p class="text-caption text-medium-emphasis mb-3">{{ copy.staticText.compositionDurationSummary.replace('{duration}', String(compositionDuration)) }}</p>
        <div class="d-flex flex-wrap ga-2 mb-4" role="group" :aria-label="copy.staticText.chooseTimelineComposition">
          <UiButton :variant="compositionMode === 'sequence' ? 'flat' : 'outlined'" color="primary" @click="playComposition('sequence')">{{ copy.staticText.sequence }}</UiButton>
          <UiButton :variant="compositionMode === 'parallel' ? 'flat' : 'outlined'" color="primary" @click="playComposition('parallel')">{{ copy.staticText.parallel }}</UiButton>
          <UiButton :variant="compositionMode === 'staggered' ? 'flat' : 'outlined'" color="primary" @click="playComposition('staggered')">{{ copy.staticText.staggeredFromCenter }}</UiButton>
        </div>
        <UiExpansionPanels variant="accordion">
          <UiExpansionPanel :title="copy.staticText.viewTheTypescript"><UiExpansionPanelText><pre class="api-code"><code>{{ compositionCode }}</code></pre></UiExpansionPanelText></UiExpansionPanel>
        </UiExpansionPanels>
      </UiCardText>
    </UiCard>

    <UiAlert type="info" variant="tonal" density="comfortable" class="mt-6">
      <strong>{{ copy.staticText.headlessByDesign }}</strong> {{ copy.staticText.import }} <code>keyframes</code> {{ copy.staticText.from }} <code>@re-code/flux</code> {{ copy.staticText.forGenericValuesImport }} <code>animate</code> {{ copy.staticText.from }} <code>@re-code/flux/dom</code> {{ copy.staticText.onlyWhenYouWantSelectorResolutionAndCssPropertyBinding }}
    </UiAlert>
  </div>
</template>

<style scoped lang="scss" src="../styles/views/api-playground.scss"></style>
