<script setup lang="ts">
import { computed } from 'vue';
import { useAppStore } from '../../stores/app';
import type { MotionPreferences } from '@lib';
import type { VisualLabStageConfig, VisualLabTelemetry } from './visualLabTypes';
import { useVisualLabFeaturedStage } from './useVisualLabFeaturedStage';

const props = defineProps<{ config: VisualLabStageConfig; preferences: MotionPreferences }>();
const emit = defineEmits<{ telemetry: [telemetry: VisualLabTelemetry] }>();
const appStore = useAppStore();
const copy = computed(() => appStore.app.view.visualLabFeaturedStage);
const stage = useVisualLabFeaturedStage(props, (telemetry) => emit('telemetry', telemetry));
const {
  root,
  canvasHost,
  isVisible,
  isPointerActive,
  canvasUnavailable,
  prefersReducedMotion,
  onPointerMove,
  clearPointer,
  onKeydown,
  resetCenter,
} = stage;

defineExpose({ resetCenter });
</script>

<template>
  <div
    ref="root"
    class="lab-feature-stage"
    :class="{ 'is-active': isVisible && !prefersReducedMotion, 'is-pointer-active': isPointerActive, 'is-static': prefersReducedMotion }"
    role="group"
    :aria-label="copy.staticText.interactiveP5Singularity"
    tabindex="0"
    @pointermove="onPointerMove"
    @pointerleave="clearPointer"
    @focusout="clearPointer"
    @keydown="onKeydown"
  >
    <div ref="canvasHost" class="lab-feature-stage__canvas-host" aria-hidden="true" />
    <div v-if="canvasUnavailable" class="lab-feature-stage__fallback" role="status">{{ copy.staticText.p5PreviewUnavailable }}</div>
    <div v-if="!canvasUnavailable" class="lab-feature-stage__credit">
      {{ copy.staticText.poweredByP5js }}
      <a href="https://p5js.org/" target="_blank" rel="noreferrer noopener">{{ copy.staticText.p5jsName }} <span aria-hidden="true">↗</span></a>
    </div>
    <div class="lab-feature-stage__vignette" aria-hidden="true" />
    <div v-if="!canvasUnavailable" class="lab-feature-stage__hint">
      {{ prefersReducedMotion ? copy.staticText.reducedMotion : isPointerActive ? copy.staticText.pointerSpringActive : isVisible ? copy.staticText.movePointerOrUseArrowKeys : copy.staticText.stagePausedOffscreen }}
    </div>
  </div>
</template>
