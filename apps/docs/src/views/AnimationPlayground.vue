<script setup lang="ts">
import LabeledSlider from '../components/LabeledSlider.vue';
import { computed, onBeforeUnmount, ref, shallowRef, watchEffect } from 'vue';
import { Animation, Easings, type EasingName } from '@lib';
import MetricTile from '../components/MetricTile.vue';
import EventLog from '../components/EventLog.vue';
import { useAppStore } from '../stores/app';

const appStore = useAppStore();
const copy = computed(() => appStore.app.view.animationPlayground);

const duration = ref(1200);
const delay = ref(0);
const repeatCount = ref(1);
const infinite = ref(false);
const yoyo = ref(true);
const easingName = ref<EasingName>('easeOutCubic');
const progress = ref(0);
const easedProgress = ref(0);
const state = ref('idle');
const logs = ref<string[]>([]);
const timeOrigin = Date.now();

function log(message: string): void {
  const elapsed = String(Date.now() - timeOrigin).padStart(5, '0');
  logs.value.unshift(`${elapsed} ms  ${message}`);
  logs.value = logs.value.slice(0, 24);
}

function createAnimation(): Animation {
  return new Animation({
    duration: duration.value,
    delay: delay.value,
    repeat: infinite.value ? Infinity : repeatCount.value,
    yoyo: yoyo.value,
    easing: easingName.value,
    onStart: () => log(copy.value.staticText.onStartEvent),
    onUpdate: (_raw, eased) => { easedProgress.value = eased; },
    onComplete: () => log(copy.value.staticText.onCompleteEvent),
    onPause: () => log(copy.value.staticText.onPauseEvent),
    onResume: () => log(copy.value.staticText.onResumeEvent),
    onStop: () => log(copy.value.staticText.onStopEvent),
  });
}

const animation = shallowRef<Animation>(createAnimation());
watchEffect((onCleanup) => {
  const current = animation.value;
  const progressSub = current.progress$.subscribe((value) => { progress.value = value; });
  const stateSub = current.state$.subscribe((value) => { state.value = value; });
  onCleanup(() => { progressSub.unsubscribe(); stateSub.unsubscribe(); });
});

const boxStyle = computed(() => ({
  left: `${Math.min(1, Math.max(0, easedProgress.value)) * 100}%`,
  transform: `translateX(-50%) rotate(${easedProgress.value * 180}deg) scale(${0.72 + easedProgress.value * 0.28})`,
  opacity: String(0.35 + Math.min(1, Math.max(0, easedProgress.value)) * 0.65),
}));
const easingNames = Object.keys(Easings) as EasingName[];
const progressPercent = computed(() => `${Math.round(progress.value * 100)}%`);
const stateLabels: Record<string, string> = { idle: copy.value.staticText.idle, running: copy.value.staticText.running, paused: copy.value.staticText.paused, completed: copy.value.staticText.completed, stopped: copy.value.staticText.stopped };
const stateLabel = computed(() => stateLabels[state.value] ?? state.value);

function seekFromInput(value: number | number[]): void {
  const normalized = Array.isArray(value) ? (value[0] ?? 0) : value;
  animation.value.seek(normalized * Math.max(animation.value.duration, 1));
}
function playAnimation(): void { animation.value.play(); }
function pauseAnimation(): void { animation.value.pause(); }
function stopAnimation(): void { animation.value.stop(); }
function restartAnimation(): void { animation.value.restart(); }

function applyOptions(): void {
  animation.value.stop();
  animation.value = createAnimation();
  easedProgress.value = 0;
  logs.value = [];
  log(copy.value.staticText.createdNewInstanceWithCurrentOptions);
}

async function playAndWait(): Promise<void> {
  const current = animation.value;
  current.play();
  log(copy.value.staticText.awaitAnimation);
  try {
    await current;
    log(copy.value.staticText.awaitResolved);
  } catch (error: unknown) {
    log(`await rejected: ${error instanceof Error ? error.message : String(error)}`);
  }
}

onBeforeUnmount(() => { animation.value.stop(); });
</script>

<template>
  <UiContainer class="py-8 py-md-12" style="max-width: 1200px">
<UiRow align="start">
      <UiCol cols="12" md="4" lg="3">
        <UiCard variant="outlined">
          <UiCardTitle class="d-flex align-center justify-space-between ga-3 pa-4">
            <div><div class="text-overline text-primary">{{ copy.staticText.configuration }}</div><h2 class="text-h6 ma-0">{{ copy.staticText.options }}</h2></div>
            <UiChip size="small" variant="tonal">{{ copy.staticText.constructor }}</UiChip>
          </UiCardTitle>
          <UiDivider />
          <UiCardText class="pa-4">
            <div class="mb-5">
              <div class="d-flex justify-end mb-1"><UiChip size="x-small" color="primary" variant="tonal">{{ duration }} ms</UiChip></div>
              <LabeledSlider :label="copy.staticText.durationMilliseconds" v-model="duration" :min="150" :max="3000" :step="50" />
            </div>
            <div class="mb-5">
              <div class="d-flex justify-end mb-1"><UiChip size="x-small" color="primary" variant="tonal">{{ delay }} ms</UiChip></div>
              <LabeledSlider :label="copy.staticText.delayMilliseconds" v-model="delay" :min="0" :max="1500" :step="50" />
            </div>
            <div class="mb-5">
              <div class="d-flex justify-end mb-1"><UiChip size="x-small" color="primary" variant="tonal">{{ infinite ? '∞' : repeatCount }}</UiChip></div>
              <LabeledSlider :label="copy.staticText.repeatCount" v-model="repeatCount" :min="0" :max="5" :step="1" :disabled="infinite" />
            </div>
            <UiSelect hide-details v-model="easingName" :items="easingNames" :label="copy.staticText.easing" class="mb-2" />
            <UiSwitch hide-details v-model="infinite" :label="copy.staticText.repeatForever" color="primary" class="mb-2" />
            <UiSwitch hide-details v-model="yoyo" :label="copy.staticText.yoyoAlternateDirection" color="primary" />
          </UiCardText>
          <UiDivider />
          <UiCardActions class="d-flex flex-column align-stretch pa-4 ga-2">
            <UiButton block @click="applyOptions" color="primary" variant="flat" append-icon="mdi-refresh">{{ copy.staticText.applyOptions }}</UiButton>
            <p class="text-caption text-medium-emphasis mb-0">{{ copy.staticText.constructorOptionsAreImmutableApplyingStopsAndReplacesTheActiveInstance }}</p>
          </UiCardActions>
        </UiCard>
      </UiCol>

      <UiCol cols="12" md="8" lg="9">
        <UiCard variant="outlined">
          <UiCardTitle class="d-flex flex-wrap align-center justify-space-between ga-3 pa-4">
            <div><div class="text-overline text-primary">{{ copy.staticText.livePreview }}</div><h2 class="text-h6 ma-0">{{ copy.staticText.motionStage }}</h2></div>
            <UiChip role="status" aria-live="polite" :color="state === 'running' ? 'success' : state === 'paused' ? 'warning' : state === 'completed' ? 'secondary' : 'default'" size="small" variant="tonal" dot>{{ stateLabel }}</UiChip>
          </UiCardTitle>
          <UiDivider />
          <UiCardText class="pa-4 pa-md-5">
            <div class="motion-stage">
              <div class="stage-track"><span class="track-start">0</span><span class="track-end">100%</span></div>
              <div class="motion-box-track"><div class="motion-box" :style="boxStyle"><span>{{ copy.staticText.rx }}</span></div></div>
              <div class="stage-caption">{{ copy.staticText.translatexRotateOpacity }}</div>
            </div>
            <UiRow dense class="my-4">
              <UiCol cols="4"><MetricTile :label="copy.staticText.progress" :value="progressPercent" /></UiCol>
              <UiCol cols="4"><MetricTile :label="copy.staticText.eased" :value="easedProgress.toFixed(3)" /></UiCol>
              <UiCol cols="4"><MetricTile :label="copy.staticText.state" :value="stateLabel" /></UiCol>
            </UiRow>
            <UiProgressLinear :model-value="progress * 100" :aria-label="copy.staticText.animationProgress" :aria-valuetext="progressPercent" color="primary" height="6" rounded class="mb-5" />
            <div class="d-flex flex-wrap ga-2 mb-5">
              <UiButton @click="playAnimation" color="primary" variant="flat" prepend-icon="mdi-play">{{ copy.staticText.play }}</UiButton>
              <UiButton @click="pauseAnimation" variant="tonal" prepend-icon="mdi-pause">{{ copy.staticText.pause }}</UiButton>
              <UiButton @click="stopAnimation" variant="tonal" prepend-icon="mdi-stop">{{ copy.staticText.stop }}</UiButton>
              <UiButton @click="restartAnimation" variant="tonal" prepend-icon="mdi-restart">{{ copy.staticText.restart }}</UiButton>
            </div>
            <div class="mb-5">
              <div class="d-flex justify-space-between text-body-2 mb-2"><span>{{ copy.staticText.seek }}</span><span class="font-weight-medium">{{ progressPercent }}</span></div>
              <LabeledSlider :label="copy.staticText.seekAnimationProgress" :model-value="progress" :min="0" :max="1" :step="0.01" @update:model-value="seekFromInput" />
            </div>
            <UiButton @click="playAndWait" color="secondary" variant="outlined" prepend-icon="mdi-code-braces">{{ copy.staticText.playAndAwaitWith }} <code class="ml-1">await animation</code></UiButton>
          </UiCardText>
        </UiCard>

        <EventLog
          class="mt-4"
          :eyebrow="copy.staticText.lifecycle"
          :title="copy.staticText.eventLog"
          :entries="logs"
          :empty-message="copy.staticText.callbacksWillAppearHereWhenYouPlayTheAnimation"
          @clear="logs = []"
        />
      </UiCol>
    </UiRow>
  </UiContainer>
</template>
