<script setup lang="ts">
import { onBeforeUnmount, ref, shallowRef, watchEffect } from 'vue';
import { projectInertiaTarget, RetargetableMotion, type AnimationState } from '@lib';
import LabeledSlider from '../../LabeledSlider.vue';
import MetricTile from '../../MetricTile.vue';
import EventLog from '../../EventLog.vue';

const stiffness = ref(260);
const damping = ref(30);
const releaseVelocity = ref(520);
const inertiaFriction = ref(6);
const projectedTarget = ref<number | null>(null);
const motionLogs = ref<string[]>([]);
function addMotionLog(message: string): void {
  motionLogs.value = [`${new Date().toLocaleTimeString()} · ${message}`, ...motionLogs.value].slice(0, 12);
}
function createMotion(): RetargetableMotion {
  return new RetargetableMotion({ initialValue: 36, stiffness: stiffness.value, damping: damping.value, onComplete: () => addMotionLog('Spring settled at its target') });
}
const motion = shallowRef(createMotion());
const motionValue = ref(motion.value.value$.value);
const motionVelocity = ref(motion.value.velocity$.value);
const motionTarget = ref(motion.value.target$.value);
const motionState = ref<AnimationState>(motion.value.state$.value);
watchEffect((onCleanup) => {
  const current = motion.value;
  const subscriptions = [
    current.value$.subscribe((value) => { motionValue.value = value; }),
    current.velocity$.subscribe((value) => { motionVelocity.value = value; }),
    current.target$.subscribe((value) => { motionTarget.value = value; }),
    current.state$.subscribe((value) => { motionState.value = value; }),
  ];
  onCleanup(() => subscriptions.forEach((subscription) => subscription.unsubscribe()));
});
function retarget(target: number): void {
  const previous = motion.value.currentSample;
  motion.value.to(target, { stiffness: stiffness.value, damping: damping.value });
  addMotionLog(`Retargeted ${previous.value.toFixed(1)} → ${target}; velocity ${previous.velocity.toFixed(1)} preserved`);
}
function applySpringSettings(): void {
  motion.value.to(motion.value.target$.value, { stiffness: stiffness.value, damping: damping.value });
  addMotionLog(`Spring parameters updated: k=${stiffness.value}, c=${damping.value}`);
}
function projectRelease(): void {
  const target = projectInertiaTarget(motionValue.value, releaseVelocity.value, inertiaFriction.value, { min: 0, max: 300 });
  projectedTarget.value = target;
  retarget(target);
  addMotionLog(`Inertia projected endpoint ${target.toFixed(1)} from ${releaseVelocity.value} units/s`);
}
const springCode = `import { RetargetableMotion, projectInertiaTarget } from '@re-code/flux';

const motion = new RetargetableMotion({ initialValue: 36, stiffness: 260, damping: 30 });
motion.value$.subscribe(render);
motion.to(250);
motion.to(100); // Retarget without resetting velocity.
const endpoint = projectInertiaTarget(position, velocity, 6, { min: 0, max: 300 });`;
onBeforeUnmount(() => motion.value.dispose());
</script>

<template>
  <v-card variant="outlined" class="motion-playground-card">
    <v-card-title class="pa-4">
      <div class="text-overline text-secondary">02 / RETARGETING</div>
      <h2 class="text-h6 ma-0">Spring motion</h2>
      <p class="text-body-2 text-medium-emphasis mt-2 mb-0">Change the target while moving. Position and velocity are sampled and preserved, so a new target does not force a visual reset.</p>
    </v-card-title>
    <v-divider />
    <v-card-text class="pa-4 pa-md-5">
      <div class="spring-stage mb-4">
        <div class="spring-stage__rail">
          <div class="spring-stage__target" :class="{ 'spring-stage__target--end': motionTarget > 220 }" :style="{ left: `${Math.min(100, Math.max(0, motionTarget / 300 * 100))}%` }"><span>target</span></div>
          <div class="spring-stage__object" :style="{ left: `${Math.min(100, Math.max(0, motionValue / 300 * 100))}%` }"><span>re;</span></div>
        </div>
        <div class="spring-stage__axis"><span>0</span><span>300 units</span></div>
      </div>

      <div class="text-body-2 font-weight-medium mb-2">Retarget during motion</div>
      <div class="d-flex flex-wrap ga-2 mb-5">
        <v-btn v-for="target in [30, 90, 170, 250]" :key="target" :variant="motionTarget === target ? 'flat' : 'tonal'" :color="motionTarget === target ? 'primary' : 'default'" @click="retarget(target)">To {{ target }}</v-btn>
      </div>
      <v-card variant="tonal" color="secondary" class="mb-5">
        <v-card-text class="pa-4">
          <div class="text-subtitle-2 font-weight-bold mb-1">Inertia projection</div>
          <p class="text-caption text-medium-emphasis mb-3">Estimate an endpoint from release velocity (units/second), then let the spring settle toward it.</p>
          <div class="d-flex justify-end text-body-2 mb-1"><v-chip size="x-small" variant="tonal">{{ releaseVelocity }} u/s</v-chip></div>
          <LabeledSlider label="Release velocity (units per second)" v-model="releaseVelocity" :min="-1200" :max="1200" :step="40" class="mb-3" />
          <div class="d-flex justify-end text-body-2 mb-1"><v-chip size="x-small" variant="tonal">{{ inertiaFriction }}</v-chip></div>
          <LabeledSlider label="Inertia friction" v-model="inertiaFriction" :min="2" :max="12" :step="1" class="mb-3" />
          <div class="d-flex flex-wrap align-center ga-3">
            <v-btn color="secondary" variant="flat" prepend-icon="mdi-arrow-right-bold" @click="projectRelease">Project & retarget</v-btn>
            <v-chip v-if="projectedTarget !== null" role="status" aria-live="polite" variant="outlined">Projected endpoint: {{ projectedTarget.toFixed(1) }}</v-chip>
          </div>
        </v-card-text>
      </v-card>
      <div class="mb-4">
        <div class="d-flex justify-end text-body-2 mb-1"><v-chip size="x-small" variant="tonal">{{ stiffness }}</v-chip></div>
        <LabeledSlider label="Spring stiffness" v-model="stiffness" :min="60" :max="500" :step="10" />
      </div>
      <div class="mb-4">
        <div class="d-flex justify-end text-body-2 mb-1"><v-chip size="x-small" variant="tonal">{{ damping }}</v-chip></div>
        <LabeledSlider label="Spring damping" v-model="damping" :min="5" :max="60" :step="1" />
      </div>
      <div class="d-flex flex-wrap ga-2 mb-5">
        <v-btn color="secondary" variant="tonal" prepend-icon="mdi-tune" @click="applySpringSettings">Apply physics</v-btn>
        <v-btn variant="tonal" prepend-icon="mdi-pause" @click="motion.pause()">Pause</v-btn>
        <v-btn variant="tonal" prepend-icon="mdi-play" @click="motion.resume()">Resume</v-btn>
        <v-btn variant="tonal" prepend-icon="mdi-stop" @click="motion.stop()">Stop</v-btn>
      </div>
      <v-row dense class="mb-4">
        <v-col cols="4"><MetricTile label="Position" :value="motionValue.toFixed(2)" /></v-col>
        <v-col cols="4"><MetricTile label="Velocity" :value="motionVelocity.toFixed(2)" /></v-col>
        <v-col cols="4"><MetricTile label="State" :value="motionState" /></v-col>
      </v-row>
      <pre class="motion-code"><code>{{ springCode }}</code></pre>
    </v-card-text>
  </v-card>
<EventLog class="mt-5" eyebrow="Retargeting" title="Motion event log" :entries="motionLogs" empty-message="Retargeting and spring-completion events will appear here." @clear="motionLogs = []" />

</template>
