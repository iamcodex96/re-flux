<script setup lang="ts">
import LabeledSlider from '../components/LabeledSlider.vue';
import { computed, onBeforeUnmount, ref, shallowRef, watchEffect } from 'vue';
import { Animation, Easings, type EasingName } from '@lib';
import MetricTile from '../components/MetricTile.vue';
import EventLog from '../components/EventLog.vue';

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
    onStart: () => log('onStart()'),
    onUpdate: (_raw, eased) => { easedProgress.value = eased; },
    onComplete: () => log('onComplete()'),
    onPause: () => log('onPause()'),
    onResume: () => log('onResume()'),
    onStop: () => log('onStop()'),
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
  log('Created a new instance with the current options');
}

async function playAndWait(): Promise<void> {
  const current = animation.value;
  current.play();
  log('await animation…');
  try {
    await current;
    log('await resolved ✓');
  } catch (error: unknown) {
    log(`await rejected: ${error instanceof Error ? error.message : String(error)}`);
  }
}

onBeforeUnmount(() => { animation.value.stop(); });
</script>

<template>
  <v-container class="py-8 py-md-12" style="max-width: 1200px">
<v-row align="start">
      <v-col cols="12" md="4" lg="3">
        <v-card variant="outlined">
          <v-card-title class="d-flex align-center justify-space-between ga-3 pa-4">
            <div><div class="text-overline text-primary">Configuration</div><h2 class="text-h6 ma-0">Options</h2></div>
            <v-chip size="small" variant="tonal">Constructor</v-chip>
          </v-card-title>
          <v-divider />
          <v-card-text class="pa-4">
            <div class="mb-5">
              <div class="d-flex justify-end mb-1"><v-chip size="x-small" color="primary" variant="tonal">{{ duration }} ms</v-chip></div>
              <LabeledSlider label="Duration (milliseconds)" v-model="duration" :min="150" :max="3000" :step="50" />
            </div>
            <div class="mb-5">
              <div class="d-flex justify-end mb-1"><v-chip size="x-small" color="primary" variant="tonal">{{ delay }} ms</v-chip></div>
              <LabeledSlider label="Delay (milliseconds)" v-model="delay" :min="0" :max="1500" :step="50" />
            </div>
            <div class="mb-5">
              <div class="d-flex justify-end mb-1"><v-chip size="x-small" color="primary" variant="tonal">{{ infinite ? '∞' : repeatCount }}</v-chip></div>
              <LabeledSlider label="Repeat count" v-model="repeatCount" :min="0" :max="5" :step="1" :disabled="infinite" />
            </div>
            <v-select hide-details v-model="easingName" :items="easingNames" label="Easing" class="mb-2" />
            <v-switch hide-details v-model="infinite" label="Repeat forever" color="primary" class="mb-2" />
            <v-switch hide-details v-model="yoyo" label="Yoyo (alternate direction)" color="primary" />
          </v-card-text>
          <v-divider />
          <v-card-actions class="d-flex flex-column align-stretch pa-4 ga-2">
            <v-btn block @click="applyOptions" color="primary" variant="flat" append-icon="mdi-refresh">Apply options</v-btn>
            <p class="text-caption text-medium-emphasis mb-0">Constructor options are immutable. Applying stops and replaces the active instance.</p>
          </v-card-actions>
        </v-card>
      </v-col>

      <v-col cols="12" md="8" lg="9">
        <v-card variant="outlined">
          <v-card-title class="d-flex flex-wrap align-center justify-space-between ga-3 pa-4">
            <div><div class="text-overline text-primary">Live preview</div><h2 class="text-h6 ma-0">Motion stage</h2></div>
            <v-chip role="status" aria-live="polite" :color="state === 'running' ? 'success' : state === 'paused' ? 'warning' : state === 'completed' ? 'secondary' : 'default'" size="small" variant="tonal" dot>{{ state }}</v-chip>
          </v-card-title>
          <v-divider />
          <v-card-text class="pa-4 pa-md-5">
            <div class="motion-stage">
              <div class="stage-track"><span class="track-start">0</span><span class="track-end">100%</span></div>
              <div class="motion-box-track"><div class="motion-box" :style="boxStyle"><span>rx</span></div></div>
              <div class="stage-caption">translateX · rotate · opacity</div>
            </div>
            <v-row dense class="my-4">
              <v-col cols="4"><MetricTile label="Progress" :value="progressPercent" /></v-col>
              <v-col cols="4"><MetricTile label="Eased" :value="easedProgress.toFixed(3)" /></v-col>
              <v-col cols="4"><MetricTile label="State" :value="state" /></v-col>
            </v-row>
            <v-progress-linear :model-value="progress * 100" aria-label="Animation progress" :aria-valuetext="progressPercent" color="primary" height="6" rounded class="mb-5" />
            <div class="d-flex flex-wrap ga-2 mb-5">
              <v-btn @click="playAnimation" color="primary" variant="flat" prepend-icon="mdi-play">Play</v-btn>
              <v-btn @click="pauseAnimation" variant="tonal" prepend-icon="mdi-pause">Pause</v-btn>
              <v-btn @click="stopAnimation" variant="tonal" prepend-icon="mdi-stop">Stop</v-btn>
              <v-btn @click="restartAnimation" variant="tonal" prepend-icon="mdi-restart">Restart</v-btn>
            </div>
            <div class="mb-5">
              <div class="d-flex justify-space-between text-body-2 mb-2"><span>Seek</span><span class="font-weight-medium">{{ progressPercent }}</span></div>
              <LabeledSlider label="Seek animation progress" :model-value="progress" :min="0" :max="1" :step="0.01" @update:model-value="seekFromInput" />
            </div>
            <v-btn @click="playAndWait" color="secondary" variant="outlined" prepend-icon="mdi-code-braces">Play and await with <code class="ml-1">await animation</code></v-btn>
          </v-card-text>
        </v-card>

        <EventLog
          class="mt-4"
          eyebrow="Lifecycle"
          title="Event log"
          :entries="logs"
          empty-message="Callbacks will appear here when you play the animation."
          @clear="logs = []"
        />
      </v-col>
    </v-row>
  </v-container>
</template>
