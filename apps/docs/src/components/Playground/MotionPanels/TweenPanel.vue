<script setup lang="ts">
import { useAppStore } from '../../../stores/app';
import { ref, shallowRef, watchEffect, onBeforeUnmount , computed} from 'vue';
import { Tween, type AnimationState } from '@lib';
import LabeledSlider from '../../LabeledSlider.vue';
import MetricTile from '../../MetricTile.vue';


const appStore = useAppStore();
const copy = computed(() => appStore.app.view.motionPanelTween);
const tweenFrom = ref(0);
const tweenTo = ref(100);
const tweenDuration = ref(1000);
const tweenValue = ref(0);
const tweenProgress = ref(0);
const tweenState = ref<AnimationState>('idle');
const tween = shallowRef(createTween());

function createTween(): Tween<number> {
  return new Tween({ from: tweenFrom.value, to: tweenTo.value, duration: tweenDuration.value, easing: 'easeOutCubic' });
}

watchEffect((onCleanup) => {
  const current = tween.value;
  const subscriptions = [
    current.value$.subscribe((value) => { tweenValue.value = value; }),
    current.progress$.subscribe((value) => { tweenProgress.value = value; }),
    current.state$.subscribe((value) => { tweenState.value = value; }),
  ];
  onCleanup(() => subscriptions.forEach((subscription) => subscription.unsubscribe()));
});

function applyTweenOptions(): void {
  tween.value.stop();
  tween.value = createTween();
}
function seekTween(value: number | number[]): void {
  const progress = Array.isArray(value) ? (value[0] ?? 0) : value;
  tween.value.seek(progress * Math.max(1, tween.value.duration));
}
function playTween(): void { tween.value.play(); }
function pauseTween(): void { tween.value.pause(); }
function restartTween(): void { tween.value.restart(); }
function stopTween(): void { tween.value.stop(); }
const tweenCode = `import { Tween } from '@re-code/flux';

const tween = new Tween({ from: 0, to: 100, duration: 1000 });
tween.value$.subscribe((value) => render(value));
tween.play();
await tween;`;
onBeforeUnmount(() => {
   
  tween.value.stop();
});
</script>

<template>
  <UiCard variant="outlined" class="motion-playground-card">
    <UiCardTitle class="pa-4">
      <div class="text-overline text-primary">{{ copy.staticText.text01VALUESTREAM }}</div>
      <h2 class="text-h6 ma-0">{{ copy.staticText.tweenNumber }}</h2>
      <p class="text-body-2 text-medium-emphasis mt-2 mb-0">{{ copy.staticText.aTypedValueAnimationCanFeedAec8ffb }}</p>
    </UiCardTitle>
    <UiDivider />
    <UiCardText class="pa-4 pa-md-5">
      <UiRow dense>
        <UiCol cols="4"><UiTextField v-model.number="tweenFrom" type="number" :label="copy.staticText.from" density="compact" /></UiCol>
        <UiCol cols="4"><UiTextField v-model.number="tweenTo" type="number" :label="copy.staticText.to" density="compact" /></UiCol>
        <UiCol cols="4"><UiTextField v-model.number="tweenDuration" type="number" :label="copy.staticText.durationMs" density="compact" /></UiCol>
      </UiRow>
      <UiButton class="mt-4 mb-5" color="secondary" variant="tonal" prepend-icon="mdi-check" @click="applyTweenOptions">{{ copy.staticText.applyValues }}</UiButton>

      <div class="value-stage mb-5">
        <div class="value-stage__track">
          <div class="value-stage__object" :style="{ left: `${Math.min(100, Math.max(0, tweenProgress * 100))}%` }">{{ Math.round(tweenValue) }}</div>
        </div>
        <div class="value-stage__axis"><span>{{ tweenFrom }}</span><span>{{ tweenTo }}</span></div>
      </div>

      <UiRow dense class="mb-4">
        <UiCol cols="4"><MetricTile :label="copy.staticText.value" :value="tweenValue.toFixed(2)" /></UiCol>
        <UiCol cols="4"><MetricTile :label="copy.staticText.progress" :value="`${Math.round(tweenProgress * 100)}%`" /></UiCol>
        <UiCol cols="4"><MetricTile :label="copy.staticText.state" :value="tweenState" /></UiCol>
      </UiRow>
      <UiProgressLinear :model-value="tweenProgress * 100" :aria-label="copy.staticText.tweenProgress" :aria-valuetext="copy.staticText.percentAriaValueText.replace('{percent}', String(Math.round(tweenProgress * 100)))" color="primary" rounded height="6" class="mb-4" />
      <LabeledSlider :model-value="tweenProgress" :label="copy.staticText.seekTweenProgress" :min="0" :max="1" :step="0.01" class="mb-4" @update:model-value="seekTween" />
      <div class="d-flex flex-wrap ga-2">
        <UiButton color="primary" prepend-icon="mdi-play" @click="playTween">{{ copy.staticText.play }}</UiButton>
        <UiButton variant="tonal" prepend-icon="mdi-pause" @click="pauseTween">{{ copy.staticText.pause }}</UiButton>
        <UiButton variant="tonal" prepend-icon="mdi-restart" @click="restartTween">{{ copy.staticText.restart }}</UiButton>
        <UiButton variant="tonal" prepend-icon="mdi-stop" @click="stopTween">{{ copy.staticText.stop }}</UiButton>
      </div>
      <UiExpansionPanels variant="accordion" class="mt-5">
        <UiExpansionPanel :title="copy.staticText.viewTheTypeScript">
          <UiExpansionPanelText><pre class="motion-code"><code>{{ tweenCode }}</code></pre></UiExpansionPanelText>
        </UiExpansionPanel>
      </UiExpansionPanels>
    </UiCardText>
  </UiCard>

</template>
