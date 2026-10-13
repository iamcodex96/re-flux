<script setup lang="ts">
import { onBeforeUnmount, ref, shallowRef } from 'vue';
import { Tween } from '@lib';
import { bindCanvas } from '@lib/canvas';
import type { Subscription } from 'rxjs';

const canvasElement = ref<HTMLCanvasElement | null>(null);
const canvasPosition = ref(20);
const canvasStatus = ref<'idle' | 'running'>('idle');
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
  <v-card variant="outlined" class="motion-playground-card">
  <v-card-title class="pa-4">
    <div class="text-overline text-secondary">08 / RENDERING ADAPTER</div>
    <h2 class="text-h6 ma-0">Canvas 2D adapter</h2>
    <p class="text-body-2 text-medium-emphasis mt-2 mb-0">The same headless Tween value stream drives a Canvas draw callback. Multiple values in one frame are coalesced and drawn in the shared coordinator's write phase.</p>
  </v-card-title>
  <v-divider />
  <v-card-text class="pa-4 pa-md-5">
    <canvas ref="canvasElement" class="canvas-adapter-stage mb-4" width="640" height="160" role="img" :aria-label="`Canvas animation preview. Current horizontal position ${canvasPosition.toFixed(1)} pixels.`"></canvas>
    <div class="d-flex flex-wrap align-center ga-2 mb-4">
      <v-btn color="primary" prepend-icon="mdi-play" :disabled="canvasStatus === 'running'" @click="startCanvasDemo">Start Canvas animation</v-btn>
      <v-btn variant="outlined" color="primary" prepend-icon="mdi-stop" :disabled="canvasStatus === 'idle'" @click="stopCanvasDemo">Stop and clear</v-btn>
      <v-chip :color="canvasStatus === 'running' ? 'success' : 'default'" variant="tonal">{{ canvasStatus }}</v-chip>
    </div>
    <v-alert density="compact" variant="tonal" type="info" class="mb-4">The adapter clears the bitmap before each draw by default. Canvas pixels are not restored on unsubscribe; this demo opts into clearing on teardown.</v-alert>
    <pre class="motion-code"><code>{{ canvasAdapterCode }}</code></pre>
  </v-card-text>
</v-card>

</template>
