<script setup lang="ts">
import { computed, onBeforeUnmount, ref, shallowRef } from 'vue';
import { Animation, Easings, resolveEasing, type EasingName } from '@lib';
import EasingCurve from '../components/EasingCurve.vue';
import { useAppStore } from '../stores/app';

const appStore = useAppStore();
const copy = computed(() => appStore.app.view.easingsPlayground);

const selected = ref<EasingName>('easeOutBounce');
const progress = ref(0);
const eased = ref(0);
const isRunning = ref(false);
const names = Object.keys(Easings) as EasingName[];
const runnerStyle = computed(() => ({ left: `${Math.max(0, Math.min(1, eased.value)) * 100}%` }));
let animation = shallowRef<Animation>(createAnimation());

function createAnimation(): Animation {
  return new Animation({
    duration: 1600,
    easing: selected.value,
    onUpdate: (_progress, easedProgress) => {
      progress.value = _progress;
      eased.value = easedProgress;
    },
    onComplete: () => { isRunning.value = false; },
    onPause: () => { isRunning.value = false; },
    onResume: () => { isRunning.value = true; },
  });
}
function applyEasing(): void {
  animation.value.stop();
  progress.value = 0;
  eased.value = 0;
  animation.value = createAnimation();
  isRunning.value = false;
}
function play(): void { animation.value.play(); isRunning.value = true; }
function pause(): void { animation.value.pause(); isRunning.value = false; }
function restart(): void { animation.value.restart(); isRunning.value = true; }
function stop(): void { animation.value.stop(); progress.value = 0; eased.value = 0; isRunning.value = false; }
const sampleValues = computed(() => [0, 0.25, 0.5, 0.75, 1].map((t) => ({ t, value: resolveEasing(selected.value)(t) })));
onBeforeUnmount(() => {
  animation.value.stop();
});
</script>

<template>
  <div class="playground-route playground-route--easings">
<UiRow align="start">
      <UiCol cols="12" md="7">
        <UiCard variant="outlined" class="h-100">
          <UiCardTitle class="d-flex align-center justify-space-between pa-4"><div><div class="text-overline text-primary">{{ copy.staticText.easingCurve }}</div><h2 class="text-h6 ma-0">{{ selected }}</h2></div><UiChip size="small" variant="tonal">{{ copy.staticText.tEasingT }}</UiChip></UiCardTitle>
          <UiDivider />
          <UiCardText class="pa-4 pa-md-5">
            <div class="curve-wrap"><EasingCurve :easing="resolveEasing(selected)" :label="copy.staticText.easingCurveLabel.replace('{name}', selected)" :progress="progress" /></div>
            <UiTable density="compact" class="mt-5"><thead><tr><th>{{ copy.staticText.timeT }}</th><th>{{ copy.staticText.output }}</th></tr></thead><tbody><tr v-for="sample in sampleValues" :key="sample.t"><td><code>{{ sample.t.toFixed(2) }}</code></td><td><code>{{ sample.value.toFixed(3) }}</code></td></tr></tbody></UiTable>
          </UiCardText>
        </UiCard>
      </UiCol>
      <UiCol cols="12" md="5">
        <UiCard variant="outlined">
          <UiCardTitle class="pa-4"><div><div class="text-overline text-primary">{{ copy.staticText.interpolation }}</div><h2 class="text-h6 ma-0">{{ copy.staticText.tryAnEasing }}</h2></div></UiCardTitle>
          <UiDivider />
          <UiCardText class="pa-4">
            <UiSelect v-model="selected" :items="names" :label="copy.staticText.easingFunction" hide-details class="mb-6" @update:model-value="applyEasing" />
            <div class="easing-stage mb-5"><span class="track-start">0</span><span class="track-end">1</span><div class="easing-track"><div class="easing-runner" :style="runnerStyle"><span>{{ copy.staticText.rx }}</span></div></div></div>
            <UiRow dense class="mb-5"><UiCol cols="4"><UiSheet rounded="lg" color="surface-variant" class="pa-3"><div class="text-overline text-medium-emphasis">{{ copy.staticText.time }}</div><div class="text-h6">{{ progress.toFixed(2) }}</div></UiSheet></UiCol><UiCol cols="4"><UiSheet rounded="lg" color="surface-variant" class="pa-3"><div class="text-overline text-medium-emphasis">{{ copy.staticText.value }}</div><div class="text-h6">{{ eased.toFixed(3) }}</div></UiSheet></UiCol><UiCol cols="4"><UiSheet rounded="lg" color="surface-variant" class="pa-3"><div class="text-overline text-medium-emphasis">{{ copy.staticText.state }}</div><div class="text-body-2 font-weight-bold text-truncate">{{ isRunning ? copy.staticText.running : (progress >= 1 ? copy.staticText.completed : copy.staticText.idle) }}</div></UiSheet></UiCol></UiRow>
            <div class="d-flex flex-wrap ga-2"><UiButton @click="play" color="primary" variant="flat" prepend-icon="mdi-play">{{ copy.staticText.play }}</UiButton><UiButton @click="pause" variant="tonal" prepend-icon="mdi-pause">{{ copy.staticText.pause }}</UiButton><UiButton @click="stop" variant="tonal" prepend-icon="mdi-stop">{{ copy.staticText.stop }}</UiButton><UiButton @click="restart" variant="tonal" prepend-icon="mdi-restart">{{ copy.staticText.restart }}</UiButton></div>
          </UiCardText>
        </UiCard>
      </UiCol>
    </UiRow>
  </div>
</template>
