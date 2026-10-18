<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref } from 'vue';
import { RouterLink } from 'vue-router';
import { MotionPreferences } from '@lib';
import VisualExperimentCard from '../components/VisualLab/VisualExperimentCard.vue';
import VisualLabFeaturedStage from '../components/VisualLab/VisualLabFeaturedStage.vue';
import type { VisualExperimentCategory, VisualExperimentKind, VisualLabStageConfig, VisualLabTelemetry } from '../components/VisualLab/visualLabTypes';

const preferences = new MotionPreferences();
const activeFilter = ref('all');
const copied = ref(false);
const copyError = ref(false);
const downloaded = ref(false);
const reducedMotion = ref(preferences.snapshot.reducedMotion);
const featuredStage = ref<{ resetCenter: () => void } | null>(null);
let copyStatusTimer: ReturnType<typeof setTimeout> | null = null;
let downloadStatusTimer: ReturnType<typeof setTimeout> | null = null;
const preferenceSubscription = preferences.state$.subscribe((state) => { reducedMotion.value = state.reducedMotion; });

const defaultConfig: VisualLabStageConfig = {
  timeScale: 1,
  gravity: 9.81,
  springElasticity: 0.72,
  airDrag: 0.025,
};
const config = reactive<VisualLabStageConfig>({ ...defaultConfig });
const stageTelemetry = reactive<VisualLabTelemetry>({
  fps: 0,
  frameTimeMs: 0,
  nodeCount: 23 * 9,
  pointerX: null,
  pointerY: null,
  state: 'idle',
});

const filters: readonly { id: string; label: string; category: VisualExperimentCategory | null }[] = [
  { id: 'all', label: 'All experiments', category: null },
  { id: 'physics', label: 'Physics & springs', category: 'physics' },
  { id: 'shader', label: 'WebGL & shaders', category: 'shader' },
  { id: 'svg', label: 'SVG spline morphing', category: 'svg' },
  { id: 'canvas', label: 'Canvas particles', category: 'canvas' },
];

const experiments: VisualLabExperiment[] = [
  {
    code: 'EXP-088', title: 'Kinetic Typography Rx', eyebrow: 'STAGGERED GLYPHS',
    description: 'Text enters by grapheme using re;Flux stagger timing. Leave the card to restore the original readable text.',
    category: 'physics', kind: 'typography', tags: ['DOM', 'STREAM', 'TYPE'], to: '/visuals/interactions',
  },
  {
    code: 'EXP-082', title: 'Morphing Topography Splines', eyebrow: 'BÉZIER CONTINUUM',
    description: 'A normalized SVG path morphs between compatible geometries and resets to its original outline on pointer leave.',
    category: 'svg', kind: 'spline', tags: ['SVG MORPH', 'SPLINE'], to: '/visuals/svg',
  },
  {
    code: 'EXP-079', title: 'Fluid Particle Vortices', eyebrow: 'PARTICLE CONSTELLATION',
    description: 'Connected particles form a constellation whose positions and links are redrawn from a single animation stream.',
    category: 'canvas', kind: 'particles', tags: ['CANVAS 2D', 'PARTICLES'], to: '/visuals/canvas',
  },
  {
    code: 'EXP-071', title: 'Viscoelastic Mesh Study', eyebrow: 'PROCEDURAL MESH',
    description: 'A responsive wire mesh visual study driven by a shared phase stream. It is not presented as a full cloth constraint solver.',
    category: 'physics', kind: 'cloth', tags: ['CANVAS', 'MESH'], to: '/visuals/canvas',
  },
  {
    code: 'EXP-064', title: 'Chromatic Dispersion', eyebrow: 'FRAGMENT COLOR STUDY',
    description: 'A real WebGL fragment shader separates spectral bands and recombines them into a chromatic field.',
    category: 'shader', kind: 'dispersion', tags: ['WEBGL', 'GLSL'], to: '/visuals/shaders',
  },
  {
    code: 'EXP-052', title: 'Vector Field Swarm', eyebrow: 'AGENT FIELD',
    description: 'A constellation of agents follows orbital paths around a moving center, driven by a single continuous phase value.',
    category: 'physics', kind: 'swarm', tags: ['CANVAS 2D', 'VECTOR FIELD'], to: '/visuals/canvas',
  },
  {
    code: 'EXP-057', title: 'Spring Follower Field', eyebrow: 'FOLLOWER RESPONSE',
    description: 'A chain of followers traces a moving target with phase-delayed motion, illustrating how coordinated values can shape a scene.',
    category: 'physics', kind: 'spring-follower', tags: ['FOLLOWERS', 'STREAM'], to: '/docs/interactions',
  },
  {
    code: 'EXP-061', title: 'Inertia Vector Trails', eyebrow: 'MOMENTUM STUDY',
    description: 'Orbiting traces visualize phase lag and motion direction in a compact Canvas scene.',
    category: 'physics', kind: 'inertia', tags: ['VECTORS', 'MOMENTUM'], to: '/visuals/canvas',
  },
  {
    code: 'EXP-045', title: 'Soft-body Node Study', eyebrow: 'FLEXIBLE CONTOUR',
    description: 'A procedural contour flexes around a changing perimeter. The preview is a geometry study rather than a constraint solver.',
    category: 'physics', kind: 'soft-body', tags: ['GEOMETRY', 'CANVAS'], to: '/visuals/canvas',
  },
  {
    code: 'EXP-069', title: 'Aurora Interference', eyebrow: 'WAVE INTERFERENCE',
    description: 'Overlapping color bands respond to the animated time uniform and pointer position.',
    category: 'shader', kind: 'shader-aurora', tags: ['WEBGL', 'UNIFORMS'], to: '/visuals/shaders',
  },
  {
    code: 'EXP-073', title: 'Spectral Refraction', eyebrow: 'RADIAL SPECTRUM',
    description: 'Concentric bands and a pointer-driven offset form an interactive color field rendered with WebGL.',
    category: 'shader', kind: 'shader-spectrum', tags: ['WEBGL', 'POINTER INPUT'], to: '/visuals/shaders',
  },
  {
    code: 'EXP-081', title: 'SVG Stroke Reveal', eyebrow: 'PATH DRAWING',
    description: 'An SVG line is revealed by binding normalized progress to its stroke dash offset.',
    category: 'svg', kind: 'path-draw', tags: ['SVG', 'DRAWING'], to: '/visuals/svg',
  },
  {
    code: 'EXP-083', title: 'Liquid SVG Distortion', eyebrow: 'FILTER DYNAMICS',
    description: 'SVG turbulence parameters animate to distort a vector silhouette without requiring a GPU adapter.',
    category: 'svg', kind: 'liquid-svg', tags: ['SVG FILTER', 'GEOMETRY'], to: '/visuals/svg',
  },
  {
    code: 'EXP-085', title: 'Motion Along a Path', eyebrow: 'TANGENT FOLLOWING',
    description: 'A marker moves along a curve while its orientation follows the path direction.',
    category: 'svg', kind: 'motion-path', tags: ['SVG', 'MOTION PATH'], to: '/visuals/svg',
  },
  {
    code: 'EXP-086', title: 'Parametric Curve Morph', eyebrow: 'GEOMETRY INTERPOLATION',
    description: 'Two compatible Bézier contours interpolate continuously through one normalized progress stream.',
    category: 'svg', kind: 'morph-grid', tags: ['SVG MORPH', 'PARAMETRIC'], to: '/visuals/svg',
  },
  {
    code: 'EXP-077', title: 'Frequency Spectrum', eyebrow: 'LIVE DATA DISPLAY',
    description: 'A spectrum-like bar field turns a scalar phase value into a set of animated visual measurements.',
    category: 'canvas', kind: 'frequency', tags: ['CANVAS', 'DATA VIZ'], to: '/visuals/canvas',
  },
  {
    code: 'EXP-075', title: 'Radial Data Spectrum', eyebrow: 'POLAR VISUALIZATION',
    description: 'Radial bars show how a changing stream can animate geometry across many points without DOM layout work.',
    category: 'canvas', kind: 'radial', tags: ['CANVAS', 'RADIAL'], to: '/visuals/canvas',
  },
];

interface VisualLabExperiment {
  code: string;
  title: string;
  eyebrow: string;
  description: string;
  category: VisualExperimentCategory;
  kind: VisualExperimentKind;
  tags: readonly string[];
  to: string;
}

const visibleExperiments = computed(() => {
  const filter = filters.find((item) => item.id === activeFilter.value);
  if (!filter || filter.category === null) return experiments;
  return experiments.filter((experiment) => experiment.category === filter.category);
});

const presets = [
  { id: 'zero-g', label: 'Zero-G Float', config: { timeScale: 0.8, gravity: 0, springElasticity: 0.82, airDrag: 0.012 } },
  { id: 'hyper', label: 'Hyper-Tension', config: { timeScale: 1.2, gravity: 9.81, springElasticity: 1, airDrag: 0.012 } },
  { id: 'viscous', label: 'Viscous Field', config: { timeScale: 0.6, gravity: 5.5, springElasticity: 0.48, airDrag: 0.085 } },
  { id: 'snappy', label: 'Snappy UI Motion', config: { timeScale: 1, gravity: 9.81, springElasticity: 0.72, airDrag: 0.025 } },
] as const;
const activePreset = ref('snappy');

function applyPreset(id: string): void {
  const preset = presets.find((item) => item.id === id);
  if (!preset) return;
  Object.assign(config, preset.config);
  activePreset.value = id;
}

function updateTelemetry(payload: VisualLabTelemetry): void {
  Object.assign(stageTelemetry, payload);
}

function resetCenter(): void {
  featuredStage.value?.resetCenter();
}

function generatedStreamCode(): string {
  const stiffness = Math.round(130 + config.springElasticity * 210);
  const damping = Number((12 + config.airDrag * 520).toFixed(2));
  const mass = 1;
  return `import { RetargetableMotion } from '@re-code/flux';

// Settings exported from the live Visual Lab preview.
export const visualLabConfig = ${JSON.stringify(config, null, 2)} as const;

const springOptions = {
  stiffness: ${stiffness},
  damping: ${damping},
  mass: ${mass},
};

export const pointerX = new RetargetableMotion({ initialValue: -1, ...springOptions });
export const pointerY = new RetargetableMotion({ initialValue: -1, ...springOptions });

export function retargetPointer(x: number, y: number): void {
  pointerX.to(x, springOptions);
  pointerY.to(y, springOptions);
}

export function resetPointer(): void {
  pointerX.to(-1, springOptions);
  pointerY.to(-1, springOptions);
}

// Mirrors the featured Canvas lattice's phase, gravity and pointer-displacement model.
export function sampleLatticePoint(
  baseX: number,
  baseY: number,
  column: number,
  row: number,
  elapsedMs: number,
  width: number,
  height: number,
  rows = 9,
): { x: number; y: number } {
  const phase = (elapsedMs / 1000) * visualLabConfig.timeScale;
  const amplitude = visualLabConfig.springElasticity
    * (1 - Math.min(0.72, visualLabConfig.airDrag * 5.5))
    * Math.min(14, height * 0.035);
  let x = baseX + Math.sin(phase + row * 0.7) * amplitude * 0.2;
  let y = baseY
    + Math.sin(phase * 1.25 + column * 0.23 + row * 0.41) * amplitude
    + (visualLabConfig.gravity / 25) * (row / Math.max(1, rows - 1)) * height * 0.025;

  const targetX = pointerX.value$.value;
  const targetY = pointerY.value$.value;
  if (targetX >= 0 && targetX <= 1 && targetY >= 0 && targetY <= 1) {
    const dx = baseX - targetX * width;
    const dy = baseY - targetY * height;
    const distance = Math.hypot(dx / Math.max(1, width), dy / Math.max(1, height));
    const influence = Math.max(0, 1 - distance / 0.22);
    x -= dx * influence * 0.095;
    y -= dy * influence * 0.12;
  }
  return { x, y };
}

export function disposePointerStreams(): void {
  pointerX.dispose();
  pointerY.dispose();
}
`;
}

async function copyConfig(): Promise<void> {
  copied.value = false;
  copyError.value = false;
  try {
    if (!navigator.clipboard?.writeText) throw new Error('Clipboard API is unavailable.');
    await navigator.clipboard.writeText(generatedStreamCode());
    copied.value = true;
  } catch {
    copyError.value = true;
  }
  if (copyStatusTimer !== null) clearTimeout(copyStatusTimer);
  copyStatusTimer = setTimeout(() => {
    copied.value = false;
    copyError.value = false;
    copyStatusTimer = null;
  }, 2200);
}

function downloadStream(): void {
  const blob = new Blob([generatedStreamCode()], { type: 'text/typescript;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 're-flux-visual-lab-stream.ts';
  anchor.hidden = true;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  downloaded.value = true;
  copied.value = false;
  copyError.value = false;
  if (downloadStatusTimer !== null) clearTimeout(downloadStatusTimer);
  downloadStatusTimer = setTimeout(() => {
    downloaded.value = false;
    downloadStatusTimer = null;
  }, 2200);
}

function updateConfig(key: keyof VisualLabStageConfig, value: string): void {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return;
  config[key] = numericValue;
  activePreset.value = '';
}

onBeforeUnmount(() => {
  if (copyStatusTimer !== null) clearTimeout(copyStatusTimer);
  if (downloadStatusTimer !== null) clearTimeout(downloadStatusTimer);
  preferenceSubscription.unsubscribe();
  preferences.destroy();
});
</script>

<template>
  <main class="visual-lab-overview">
    <div class="visual-lab-overview__topline">
      <div class="visual-lab-overview__brandline"><span class="visual-lab-overview__status-dot" /> KINETIC STREAM EDITORIAL</div>
      <div class="visual-lab-overview__runtime">
        <span class="visual-lab-overview__status-dot" />
        <span>{{ stageTelemetry.state === 'reduced-motion' || reducedMotion ? 'REDUCED MOTION' : stageTelemetry.state === 'running' && stageTelemetry.fps > 0 ? `${stageTelemetry.fps.toFixed(1)} FPS · ${stageTelemetry.frameTimeMs.toFixed(2)} ms canvas draw` : stageTelemetry.state === 'running' ? 'SAMPLING RENDER METRICS…' : 'STAGE IDLE · MEASUREMENTS PAUSED' }}</span>
        <span>·</span><span>CANVAS 2D / SVG / WEBGL</span>
      </div>
    </div>

    <section class="lab-explorer" aria-label="Filter Visual Lab experiments">
      <div class="lab-explorer__filters" role="group" aria-label="Experiment categories">
        <button
          v-for="filter in filters"
          :key="filter.id"
          type="button"
          class="lab-explorer__filter"
          :class="{ 'is-active': activeFilter === filter.id }"
          :aria-pressed="activeFilter === filter.id"
          @click="activeFilter = filter.id"
        >
          <span v-if="filter.id === 'all'" class="lab-explorer__filter-dot" aria-hidden="true" />
          {{ filter.label }}
          <span class="lab-explorer__count">{{ filter.category === null ? experiments.length : experiments.filter((experiment) => experiment.category === filter.category).length }}</span>
        </button>
      </div>
      <p class="lab-explorer__hint">{{ visibleExperiments.length }} of {{ experiments.length }} experiments · Hover or keyboard-focus to play; leave to reset.</p>
    </section>

    <section class="lab-feature" aria-labelledby="lab-feature-title">
      <div class="lab-feature__header">
        <div class="lab-feature__titleline"><span class="visual-lab-overview__status-dot" /> FEATURED EXPERIMENT <span class="lab-feature__divider">/</span> EXP-094 <span class="lab-feature__divider">/</span> PROCEDURAL LATTICE</div>
        <div class="lab-feature__badges"><span>CANVAS 2D</span><span>RETARGETABLE SPRINGS</span></div>
      </div>
      <div class="lab-feature__content">
        <VisualLabFeaturedStage ref="featuredStage" :config="config" :preferences="preferences" @telemetry="updateTelemetry" />
        <div class="lab-feature__intro">
          <span class="lab-feature__live"><span class="visual-lab-overview__status-dot" /> {{ stageTelemetry.state === 'running' ? 'LIVE CANVAS STAGE' : reducedMotion ? 'STATIC PREVIEW' : 'STAGE READY' }}</span>
          <h1 id="lab-feature-title">Neural Spring Lattice</h1>
          <p>A responsive 23 × 9 mesh. Pointer displacement is smoothed by retargetable spring streams; tune the preview below and watch the field react.</p>
          <div class="lab-feature__actions">
            <RouterLink to="/visuals/canvas" class="lab-button lab-button--primary">Explore Canvas demos <span aria-hidden="true">↗</span></RouterLink>
            <RouterLink to="/docs/interactions" class="lab-button lab-button--quiet">Spring dynamics</RouterLink>
          </div>
        </div>
        <div class="lab-feature__readout" aria-label="Live Canvas measurements">
          <div><span>RENDER TARGET</span><strong>Canvas 2D</strong></div>
          <div><span>FPS SAMPLE</span><strong>{{ stageTelemetry.state === 'running' && stageTelemetry.fps > 0 ? stageTelemetry.fps.toFixed(1) : '—' }}</strong></div>
          <div><span>CANVAS DRAW TIME</span><strong>{{ stageTelemetry.state === 'running' && stageTelemetry.fps > 0 ? `${stageTelemetry.frameTimeMs.toFixed(2)} ms` : stageTelemetry.state === 'running' ? 'Sampling…' : 'Paused' }}</strong></div>
          <div><span>GRID NODES</span><strong>{{ stageTelemetry.nodeCount }}</strong></div>
          <div><span>POINTER VECTOR</span><strong>{{ stageTelemetry.pointerX === null || stageTelemetry.pointerY === null ? 'Inactive' : `x ${stageTelemetry.pointerX.toFixed(2)} · y ${stageTelemetry.pointerY.toFixed(2)}` }}</strong></div>
        </div>
      </div>
    </section>

    <section class="lab-modules" aria-labelledby="lab-modules-title">
      <div class="lab-modules__heading">
        <div>
          <span class="lab-kicker">// BATCH EXECUTION RUNTIMES</span>
          <h2 id="lab-modules-title">Experimental Lab Modules</h2>
        </div>
        <p>Explore focused motion studies across physics, WebGL, SVG and Canvas. Each preview only animates while it is being inspected.</p>
      </div>

      <div v-if="visibleExperiments.length" class="lab-modules__grid">
        <VisualExperimentCard
          v-for="experiment in visibleExperiments"
          :key="experiment.code"
          :code="experiment.code"
          :title="experiment.title"
          :eyebrow="experiment.eyebrow"
          :description="experiment.description"
          :category="experiment.category"
          :kind="experiment.kind"
          :tags="experiment.tags"
          :to="experiment.to"
          :preferences="preferences"
        />
      </div>
      <p v-else class="lab-modules__empty">No experiments match this category yet.</p>
    </section>

    <section class="lab-sandbox" aria-labelledby="lab-sandbox-title">
      <div class="lab-sandbox__intro">
        <span class="lab-kicker">// PREVIEW CONFIGURATION</span>
        <h2 id="lab-sandbox-title">Global Engine Sandbox <span class="lab-sandbox__live">LIVE PREVIEW</span></h2>
        <p>These controls tune the featured Canvas lattice. They are local preview parameters, not global engine defaults. Export creates a runnable RetargetableMotion example from the current settings.</p>
      </div>
      <div class="lab-sandbox__controls">
        <label class="lab-control">
          <span><span>Time scale</span><strong>{{ config.timeScale.toFixed(2) }}×</strong></span>
          <input type="range" min="0.1" max="2" step="0.05" :value="config.timeScale" @input="updateConfig('timeScale', ($event.target as HTMLInputElement).value)" />
          <small>0.1× slower <span>2× faster</span></small>
        </label>
        <label class="lab-control">
          <span><span>Gravity influence</span><strong>{{ config.gravity.toFixed(2) }}</strong></span>
          <input type="range" min="0" max="25" step="0.1" :value="config.gravity" @input="updateConfig('gravity', ($event.target as HTMLInputElement).value)" />
          <small>0.0 low <span>25.0 high</span></small>
        </label>
        <label class="lab-control">
          <span><span>Spring elasticity</span><strong>{{ config.springElasticity.toFixed(2) }}</strong></span>
          <input type="range" min="0.1" max="1.2" step="0.01" :value="config.springElasticity" @input="updateConfig('springElasticity', ($event.target as HTMLInputElement).value)" />
          <small>Soft <span>Elastic</span></small>
        </label>
        <label class="lab-control">
          <span><span>Air drag</span><strong>{{ config.airDrag.toFixed(3) }}</strong></span>
          <input type="range" min="0.005" max="0.1" step="0.001" :value="config.airDrag" @input="updateConfig('airDrag', ($event.target as HTMLInputElement).value)" />
          <small>Low resistance <span>High resistance</span></small>
        </label>
      </div>
      <div class="lab-sandbox__bottom">
        <div class="lab-sandbox__presets" aria-label="Preview presets">
          <span>PHYSICS PRESETS:</span>
          <button v-for="preset in presets" :key="preset.id" type="button" :class="{ 'is-active': activePreset === preset.id }" @click="applyPreset(preset.id)">{{ preset.label }}</button>
        </div>
        <div class="lab-sandbox__actions">
          <button type="button" class="lab-button lab-button--quiet" @click="resetCenter">Reset center</button>
          <button type="button" class="lab-button lab-button--primary" @click="downloadStream">{{ downloaded ? 'Stream downloaded' : 'Export stream (.ts)' }}</button>
          <button type="button" class="lab-button lab-button--quiet" @click="copyConfig">{{ copied ? 'Code copied' : copyError ? 'Clipboard unavailable' : 'Copy code' }}</button>
        </div>
      </div>
      <div class="lab-sandbox__launchers">
        <a href="https://codesandbox.io/p/github/iamcodex96/re-flux" target="_blank" rel="noopener noreferrer">Open repository in CodeSandbox <span aria-hidden="true">↗</span></a>
        <a href="https://stackblitz.com/github/iamcodex96/re-flux" target="_blank" rel="noopener noreferrer">Open repository in StackBlitz <span aria-hidden="true">↗</span></a>
      </div>
    </section>
  </main>
</template>
