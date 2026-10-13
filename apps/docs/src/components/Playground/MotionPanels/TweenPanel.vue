<script setup lang="ts">
import { ref, shallowRef, watchEffect, onBeforeUnmount } from 'vue';
import { Tween, type AnimationState } from '@lib';
import LabeledSlider from '../../LabeledSlider.vue';
import MetricTile from '../../MetricTile.vue';

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
  // Animation/Tween are PromiseLike; return void so Vue does not treat cancellation as a lifecycle failure.
  tween.value.stop();
});
</script>

<template>
  <v-card variant="outlined" class="motion-playground-card">
    <v-card-title class="pa-4">
      <div class="text-overline text-primary">01 / VALUE STREAM</div>
      <h2 class="text-h6 ma-0">Tween&lt;number&gt;</h2>
      <p class="text-body-2 text-medium-emphasis mt-2 mb-0">A typed value animation can feed a DOM style, Canvas draw call, chart, or any other renderer.</p>
    </v-card-title>
    <v-divider />
    <v-card-text class="pa-4 pa-md-5">
      <v-row dense>
        <v-col cols="4"><v-text-field v-model.number="tweenFrom" type="number" label="From" density="compact" /></v-col>
        <v-col cols="4"><v-text-field v-model.number="tweenTo" type="number" label="To" density="compact" /></v-col>
        <v-col cols="4"><v-text-field v-model.number="tweenDuration" type="number" label="Duration (ms)" density="compact" /></v-col>
      </v-row>
      <v-btn class="mt-4 mb-5" color="secondary" variant="tonal" prepend-icon="mdi-check" @click="applyTweenOptions">Apply values</v-btn>

      <div class="value-stage mb-5">
        <div class="value-stage__track">
          <div class="value-stage__object" :style="{ left: `${Math.min(100, Math.max(0, tweenProgress * 100))}%` }">{{ Math.round(tweenValue) }}</div>
        </div>
        <div class="value-stage__axis"><span>{{ tweenFrom }}</span><span>{{ tweenTo }}</span></div>
      </div>

      <v-row dense class="mb-4">
        <v-col cols="4"><MetricTile label="Value" :value="tweenValue.toFixed(2)" /></v-col>
        <v-col cols="4"><MetricTile label="Progress" :value="`${Math.round(tweenProgress * 100)}%`" /></v-col>
        <v-col cols="4"><MetricTile label="State" :value="tweenState" /></v-col>
      </v-row>
      <v-progress-linear :model-value="tweenProgress * 100" aria-label="Tween progress" :aria-valuetext="`${Math.round(tweenProgress * 100)} percent`" color="primary" rounded height="6" class="mb-4" />
      <LabeledSlider :model-value="tweenProgress" label="Seek tween progress" :min="0" :max="1" :step="0.01" class="mb-4" @update:model-value="seekTween" />
      <div class="d-flex flex-wrap ga-2">
        <v-btn color="primary" prepend-icon="mdi-play" @click="playTween">Play</v-btn>
        <v-btn variant="tonal" prepend-icon="mdi-pause" @click="pauseTween">Pause</v-btn>
        <v-btn variant="tonal" prepend-icon="mdi-restart" @click="restartTween">Restart</v-btn>
        <v-btn variant="tonal" prepend-icon="mdi-stop" @click="stopTween">Stop</v-btn>
      </div>
      <v-expansion-panels variant="accordion" class="mt-5">
        <v-expansion-panel title="View the TypeScript">
          <v-expansion-panel-text><pre class="motion-code"><code>{{ tweenCode }}</code></pre></v-expansion-panel-text>
        </v-expansion-panel>
      </v-expansion-panels>
    </v-card-text>
  </v-card>

</template>
