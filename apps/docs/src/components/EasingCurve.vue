<script setup lang="ts">
import { useAppStore } from '../stores/app';
import { computed, useId } from 'vue';
import type { EasingFunction } from '@lib';


const appStore = useAppStore();
const copy = computed(() => appStore.app.view.easingCurve);
const props = withDefaults(defineProps<{
  easing: EasingFunction;
  label: string;
  progress?: number;
  showGrid?: boolean;
  compact?: boolean;
}>(), {
  showGrid: true,
  compact: false,
});

const clipId = `easing-curve-clip-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
const plot = { left: 16, right: 304, top: 12, bottom: 140 } as const;
const tickIndexes = [0, 1, 2, 3, 4] as const;

function safeEvaluate(progress: number): number {
  const value = props.easing(progress);
  return Number.isFinite(value) ? value : progress;
}

const samples = computed(() => Array.from({ length: 101 }, (_, index) => {
  const progress = index / 100;
  return { progress, value: safeEvaluate(progress) };
}));

const outputExtent = computed(() => {
  const values = samples.value.map((sample) => sample.value);
  return { min: Math.min(0, 1, ...values), max: Math.max(0, 1, ...values) };
});

 
const bounds = computed(() => {
  const { min: rawMin, max: rawMax } = outputExtent.value;
  const range = Math.max(rawMax - rawMin, 1);
  const padding = range * 0.08;
  return { min: rawMin - padding, max: rawMax + padding };
});

function xForProgress(progress: number): number {
  const t = Math.min(1, Math.max(0, progress));
  return plot.left + t * (plot.right - plot.left);
}

function yForValue(value: number): number {
  const { min, max } = bounds.value;
  return plot.bottom - ((value - min) / (max - min)) * (plot.bottom - plot.top);
}

const curvePoints = computed(() => samples.value
  .map((sample) => `${xForProgress(sample.progress).toFixed(2)},${yForValue(sample.value).toFixed(2)}`)
  .join(' '));
const referencePoints = computed(() => `${xForProgress(0)},${yForValue(0)} ${xForProgress(1)},${yForValue(1)}`);
const progressPoint = computed(() => {
  if (props.progress === undefined) return null;
  const progress = Math.min(1, Math.max(0, props.progress));
  return { x: xForProgress(progress), y: yForValue(safeEvaluate(progress)) };
});
const outputRange = computed(() => `${outputExtent.value.min.toFixed(2)} to ${outputExtent.value.max.toFixed(2)}`);
</script>

<template>
  <div class="easing-curve-chart" :class="{ 'easing-curve-chart--compact': compact }">
    <svg
      class="easing-curve__svg"
      viewBox="0 0 320 152"
      preserveAspectRatio="xMidYMid meet"
      role="img"
      :aria-label="label"
    >
      <defs>
        <clipPath :id="clipId">
          <rect :x="plot.left - 3" :y="plot.top - 3" :width="plot.right - plot.left + 6" :height="plot.bottom - plot.top + 6" />
        </clipPath>
      </defs>
      <g v-if="showGrid" class="easing-curve__grid">
        <line v-for="tick in tickIndexes" :key="`x-${tick}`" :x1="plot.left + tick * (plot.right - plot.left) / 4" :x2="plot.left + tick * (plot.right - plot.left) / 4" :y1="plot.top" :y2="plot.bottom" />
        <line v-for="tick in tickIndexes" :key="`y-${tick}`" :x1="plot.left" :x2="plot.right" :y1="plot.top + tick * (plot.bottom - plot.top) / 4" :y2="plot.top + tick * (plot.bottom - plot.top) / 4" />
      </g>
      <g :clip-path="`url(#${clipId})`">
        <polyline :points="referencePoints" class="easing-curve__reference" />
        <polyline :points="curvePoints" class="easing-curve__line" />
        <circle v-if="progressPoint" :cx="progressPoint.x" :cy="progressPoint.y" r="3.2" class="easing-curve__point" />
      </g>
    </svg>
    <div v-if="!compact" class="easing-curve__legend">
      <span>{{ copy.staticText.progress01 }}</span>
      <span>{{ copy.staticText.outputRange }} {{ outputRange }}</span>
    </div>
  </div>
</template>

<style scoped lang="scss" src="../styles/components/easing-curve.scss"></style>
