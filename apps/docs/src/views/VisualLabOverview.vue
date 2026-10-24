<script setup lang="ts">
import { useAppStore } from '../stores/app';
import { computed, onBeforeUnmount, reactive, ref } from 'vue';
import { RouterLink } from 'vue-router';
import { MotionPreferences } from '@lib';
import VisualExperimentCard from '../components/VisualLab/VisualExperimentCard.vue';
import VisualLabFeaturedStage from '../components/VisualLab/VisualLabFeaturedStage.vue';
import type { VisualExperimentCategory, VisualExperimentKind, VisualLabStageConfig, VisualLabTelemetry } from '../components/VisualLab/visualLabTypes';


const appStore = useAppStore();
const copy = computed(() => appStore.app.view.visualLabOverview);
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
  nodeCount: 120,
  pointerX: null,
  pointerY: null,
  state: 'idle',
});

const filters: readonly { id: string; label: string; category: VisualExperimentCategory | null }[] = [
  { id: 'all', label: copy.value.staticText.allExperiments, category: null },
  { id: 'physics', label: copy.value.staticText.physicsAndSprings, category: 'physics' },
  { id: 'shader', label: copy.value.staticText.webglAndShaders, category: 'shader' },
  { id: 'svg', label: copy.value.staticText.svgSplineMorphing, category: 'svg' },
  { id: 'canvas', label: copy.value.staticText.canvasParticles, category: 'canvas' },
];

const experiments: VisualLabExperiment[] = [
  {
    code: 'EXP-088', title: copy.value.staticText.kineticTypographyRx, eyebrow: copy.value.staticText.staggeredGlyphs,
    description: copy.value.staticText.textEntersByGraphemeUsingReFluxStaggerTimingLeaveTheCardToRestoreTheOriginalReadableText,
    category: 'physics', kind: 'typography', tags: [copy.value.staticText.dom, copy.value.staticText.stream, copy.value.staticText.type], to: '/visuals/interactions',
  },
  {
    code: 'EXP-082', title: copy.value.staticText.morphingTopographySplines, eyebrow: copy.value.staticText.bZierContinuum,
    description: copy.value.staticText.aNormalizedSvgPathMorphsBetweenCompatibleGeometriesAndResetsToItsOriginalOutlineOnPointerLeave,
    category: 'svg', kind: 'spline', tags: [copy.value.staticText.svgMorph, copy.value.staticText.spline], to: '/visuals/svg',
  },
  {
    code: 'EXP-079', title: copy.value.staticText.fluidParticleVortices, eyebrow: copy.value.staticText.particleConstellation,
    description: copy.value.staticText.connectedParticlesFormAConstellationWhosePositionsAndLinksAreRedrawnFromASingleAnimationStream,
    category: 'canvas', kind: 'particles', tags: [copy.value.staticText.canvas2d, copy.value.staticText.particles], to: '/visuals/canvas',
  },
  {
    code: 'EXP-071', title: copy.value.staticText.viscoelasticMeshStudy, eyebrow: copy.value.staticText.proceduralMesh,
    description: copy.value.staticText.aResponsiveWireMeshVisualStudyDrivenByASharedPhaseStreamItIsNotPresentedAsAFullClothConstraintSolver,
    category: 'physics', kind: 'cloth', tags: [copy.value.staticText.canvas, copy.value.staticText.mesh], to: '/visuals/canvas',
  },
  {
    code: 'EXP-064', title: copy.value.staticText.chromaticDispersion, eyebrow: copy.value.staticText.fragmentColorStudy,
    description: copy.value.staticText.aRealWebglFragmentShaderSeparatesSpectralBandsAndRecombinesThemIntoAChromaticField,
    category: 'shader', kind: 'dispersion', tags: [copy.value.staticText.webgl, copy.value.staticText.glsl], to: '/visuals/shaders',
  },
  {
    code: 'EXP-052', title: copy.value.staticText.vectorFieldSwarm, eyebrow: copy.value.staticText.agentField,
    description: copy.value.staticText.aConstellationOfAgentsFollowsOrbitalPathsAroundAMovingCenterDrivenByASingleContinuousPhaseValue,
    category: 'physics', kind: 'swarm', tags: [copy.value.staticText.canvas2d, copy.value.staticText.vectorField], to: '/visuals/canvas',
  },
  {
    code: 'EXP-057', title: copy.value.staticText.springFollowerField, eyebrow: copy.value.staticText.followerResponse,
    description: copy.value.staticText.aChainOfFollowersTracesAMovingTargetWithPhaseDelayedMotionIllustratingHowCoordinatedValuesCanShapeAScene,
    category: 'physics', kind: 'spring-follower', tags: [copy.value.staticText.followers, copy.value.staticText.stream], to: '/docs/interactions',
  },
  {
    code: 'EXP-061', title: copy.value.staticText.inertiaVectorTrails, eyebrow: copy.value.staticText.momentumStudy,
    description: copy.value.staticText.orbitingTracesVisualizePhaseLagAndMotionDirectionInACompactCanvasScene,
    category: 'physics', kind: 'inertia', tags: [copy.value.staticText.vectors, copy.value.staticText.momentum], to: '/visuals/canvas',
  },
  {
    code: 'EXP-045', title: copy.value.staticText.softBodyNodeStudy, eyebrow: copy.value.staticText.flexibleContour,
    description: copy.value.staticText.aProceduralContourFlexesAroundAChangingPerimeterThePreviewIsAGeometryStudyRatherThanAConstraintSolver,
    category: 'physics', kind: 'soft-body', tags: [copy.value.staticText.geometry, copy.value.staticText.canvas], to: '/visuals/canvas',
  },
  {
    code: 'EXP-069', title: copy.value.staticText.auroraInterference, eyebrow: copy.value.staticText.waveInterference,
    description: copy.value.staticText.overlappingColorBandsRespondToTheAnimatedTimeUniformAndPointerPosition,
    category: 'shader', kind: 'shader-aurora', tags: [copy.value.staticText.webgl, copy.value.staticText.uniforms], to: '/visuals/shaders',
  },
  {
    code: 'EXP-073', title: copy.value.staticText.spectralRefraction, eyebrow: copy.value.staticText.radialSpectrum,
    description: copy.value.staticText.concentricBandsAndAPointerDrivenOffsetFormAnInteractiveColorFieldRenderedWithWebgl,
    category: 'shader', kind: 'shader-spectrum', tags: [copy.value.staticText.webgl, copy.value.staticText.pointerInput], to: '/visuals/shaders',
  },
  {
    code: 'EXP-081', title: copy.value.staticText.svgStrokeReveal, eyebrow: copy.value.staticText.pathDrawing,
    description: copy.value.staticText.anSvgLineIsRevealedByBindingNormalizedProgressToItsStrokeDashOffset,
    category: 'svg', kind: 'path-draw', tags: [copy.value.staticText.svg, copy.value.staticText.drawing], to: '/visuals/svg',
  },
  {
    code: 'EXP-083', title: copy.value.staticText.liquidSvgDistortion, eyebrow: copy.value.staticText.filterDynamics,
    description: copy.value.staticText.svgTurbulenceParametersAnimateToDistortAVectorSilhouetteWithoutRequiringAGpuAdapter,
    category: 'svg', kind: 'liquid-svg', tags: [copy.value.staticText.svgFilter, copy.value.staticText.geometry], to: '/visuals/svg',
  },
  {
    code: 'EXP-085', title: copy.value.staticText.motionAlongAPath, eyebrow: copy.value.staticText.tangentFollowing,
    description: copy.value.staticText.aMarkerMovesAlongACurveWhileItsOrientationFollowsThePathDirection,
    category: 'svg', kind: 'motion-path', tags: [copy.value.staticText.svg, copy.value.staticText.motionPath], to: '/visuals/svg',
  },
  {
    code: 'EXP-086', title: copy.value.staticText.parametricCurveMorph, eyebrow: copy.value.staticText.geometryInterpolation,
    description: copy.value.staticText.twoCompatibleBZierContoursInterpolateContinuouslyThroughOneNormalizedProgressStream,
    category: 'svg', kind: 'morph-grid', tags: [copy.value.staticText.svgMorph, copy.value.staticText.parametric], to: '/visuals/svg',
  },
  {
    code: 'EXP-077', title: copy.value.staticText.frequencySpectrum, eyebrow: copy.value.staticText.liveDataDisplay,
    description: copy.value.staticText.aSpectrumLikeBarFieldTurnsAScalarPhaseValueIntoASetOfAnimatedVisualMeasurements,
    category: 'canvas', kind: 'frequency', tags: [copy.value.staticText.canvas, copy.value.staticText.dataViz], to: '/visuals/canvas',
  },
  {
    code: 'EXP-075', title: copy.value.staticText.radialDataSpectrum, eyebrow: copy.value.staticText.polarVisualization,
    description: copy.value.staticText.radialBarsShowHowAChangingStreamCanAnimateGeometryAcrossManyPointsWithoutDomLayoutWork,
    category: 'canvas', kind: 'radial', tags: [copy.value.staticText.canvas, copy.value.staticText.radial], to: '/visuals/canvas',
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
  { id: 'zero-g', label: copy.value.staticText.zeroGFloat, config: { timeScale: 0.8, gravity: 0, springElasticity: 0.82, airDrag: 0.012 } },
  { id: 'hyper', label: copy.value.staticText.hyperTension, config: { timeScale: 1.2, gravity: 9.81, springElasticity: 1, airDrag: 0.012 } },
  { id: 'viscous', label: copy.value.staticText.viscousField, config: { timeScale: 0.6, gravity: 5.5, springElasticity: 0.48, airDrag: 0.085 } },
  { id: 'snappy', label: copy.value.staticText.snappyUiMotion, config: { timeScale: 1, gravity: 9.81, springElasticity: 0.72, airDrag: 0.025 } },
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

// Samples one of the featured orbital ribbons using the current reactive motion state.
export function sampleOrbitalPoint(
  progress: number,
  ribbon: number,
  phaseInput: number,
  width: number,
  height: number,
): { x: number; y: number } {
  const phase = phaseInput * visualLabConfig.timeScale;
  const unit = ((progress % 1) + 1) % 1;
  const angle = unit * Math.PI * 2 + phase * 0.14 + ribbon * 0.42;
  const resistance = 1 - Math.min(0.68, visualLabConfig.airDrag * 4.8);
  const amplitude = (0.55 + visualLabConfig.springElasticity * 0.8) * resistance;
  const x = width * 0.5
    + Math.cos(angle) * width * (0.205 + ribbon * 0.012)
    + Math.sin(angle * 3 + phase * 0.24 + ribbon * 0.74) * width * 0.062 * amplitude;
  const y = height * 0.5
    + Math.sin(angle * 2 + ribbon * 0.19) * height * (0.245 + ribbon * 0.018) * 0.72
    + Math.cos(angle * 3 - phase * 0.17 + ribbon * 0.61) * height * 0.105 * amplitude
    + (visualLabConfig.gravity / 25) * (unit - 0.5) * height * 0.09;

  const targetX = pointerX.value$.value;
  const targetY = pointerY.value$.value;
  if (targetX >= 0 && targetX <= 1 && targetY >= 0 && targetY <= 1) {
    const dx = targetX * width - x;
    const dy = targetY * height - y;
    const distance = Math.hypot(dx / Math.max(1, width), dy / Math.max(1, height));
    const influence = Math.max(0, 1 - distance / 0.34) * visualLabConfig.springElasticity * 0.28;
    return { x: x + dx * influence, y: y + dy * influence };
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
      <div class="visual-lab-overview__brandline"><span class="visual-lab-overview__status-dot" /> {{ copy.staticText.kineticStreamEditorial }}</div>
      <div class="visual-lab-overview__runtime">
        <span class="visual-lab-overview__status-dot" />
        <span>{{ stageTelemetry.state === 'reduced-motion' || reducedMotion ? copy.staticText.reducedMotion : stageTelemetry.state === 'running' && stageTelemetry.fps > 0 ? copy.staticText.p5DrawMetrics.replace('{fps}', stageTelemetry.fps.toFixed(1)).replace('{frameTime}', stageTelemetry.frameTimeMs.toFixed(2)) : stageTelemetry.state === 'running' ? copy.staticText.samplingRenderMetrics : copy.staticText.stageIdleMeasurementsPaused }}</span>
        <span>·</span><span>{{ copy.staticText.p5JsCanvasSvgWebgl }}</span>
      </div>
    </div>

    <section class="lab-explorer" :aria-label="copy.staticText.filterVisualLabExperiments">
      <div class="lab-explorer__filters" role="group" :aria-label="copy.staticText.experimentCategories">
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
      <p class="lab-explorer__hint">{{ visibleExperiments.length }} {{ copy.staticText.of }} {{ experiments.length }} {{ copy.staticText.experimentsHoverOrKeyboardFocusToPlayLeaveToReset }}</p>
    </section>

    <section class="lab-feature" aria-labelledby="lab-feature-title">
      <div class="lab-feature__header">
        <div class="lab-feature__titleline"><span class="visual-lab-overview__status-dot" /> {{ copy.staticText.featuredExperiment }} <span class="lab-feature__divider">/</span> {{ copy.staticText.exp094 }} <span class="lab-feature__divider">/</span> {{ copy.staticText.generativeFlowField }}</div>
        <div class="lab-feature__badges"><span>{{ copy.staticText.p5jsCanvasBadge }}</span><span>{{ copy.staticText.retargetableSprings }}</span></div>
      </div>
      <div class="lab-feature__content">
        <VisualLabFeaturedStage ref="featuredStage" :config="config" :preferences="preferences" @telemetry="updateTelemetry" />
        <div class="lab-feature__intro">
          <span class="lab-feature__live"><span class="visual-lab-overview__status-dot" /> {{ stageTelemetry.state === 'running' ? copy.staticText.liveP5jsStage : reducedMotion ? copy.staticText.staticPreview : copy.staticText.stageReady }}</span>
          <h1 id="lab-feature-title">{{ copy.staticText.kineticSingularity }}</h1>
          <p>{{ copy.staticText.kineticSingularityDescription }}</p>
          <div class="lab-feature__actions">
            <RouterLink to="/visuals/canvas" class="lab-button lab-button--primary">{{ copy.staticText.exploreCanvasDemos }} <span aria-hidden="true">↗</span></RouterLink>
            <RouterLink to="/docs/interactions" class="lab-button lab-button--quiet">{{ copy.staticText.springDynamics }}</RouterLink>
          </div>
        </div>
        <div class="lab-feature__readout" :aria-label="copy.staticText.liveRendererMeasurements">
          <div><span>{{ copy.staticText.renderTarget }}</span><strong>{{ copy.staticText.p5jsCanvas }}</strong></div>
          <div><span>{{ copy.staticText.fpsSample }}</span><strong>{{ stageTelemetry.state === 'running' && stageTelemetry.fps > 0 ? stageTelemetry.fps.toFixed(1) : '—' }}</strong></div>
          <div><span>{{ copy.staticText.p5DrawTime }}</span><strong>{{ stageTelemetry.state === 'running' && stageTelemetry.fps > 0 ? `${stageTelemetry.frameTimeMs.toFixed(2)} ms` : stageTelemetry.state === 'running' ? copy.staticText.sampling : copy.staticText.paused }}</strong></div>
          <div><span>{{ copy.staticText.fieldParticles }}</span><strong>{{ stageTelemetry.nodeCount }}</strong></div>
          <div><span>{{ copy.staticText.pointerVector }}</span><strong>{{ stageTelemetry.pointerX === null || stageTelemetry.pointerY === null ? copy.staticText.inactive : `x ${stageTelemetry.pointerX.toFixed(2)} · y ${stageTelemetry.pointerY.toFixed(2)}` }}</strong></div>
        </div>
      </div>
    </section>

    <section class="lab-modules" aria-labelledby="lab-modules-title">
      <div class="lab-modules__heading">
        <div>
          <span class="lab-kicker">{{ copy.staticText.batchExecutionRuntimes }}</span>
          <h2 id="lab-modules-title">{{ copy.staticText.experimentalLabModules }}</h2>
        </div>
        <p>{{ copy.staticText.exploreFocusedMotionStudiesAcrossPhysicsWebglSvgAndCanvasEachPreviewOnlyAnimatesWhileItIsBeingInspected }}</p>
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
      <p v-else class="lab-modules__empty">{{ copy.staticText.noExperimentsMatchThisCategoryYet }}</p>
    </section>

    <section class="lab-sandbox" aria-labelledby="lab-sandbox-title">
      <div class="lab-sandbox__intro">
        <span class="lab-kicker">{{ copy.staticText.previewConfiguration }}</span>
        <h2 id="lab-sandbox-title">{{ copy.staticText.globalEngineSandbox }} <span class="lab-sandbox__live">{{ copy.staticText.livePreview }}</span></h2>
        <p>{{ copy.staticText.generativeFieldConfigurationDescription }}</p>
      </div>
      <div class="lab-sandbox__controls">
        <label class="lab-control">
          <span><span>{{ copy.staticText.timeScale }}</span><strong>{{ config.timeScale.toFixed(2) }}{{ copy.staticText.text }}</strong></span>
          <input type="range" min="0.1" max="2" step="0.05" :value="config.timeScale" @input="updateConfig('timeScale', ($event.target as HTMLInputElement).value)" />
          <small>{{ copy.staticText.text01Slower }} <span>{{ copy.staticText.text2Faster }}</span></small>
        </label>
        <label class="lab-control">
          <span><span>{{ copy.staticText.gravityInfluence }}</span><strong>{{ config.gravity.toFixed(2) }}</strong></span>
          <input type="range" min="0" max="25" step="0.1" :value="config.gravity" @input="updateConfig('gravity', ($event.target as HTMLInputElement).value)" />
          <small>{{ copy.staticText.text00Low }} <span>{{ copy.staticText.text250High }}</span></small>
        </label>
        <label class="lab-control">
          <span><span>{{ copy.staticText.springElasticity }}</span><strong>{{ config.springElasticity.toFixed(2) }}</strong></span>
          <input type="range" min="0.1" max="1.2" step="0.01" :value="config.springElasticity" @input="updateConfig('springElasticity', ($event.target as HTMLInputElement).value)" />
          <small>{{ copy.staticText.soft }} <span>{{ copy.staticText.elastic }}</span></small>
        </label>
        <label class="lab-control">
          <span><span>{{ copy.staticText.airDrag }}</span><strong>{{ config.airDrag.toFixed(3) }}</strong></span>
          <input type="range" min="0.005" max="0.1" step="0.001" :value="config.airDrag" @input="updateConfig('airDrag', ($event.target as HTMLInputElement).value)" />
          <small>{{ copy.staticText.lowResistance }} <span>{{ copy.staticText.highResistance }}</span></small>
        </label>
      </div>
      <div class="lab-sandbox__bottom">
        <div class="lab-sandbox__presets" :aria-label="copy.staticText.previewPresets">
          <span>{{ copy.staticText.physicsPresets }}</span>
          <button v-for="preset in presets" :key="preset.id" type="button" :class="{ 'is-active': activePreset === preset.id }" @click="applyPreset(preset.id)">{{ preset.label }}</button>
        </div>
        <div class="lab-sandbox__actions">
          <button type="button" class="lab-button lab-button--quiet" @click="resetCenter">{{ copy.staticText.resetCenter }}</button>
          <button type="button" class="lab-button lab-button--primary" @click="downloadStream">{{ downloaded ? copy.staticText.streamDownloaded : copy.staticText.exportStream }}</button>
          <button type="button" class="lab-button lab-button--quiet" @click="copyConfig">{{ copied ? copy.staticText.codeCopied : copyError ? copy.staticText.clipboardUnavailable : copy.staticText.copyCode }}</button>
        </div>
      </div>
      <div class="lab-sandbox__launchers">
        <a href="https://codesandbox.io/p/github/iamcodex96/re-flux" target="_blank" rel="noopener noreferrer">{{ copy.staticText.openRepositoryInCodesandbox }} <span aria-hidden="true">↗</span></a>
        <a href="https://stackblitz.com/github/iamcodex96/re-flux" target="_blank" rel="noopener noreferrer">{{ copy.staticText.openRepositoryInStackblitz }} <span aria-hidden="true">↗</span></a>
      </div>
    </section>
  </main>
</template>
