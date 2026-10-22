<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { MotionPreferences, Tween } from '@lib';
import { drawFrequencyBars } from '@lib/effects/canvas';
import { drawParticleConstellation, drawWaveField, drawWireframeSphere, drawRadialSpectrum, drawFireworks } from '@demos/canvas';
import { bindCanvas, resizeCanvas } from '@lib/canvas';
import VisualLabSceneExplorer from './VisualLabSceneExplorer.vue';
import type { VisualLabSceneDefinition } from './visualLabSceneTypes';

type CanvasKind = 'particles' | 'wave' | 'wireframe' | 'radial' | 'frequency' | 'fireworks';

const activeScene = ref<string>('frequency');
const activeCanvas = ref<HTMLCanvasElement | null>(null);
const preferences = new MotionPreferences();
const activeCleanups: Array<() => void> = [];
const canvasResizeCallbacks = new Map<HTMLCanvasElement, () => void>();
let resizeHandler: (() => void) | null = null;
let resizeObserver: ResizeObserver | null = null;

const scenes: readonly VisualLabSceneDefinition[] = [
  {
    id: 'frequency', category: '07 / DATA VISUALIZATION', title: 'Animate data, not only coordinates.',
    description: 'The drawing helper consumes normalized samples. This example synthesizes frequency bins; in a real scene, feed values from Web Audio or application telemetry.',
    stageLabel: 'LIVE CANVAS STAGE', fileLabel: 'frequency-bins.ts', stageTag: 'NORMALIZED SAMPLES', ariaLabel: 'Animated cyan and violet frequency bar visualization',
    snippet: `import { Tween } from '@re-code/flux';\nimport { drawFrequencyBars } from '@re-code/flux/effects/canvas';\nimport { bindCanvas } from '@re-code/flux/canvas';\n\nconst phase = new Tween({\n  from: 0,\n  to: Math.PI * 2,\n  duration: 7200,\n  easing: 'linear',\n  repeat: Infinity,\n});\n\nconst binding = bindCanvas(context, phase.value$, (ctx, angle) => {\n  const bins = createFrequencyBins(angle);\n  drawFrequencyBars(ctx, bins, size, { barCount: 72, gap: 3 });\n});\n\nvoid phase.play().catch(() => undefined);\nreturn () => {\n  binding.unsubscribe();\n  phase.stop();\n};`,
  },
  {
    id: 'fireworks', category: '08 / CANVAS', title: 'Burst, trail and fade — without a mutable particle engine.',
    description: 'Firework trails are derived from a single phase. The drawing function is deterministic for a given frame, so it can be paused, scrubbed or driven by any Observable.',
    stageLabel: 'LIVE CANVAS STAGE', fileLabel: 'fireworks.ts', stageTag: 'DETERMINISTIC DRAWING', ariaLabel: 'Procedural coral and gold fireworks with glowing trails',
    snippet: `import { Tween } from '@re-code/flux';\nimport { bindCanvas } from '@re-code/flux/canvas';\n\nconst phase = new Tween({\n  from: 0,\n  to: Math.PI * 2,\n  duration: 7600,\n  easing: 'linear',\n  repeat: Infinity,\n});\n\nconst binding = bindCanvas(context, phase.value$, (ctx, angle) => {\n  drawFireworks(ctx, angle, size, {\n    burstCount: 5,\n    particlesPerBurst: 26,\n    color: '#fda4af',\n    accentColor: '#fef08a',\n  });\n});\n\nvoid phase.play().catch(() => undefined);\nreturn () => { binding.unsubscribe(); phase.stop(); };`,
  },
  {
    id: 'particles', category: '09 / CANVAS', title: 'Emergent motion from simple rules.',
    description: 'A time stream drives a field of particles and proximity links. Rendering is batched through the shared frame coordinator.',
    stageLabel: 'LIVE CANVAS STAGE', fileLabel: 'particle-field.ts', stageTag: 'SHARED FRAME COORDINATOR', ariaLabel: 'Animated constellation of connected cyan and violet particles',
    snippet: `import { Tween } from '@re-code/flux';\nimport { bindCanvas } from '@re-code/flux/canvas';\n\nconst phase = new Tween({\n  from: 0, to: Math.PI * 2, duration: 8500,\n  easing: 'linear', repeat: Infinity,\n});\nconst binding = bindCanvas(context, phase.value$, (ctx, angle) => {\n  drawParticleConstellation(ctx, angle, size, {\n    count: 82, connectionDistance: 51,\n  });\n});\n\nvoid phase.play().catch(() => undefined);\nreturn () => { binding.unsubscribe(); phase.stop(); };`,
  },
  {
    id: 'wave', category: '10 / CANVAS', title: 'Waveforms as live data.',
    description: 'Several harmonic layers update from one phase value, with no animation loop inside the drawing callback.',
    stageLabel: 'LIVE CANVAS STAGE', fileLabel: 'wave-field.ts', stageTag: 'ONE PHASE · FOUR LAYERS', ariaLabel: 'Four layered animated sine wave curves',
    snippet: `import { Tween } from '@re-code/flux';\nimport { bindCanvas } from '@re-code/flux/canvas';\n\nconst phase = new Tween({\n  from: 0, to: Math.PI * 2, duration: 6000,\n  easing: 'linear', repeat: Infinity,\n});\nconst binding = bindCanvas(context, phase.value$, (ctx, angle) => {\n  drawWaveField(ctx, angle, size, {\n    layers: 4, amplitude: 0.11, lineWidth: 2,\n  });\n});\n\nvoid phase.play().catch(() => undefined);\nreturn () => { binding.unsubscribe(); phase.stop(); };`,
  },
  {
    id: 'wireframe', category: '11 / CANVAS 3D', title: 'Animate geometry in three dimensions.',
    description: 'Latitude and longitude curves are projected from a rotating 3D sphere into Canvas 2D. Depth changes opacity and line weight, producing a light-weight scientific visualization.',
    stageLabel: 'LIVE CANVAS STAGE', fileLabel: 'wireframe-sphere.ts', stageTag: 'PROJECTED 3D GEOMETRY', ariaLabel: 'A rotating cyan and violet wireframe sphere',
    snippet: `import { Tween } from '@re-code/flux';\nimport { bindCanvas } from '@re-code/flux/canvas';\n\nconst rotation = new Tween({\n  from: 0, to: Math.PI * 2, duration: 9200,\n  easing: 'linear', repeat: Infinity,\n});\nconst binding = bindCanvas(context, rotation.value$, (ctx, angle) => {\n  drawWireframeSphere(ctx, angle, size, {\n    latitudeLines: 9, longitudeLines: 15, rotationSpeed: 0.8,\n  });\n});\n\nvoid rotation.play().catch(() => undefined);\nreturn () => { binding.unsubscribe(); rotation.stop(); };`,
  },
  {
    id: 'radial', category: '12 / CANVAS', title: 'Procedural data becomes an instrument.',
    description: 'A radial spectrum pattern changes its bars, accent rhythm and rings from a single stream. It can later consume audio amplitudes or application metrics instead of a procedural phase.',
    stageLabel: 'LIVE CANVAS STAGE', fileLabel: 'radial-spectrum.ts', stageTag: 'DATA SHAPES IN SPACE', ariaLabel: 'An animated circular spectrum made of cyan and violet radial bars',
    snippet: `import { Tween } from '@re-code/flux';\nimport { bindCanvas } from '@re-code/flux/canvas';\n\nconst phase = new Tween({\n  from: 0, to: Math.PI * 2, duration: 7200,\n  easing: 'linear', repeat: Infinity,\n});\nconst binding = bindCanvas(context, phase.value$, (ctx, angle) => {\n  drawRadialSpectrum(ctx, angle, size, { bars: 92 });\n});\n\nvoid phase.play().catch(() => undefined);\nreturn () => { binding.unsubscribe(); phase.stop(); };`,
  },
];

function cleanupActiveScene(): void {
  for (const cleanup of activeCleanups.splice(0).reverse()) cleanup();
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
  activeCleanups.push(() => {
    resizeObserver?.unobserve(canvas);
    canvasResizeCallbacks.delete(canvas);
  });

  const phase = new Tween({
    from: 0,
    to: Math.PI * 2,
    duration: kind === 'particles' ? 8500 : kind === 'wave' ? 6000 : kind === 'wireframe' ? 9200 : kind === 'fireworks' ? 7600 : 7200,
    easing: 'linear',
    repeat: Infinity,
    motion: { preferences, pauseWhenHidden: true, reducedMotion: 'finish' },
  });
  void phase.play().catch(() => undefined);
  activeCleanups.push(() => phase.stop());

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
  activeCleanups.push(() => binding.unsubscribe());
}

async function mountActiveScene(kind: string): Promise<void> {
  await nextTick();
  if (kind !== activeScene.value) return;
  setupCanvas(activeCanvas.value, kind as CanvasKind);
}

watch(activeScene, async (kind) => {
  cleanupActiveScene();
  await mountActiveScene(kind);
});

onMounted(async () => mountActiveScene(activeScene.value));

onBeforeUnmount(() => {
  cleanupActiveScene();
  if (resizeHandler) window.removeEventListener('resize', resizeHandler);
  resizeHandler = null;
  resizeObserver?.disconnect();
  resizeObserver = null;
  canvasResizeCallbacks.clear();
  preferences.destroy();
});
</script>

<template>
  <VisualLabSceneExplorer
    v-model="activeScene"
    id-prefix="canvas-scene"
    eyebrow="CANVAS / DATA"
    heading="Data into pixels"
    description="Select one live Canvas experiment at a time. A re;Flux value stream drives each draw pass, while the rendering callback stays deterministic for its input."
    :scenes="scenes"
  >
    <template #stage="{ scene }">
      <div class="canvas-stage" :class="`canvas-stage--${scene.id}`">
        <canvas :key="scene.id" ref="activeCanvas" :aria-label="scene.ariaLabel" />
      </div>
    </template>
  </VisualLabSceneExplorer>
</template>
