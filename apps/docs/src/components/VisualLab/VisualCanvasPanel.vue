<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { MotionPreferences, Tween } from '@lib';
import { drawFrequencyBars } from '@lib/effects/canvas';
import { drawParticleConstellation, drawWaveField, drawWireframeSphere, drawRadialSpectrum, drawFireworks } from '@demos/canvas';
import { bindCanvas, resizeCanvas } from '@lib/canvas';

const particleCanvas = ref<HTMLCanvasElement | null>(null);
const waveCanvas = ref<HTMLCanvasElement | null>(null);
const wireframeCanvas = ref<HTMLCanvasElement | null>(null);
const radialCanvas = ref<HTMLCanvasElement | null>(null);
const frequencyCanvas = ref<HTMLCanvasElement | null>(null);
const fireworksCanvas = ref<HTMLCanvasElement | null>(null);
const preferences = new MotionPreferences();
const cleanups: Array<() => void> = [];
const canvasResizeCallbacks = new Map<HTMLCanvasElement, () => void>();
let resizeHandler: (() => void) | null = null;
let resizeObserver: ResizeObserver | null = null;

type CanvasKind = 'particles' | 'wave' | 'wireframe' | 'radial' | 'frequency' | 'fireworks';

function trackTween<T>(tween: Tween<T>): Tween<T> {
  cleanups.push(() => tween.stop());
  tween.play();
  return tween;
}

function setupCanvas(canvas: HTMLCanvasElement | null, kind: CanvasKind): void {
  if (!canvas) return;
  const initial = resizeCanvas(canvas);
  let width = initial.width;
  let height = initial.height;
  const context = initial.context;
  const resize = (): void => {
    const resized = resizeCanvas(canvas);
    width = resized.width;
    height = resized.height;
  };
  canvasResizeCallbacks.set(canvas, resize);

  if (typeof ResizeObserver !== 'undefined') {
    if (!resizeObserver) {
      resizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) canvasResizeCallbacks.get(entry.target as HTMLCanvasElement)?.();
      });
    }
    resizeObserver.observe(canvas);
  } else if (!resizeHandler) {
    resizeHandler = () => canvasResizeCallbacks.forEach((callback) => callback());
    window.addEventListener('resize', resizeHandler, { passive: true });
  }

  const phase = trackTween(new Tween({
    from: 0,
    to: Math.PI * 2,
    duration: kind === 'particles' ? 8500 : kind === 'wave' ? 6000 : kind === 'wireframe' ? 9200 : kind === 'fireworks' ? 7600 : 7200,
    easing: 'linear',
    repeat: Infinity,
    motion: { preferences, pauseWhenHidden: true, reducedMotion: 'finish' },
  }));

  const binding = bindCanvas(context, phase.value$, (ctx, angle) => {
    const size = { width, height };
    switch (kind) {
      case 'particles': drawParticleConstellation(ctx, angle, size, { count: 82, connectionDistance: 51 }); break;
      case 'wave': drawWaveField(ctx, angle, size, { layers: 4, amplitude: 0.11, lineWidth: 2 }); break;
      case 'wireframe': drawWireframeSphere(ctx, angle, size, { latitudeLines: 9, longitudeLines: 15, rotationSpeed: 0.8 }); break;
      case 'radial': drawRadialSpectrum(ctx, angle, size, { bars: 92 }); break;
      case 'fireworks': drawFireworks(ctx, angle, size, { burstCount: 5, particlesPerBurst: 26, color: '#fda4af', accentColor: '#fef08a' }); break;
      case 'frequency': {
        const bins = Array.from({ length: 84 }, (_, index) => {
          const envelope = Math.exp(-index / 94);
          const low = Math.max(0, Math.sin(index * 0.39 + angle * 2.1));
          const high = Math.max(0, Math.sin(index * 0.17 - angle * 3.4));
          return Math.min(1, 0.035 + envelope * (Math.pow(low, 1.7) * 0.78 + Math.pow(high, 2.3) * 0.24));
        });
        drawFrequencyBars(ctx, bins, size, { barCount: 72, gap: 3, symmetric: false, maxHeight: height * 0.84 });
        break;
      }
    }
  });
  cleanups.push(() => binding.unsubscribe());
}

onMounted(async () => {
  await nextTick();
  setupCanvas(particleCanvas.value, 'particles');
  setupCanvas(waveCanvas.value, 'wave');
  setupCanvas(wireframeCanvas.value, 'wireframe');
  setupCanvas(radialCanvas.value, 'radial');
  setupCanvas(frequencyCanvas.value, 'frequency');
  setupCanvas(fireworksCanvas.value, 'fireworks');
});

onBeforeUnmount(() => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup();
  if (resizeHandler) window.removeEventListener('resize', resizeHandler);
  resizeHandler = null;
  resizeObserver?.disconnect();
  resizeObserver = null;
  canvasResizeCallbacks.clear();
  preferences.destroy();
});
</script>

<template>
  <v-row class="visual-demo-grid">
    <v-col cols="12">
        <v-card class="visual-card visual-card--frequency" variant="outlined">
          <v-card-text class="pa-5 pa-md-6">
            <div class="visual-card__heading"><v-chip size="small" variant="tonal" color="secondary">07 / Data visualization</v-chip><span class="text-caption text-medium-emphasis">Frequency bins</span></div>
            <h3 class="text-h6 font-weight-bold mt-4 mb-2">Animate data, not only coordinates.</h3>
            <p class="text-body-2 text-medium-emphasis">The drawing helper consumes normalized samples. This example synthesizes frequency bins; in a real scene, feed values from Web Audio or application telemetry.</p>
            <div class="canvas-stage canvas-stage--frequency"><canvas ref="frequencyCanvas" aria-label="Animated cyan and violet frequency bar visualization" /></div>
            <div class="d-flex justify-space-between align-center mt-4"><span class="text-caption text-medium-emphasis">drawFrequencyBars(context, values, size)</span><v-icon color="secondary">mdi-waveform</v-icon></div>
          </v-card-text>
        </v-card>
      </v-col>

<v-col cols="12">
        <v-card class="visual-card visual-card--fireworks" variant="outlined">
          <v-card-text class="pa-5 pa-md-6">
            <div class="visual-card__heading"><v-chip size="small" variant="tonal" color="warning">08 / Canvas</v-chip><span class="text-caption text-medium-emphasis">Procedural particles</span></div>
            <h3 class="text-h6 font-weight-bold mt-4 mb-2">Burst, trail and fade — without a mutable particle engine.</h3>
            <p class="text-body-2 text-medium-emphasis">Firework trails are derived from a single phase. The drawing function is deterministic for a given frame, so it can be paused, scrubbed or driven by any Observable.</p>
            <div class="canvas-stage canvas-stage--fireworks"><canvas ref="fireworksCanvas" aria-label="Procedural coral and gold fireworks with glowing trails" /></div>
            <div class="d-flex justify-space-between align-center mt-4"><span class="text-caption text-medium-emphasis">drawFireworks(context, phase, size)</span><v-icon color="warning">mdi-firework</v-icon></div>
          </v-card-text>
        </v-card>
      </v-col>

<v-col cols="12">
        <v-card class="visual-card visual-card--canvas" variant="outlined">
          <v-card-text class="pa-5 pa-md-6">
            <div class="visual-card__heading"><v-chip size="small" variant="tonal" color="info">09 / Canvas</v-chip><span class="text-caption text-medium-emphasis">Particle field</span></div>
            <h3 class="text-h6 font-weight-bold mt-4 mb-2">Emergent motion from simple rules.</h3>
            <p class="text-body-2 text-medium-emphasis">A time stream drives a field of particles and proximity links. Rendering is batched through the shared frame coordinator.</p>
            <div class="canvas-stage"><canvas ref="particleCanvas" aria-label="Animated constellation of connected cyan and violet particles" /></div>
            <div class="d-flex justify-space-between align-center mt-4"><span class="text-caption text-medium-emphasis">resizeCanvas() + bindCanvas()</span><v-icon color="info">mdi-creation</v-icon></div>
          </v-card-text>
        </v-card>
      </v-col>

<v-col cols="12">
        <v-card class="visual-card visual-card--wave" variant="outlined" height="100%">
          <v-card-text class="pa-5 pa-md-6">
            <div class="visual-card__heading"><v-chip size="small" variant="tonal" color="purple">10 / Canvas</v-chip><span class="text-caption text-medium-emphasis">Procedural curves</span></div>
            <h3 class="text-h6 font-weight-bold mt-4 mb-2">Waveforms as live data.</h3>
            <p class="text-body-2 text-medium-emphasis">Several harmonic layers update from one phase value, with no animation loop inside the drawing callback.</p>
            <div class="canvas-stage canvas-stage--wave"><canvas ref="waveCanvas" aria-label="Four layered animated sine wave curves" /></div>
            <div class="d-flex justify-space-between align-center mt-4"><span class="text-caption text-medium-emphasis">One phase stream · four layers</span><v-icon color="purple">mdi-sine-wave</v-icon></div>
          </v-card-text>
        </v-card>
      </v-col>

<v-col cols="12">
        <v-card class="visual-card visual-card--wireframe" variant="outlined">
          <v-card-text class="pa-5 pa-md-6">
            <div class="visual-card__heading"><v-chip size="small" variant="tonal" color="info">11 / Canvas 3D</v-chip><span class="text-caption text-medium-emphasis">Projected wireframe</span></div>
            <h3 class="text-h6 font-weight-bold mt-4 mb-2">Animate geometry in three dimensions.</h3>
            <p class="text-body-2 text-medium-emphasis">Latitude and longitude curves are projected from a rotating 3D sphere into Canvas 2D. Depth changes opacity and line weight, producing a light-weight scientific visualization.</p>
            <div class="canvas-stage canvas-stage--wireframe"><canvas ref="wireframeCanvas" aria-label="A rotating cyan and violet wireframe sphere" /></div>
            <div class="d-flex justify-space-between align-center mt-4"><span class="text-caption text-medium-emphasis">drawWireframeSphere(context, phase, size)</span><v-icon color="info">mdi-orbit</v-icon></div>
          </v-card-text>
        </v-card>
      </v-col>

<v-col cols="12">
        <v-card class="visual-card visual-card--radial" variant="outlined">
          <v-card-text class="pa-5 pa-md-6">
            <div class="visual-card__heading"><v-chip size="small" variant="tonal" color="secondary">12 / Canvas</v-chip><span class="text-caption text-medium-emphasis">Radial spectrum</span></div>
            <h3 class="text-h6 font-weight-bold mt-4 mb-2">Procedural data becomes an instrument.</h3>
            <p class="text-body-2 text-medium-emphasis">A radial spectrum pattern changes its bars, accent rhythm and rings from a single stream. It can later consume audio amplitudes or application metrics instead of a procedural phase.</p>
            <div class="canvas-stage canvas-stage--radial"><canvas ref="radialCanvas" aria-label="An animated circular spectrum made of cyan and violet radial bars" /></div>
            <div class="d-flex justify-space-between align-center mt-4"><span class="text-caption text-medium-emphasis">drawRadialSpectrum(context, phase, size)</span><v-icon color="secondary">mdi-chart-donut</v-icon></div>
          </v-card-text>
        </v-card>
      </v-col>
  </v-row>
</template>
