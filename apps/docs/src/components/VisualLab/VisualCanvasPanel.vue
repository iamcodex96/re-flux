<script setup lang="ts">
import { useAppStore } from '../../stores/app';
import { nextTick, onBeforeUnmount, onMounted, ref, watch , computed} from 'vue';
import { MotionPreferences, Tween } from '@lib';
import { drawFrequencyBars } from '@lib/effects/canvas';
import { drawParticleConstellation, drawWaveField, drawWireframeSphere, drawRadialSpectrum, drawFireworks } from '@demos/canvas';
import { bindCanvas, resizeCanvas } from '@lib/canvas';
import VisualLabSceneExplorer from './VisualLabSceneExplorer.vue';
import type { VisualLabSceneDefinition } from './visualLabSceneTypes';


const appStore = useAppStore();
const copy = computed(() => appStore.app.view.visualCanvasPanel);
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
    id: 'frequency', category: '07 / DATA VISUALIZATION', title: copy.value.staticText.animateDataNotOnlyCoordinates,
    description: copy.value.staticText.theDrawingHelperConsumesNormalizedSamplesThisf05d9f,
    stageLabel: copy.value.staticText.liveCANVASSTAGE, fileLabel: copy.value.staticText.frequencyBinsTs, stageTag: copy.value.staticText.normalizedSAMPLES, ariaLabel: copy.value.staticText.animatedCyanAndVioletFrequencyBarVisualization,
    snippet: `import { Tween } from '@re-code/flux';\nimport { drawFrequencyBars } from '@re-code/flux/effects/canvas';\nimport { bindCanvas } from '@re-code/flux/canvas';\n\nconst phase = new Tween({\n  from: 0,\n  to: Math.PI * 2,\n  duration: 7200,\n  easing: 'linear',\n  repeat: Infinity,\n});\n\nconst binding = bindCanvas(context, phase.value$, (ctx, angle) => {\n  const bins = createFrequencyBins(angle);\n  drawFrequencyBars(ctx, bins, size, { barCount: 72, gap: 3 });\n});\n\nvoid phase.play().catch(() => undefined);\nreturn () => {\n  binding.unsubscribe();\n  phase.stop();\n};`,
  },
  {
    id: 'fireworks', category: '08 / CANVAS', title: copy.value.staticText.burstTrailAndFadeWithoutAMutableParticleEngine,
    description: copy.value.staticText.fireworkTrailsAreDerivedFromASingle46c9b3,
    stageLabel: copy.value.staticText.liveCANVASSTAGE, fileLabel: copy.value.staticText.fireworksTs, stageTag: copy.value.staticText.deterministicDRAWING, ariaLabel: copy.value.staticText.proceduralCoralAndGoldFireworksWithGlowingTrails,
    snippet: `import { Tween } from '@re-code/flux';\nimport { bindCanvas } from '@re-code/flux/canvas';\n\nconst phase = new Tween({\n  from: 0,\n  to: Math.PI * 2,\n  duration: 7600,\n  easing: 'linear',\n  repeat: Infinity,\n});\n\nconst binding = bindCanvas(context, phase.value$, (ctx, angle) => {\n  drawFireworks(ctx, angle, size, {\n    burstCount: 5,\n    particlesPerBurst: 26,\n    color: '#fda4af',\n    accentColor: '#fef08a',\n  });\n});\n\nvoid phase.play().catch(() => undefined);\nreturn () => { binding.unsubscribe(); phase.stop(); };`,
  },
  {
    id: 'particles', category: '09 / CANVAS', title: copy.value.staticText.emergentMotionFromSimpleRules,
    description: copy.value.staticText.aTimeStreamDrivesAFieldOfaca8dd,
    stageLabel: copy.value.staticText.liveCANVASSTAGE, fileLabel: copy.value.staticText.particleFieldTs, stageTag: copy.value.staticText.sharedFRAMECOORDINATOR, ariaLabel: copy.value.staticText.animatedConstellationOfConnectedCyanAndVioletParticles,
    snippet: `import { Tween } from '@re-code/flux';\nimport { bindCanvas } from '@re-code/flux/canvas';\n\nconst phase = new Tween({\n  from: 0, to: Math.PI * 2, duration: 8500,\n  easing: 'linear', repeat: Infinity,\n});\nconst binding = bindCanvas(context, phase.value$, (ctx, angle) => {\n  drawParticleConstellation(ctx, angle, size, {\n    count: 82, connectionDistance: 51,\n  });\n});\n\nvoid phase.play().catch(() => undefined);\nreturn () => { binding.unsubscribe(); phase.stop(); };`,
  },
  {
    id: 'wave', category: '10 / CANVAS', title: copy.value.staticText.waveformsAsLiveData,
    description: copy.value.staticText.severalHarmonicLayersUpdateFromOnePhase38e4d9,
    stageLabel: copy.value.staticText.liveCANVASSTAGE, fileLabel: copy.value.staticText.waveFieldTs, stageTag: copy.value.staticText.onePHASEFOURLAYERS, ariaLabel: copy.value.staticText.fourLayeredAnimatedSineWaveCurves,
    snippet: `import { Tween } from '@re-code/flux';\nimport { bindCanvas } from '@re-code/flux/canvas';\n\nconst phase = new Tween({\n  from: 0, to: Math.PI * 2, duration: 6000,\n  easing: 'linear', repeat: Infinity,\n});\nconst binding = bindCanvas(context, phase.value$, (ctx, angle) => {\n  drawWaveField(ctx, angle, size, {\n    layers: 4, amplitude: 0.11, lineWidth: 2,\n  });\n});\n\nvoid phase.play().catch(() => undefined);\nreturn () => { binding.unsubscribe(); phase.stop(); };`,
  },
  {
    id: 'wireframe', category: '11 / CANVAS 3D', title: copy.value.staticText.animateGeometryInThreeDimensions,
    description: copy.value.staticText.latitudeAndLongitudeCurvesAreProjectedFromc765b9,
    stageLabel: copy.value.staticText.liveCANVASSTAGE, fileLabel: copy.value.staticText.wireframeSphereTs, stageTag: copy.value.staticText.projected3DGEOMETRY, ariaLabel: copy.value.staticText.aRotatingCyanAndVioletWireframeSphere,
    snippet: `import { Tween } from '@re-code/flux';\nimport { bindCanvas } from '@re-code/flux/canvas';\n\nconst rotation = new Tween({\n  from: 0, to: Math.PI * 2, duration: 9200,\n  easing: 'linear', repeat: Infinity,\n});\nconst binding = bindCanvas(context, rotation.value$, (ctx, angle) => {\n  drawWireframeSphere(ctx, angle, size, {\n    latitudeLines: 9, longitudeLines: 15, rotationSpeed: 0.8,\n  });\n});\n\nvoid rotation.play().catch(() => undefined);\nreturn () => { binding.unsubscribe(); rotation.stop(); };`,
  },
  {
    id: 'radial', category: '12 / CANVAS', title: copy.value.staticText.proceduralDataBecomesAnInstrument,
    description: copy.value.staticText.aRadialSpectrumPatternChangesItsBars34d809,
    stageLabel: copy.value.staticText.liveCANVASSTAGE, fileLabel: copy.value.staticText.radialSpectrumTs, stageTag: copy.value.staticText.dataSHAPESINSPACE, ariaLabel: copy.value.staticText.anAnimatedCircularSpectrumMadeOfCyanAndVioletRadialBars,
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
    :eyebrow="copy.staticText.canvasDATA"
    heading="Data into pixels"
    :description="copy.staticText.selectOneLiveCanvasExperimentAtA97820f"
    :scenes="scenes"
  >
    <template #stage="{ scene }">
      <div class="canvas-stage" :class="`canvas-stage--${scene.id}`">
        <canvas :key="scene.id" ref="activeCanvas" :aria-label="scene.ariaLabel" />
      </div>
    </template>
  </VisualLabSceneExplorer>
</template>
