<script setup lang="ts">
import { computed, onBeforeUnmount, ref, shallowRef } from 'vue';
import { Animation, Easings, resolveEasing, type EasingName } from '@lib';
import EasingCurve from '../components/EasingCurve.vue';

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
  <v-container class="py-8 py-md-12" style="max-width: 1200px">
<v-row align="start">
      <v-col cols="12" md="7">
        <v-card variant="outlined" class="h-100">
          <v-card-title class="d-flex align-center justify-space-between pa-4"><div><div class="text-overline text-primary">Easing curve</div><h2 class="text-h6 ma-0">{{ selected }}</h2></div><v-chip size="small" variant="tonal">t → easing(t)</v-chip></v-card-title>
          <v-divider />
          <v-card-text class="pa-4 pa-md-5">
            <div class="curve-wrap"><EasingCurve :easing="resolveEasing(selected)" :label="`Easing curve ${selected}`" :progress="progress" /></div>
            <v-table density="compact" class="mt-5"><thead><tr><th>Time (t)</th><th>Output</th></tr></thead><tbody><tr v-for="sample in sampleValues" :key="sample.t"><td><code>{{ sample.t.toFixed(2) }}</code></td><td><code>{{ sample.value.toFixed(3) }}</code></td></tr></tbody></v-table>
          </v-card-text>
        </v-card>
      </v-col>
      <v-col cols="12" md="5">
        <v-card variant="outlined">
          <v-card-title class="pa-4"><div><div class="text-overline text-primary">Interpolation</div><h2 class="text-h6 ma-0">Try an easing</h2></div></v-card-title>
          <v-divider />
          <v-card-text class="pa-4">
            <v-select v-model="selected" :items="names" label="Easing function" hide-details class="mb-6" @update:model-value="applyEasing" />
            <div class="easing-stage mb-5"><span class="track-start">0</span><span class="track-end">1</span><div class="easing-track"><div class="easing-runner" :style="runnerStyle"><span>rx</span></div></div></div>
            <v-row dense class="mb-5"><v-col cols="4"><v-sheet rounded="lg" color="surface-variant" class="pa-3"><div class="text-overline text-medium-emphasis">Time</div><div class="text-h6">{{ progress.toFixed(2) }}</div></v-sheet></v-col><v-col cols="4"><v-sheet rounded="lg" color="surface-variant" class="pa-3"><div class="text-overline text-medium-emphasis">Value</div><div class="text-h6">{{ eased.toFixed(3) }}</div></v-sheet></v-col><v-col cols="4"><v-sheet rounded="lg" color="surface-variant" class="pa-3"><div class="text-overline text-medium-emphasis">State</div><div class="text-body-2 font-weight-bold text-truncate">{{ isRunning ? 'running' : (progress >= 1 ? 'completed' : 'idle') }}</div></v-sheet></v-col></v-row>
            <div class="d-flex flex-wrap ga-2"><v-btn @click="play" color="primary" variant="flat" prepend-icon="mdi-play">Play</v-btn><v-btn @click="pause" variant="tonal" prepend-icon="mdi-pause">Pause</v-btn><v-btn @click="stop" variant="tonal" prepend-icon="mdi-stop">Stop</v-btn><v-btn @click="restart" variant="tonal" prepend-icon="mdi-restart">Restart</v-btn></div>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>
  </v-container>
</template>
