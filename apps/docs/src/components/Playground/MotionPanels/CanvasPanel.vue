<script setup lang="ts">
import { computed, onBeforeUnmount, ref, shallowRef } from 'vue';
import { Tween } from '@lib';
import { bindCanvas } from '@lib/canvas';
import type { Subscription } from 'rxjs';
import { useAppStore } from '../../../stores/app';

const appStore = useAppStore();
const copy = computed(() => appStore.app.view.motionPanelCanvas);

const canvasElement = ref<HTMLCanvasElement | null>(null);
const canvasPosition = ref(20);
const canvasStatus = ref<'idle' | 'running'>('idle');
const canvasStatusLabel = computed(() => copy.value.staticText[canvasStatus.value]);
const canvasMotion = shallowRef<Tween<number> | null>(null);
let canvasBinding: Subscription | null = null;
function startCanvasDemo(): void {
  const canvas = canvasElement.value;
  const context = canvas?.getContext('2d');
  if (!canvas || !context) return;
  stopCanvasDemo();
  const radius = 12;
  const animation = new Tween({ from: radius + 8, to: Math.max(radius + 8, canvas.width - radius - 8), duration: 1450, easing: 'easeInOutCubic', repeat: Infinity, yoyo: true });
  canvasMotion.value = animation;
  canvasBinding = bindCanvas(context, animation.value$, (ctx, x) => {
    canvasPosition.value = x;
    ctx.fillStyle = getComputedStyle(canvas).getPropertyValue('--rx-color-primary').trim() || '#9680ff';
    ctx.shadowColor = 'rgba(150, 128, 255, 0.26)';
    ctx.shadowBlur = 16;
    ctx.beginPath();
    ctx.arc(x, canvas.height / 2, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }, { clearBeforeDraw: true, clearOnUnsubscribe: true });
  canvasStatus.value = 'running';
  animation.play();
}
function stopCanvasDemo(): void {
  canvasBinding?.unsubscribe();
  canvasBinding = null;
  canvasMotion.value?.stop();
  canvasMotion.value = null;
  canvasStatus.value = 'idle';
  canvasPosition.value = 20;
}
const canvasAdapterCode = `import { Tween } from '@re-code/flux';
import { bindCanvas } from '@re-code/flux/canvas';

const tween = new Tween({ from: 12, to: 300, duration: 1400, repeat: Infinity, yoyo: true });
const binding = bindCanvas(context, tween.value$, (ctx, x) => {
  ctx.beginPath(); ctx.arc(x, 60, 12, 0, Math.PI * 2); ctx.fill();
});
tween.play();
// Teardown: binding.unsubscribe(); tween.stop();`;
onBeforeUnmount(stopCanvasDemo);
</script>

<template>
  <UiCard variant="outlined" class="motion-playground-card">
  <UiCardTitle class="pa-4">
    <div class="text-overline text-secondary">{{ copy.staticText.text08RENDERINGADAPTER }}</div>
    <h2 class="text-h6 ma-0">{{ copy.staticText.canvas2DAdapter }}</h2>
    <p class="text-body-2 text-medium-emphasis mt-2 mb-0">{{ copy.staticText.theSameHeadlessTweenValueStreamDrivesc5ffb6 }}</p>
  </UiCardTitle>
  <UiDivider />
  <UiCardText class="pa-4 pa-md-5">
    <canvas ref="canvasElement" class="canvas-adapter-stage mb-4" width="640" height="160" role="img" :aria-label="copy.staticText.canvasAnimationPreview.replace('{position}', canvasPosition.toFixed(1))"></canvas>
    <div class="d-flex flex-wrap align-center ga-2 mb-4">
      <UiButton color="primary" prepend-icon="mdi-play" :disabled="canvasStatus === 'running'" @click="startCanvasDemo">{{ copy.staticText.startCanvasAnimation }}</UiButton>
      <UiButton variant="outlined" color="primary" prepend-icon="mdi-stop" :disabled="canvasStatus === 'idle'" @click="stopCanvasDemo">{{ copy.staticText.stopAndClear }}</UiButton>
      <UiChip :color="canvasStatus === 'running' ? 'success' : 'default'" variant="tonal">{{ canvasStatusLabel }}</UiChip>
    </div>
    <UiAlert density="compact" variant="tonal" type="info" class="mb-4">{{ copy.staticText.theAdapterClearsTheBitmapBeforeEach8ae4be }}</UiAlert>
    <pre class="motion-code"><code>{{ canvasAdapterCode }}</code></pre>
  </UiCardText>
</UiCard>

</template>
