<script setup lang="ts">
import LabeledSlider from '../components/LabeledSlider.vue';
import { computed, onBeforeUnmount, reactive, ref, shallowRef, watchEffect } from 'vue';
import { Animation, Timeline } from '@lib';
import type { TimelineOffset } from '@lib';
import MetricTile from '../components/MetricTile.vue';
import EventLog from '../components/EventLog.vue';
import { useAppStore } from '../stores/app';

const appStore = useAppStore();
const copy = computed(() => appStore.app.view.timelinePlayground);

type OffsetKind = 'start' | 'seq' | 'plus' | 'minus' | 'parallel' | 'absolute';
interface StepConfig { label: string; duration: number; offset: OffsetKind; amount: number; absolute: number; }
const steps = reactive<StepConfig[]>([
  { label: copy.value.staticText.entrance, duration: 650, offset: 'start', amount: 100, absolute: 0 },
  { label: copy.value.staticText.movement, duration: 900, offset: 'seq', amount: 160, absolute: 400 },
  { label: copy.value.staticText.emphasis, duration: 700, offset: 'parallel', amount: 100, absolute: 850 },
]);
const progress = ref(0);
const state = ref('idle');
const stepProgress = ref<number[]>([0, 0, 0]);
const logs = ref<string[]>([]);
const origin = Date.now();
const stepAnimations = shallowRef<Animation[]>([]);

function log(message: string): void {
  const elapsed = String(Date.now() - origin).padStart(5, '0');
  logs.value.unshift(`${elapsed} ms  ${message}`);
  logs.value = logs.value.slice(0, 30);
}

function resolveStepOffset(step: StepConfig): TimelineOffset | undefined {
  if (step.offset === 'start') return 0;
  if (step.offset === 'seq') return undefined;
  if (step.offset === 'plus') return `+=${step.amount}`;
  if (step.offset === 'minus') return `-=${step.amount}`;
  if (step.offset === 'parallel') return '<';
  return Math.max(0, step.absolute);
}

function createTimeline(): Timeline {
  const nextItems = steps.map((step, index) => new Animation({
    duration: step.duration,
    easing: index === 1 ? 'easeInOutCubic' : 'easeOutCubic',
    onStart: () => log(`${step.label}: onStart()`),
    onComplete: () => log(`${step.label}: onComplete()`),
    onUpdate: () => undefined,
  }));
  stepAnimations.value = nextItems;
  const nextTimeline = new Timeline({
    onStart: () => log(copy.value.staticText.timelineOnStartEvent),
    onUpdate: () => undefined,
    onComplete: () => log(copy.value.staticText.timelineOnCompleteEvent),
    onPause: () => log(copy.value.staticText.timelineOnPauseEvent),
    onResume: () => log(copy.value.staticText.timelineOnResumeEvent),
    onStop: () => log(copy.value.staticText.timelineOnStopEvent),
  });
  nextItems.forEach((item, index) => nextTimeline.add(item, resolveStepOffset(steps[index]!)));
  return nextTimeline;
}

const timeline = shallowRef<Timeline>(createTimeline());
watchEffect((onCleanup) => {
  const current = timeline.value;
  const currentItems = stepAnimations.value;
  const subscriptions = [current.progress$.subscribe((value) => { progress.value = value; }), current.state$.subscribe((value) => { state.value = value; })];
  currentItems.forEach((item, index) => subscriptions.push(item.progress$.subscribe((value) => { stepProgress.value[index] = value; })));
  onCleanup(() => subscriptions.forEach((subscription) => subscription.unsubscribe()));
});

function applyOptions(): void {
  timeline.value.stop();
  logs.value = [];
  stepProgress.value = [0, 0, 0];
  timeline.value = createTimeline();
  log(copy.value.staticText.timelineRebuiltWithCurrentOffsets);
}

async function playAndWait(): Promise<void> {
  const current = timeline.value;
  current.play();
  log(copy.value.staticText.awaitTimeline);
  try { await current; log(copy.value.staticText.awaitResolved); }
  catch (error: unknown) { log(`await rejected: ${error instanceof Error ? error.message : String(error)}`); }
}

const duration = computed(() => Math.max(timeline.value.duration, 1));
const progressLabel = computed(() => `${Math.round(progress.value * 100)}%`);
const stateLabels: Record<string, string> = { idle: copy.value.staticText.idle, running: copy.value.staticText.running, paused: copy.value.staticText.paused, completed: copy.value.staticText.completed, stopped: copy.value.staticText.stopped };
const stateLabel = computed(() => stateLabels[state.value] ?? state.value);
const segments = computed(() => timeline.value.segments);
const ganttRows = computed(() => segments.value.map((segment, index) => {
  const leftPercent = Math.min(100, Math.max(0, segment.startTime / duration.value * 100));
  const requestedWidth = Math.max(1.5, segment.duration / duration.value * 100);
  const widthPercent = Math.min(100 - leftPercent, requestedWidth);
  return { ...segment, label: steps[index]?.label ?? copy.value.staticText.segmentNumber.replace('{number}', String(index + 1)), leftPercent, widthPercent };
}));
function seekFromInput(value: number | number[]): void {
  const normalized = Array.isArray(value) ? (value[0] ?? 0) : value;
  timeline.value.seek(normalized * duration.value);
}
function playTimeline(): void { timeline.value.play(); }
function pauseTimeline(): void { timeline.value.pause(); }
function stopTimeline(): void { timeline.value.stop(); }
function restartTimeline(): void { timeline.value.restart(); }
onBeforeUnmount(() => {
   
  timeline.value.stop();
});
</script>

<template>
  <UiContainer class="py-8 py-md-12" style="max-width: 1200px">
<UiRow align="start">
      <UiCol cols="12" md="4" lg="3">
        <UiCard variant="outlined">
          <UiCardTitle class="d-flex align-center justify-space-between pa-4">
            <div><div class="text-overline text-primary">{{ copy.staticText.composition }}</div><h2 class="text-h6 ma-0">{{ steps.length }} {{ copy.staticText.segments }}</h2></div>
            <UiChip size="small" variant="tonal">{{ copy.staticText.ms }}</UiChip>
          </UiCardTitle>
          <UiDivider />
          <UiCardText class="pa-4">
            <div v-for="(step, index) in steps" :key="step.label" class="mb-6">
              <div class="d-flex align-center ga-2 mb-3"><UiAvatar color="primary" variant="tonal" size="28" class="text-caption font-weight-bold">{{ index + 1 }}</UiAvatar><span class="text-subtitle-2 font-weight-bold">{{ step.label }}</span></div>
              <div class="d-flex justify-end mb-1"><UiChip size="x-small" color="primary" variant="tonal">{{ step.duration }} ms</UiChip></div>
              <LabeledSlider :label="copy.staticText.segmentDurationMilliseconds" v-model="step.duration" :min="150" :max="1600" :step="50" class="mb-3" />
              <UiSelect hide-details v-model="step.offset" :label="copy.staticText.offset" :items="[{ title: copy.staticText.startAtZero, value: 'start' }, { title: copy.staticText.sequential, value: 'seq' }, { title: copy.staticText.plusDelay, value: 'plus' }, { title: copy.staticText.minusOverlap, value: 'minus' }, { title: copy.staticText.parallel, value: 'parallel' }, { title: copy.staticText.absolute, value: 'absolute' }]" class="mb-2" />
              <template v-if="step.offset === 'plus' || step.offset === 'minus'">
                <div class="d-flex justify-end mb-1"><UiChip size="x-small" variant="tonal">{{ step.amount }} ms</UiChip></div>
                <LabeledSlider :label="step.offset === 'plus' ? copy.staticText.offsetDelay : copy.staticText.offsetOverlap" v-model="step.amount" :min="0" :max="500" :step="25" />
              </template>
              <template v-if="step.offset === 'absolute'">
                <div class="d-flex justify-end mb-1"><UiChip size="x-small" variant="tonal">{{ step.absolute }} ms</UiChip></div>
                <LabeledSlider :label="copy.staticText.absoluteStartTimeMilliseconds" v-model="step.absolute" :min="0" :max="2000" :step="50" />
              </template>
              <UiDivider v-if="index < steps.length - 1" class="mt-5" />
            </div>
          </UiCardText>
          <UiDivider />
          <UiCardActions class="d-flex flex-column align-stretch pa-4 ga-2">
            <UiButton block @click="applyOptions" color="primary" variant="flat" prepend-icon="mdi-refresh">{{ copy.staticText.applyComposition }}</UiButton>
            <p class="text-caption text-medium-emphasis mb-0">{{ copy.staticText.offsetsResolveInInsertionOrderStartTimesAreClampedToZero }}</p>
          </UiCardActions>
        </UiCard>
      </UiCol>

      <UiCol cols="12" md="8" lg="9">
        <UiCard variant="outlined">
          <UiCardTitle class="d-flex flex-wrap align-center justify-space-between ga-3 pa-4">
            <div><div class="text-overline text-primary">{{ copy.staticText.timelineInspector }}</div><h2 class="text-h6 ma-0">{{ copy.staticText.ganttView }}</h2></div>
            <UiChip role="status" aria-live="polite" :color="state === 'running' ? 'success' : state === 'paused' ? 'warning' : state === 'completed' ? 'secondary' : 'default'" size="small" variant="tonal" dot>{{ stateLabel }}</UiChip>
          </UiCardTitle>
          <UiDivider />
          <UiCardText class="pa-4 pa-md-5">
            <div class="gantt-ruler"><span>{{ copy.staticText.text0Ms }}</span><span>{{ Math.round(duration / 2) }} ms</span><span>{{ Math.round(duration) }} ms</span></div>
            <div class="gantt-chart">
              <div class="gantt-playhead" :class="{ 'gantt-playhead--end': progress > 0.72 }" :style="{ left: `${Math.min(100, Math.max(0, progress * 100))}%` }"><span>{{ Math.round(progress * duration) }} ms</span></div>
              <div v-for="(segment, index) in ganttRows" :key="index" class="gantt-row">
                <span class="gantt-label">{{ segment.label }}</span>
                <div class="gantt-lane"><div class="gantt-segment" role="img" :aria-label="copy.staticText.startsAtAndEndsAt.replace('{label}', segment.label).replace('{start}', String(Math.round(segment.startTime))).replace('{end}', Number.isFinite(segment.endTime) ? String(Math.round(segment.endTime)) : copy.staticText.infinity)" :class="`segment-${index}`" :style="{ left: `${segment.leftPercent}%`, width: `${segment.widthPercent}%` }"><span v-if="segment.widthPercent >= 17">{{ Math.round(segment.startTime) }}–{{ Number.isFinite(segment.endTime) ? Math.round(segment.endTime) : '∞' }} ms</span></div></div>
              </div>
            </div>
            <UiProgressLinear :model-value="progress * 100" :aria-label="copy.staticText.timelineProgress" :aria-valuetext="progressLabel" color="primary" height="6" rounded class="my-5" />
            <UiRow dense class="mb-4">
              <UiCol cols="4"><MetricTile :label="copy.staticText.duration" :value="`${Math.round(timeline.duration)} ms`" /></UiCol>
              <UiCol cols="4"><MetricTile :label="copy.staticText.progress" :value="progressLabel" /></UiCol>
              <UiCol cols="4"><MetricTile :label="copy.staticText.segments" :value="segments.length" /></UiCol>
            </UiRow>
            <div class="d-flex flex-wrap ga-2 mb-5">
              <UiButton @click="playTimeline" color="primary" variant="flat" prepend-icon="mdi-play">{{ copy.staticText.play }}</UiButton>
              <UiButton @click="pauseTimeline" variant="tonal" prepend-icon="mdi-pause">{{ copy.staticText.pause }}</UiButton>
              <UiButton @click="stopTimeline" variant="tonal" prepend-icon="mdi-stop">{{ copy.staticText.stop }}</UiButton>
              <UiButton @click="restartTimeline" variant="tonal" prepend-icon="mdi-restart">{{ copy.staticText.restart }}</UiButton>
            </div>
            <div class="mb-5"><div class="d-flex justify-end mb-1"><UiChip size="small" variant="tonal">{{ progressLabel }}</UiChip></div><LabeledSlider :label="copy.staticText.seekTimelineProgress" :model-value="progress" :min="0" :max="1" :step="0.01" @update:model-value="seekFromInput" /></div>
            <UiButton @click="playAndWait" color="secondary" variant="outlined" prepend-icon="mdi-code-braces">{{ copy.staticText.playAndAwaitWith }} <code class="ml-1">await timeline</code></UiButton>
          </UiCardText>
        </UiCard>

        <UiCard variant="outlined" class="mt-4">
          <UiCardTitle class="pa-4"><div><div class="text-overline text-primary">{{ copy.staticText.childrenControlledBySeek }}</div><h2 class="text-h6 ma-0">{{ copy.staticText.items }}</h2></div></UiCardTitle>
          <UiDivider />
          <UiCardText class="pa-4"><div class="timeline-objects"><div v-for="(step, index) in steps" :key="step.label" class="timeline-object-row"><span>{{ step.label }}</span><div class="object-track"><div class="object-rail"><div class="object-box" :class="`segment-${index}`" :style="{ left: `${Math.min(1, Math.max(0, stepProgress[index] ?? 0)) * 100}%`, transform: `translateX(-50%) scale(${0.8 + (stepProgress[index] ?? 0) * 0.2})`, opacity: String(0.35 + (stepProgress[index] ?? 0) * 0.65) }"><span>{{ index + 1 }}</span></div></div></div><b>{{ Math.round((stepProgress[index] ?? 0) * 100) }}%</b></div></div></UiCardText>
        </UiCard>

        <EventLog
          class="mt-4"
          :eyebrow="copy.staticText.lifecycle"
          :title="copy.staticText.eventLog"
          :entries="logs"
          :empty-message="copy.staticText.timelineAndChildEventsWillAppearHere"
          @clear="logs = []"
        />
      </UiCol>
    </UiRow>
  </UiContainer>
</template>
