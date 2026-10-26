<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useAppStore } from '../../../stores/app';
import LabeledSlider from '../../LabeledSlider.vue';
import {
  createSteeringSwarm,
  drawSteeringSwarm,
  stepSteeringSwarm,
  type SteeringDemoMode,
  type SteeringSwarmSimulation,
} from '../../../demos/canvas/steeringSwarm';

const appStore = useAppStore();
const copy = computed(() => appStore.app.view.motionPanelSteering);
const canvasElement = ref<HTMLCanvasElement | null>(null);
const mode = ref<SteeringDemoMode>('flow');
const agentCount = ref(42);
const maxSpeed = ref(106);
const maxForce = ref(92);
const running = ref(false);
const frameCount = ref(0);
const statusText = computed(() => running.value ? copy.value.staticText.running : copy.value.staticText.paused);
const modeOptions = computed(() => [
  { title: copy.value.staticText.followFlowField, value: 'flow' },
  { title: copy.value.staticText.seekTarget, value: 'seek' },
  { title: copy.value.staticText.arriveAtTarget, value: 'arrive' },
]);

let simulation: SteeringSwarmSimulation | null = null;
let context: CanvasRenderingContext2D | null = null;
let width = 960;
let height = 320;
let frameId: number | null = null;
let previousTimestamp = 0;
let resizeObserver: ResizeObserver | null = null;
let pointerActive = false;
let target = { x: width / 2, y: height / 2 };

const playgroundCode = `import { createFlowField } from '@re-code/flux/flow-field';
import {
  combineSteering, followFlowField, separate, stepSteeringAgent,
} from '@re-code/flux/steering';

const field = createFlowField({
  columns: 24, rows: 12, cellSize: 32,
  vectorAtCell: ({ x, y }) => {
    const angle = Math.atan2(y - 192, x - 384) + Math.PI / 2;
    return { x: Math.cos(angle), y: Math.sin(angle) };
  },
});

const flow = followFlowField(agent, field, { maxSpeed: 106, maxForce: 92 });
const spacing = separate(agent, neighbours, { distance: 28, maxForce: 66 });
const force = combineSteering([
  { force: flow },
  { force: spacing, weight: 0.85 },
], 124);
const next = stepSteeringAgent(agent, force, deltaSeconds, {
  maxSpeed: 106, linearDamping: 0.32, maxDeltaSeconds: 0.04,
});`;

function canvasPalette(): { agentColor: string; accentColor: string; fieldColor: string; linkColor: string; targetColor: string } {
  const style = getComputedStyle(canvasElement.value ?? document.documentElement);
  const normalize = (name: string, fallback: string): string => {
    const raw = style.getPropertyValue(name).trim();
    if (!raw) return fallback;
    if (/^(rgb|hsl|#|transparent|currentColor)/i.test(raw)) return raw;
    return `rgb(${raw})`;
  };
  return {
    agentColor: normalize('--rx-color-accent-cyan-rgb', '#67e8f9'),
    accentColor: normalize('--rx-theme-primary', '#a78bfa'),
    fieldColor: normalize('--rx-color-accent-cyan-rgb', '#67e8f9').replace(/^rgb\(([^)]+)\)$/, 'rgba($1, 0.28)'),
    linkColor: normalize('--rx-color-accent-cyan-rgb', '#67e8f9').replace(/^rgb\(([^)]+)\)$/, 'rgba($1, 0.15)'),
    targetColor: normalize('--rx-color-accent-amber-rgb', '#f6b96e'),
  };
}

function measureCanvas(): void {
  const canvas = canvasElement.value;
  if (!canvas) return;
  const nextWidth = Math.max(320, Math.round(canvas.clientWidth || 960));
  const nextHeight = Math.max(220, Math.round(canvas.clientHeight || 320));
  const ratio = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
  width = nextWidth;
  height = nextHeight;
  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(height * ratio);
  context = canvas.getContext('2d');
  context?.setTransform(ratio, 0, 0, ratio, 0, 0);
  target = { x: width / 2, y: height / 2 };
  simulation = createSteeringSwarm(width, height, agentCount.value);
  drawCurrentFrame();
}

function currentTarget(): { x: number; y: number } {
  return pointerActive ? target : { x: width / 2, y: height / 2 };
}

function drawCurrentFrame(): void {
  if (!context || !simulation) return;
  drawSteeringSwarm(context, simulation, {
    showField: mode.value === 'flow',
    ...(pointerActive ? { target: currentTarget() } : {}),
    ...canvasPalette(),
  });
}

function tick(timestamp: number): void {
  frameId = null;
  if (!running.value || document.visibilityState === 'hidden' || !context || !simulation) return;
  const deltaSeconds = previousTimestamp === 0 ? 1 / 60 : Math.min(0.04, Math.max(0.001, (timestamp - previousTimestamp) / 1000));
  previousTimestamp = timestamp;
  stepSteeringSwarm(simulation, deltaSeconds, {
    mode: mode.value,
    target: currentTarget(),
    maxSpeed: maxSpeed.value,
    maxForce: maxForce.value,
    targetInfluence: pointerActive && mode.value === 'flow' ? 0.38 : 0,
  });
  frameCount.value += 1;
  drawCurrentFrame();
  frameId = requestAnimationFrame(tick);
}

function startSimulation(): void {
  if (running.value) return;
  running.value = true;
  previousTimestamp = 0;
  frameId = requestAnimationFrame(tick);
}

function pauseSimulation(): void {
  running.value = false;
  previousTimestamp = 0;
  if (frameId !== null) cancelAnimationFrame(frameId);
  frameId = null;
}

function resetSimulation(): void {
  pauseSimulation();
  measureCanvas();
  frameCount.value = 0;
}

function onPointerMove(event: PointerEvent): void {
  const canvas = canvasElement.value;
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  target = {
    x: Math.max(0, Math.min(width, (event.clientX - rect.left) * width / Math.max(rect.width, 1))),
    y: Math.max(0, Math.min(height, (event.clientY - rect.top) * height / Math.max(rect.height, 1))),
  };
  pointerActive = true;
  if (!running.value) drawCurrentFrame();
}

function onPointerLeave(): void {
  pointerActive = false;
  if (!running.value) drawCurrentFrame();
}

function onCanvasKeydown(event: KeyboardEvent): void {
  const movement = event.shiftKey ? 24 : 10;
  const next = { ...currentTarget() };
  if (event.key === 'ArrowLeft') next.x -= movement;
  else if (event.key === 'ArrowRight') next.x += movement;
  else if (event.key === 'ArrowUp') next.y -= movement;
  else if (event.key === 'ArrowDown') next.y += movement;
  else return;
  event.preventDefault();
  target = {
    x: Math.max(0, Math.min(width, next.x)),
    y: Math.max(0, Math.min(height, next.y)),
  };
  pointerActive = true;
  if (!running.value) drawCurrentFrame();
}

function onVisibilityChange(): void {
  if (document.visibilityState === 'hidden') {
    if (frameId !== null) cancelAnimationFrame(frameId);
    frameId = null;
    previousTimestamp = 0;
    return;
  }
  if (running.value && frameId === null) frameId = requestAnimationFrame(tick);
}

watch([mode, agentCount], () => {
  if (simulation && context) {
    if (simulation.agents.length !== agentCount.value) simulation = createSteeringSwarm(width, height, agentCount.value);
    drawCurrentFrame();
  }
});
watch([maxSpeed, maxForce], () => {
  if (!running.value) drawCurrentFrame();
});

onMounted(() => {
  measureCanvas();
  if (typeof ResizeObserver !== 'undefined' && canvasElement.value) {
    resizeObserver = new ResizeObserver(() => measureCanvas());
    resizeObserver.observe(canvasElement.value);
  }
  document.addEventListener('visibilitychange', onVisibilityChange);
});

onBeforeUnmount(() => {
  pauseSimulation();
  resizeObserver?.disconnect();
  resizeObserver = null;
  document.removeEventListener('visibilitychange', onVisibilityChange);
  simulation = null;
  context = null;
});
</script>

<template>
  <UiCard variant="outlined" class="motion-playground-card steering-playground-card">
    <UiCardTitle class="pa-4">
      <div class="text-overline text-primary">{{ copy.staticText.natureOfCodeInspiredMotion }}</div>
      <h2 class="text-h6 ma-0">{{ copy.staticText.steeringAndFlowFields }}</h2>
      <p class="text-body-2 text-medium-emphasis mt-2 mb-0">{{ copy.staticText.inspectAutonomousAgentsCombiningFlowSteeringAndSeparation }}</p>
    </UiCardTitle>
    <UiDivider />
    <UiCardText class="pa-4 pa-md-5">
      <div class="d-flex flex-wrap align-end ga-3 mb-4 steering-playground-controls">
        <div class="steering-playground-controls__mode">
          <UiSelect v-model="mode" :items="modeOptions" :label="copy.staticText.behaviorMode" hide-details />
        </div>
        <div class="steering-playground-controls__slider">
          <LabeledSlider v-model="agentCount" :label="copy.staticText.agentCount" :min="12" :max="90" :step="6" :value-text="String(agentCount)" />
        </div>
        <div class="steering-playground-controls__slider">
          <LabeledSlider v-model="maxSpeed" :label="copy.staticText.maximumSpeed" :min="30" :max="180" :step="5" :value-text="`${maxSpeed} px/s`" />
        </div>
        <div class="steering-playground-controls__slider">
          <LabeledSlider v-model="maxForce" :label="copy.staticText.steeringForce" :min="20" :max="180" :step="4" :value-text="String(maxForce)" />
        </div>
      </div>
      <canvas
        ref="canvasElement"
        class="steering-simulation-canvas mb-4"
        role="img"
        tabindex="0"
        aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight"
        :aria-label="copy.staticText.interactiveSteeringSimulation"
        @keydown="onCanvasKeydown"
        @pointermove="onPointerMove"
        @pointerleave="onPointerLeave"
        @pointerdown="onPointerMove"
      />
      <p class="text-body-2 text-medium-emphasis mb-4">{{ mode === 'flow' ? copy.staticText.flowFieldInstructions : copy.staticText.targetInstructions }}</p>
      <div class="d-flex flex-wrap align-center ga-2 mb-4">
        <UiButton color="primary" variant="flat" prepend-icon="mdi-play" :disabled="running" @click="startSimulation">{{ copy.staticText.startSimulation }}</UiButton>
        <UiButton variant="tonal" prepend-icon="mdi-pause" :disabled="!running" @click="pauseSimulation">{{ copy.staticText.pauseSimulation }}</UiButton>
        <UiButton variant="outlined" prepend-icon="mdi-refresh" @click="resetSimulation">{{ copy.staticText.resetSimulation }}</UiButton>
        <UiChip :color="running ? 'success' : 'default'" variant="tonal" role="status" aria-live="polite">{{ statusText }}</UiChip>
        <UiChip variant="outlined">{{ simulation?.agents.length ?? agentCount }} {{ copy.staticText.agents }}</UiChip>
        <UiChip variant="outlined">{{ frameCount }} {{ copy.staticText.frames }}</UiChip>
      </div>
      <pre class="motion-code"><code>{{ playgroundCode }}</code></pre>
    </UiCardText>
  </UiCard>
</template>
