<script setup lang="ts">
import { useAppStore } from '../../stores/app';
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { MotionPreferences, Tween } from '@lib';
import { drawFrequencyBars } from '@lib/effects/canvas';
import { drawParticleConstellation, drawWaveField, drawWireframeSphere, drawRadialSpectrum, drawFireworks, createSteeringSwarm, stepSteeringSwarm, drawSteeringSwarm } from '@demos/canvas';
import type { SteeringSwarmSimulation } from '@demos/canvas';
import { bindCanvas, resizeCanvas } from '@lib/canvas';
import VisualLabSceneExplorer from './VisualLabSceneExplorer.vue';
import type { VisualLabSceneDefinition } from './visualLabSceneTypes';


const appStore = useAppStore();
const copy = computed(() => appStore.app.view.visualCanvasPanel);
type CanvasKind = 'particles' | 'flow-field' | 'wave' | 'wireframe' | 'radial' | 'frequency' | 'fireworks';

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
    id: 'flow-field', category: '10 / STEERING', title: copy.value.staticText.steeringAgentsFollowAFlowField,
    description: copy.value.staticText.theFieldStoresADirectionPerCellEachAgentCombinesFieldFollowingWithLocalSeparationAndUsesElapsedTimeForIntegration,
    stageLabel: copy.value.staticText.liveCANVASSTAGE, fileLabel: copy.value.staticText.steeringFlowFieldTs, stageTag: copy.value.staticText.seekSeparateIntegrate, ariaLabel: copy.value.staticText.flowFieldSwarmPreviewDescription,
    snippet: `import { Tween } from '@re-code/flux';
import { bindCanvas } from '@re-code/flux/canvas';
import { createFlowField } from '@re-code/flux/flow-field';
import {
  followFlowField, seek, separate, combineSteering, stepSteeringAgent,
  type SteeringAgent,
} from '@re-code/flux/steering';

const cellSize = 32;
const field = createFlowField({
  columns: Math.ceil(size.width / cellSize),
  rows: Math.ceil(size.height / cellSize),
  cellSize,
  vectorAtCell: ({ x, y }) => {
    const angle = Math.atan2(y - size.height / 2, x - size.width / 2) + Math.PI / 2;
    return { x: Math.cos(angle), y: Math.sin(angle) };
  },
});

type Agent = SteeringAgent & { id: number };
const agents: Agent[] = Array.from({ length: 44 }, (_, id) => {
  const angle = id * 2.399963229728653;
  const radius = Math.sqrt((id + 1) / 44) * Math.min(size.width, size.height) * 0.42;
  return {
    id,
    x: size.width / 2 + Math.cos(angle) * radius,
    y: size.height / 2 + Math.sin(angle) * radius,
    vx: Math.cos(angle) * 12,
    vy: Math.sin(angle) * 12,
  };
});
const wrap = (value: number, extent: number) => ((value % extent) + extent) % extent;
const phase = new Tween({ from: 0, to: Math.PI * 2, duration: 7000, easing: 'linear', repeat: Infinity });
let previousFrame = 0;
const binding = bindCanvas(context, phase.value$, (ctx, angle) => {
  const now = performance.now();
  const deltaSeconds = previousFrame === 0 ? 1 / 60 : Math.min(0.04, (now - previousFrame) / 1000);
  previousFrame = now;
  // One immutable snapshot prevents an agent from reading already-updated neighbours.
  const snapshot: SteeringAgent[] = agents.map(({ x, y, vx, vy }) => ({ x, y, vx, vy }));
  agents.forEach((agent, index) => {
    const body = snapshot[index];
    if (!body) return;
    const flow = followFlowField(body, field, { maxSpeed: 88, maxForce: 72, edgeMode: 'wrap' });
    const spacing = separate(body, snapshot, { distance: 28, maxSpeed: 88, maxForce: 52 });
    const target = {
      x: size.width * (0.5 + Math.sin(angle) * 0.14),
      y: size.height * (0.5 + Math.cos(angle * 0.72) * 0.12),
    };
    const attraction = seek(body, target, { maxSpeed: 88, maxForce: 26 });
    const force = combineSteering([
      { force: flow },
      { force: spacing, weight: 0.85 },
      { force: attraction, weight: 0.18 },
    ], 98);
    const next = stepSteeringAgent(body, force, deltaSeconds, {
      maxSpeed: 88, linearDamping: 0.32, maxDeltaSeconds: 0.04,
    });
    Object.assign(agent, { ...next, x: wrap(next.x, size.width), y: wrap(next.y, size.height) });
  });

  ctx.clearRect(0, 0, size.width, size.height);
  ctx.strokeStyle = 'rgba(103, 232, 249, 0.18)';
  ctx.lineWidth = 0.8;
  for (let row = 0; row < field.rows; row += 1) {
    for (let column = 0; column < field.columns; column += 1) {
      const vector = field.vectors[row * field.columns + column];
      if (!vector) continue;
      const x = (column + 0.5) * cellSize;
      const y = (row + 0.5) * cellSize;
      ctx.beginPath();
      ctx.moveTo(x - vector.x * 5, y - vector.y * 5);
      ctx.lineTo(x + vector.x * 5, y + vector.y * 5);
      ctx.stroke();
    }
  }
  ctx.beginPath();
  ctx.arc(size.width * (0.5 + Math.sin(angle) * 0.14), size.height * (0.5 + Math.cos(angle * 0.72) * 0.12), 5, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(246, 185, 110, 0.9)';
  ctx.stroke();
  ctx.fillStyle = 'rgba(103, 232, 249, 0.9)';
  agents.forEach((agent) => {
    ctx.beginPath();
    ctx.arc(agent.x, agent.y, 1.8 + (agent.id % 6 === 0 ? 0.9 : 0), 0, Math.PI * 2);
    ctx.fill();
  });
});
void phase.play().catch(() => undefined);
return () => { binding.unsubscribe(); phase.stop(); };`,
  },
  {
    id: 'wave', category: '11 / CANVAS', title: copy.value.staticText.waveformsAsLiveData,
    description: copy.value.staticText.severalHarmonicLayersUpdateFromOnePhase38e4d9,
    stageLabel: copy.value.staticText.liveCANVASSTAGE, fileLabel: copy.value.staticText.waveFieldTs, stageTag: copy.value.staticText.onePHASEFOURLAYERS, ariaLabel: copy.value.staticText.fourLayeredAnimatedSineWaveCurves,
    snippet: `import { Tween } from '@re-code/flux';\nimport { bindCanvas } from '@re-code/flux/canvas';\n\nconst phase = new Tween({\n  from: 0, to: Math.PI * 2, duration: 6000,\n  easing: 'linear', repeat: Infinity,\n});\nconst binding = bindCanvas(context, phase.value$, (ctx, angle) => {\n  drawWaveField(ctx, angle, size, {\n    layers: 4, amplitude: 0.11, lineWidth: 2,\n  });\n});\n\nvoid phase.play().catch(() => undefined);\nreturn () => { binding.unsubscribe(); phase.stop(); };`,
  },
  {
    id: 'wireframe', category: '12 / CANVAS 3D', title: copy.value.staticText.animateGeometryInThreeDimensions,
    description: copy.value.staticText.latitudeAndLongitudeCurvesAreProjectedFromc765b9,
    stageLabel: copy.value.staticText.liveCANVASSTAGE, fileLabel: copy.value.staticText.wireframeSphereTs, stageTag: copy.value.staticText.projected3DGEOMETRY, ariaLabel: copy.value.staticText.aRotatingCyanAndVioletWireframeSphere,
    snippet: `import { Tween } from '@re-code/flux';\nimport { bindCanvas } from '@re-code/flux/canvas';\n\nconst rotation = new Tween({\n  from: 0, to: Math.PI * 2, duration: 9200,\n  easing: 'linear', repeat: Infinity,\n});\nconst binding = bindCanvas(context, rotation.value$, (ctx, angle) => {\n  drawWireframeSphere(ctx, angle, size, {\n    latitudeLines: 9, longitudeLines: 15, rotationSpeed: 0.8,\n  });\n});\n\nvoid rotation.play().catch(() => undefined);\nreturn () => { binding.unsubscribe(); rotation.stop(); };`,
  },
  {
    id: 'radial', category: '13 / CANVAS', title: copy.value.staticText.proceduralDataBecomesAnInstrument,
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
  let simulation: SteeringSwarmSimulation | null = kind === 'flow-field' ? createSteeringSwarm(width, height, 46) : null;
  let previousSimulationTimestamp = 0;
  let pointerActive = false;
  let target = { x: width / 2, y: height / 2 };
  const resize = (): void => {
    const resized = resizeCanvas(canvas);
    const changed = resized.width !== width || resized.height !== height;
    width = resized.width;
    height = resized.height;
    if (kind === 'flow-field' && changed) {
      simulation = createSteeringSwarm(width, height, 46);
      previousSimulationTimestamp = 0;
      target = { x: width / 2, y: height / 2 };
    }
  };
  const onPointerMove = (event: PointerEvent): void => {
    const rect = canvas.getBoundingClientRect();
    target = {
      x: Math.max(0, Math.min(width, (event.clientX - rect.left) * width / Math.max(rect.width, 1))),
      y: Math.max(0, Math.min(height, (event.clientY - rect.top) * height / Math.max(rect.height, 1))),
    };
    pointerActive = true;
  };
  const onPointerLeave = (): void => { pointerActive = false; };
  if (kind === 'flow-field') {
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerdown', onPointerMove);
    canvas.addEventListener('pointerleave', onPointerLeave);
    activeCleanups.push(() => {
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerdown', onPointerMove);
      canvas.removeEventListener('pointerleave', onPointerLeave);
    });
  }
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
    duration: kind === 'particles' ? 8500 : kind === 'flow-field' ? 7000 : kind === 'wave' ? 6000 : kind === 'wireframe' ? 9200 : kind === 'fireworks' ? 7600 : 7200,
    easing: 'linear',
    repeat: Infinity,
    motion: { preferences, pauseWhenHidden: true, reducedMotion: 'finish' },
  });
  void phase.play().catch(() => undefined);
  activeCleanups.push(() => phase.stop());

  const binding = bindCanvas(context, phase.value$, (ctx, angle) => {
    const size = { width, height };
    if (kind === 'flow-field' && simulation) {
      const now = performance.now();
      const deltaSeconds = previousSimulationTimestamp === 0 ? 1 / 60 : Math.min(0.04, Math.max(0.001, (now - previousSimulationTimestamp) / 1000));
      previousSimulationTimestamp = now;
      stepSteeringSwarm(simulation, deltaSeconds, {
        mode: 'flow',
        target: pointerActive ? target : { x: width / 2 + Math.sin(angle) * width * 0.14, y: height / 2 + Math.cos(angle * 0.72) * height * 0.12 },
        maxSpeed: 86,
        maxForce: 74,
        targetInfluence: pointerActive ? 0.38 : 0,
      });
      drawSteeringSwarm(ctx, simulation, {
        showField: true,
        ...(pointerActive ? { target } : {}),
        agentColor: 'rgba(103, 232, 249, 0.9)',
        accentColor: 'rgb(167, 139, 250)',
        fieldColor: 'rgba(103, 232, 249, 0.24)',
        linkColor: 'rgba(103, 232, 249, 0.12)',
        targetColor: 'rgb(246, 185, 110)',
      });
      return;
    }
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
    :heading="copy.staticText.canvasLabHeading"
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
