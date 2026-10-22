<script setup lang="ts">
import { useAppStore } from '../../../stores/app';
import { onBeforeUnmount, ref, shallowRef, watchEffect , computed} from 'vue';
import { projectInertiaTarget, RetargetableMotion, type AnimationState } from '@lib';
import LabeledSlider from '../../LabeledSlider.vue';
import MetricTile from '../../MetricTile.vue';
import EventLog from '../../EventLog.vue';


const appStore = useAppStore();
const copy = computed(() => appStore.app.view.motionPanelSpring);
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
  return new RetargetableMotion({ initialValue: 36, stiffness: stiffness.value, damping: damping.value, onComplete: () => addMotionLog(copy.value.staticText.springSettledLog) });
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
  addMotionLog(copy.value.staticText.retargetedLog.replace('{position}', previous.value.toFixed(1)).replace('{target}', String(target)).replace('{velocity}', previous.velocity.toFixed(1)));
}
function applySpringSettings(): void {
  motion.value.to(motion.value.target$.value, { stiffness: stiffness.value, damping: damping.value });
  addMotionLog(copy.value.staticText.springParametersUpdatedLog.replace('{stiffness}', String(stiffness.value)).replace('{damping}', String(damping.value)));
}
function projectRelease(): void {
  const target = projectInertiaTarget(motionValue.value, releaseVelocity.value, inertiaFriction.value, { min: 0, max: 300 });
  projectedTarget.value = target;
  retarget(target);
  addMotionLog(copy.value.staticText.inertiaProjectedEndpointLog.replace('{target}', target.toFixed(1)).replace('{velocity}', String(releaseVelocity.value)));
}
const motionStateLabel = computed(() => ({ idle: copy.value.staticText.idle, running: copy.value.staticText.running, paused: copy.value.staticText.pausedState, completed: copy.value.staticText.completed, stopped: copy.value.staticText.stopped }[motionState.value] ?? motionState.value));
const springCode = `import { RetargetableMotion, projectInertiaTarget } from '@re-code/flux';

const motion = new RetargetableMotion({ initialValue: 36, stiffness: 260, damping: 30 });
motion.value$.subscribe(render);
motion.to(250);
motion.to(100); // Retarget without resetting velocity.
const endpoint = projectInertiaTarget(position, velocity, 6, { min: 0, max: 300 });`;
onBeforeUnmount(() => motion.value.dispose());
</script>

<template>
  <UiCard variant="outlined" class="motion-playground-card">
    <UiCardTitle class="pa-4">
      <div class="text-overline text-secondary">{{ copy.staticText.text02RETARGETING }}</div>
      <h2 class="text-h6 ma-0">{{ copy.staticText.springMotion }}</h2>
      <p class="text-body-2 text-medium-emphasis mt-2 mb-0">{{ copy.staticText.changeTheTargetWhileMovingPositionAnd2ea5b8 }}</p>
    </UiCardTitle>
    <UiDivider />
    <UiCardText class="pa-4 pa-md-5">
      <div class="spring-stage mb-4">
        <div class="spring-stage__rail">
          <div class="spring-stage__target" :class="{ 'spring-stage__target--end': motionTarget > 220 }" :style="{ left: `${Math.min(100, Math.max(0, motionTarget / 300 * 100))}%` }"><span>{{ copy.staticText.target }}</span></div>
          <div class="spring-stage__object" :style="{ left: `${Math.min(100, Math.max(0, motionValue / 300 * 100))}%` }"><span>{{ copy.staticText.re }}</span></div>
        </div>
        <div class="spring-stage__axis"><span>0</span><span>{{ copy.staticText.text300Units }}</span></div>
      </div>

      <div class="text-body-2 font-weight-medium mb-2">{{ copy.staticText.retargetDuringMotion }}</div>
      <div class="d-flex flex-wrap ga-2 mb-5">
        <UiButton v-for="target in [30, 90, 170, 250]" :key="target" :variant="motionTarget === target ? 'flat' : 'tonal'" :color="motionTarget === target ? 'primary' : 'default'" @click="retarget(target)">{{ copy.staticText.to }} {{ target }}</UiButton>
      </div>
      <UiCard variant="tonal" color="secondary" class="mb-5">
        <UiCardText class="pa-4">
          <div class="text-subtitle-2 font-weight-bold mb-1">{{ copy.staticText.inertiaProjection }}</div>
          <p class="text-caption text-medium-emphasis mb-3">{{ copy.staticText.estimateAnEndpointFromReleaseVelocityUnitse1b43d }}</p>
          <div class="d-flex justify-end text-body-2 mb-1"><UiChip size="x-small" variant="tonal">{{ releaseVelocity }} {{ copy.staticText.uS }}</UiChip></div>
          <LabeledSlider :label="copy.staticText.releaseVelocityUnitsPerSecond" v-model="releaseVelocity" :min="-1200" :max="1200" :step="40" class="mb-3" />
          <div class="d-flex justify-end text-body-2 mb-1"><UiChip size="x-small" variant="tonal">{{ inertiaFriction }}</UiChip></div>
          <LabeledSlider :label="copy.staticText.inertiaFriction" v-model="inertiaFriction" :min="2" :max="12" :step="1" class="mb-3" />
          <div class="d-flex flex-wrap align-center ga-3">
            <UiButton color="secondary" variant="flat" prepend-icon="mdi-arrow-right-bold" @click="projectRelease">{{ copy.staticText.projectRetarget }}</UiButton>
            <UiChip v-if="projectedTarget !== null" role="status" aria-live="polite" variant="outlined">{{ copy.staticText.projectedEndpoint }} {{ projectedTarget.toFixed(1) }}</UiChip>
          </div>
        </UiCardText>
      </UiCard>
      <div class="mb-4">
        <div class="d-flex justify-end text-body-2 mb-1"><UiChip size="x-small" variant="tonal">{{ stiffness }}</UiChip></div>
        <LabeledSlider :label="copy.staticText.springStiffness" v-model="stiffness" :min="60" :max="500" :step="10" />
      </div>
      <div class="mb-4">
        <div class="d-flex justify-end text-body-2 mb-1"><UiChip size="x-small" variant="tonal">{{ damping }}</UiChip></div>
        <LabeledSlider :label="copy.staticText.springDamping" v-model="damping" :min="5" :max="60" :step="1" />
      </div>
      <div class="d-flex flex-wrap ga-2 mb-5">
        <UiButton color="secondary" variant="tonal" prepend-icon="mdi-tune" @click="applySpringSettings">{{ copy.staticText.applyPhysics }}</UiButton>
        <UiButton variant="tonal" prepend-icon="mdi-pause" @click="motion.pause()">{{ copy.staticText.pause }}</UiButton>
        <UiButton variant="tonal" prepend-icon="mdi-play" @click="motion.resume()">{{ copy.staticText.resume }}</UiButton>
        <UiButton variant="tonal" prepend-icon="mdi-stop" @click="motion.stop()">{{ copy.staticText.stop }}</UiButton>
      </div>
      <UiRow dense class="mb-4">
        <UiCol cols="4"><MetricTile :label="copy.staticText.position" :value="motionValue.toFixed(2)" /></UiCol>
        <UiCol cols="4"><MetricTile :label="copy.staticText.velocity" :value="motionVelocity.toFixed(2)" /></UiCol>
        <UiCol cols="4"><MetricTile :label="copy.staticText.state" :value="motionStateLabel" /></UiCol>
      </UiRow>
      <pre class="motion-code"><code>{{ springCode }}</code></pre>
    </UiCardText>
  </UiCard>
<EventLog class="mt-5" :eyebrow="copy.staticText.retargeting" :title="copy.staticText.motionEventLog" :entries="motionLogs" :empty-message="copy.staticText.retargetingAndSpringCompletionEventsWillAppearHere" @clear="motionLogs = []" />

</template>
