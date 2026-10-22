<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { keyframes } from '@lib';

type EngineId = 're-flux' | 'gsap' | 'animejs';
type RendererId = 'dom' | 'svg' | 'canvas';
type BenchmarkRendererId = RendererId | 'none';
type ScenarioId = 'shared-renderer' | 'engine-only' | 'per-target-dom';
type EngineStatus = 'idle' | 'loading' | 'warming-up' | 'running' | 'complete' | 'error';

interface EngineMeta {
  id: EngineId;
  name: string;
  version: string;
  subtitle: string;
  href: string;
}

interface FrameStats {
  sampleCount: number;
  medianMs: number | null;
  p95Ms: number | null;
  p99Ms: number | null;
  maxMs: number | null;
  stretchedFrameCount: number;
  estimatedMissedRefreshCount: number;
}

interface BrowserRunResult {
  engine: EngineId;
  repetition: number;
  scenario: ScenarioId;
  renderer: BenchmarkRendererId;
  targetCount: number;
  configuredDurationMs: number;
  completed: boolean;
  elapsedMs: number;
  renderCallbacks: number;
  renderedTargetsPerCallback: number;
  rendererWork: { medianMs: number | null; p95Ms: number | null; p99Ms: number | null; totalMs: number | null };
  frameIntervals: FrameStats;
  longTaskCount: number | null;
  longTaskDurationMs: number | null;
  longAnimationFrameCount: number | null;
  cleanupPassed: boolean | null;
}

interface EngineSummary {
  id: EngineId;
  name: string;
  version: string;
  subtitle: string;
  href: string;
  runs: BrowserRunResult[];
  medianCompletionMs: number;
  medianRendererP95Ms: number | null;
  medianRendererTotalMs: number | null;
  medianRenderCallbacks: number | null;
  medianFrameP95Ms: number | null;
  medianFrameP99Ms: number | null;
  medianFrameIntervalMs: number | null;
  medianStretchedFrameCount: number;
  medianEstimatedMissedRefreshCount: number;
  medianLongTaskCount: number | null;
  medianLongAnimationFrameCount: number | null;
  cleanupPassed: boolean | null;
}

interface BenchmarkReport {
  benchmark: string;
  schemaVersion: 2;
  createdAt: string;
  environment: {
    userAgent: string;
    platform: string;
    language: string;
    hardwareConcurrency: number | null;
    devicePixelRatio: number;
    viewport: { width: number; height: number };
    visibilityState: DocumentVisibilityState;
  };
  configuration: {
    scenario: ScenarioId;
    renderer: BenchmarkRendererId;
    targetCount: number;
    durationMs: number;
    repetitions: number;
    frameBudgetReferenceMs: number;
    frameBudgetSource: 'raf-calibration' | '60hz-fallback';
    estimatedRafCadenceHz: number;
    calibrationSamples: number;
    stretchedFrameThresholdMs: number;
  };
  libraries: Array<{ id: EngineId; name: string; version: string; source: string }>;
  methodology: string[];
  results: EngineSummary[];
  caveats: string[];
}

interface GsapTween {
  play(position?: number): unknown;
  kill(): void;
}
interface GsapApi {
  to(target: object | Element[], vars: Record<string, unknown>): GsapTween;
}
interface AnimeAnimation {
  play(): unknown;
  cancel(): unknown;
}
type AnimeAnimate = (target: object, parameters: Record<string, unknown>) => AnimeAnimation;
interface GsapModuleShape {
  gsap?: GsapApi;
  default?: GsapApi | { gsap?: GsapApi };
}
interface AnimeModuleShape {
  animate?: AnimeAnimate;
  default?: AnimeAnimate | { animate?: AnimeAnimate };
}
interface EngineModules {
  gsap: GsapApi;
  animeAnimate: AnimeAnimate;
}
interface AnimationRunner {
  start(): void;
  cleanup(): void;
}
interface RenderScene {
  render(progress: number): void;
  cleanup(): void;
  targetCount: number;
  domTargets?: HTMLDivElement[];
  objectTargets?: Array<{ value: number }>;
}

const engines: readonly EngineMeta[] = [
  {
    id: 're-flux', name: 're;Flux', version: 'this site build',
    subtitle: 'RxJS-driven keyframes', href: 'https://github.com/iamcodex96/re-flux',
  },
  {
    id: 'gsap', name: 'GSAP', version: '3.15.0',
    subtitle: 'JavaScript object tween', href: 'https://gsap.com/',
  },
  {
    id: 'animejs', name: 'Anime.js', version: '4.5.0',
    subtitle: 'JavaScript object animation', href: 'https://animejs.com/',
  },
];

const scenarios: Array<{ id: ScenarioId; label: string; description: string }> = [
  { id: 'engine-only', label: 'Engine overhead', description: 'Each engine animates a collection of plain JavaScript objects. No DOM, SVG, Canvas or layout writes are performed in the measured workload.' },
  { id: 'per-target-dom', label: 'Per-target DOM', description: 'Each engine updates opacity independently on the selected number of real DOM elements. This includes each engine’s per-target animation path.' },
  { id: 'shared-renderer', label: 'Shared renderer', description: 'Each engine animates one scalar progress value and drives the same renderer callback for DOM, SVG or Canvas.' },
];
const renderers: Array<{ id: RendererId; label: string; description: string }> = [
  { id: 'dom', label: 'DOM', description: 'Real HTML elements; inline transform and opacity updates.' },
  { id: 'svg', label: 'SVG', description: 'Real SVG rectangles; transform and opacity attributes are updated per target.' },
  { id: 'canvas', label: 'Canvas 2D', description: 'A real canvas redraws the selected number of shapes on each engine update.' },
];
const targetOptions = [100, 250, 500, 1000, 2500, 5000];
const durationOptions = [1000, 1500, 2000, 2500];
const repetitions = 10;
const warmupTargets = 80;
const warmupDurationMs = 250;
const fallbackFrameIntervalMs = 1000 / 60;
const calibrationIntervalCount = 60;
const cdnUrls = {
  gsap: 'https://esm.sh/gsap@3.15.0',
  animejs: 'https://esm.sh/animejs@4.5.0',
} as const;

const selectedScenario = ref<ScenarioId>('shared-renderer');
const selectedRenderer = ref<RendererId>('dom');
const frameBudgetReferenceMs = ref(fallbackFrameIntervalMs);
const frameBudgetSource = ref<'raf-calibration' | '60hz-fallback'>('60hz-fallback');
const calibrationSamples = ref(0);
const estimatedRafCadenceHz = computed(() => 1000 / frameBudgetReferenceMs.value);
const stretchedFrameThresholdMs = computed(() => frameBudgetReferenceMs.value * 1.5);
const selectedTargetCount = ref(500);
const selectedDurationMs = ref(1500);
const stageHost = ref<HTMLDivElement | null>(null);
const isRunning = ref(false);
const currentEngine = ref<EngineId | null>(null);
const statusMessage = ref('Ready to compare. Keep this tab visible while a run is in progress.');
const errorMessage = ref<string | null>(null);
const progressStep = ref(0);
const totalSteps = 3 + repetitions * engines.length;
const engineStatus = ref<Record<EngineId, EngineStatus>>({
  're-flux': 'idle', gsap: 'idle', animejs: 'idle',
});
const runResults = ref<Partial<Record<EngineId, BrowserRunResult[]>>>({});
const report = ref<BenchmarkReport | null>(null);
let activeController: AbortController | null = null;
let cachedModules: Promise<EngineModules> | null = null;

const selectedScenarioMeta = computed(() => scenarios.find((item) => item.id === selectedScenario.value)!);
const selectedRendererMeta = computed(() => {
  if (selectedScenario.value === 'engine-only') return { id: 'none' as const, label: 'JavaScript objects', description: 'Object updates only; no browser renderer is involved in the measured workload.' };
  if (selectedScenario.value === 'per-target-dom') return { id: 'dom' as const, label: 'Per-target DOM', description: 'Each engine animates opacity on each real DOM target using its per-target animation path.' };
  return renderers.find((item) => item.id === selectedRenderer.value)!;
});
const activeRenderer = computed<BenchmarkRendererId>(() => selectedScenario.value === 'engine-only' ? 'none' : selectedScenario.value === 'per-target-dom' ? 'dom' : selectedRenderer.value);
const activeFrameThresholdMs = computed(() => stretchedFrameThresholdMs.value);
const progressPercent = computed(() => totalSteps > 0 ? Math.min(100, Math.round((progressStep.value / totalSteps) * 100)) : 0);
const summaries = computed<EngineSummary[]>(() => engines.map((engine) => summarizeEngine(engine, runResults.value[engine.id] ?? [])));
const measuredResultsExist = computed(() => summaries.value.some((summary) => summary.runs.length > 0));
const maxRendererP95Ms = computed(() => Math.max(0, ...summaries.value.map((summary) => summary.medianRendererP95Ms ?? 0)));
const statusLabel = computed(() => isRunning.value
  ? (currentEngine.value ? `Running ${engineName(currentEngine.value)}…` : 'Preparing benchmark…')
  : report.value ? 'Run complete' : errorMessage.value ? 'Run needs attention' : 'Ready');

watch([selectedScenario, selectedRenderer, selectedTargetCount, selectedDurationMs], () => {
  if (isRunning.value) return;
  runResults.value = {};
  report.value = null;
  progressStep.value = 0;
  errorMessage.value = null;
  engineStatus.value = { 're-flux': 'idle', gsap: 'idle', animejs: 'idle' };
  statusMessage.value = 'Configuration changed. Ready for a new benchmark.';
});

function engineName(id: EngineId): string {
  return engines.find((engine) => engine.id === id)?.name ?? id;
}

function round(value: number, digits = 3): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const value = sorted.length % 2 === 0
    ? ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
    : sorted[middle];
  return value === undefined ? null : round(value);
}

function percentile(values: readonly number[], quantile: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(quantile * sorted.length) - 1));
  const value = sorted[index];
  return value === undefined ? null : round(value);
}

function summarizeEngine(engine: EngineMeta, runs: BrowserRunResult[]): EngineSummary {
  return {
    id: engine.id,
    name: engine.name,
    version: engine.version,
    subtitle: engine.subtitle,
    href: engine.href,
    runs,
    medianCompletionMs: median(runs.map((run) => run.elapsedMs)) ?? 0,
    medianRendererP95Ms: median(runs.flatMap((run) => run.rendererWork.p95Ms === null ? [] : [run.rendererWork.p95Ms])),
    medianRendererTotalMs: median(runs.flatMap((run) => run.rendererWork.totalMs === null ? [] : [run.rendererWork.totalMs])),
    medianRenderCallbacks: median(runs.map((run) => run.renderCallbacks)),
    medianFrameP95Ms: median(runs.flatMap((run) => run.frameIntervals.p95Ms === null ? [] : [run.frameIntervals.p95Ms])),
    medianFrameP99Ms: median(runs.flatMap((run) => run.frameIntervals.p99Ms === null ? [] : [run.frameIntervals.p99Ms])),
    medianFrameIntervalMs: median(runs.flatMap((run) => run.frameIntervals.medianMs === null ? [] : [run.frameIntervals.medianMs])),
    medianStretchedFrameCount: median(runs.map((run) => run.frameIntervals.stretchedFrameCount)) ?? 0,
    medianEstimatedMissedRefreshCount: median(runs.map((run) => run.frameIntervals.estimatedMissedRefreshCount)) ?? 0,
    medianLongTaskCount: median(runs.flatMap((run) => run.longTaskCount === null ? [] : [run.longTaskCount])),
    medianLongAnimationFrameCount: median(runs.flatMap((run) => run.longAnimationFrameCount === null ? [] : [run.longAnimationFrameCount])),
    cleanupPassed: runs.length > 0 && runs.some((run) => run.cleanupPassed !== null)
      ? runs.filter((run) => run.cleanupPassed !== null).every((run) => run.cleanupPassed === true)
      : null,
  };
}

function loadCompetitorModules(): Promise<EngineModules> {
  if (!cachedModules) {
    cachedModules = (async () => {
      // The external engines are loaded only on demand and their network load time is excluded from measurements.
      const dynamicImport = (url: string): Promise<unknown> => import(/* @vite-ignore */ url) as Promise<unknown>;
      const [gsapModuleValue, animeModuleValue] = await Promise.all([
        dynamicImport(cdnUrls.gsap),
        dynamicImport(cdnUrls.animejs),
      ]);
      const gsapModule = gsapModuleValue as GsapModuleShape;
      const gsapDefault = gsapModule.default;
      const gsapCandidate = gsapModule.gsap
        ?? (gsapDefault && typeof gsapDefault === 'object' && 'gsap' in gsapDefault ? gsapDefault.gsap : undefined)
        ?? gsapDefault;
      if (!gsapCandidate || typeof gsapCandidate !== 'object' || !('to' in gsapCandidate)) {
        throw new Error('GSAP loaded from the CDN, but its animation API was not found.');
      }
      const animeModule = animeModuleValue as AnimeModuleShape;
      const animeDefault = animeModule.default;
      const animeCandidate = animeModule.animate
        ?? (animeDefault && typeof animeDefault === 'object' && 'animate' in animeDefault ? animeDefault.animate : undefined);
      if (typeof animeCandidate !== 'function') {
        throw new Error('Anime.js loaded from the CDN, but its animate() API was not found.');
      }
      return { gsap: gsapCandidate as GsapApi, animeAnimate: animeCandidate };
    })().catch((error: unknown) => {
      cachedModules = null;
      throw error;
    });
  }
  return cachedModules;
}

function createScene(host: HTMLElement, renderer: RendererId, targetCount: number): RenderScene {
  host.replaceChildren();
  const columns = Math.max(8, Math.min(40, Math.ceil(Math.sqrt(targetCount * 1.05))));
  const opacityFrom = 0.38;
  const opacityTo = 0.96;

  if (renderer === 'dom') {
    const grid = document.createElement('div');
    grid.className = 'browser-benchmarks__dot-grid';
    grid.style.gridTemplateColumns = `repeat(${columns}, 7px)`;
    const nodes: HTMLDivElement[] = [];
    for (let index = 0; index < targetCount; index += 1) {
      const node = document.createElement('div');
      node.className = 'browser-benchmarks__dot';
      node.style.opacity = String(opacityFrom);
      nodes.push(node);
    }
    grid.append(...nodes);
    host.append(grid);
    return {
      targetCount,
      domTargets: nodes,
      render(progress) {
        const translateX = progress * 16;
        const rotation = progress * 90;
        const opacity = opacityFrom + (opacityTo - opacityFrom) * progress;
        const transform = `translate3d(${translateX.toFixed(2)}px, 0, 0) rotate(${rotation.toFixed(2)}deg)`;
        const opacityValue = String(opacity);
        for (const node of nodes) {
          node.style.transform = transform;
          node.style.opacity = opacityValue;
        }
      },
      cleanup: () => host.replaceChildren(),
    };
  }

  if (renderer === 'svg') {
    const namespace = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(namespace, 'svg');
    svg.setAttribute('viewBox', '0 0 760 360');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', `${targetCount} animated SVG shapes`);
    svg.classList.add('browser-benchmarks__svg');
    const rows = Math.ceil(targetCount / columns);
    const cellWidth = 740 / columns;
    const cellHeight = 340 / Math.max(1, rows);
    const nodes: Array<{ element: SVGRectElement; x: number; y: number }> = [];
    for (let index = 0; index < targetCount; index += 1) {
      const x = 10 + (index % columns) * cellWidth;
      const y = 10 + Math.floor(index / columns) * cellHeight;
      const rect = document.createElementNS(namespace, 'rect');
      rect.setAttribute('x', String(x));
      rect.setAttribute('y', String(y));
      rect.setAttribute('width', '5');
      rect.setAttribute('height', '5');
      rect.setAttribute('rx', '1');
      rect.setAttribute('fill', 'currentColor');
      rect.setAttribute('opacity', String(opacityFrom));
      svg.append(rect);
      nodes.push({ element: rect, x, y });
    }
    host.append(svg);
    return {
      targetCount,
      render(progress) {
        const translateX = progress * 16;
        const rotation = progress * 90;
        const opacity = String(opacityFrom + (opacityTo - opacityFrom) * progress);
        for (const node of nodes) {
          node.element.setAttribute('transform', `translate(${(node.x + translateX).toFixed(2)} ${node.y.toFixed(2)}) rotate(${rotation.toFixed(2)} ${node.x.toFixed(2)} ${node.y.toFixed(2)})`);
          node.element.setAttribute('opacity', opacity);
        }
      },
      cleanup: () => host.replaceChildren(),
    };
  }

  const canvas = document.createElement('canvas');
  canvas.width = 960;
  canvas.height = 360;
  canvas.className = 'browser-benchmarks__canvas';
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', `${targetCount} animated Canvas shapes`);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D is not available in this browser.');
  const rows = Math.ceil(targetCount / columns);
  const cellWidth = 940 / columns;
  const cellHeight = 340 / Math.max(1, rows);
  const positions = Array.from({ length: targetCount }, (_, index) => ({
    x: 10 + (index % columns) * cellWidth,
    y: 10 + Math.floor(index / columns) * cellHeight,
  }));
  host.append(canvas);
  return {
    targetCount,
    render(progress) {
      context.clearRect(0, 0, canvas.width, canvas.height);
      const translateX = progress * 16;
      const rotation = progress * Math.PI / 2;
      const opacity = opacityFrom + (opacityTo - opacityFrom) * progress;
      context.fillStyle = getComputedStyle(host).color;
      for (const position of positions) {
        context.save();
        context.globalAlpha = opacity;
        context.translate(position.x + translateX, position.y);
        context.rotate(rotation);
        context.fillRect(-2.5, -2.5, 5, 5);
        context.restore();
      }
    },
    cleanup: () => host.replaceChildren(),
  };
}

function createObjectScene(host: HTMLElement, targetCount: number): RenderScene {
  host.replaceChildren();
  const objectTargets = Array.from({ length: targetCount }, () => ({ value: 0 }));
  return {
    targetCount,
    objectTargets,
    render(progress) {
      for (const target of objectTargets) target.value = progress;
    },
    cleanup() {
      // Read the final values before releasing the targets so the benchmark workload remains observable.
      const finalValueChecksum = objectTargets.reduce((sum, target) => sum + target.value, 0);
      void finalValueChecksum;
      host.replaceChildren();
    },
  };
}

function createPerTargetRunner(
  engine: EngineId,
  scene: RenderScene,
  scenario: Exclude<ScenarioId, 'shared-renderer'>,
  durationMs: number,
  onComplete: () => void,
  modules: EngineModules,
): AnimationRunner {
  const targets = scenario === 'engine-only'
    ? (scene.objectTargets ?? [])
    : (scene.domTargets ?? []);
  if (targets.length === 0) throw new Error('The selected benchmark scenario has no targets.');

  if (engine === 're-flux') {
    const animations: ReturnType<typeof keyframes<number>>[] = [];
    const subscriptions: Array<{ unsubscribe(): void }> = [];
    let completedTargets = 0;
    const completeTarget = () => {
      completedTargets += 1;
      if (completedTargets === targets.length) onComplete();
    };
    for (const target of targets) {
      const animation = keyframes<number>({
        duration: durationMs,
        easing: 'linear',
        keyframes: [{ value: 0, offset: 0 }, { value: 1, offset: 1 }],
        onComplete: completeTarget,
      });
      void animation.catch(() => undefined);
      subscriptions.push(animation.value$.subscribe((progress) => {
        if (scenario === 'engine-only') {
          (target as { value: number }).value = progress;
        } else {
          (target as HTMLDivElement).style.opacity = String(0.38 + (0.96 - 0.38) * progress);
        }
      }));
      animations.push(animation);
    }
    return {
      start() { for (const animation of animations) animation.play(); },
      cleanup() {
        for (const subscription of subscriptions) subscription.unsubscribe();
        for (const animation of animations) animation.stop();
      },
    };
  }

  if (engine === 'gsap') {
    const tween = modules.gsap.to(targets as object, {
      ...(scenario === 'engine-only' ? { value: 1 } : { opacity: 0.96 }),
      duration: durationMs / 1000,
      ease: 'none',
      paused: true,
      onComplete,
    });
    return { start: () => { tween.play(0); }, cleanup: () => tween.kill() };
  }

  const animation = modules.animeAnimate(targets as object, {
    ...(scenario === 'engine-only' ? { value: [0, 1] } : { opacity: [0.38, 0.96] }),
    duration: durationMs,
    ease: 'linear',
    autoplay: false,
    onComplete,
  });
  return { start: () => { animation.play(); }, cleanup: () => { animation.cancel(); } };
}

function createRunner(
  engine: EngineId,
  scene: RenderScene,
  durationMs: number,
  onComplete: () => void,
  modules: EngineModules,
  scenario: ScenarioId,
): AnimationRunner {
  if (scenario !== 'shared-renderer') {
    return createPerTargetRunner(engine, scene, scenario, durationMs, onComplete, modules);
  }
  if (engine === 're-flux') {
    const animation = keyframes<number>({
      duration: durationMs,
      easing: 'linear',
      keyframes: [{ value: 0, offset: 0 }, { value: 1, offset: 1 }],
      onComplete,
    });
    // Stop/reject on cancellation is expected for this PromiseLike engine handle.
    void animation.catch(() => undefined);
    const subscription = animation.value$.subscribe((progress) => scene.render(progress));
    return {
      start() { animation.play(); },
      cleanup() {
        subscription.unsubscribe();
        animation.stop();
      },
    };
  }

  const progress = { value: 0 };
  if (engine === 'gsap') {
    const tween = modules.gsap.to(progress, {
      value: 1,
      duration: durationMs / 1000,
      ease: 'none',
      paused: true,
      onUpdate: () => scene.render(progress.value),
      onComplete,
    });
    return { start: () => { tween.play(0); }, cleanup: () => tween.kill() };
  }

  const animation = modules.animeAnimate(progress, {
    value: 1,
    duration: durationMs,
    ease: 'linear',
    autoplay: false,
    onUpdate: () => scene.render(progress.value),
    onComplete,
  });
  return { start: () => { animation.play(); }, cleanup: () => { animation.cancel(); } };
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw new DOMException('Benchmark canceled.', 'AbortError');
}

function awaitWithAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  throwIfAborted(signal);
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      signal.removeEventListener('abort', onAbort);
      reject(new DOMException('Benchmark canceled.', 'AbortError'));
    };
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener('abort', onAbort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener('abort', onAbort);
        reject(error);
      },
    );
  });
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function calibrateFrameInterval(signal: AbortSignal): Promise<{ intervalMs: number; sampleCount: number; source: 'raf-calibration' | '60hz-fallback' }> {
  throwIfAborted(signal);
  const samples: number[] = [];
  let previousTimestamp: number | null = null;
  let rafId = 0;
  let abortHandler: (() => void) | null = null;
  const sampling = new Promise<void>((resolve, reject) => {
    const finish = () => {
      if (abortHandler) signal.removeEventListener('abort', abortHandler);
      if (rafId) window.cancelAnimationFrame(rafId);
      rafId = 0;
      resolve();
    };
    abortHandler = () => {
      if (rafId) window.cancelAnimationFrame(rafId);
      rafId = 0;
      signal.removeEventListener('abort', abortHandler!);
      reject(new DOMException('Benchmark canceled.', 'AbortError'));
    };
    signal.addEventListener('abort', abortHandler, { once: true });
    const sample = (timestamp: number) => {
      if (previousTimestamp !== null) samples.push(timestamp - previousTimestamp);
      previousTimestamp = timestamp;
      if (samples.length >= calibrationIntervalCount) {
        finish();
        return;
      }
      rafId = window.requestAnimationFrame(sample);
    };
    rafId = window.requestAnimationFrame(sample);
  });
  await awaitWithAbort(sampling, signal);
  throwIfAborted(signal);

  const plausible = samples.filter((value) => Number.isFinite(value) && value > 0);
  const preliminaryMedian = median(plausible);
  if (preliminaryMedian === null || plausible.length < 20) {
    return { intervalMs: fallbackFrameIntervalMs, sampleCount: plausible.length, source: '60hz-fallback' };
  }
  // Drop cadence outliers caused by occasional missed callbacks; the median remains robust to a few outliers.
  const stableSamples = plausible.filter((value) => value >= preliminaryMedian * 0.5 && value <= preliminaryMedian * 1.5);
  const calibrated = median(stableSamples);
  if (calibrated === null || calibrated < 4 || calibrated > 50) {
    return { intervalMs: fallbackFrameIntervalMs, sampleCount: stableSamples.length, source: '60hz-fallback' };
  }
  return { intervalMs: calibrated, sampleCount: stableSamples.length, source: 'raf-calibration' };
}

function estimateMissedRefreshes(intervalMs: number, referenceIntervalMs: number): number {
  if (!Number.isFinite(intervalMs) || !Number.isFinite(referenceIntervalMs) || referenceIntervalMs <= 0) return 0;
  return Math.max(0, Math.round(intervalMs / referenceIntervalMs) - 1);
}

async function measureRun(
  engine: EngineId,
  renderer: BenchmarkRendererId,
  scenario: ScenarioId,
  targetCount: number,
  durationMs: number,
  repetition: number,
  modules: EngineModules,
  signal: AbortSignal,
  frameIntervalReferenceMs: number,
): Promise<BrowserRunResult> {
  throwIfAborted(signal);
  const host = stageHost.value;
  if (!host) throw new Error('The benchmark stage is not available.');
  const scene = renderer === 'none'
    ? createObjectScene(host, targetCount)
    : createScene(host, renderer, targetCount);
  const intervals: number[] = [];
  const longTaskDurations: number[] = [];
  const longAnimationFrameDurations: number[] = [];
  let longTaskSupported = false;
  let longAnimationFrameSupported = false;
  let longTaskObserver: PerformanceObserver | null = null;
  let longAnimationFrameObserver: PerformanceObserver | null = null;
  let rafId = 0;
  let previousTimestamp: number | null = null;
  let renderCallbacks = 0;
  let measuring = false;
  const rendererWorkSamples: number[] = [];
  let runnerCleaned = false;
  let postCleanupRenderCallbacks = 0;
  let resultForCleanup: BrowserRunResult | null = null;
  const renderScene = scene.render.bind(scene);
  scene.render = (progress: number) => {
    if (runnerCleaned) postCleanupRenderCallbacks += 1;
    const startedAt = measuring && scenario === 'shared-renderer' ? performance.now() : 0;
    renderScene(progress);
    if (measuring && scenario === 'shared-renderer') {
      renderCallbacks += 1;
      rendererWorkSamples.push(performance.now() - startedAt);
    }
  };
  let startTime = Number.NaN;
  let endTime = Number.POSITIVE_INFINITY;
  let completionResolver: (() => void) | null = null;
  const completionPromise = new Promise<void>((resolve) => { completionResolver = resolve; });
  const runner = createRunner(engine, scene, durationMs, () => completionResolver?.(), modules, scenario);
  const supportedEntryTypes = typeof PerformanceObserver !== 'undefined'
    ? (PerformanceObserver.supportedEntryTypes ?? [])
    : [];

  if (supportedEntryTypes.includes('longtask')) {
    try {
      longTaskObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (Number.isFinite(startTime) && entry.startTime >= startTime && (endTime === Number.POSITIVE_INFINITY || entry.startTime <= endTime + 100)) longTaskDurations.push(entry.duration);
        }
      });
      longTaskObserver.observe({ type: 'longtask', buffered: false });
      longTaskSupported = true;
    } catch { longTaskObserver?.disconnect(); longTaskObserver = null; }
  }
  if (supportedEntryTypes.includes('long-animation-frame')) {
    try {
      longAnimationFrameObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (Number.isFinite(startTime) && entry.startTime >= startTime && (endTime === Number.POSITIVE_INFINITY || entry.startTime <= endTime + 100)) longAnimationFrameDurations.push(entry.duration);
        }
      });
      longAnimationFrameObserver.observe({ type: 'long-animation-frame', buffered: false } as PerformanceObserverInit);
      longAnimationFrameSupported = true;
    } catch { longAnimationFrameObserver?.disconnect(); longAnimationFrameObserver = null; }
  }

  let timeoutId = 0;
  let abortListener: (() => void) | null = null;
  const outcomePromise = new Promise<'completed' | 'timeout' | 'aborted'>((resolve) => {
    timeoutId = window.setTimeout(() => resolve('timeout'), durationMs + 5000);
    abortListener = () => resolve('aborted');
    signal.addEventListener('abort', abortListener, { once: true });
    void completionPromise.then(() => resolve('completed'));
  });

  const sampleFrame = (timestamp: number): void => {
    if (previousTimestamp !== null) intervals.push(timestamp - previousTimestamp);
    previousTimestamp = timestamp;
    if (measuring) rafId = window.requestAnimationFrame(sampleFrame);
  };

  try {
    startTime = performance.now();
    measuring = true;
    rafId = window.requestAnimationFrame(sampleFrame);
    runner.start();
    const outcome = await outcomePromise;
    endTime = performance.now();
    if (outcome === 'aborted') throw new DOMException('Benchmark canceled.', 'AbortError');
    if (outcome === 'timeout') throw new Error(`${engineName(engine)} did not complete within the expected time.`);
    // Capture one final scheduling opportunity so the last visual update is included in browser observations.
    await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
    measuring = false;
    window.cancelAnimationFrame(rafId);
    rafId = 0;
    await delay(60);
    const elapsedMs = endTime - startTime;
    const stats: FrameStats = {
      sampleCount: intervals.length,
      medianMs: median(intervals),
      p95Ms: percentile(intervals, 0.95),
      p99Ms: percentile(intervals, 0.99),
      maxMs: intervals.length ? round(Math.max(...intervals)) : null,
      stretchedFrameCount: intervals.filter((value) => value > frameIntervalReferenceMs * 1.5).length,
      estimatedMissedRefreshCount: intervals.reduce((total, value) => total + estimateMissedRefreshes(value, frameIntervalReferenceMs), 0),
    };
    resultForCleanup = {
      engine,
      repetition,
      scenario,
      renderer,
      targetCount,
      configuredDurationMs: durationMs,
      completed: true,
      elapsedMs: round(elapsedMs),
      renderCallbacks,
      renderedTargetsPerCallback: scenario === 'shared-renderer' ? targetCount : 0,
      rendererWork: {
        medianMs: median(rendererWorkSamples),
        p95Ms: percentile(rendererWorkSamples, 0.95),
        p99Ms: percentile(rendererWorkSamples, 0.99),
        totalMs: scenario === 'shared-renderer' ? round(rendererWorkSamples.reduce((total, value) => total + value, 0)) : null,
      },
      frameIntervals: stats,
      longTaskCount: longTaskSupported ? longTaskDurations.length : null,
      longTaskDurationMs: longTaskSupported ? round(longTaskDurations.reduce((total, value) => total + value, 0)) : null,
      longAnimationFrameCount: longAnimationFrameSupported ? longAnimationFrameDurations.length : null,
      cleanupPassed: false,
    };
    return resultForCleanup;
  } finally {
    clearTimeout(timeoutId);
    if (abortListener) signal.removeEventListener('abort', abortListener);
    measuring = false;
    if (rafId) window.cancelAnimationFrame(rafId);
    try {
      runner.cleanup();
      runnerCleaned = true;
      // Probe the next browser scheduling opportunity for stale render callbacks.
      await new Promise<void>((resolve) => {
        let probeRafId = 0;
        let probeTimeoutId = 0;
        let settled = false;
        const finishProbe = () => {
          if (settled) return;
          settled = true;
          window.clearTimeout(probeTimeoutId);
          if (probeRafId) window.cancelAnimationFrame(probeRafId);
          resolve();
        };
        probeTimeoutId = window.setTimeout(finishProbe, 50);
        if (document.visibilityState === 'visible') {
          probeRafId = window.requestAnimationFrame(finishProbe);
        }
      });
      if (resultForCleanup) resultForCleanup.cleanupPassed = scenario === 'shared-renderer'
        ? postCleanupRenderCallbacks === 0
        : null;
    } finally {
      longTaskObserver?.disconnect();
      longAnimationFrameObserver?.disconnect();
      scene.cleanup();
    }
  }
}

function buildReport(): BenchmarkReport {
  return {
    benchmark: 're;Flux public browser benchmark',
    schemaVersion: 2,
    createdAt: new Date().toISOString(),
    environment: {
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      language: navigator.language,
      hardwareConcurrency: navigator.hardwareConcurrency ?? null,
      devicePixelRatio: window.devicePixelRatio,
      viewport: { width: window.innerWidth, height: window.innerHeight },
      visibilityState: document.visibilityState,
    },
    configuration: {
      scenario: selectedScenario.value,
      renderer: activeRenderer.value,
      targetCount: selectedTargetCount.value,
      durationMs: selectedDurationMs.value,
      repetitions,
      frameBudgetReferenceMs: round(frameBudgetReferenceMs.value, 4),
      frameBudgetSource: frameBudgetSource.value,
      estimatedRafCadenceHz: round(estimatedRafCadenceHz.value, 2),
      calibrationSamples: calibrationSamples.value,
      stretchedFrameThresholdMs: round(stretchedFrameThresholdMs.value, 4),
    },
    libraries: engines.map((engine) => ({
      id: engine.id,
      name: engine.name,
      version: engine.version,
      source: engine.id === 're-flux' ? 'local site build' : cdnUrls[engine.id],
    })),
    methodology: [
      'Competitor modules are fetched before measurements; CDN load time is excluded.',
      selectedScenario.value === 'shared-renderer'
        ? 'Each engine animates the same scalar progress value from 0 to 1 using linear easing and drives a shared renderer.'
        : selectedScenario.value === 'engine-only'
          ? 'Each engine animates one plain JavaScript object per target without DOM, SVG, Canvas or layout writes; re;Flux uses one keyframes animation per object while GSAP and Anime.js use their multi-target object APIs.'
          : 'Each engine animates opacity independently on the same number of real DOM targets; re;Flux uses one keyframes animation per target while GSAP and Anime.js use their multi-target DOM APIs.',
      'The shared-renderer scenario uses the same DOM/SVG/Canvas write function and target count for each engine.',
      'One short unreported warm-up run is completed per engine before ten measured repetitions.',
      'The benchmark calibrates requestAnimationFrame cadence first and uses the median interval as its estimated refresh opportunity; this is not a hardware display-mode query.',
      'Run order rotates through three permutations across ten measured repetitions to reduce ordering bias.',
      'After each run, one extra browser scheduling opportunity checks whether stopped animation runners still call the renderer.',
      'Renderer callback time is reported only for the shared-renderer scenario; it includes two performance.now() calls per measured callback and does not include all engine internals.',
      'Frame intervals come from a separate requestAnimationFrame observer; they are not a direct measurement of paint completion or physical display presentation.',
      'Estimated missed refreshes are computed by rounding each observed requestAnimationFrame interval to the nearest calibrated interval and subtracting one; this is an estimate, not a presentation-timing measurement.',
      'Stretched intervals exceed 1.5 times the calibrated frame interval; the threshold is no longer hard-coded to 60 Hz.',
      'Long Tasks and Long Animation Frames are reported only when supported by the browser.',
    ],
    results: summaries.value.filter((summary) => summary.runs.length > 0),
    caveats: [
      'Results describe this browser, device, viewport, and current system load; they are not universal rankings.',
      'The workload compares each engine with a shared render callback, not each library’s full native DOM API surface.',
      'The CDN must be reachable to load GSAP and Anime.js. Their module transfer and evaluation happen outside the timed runs.',
      'No benchmark results are uploaded; the JSON is generated locally in this browser.',
    ],
  };
}

async function runComparison(): Promise<void> {
  if (isRunning.value) return;
  if (document.visibilityState !== 'visible') {
    errorMessage.value = 'Bring this tab to the foreground before starting a benchmark.';
    return;
  }

  const controller = new AbortController();
  activeController = controller;
  isRunning.value = true;
  currentEngine.value = null;
  progressStep.value = 0;
  errorMessage.value = null;
  report.value = null;
  runResults.value = {};
  engineStatus.value = { 're-flux': 'loading', gsap: 'loading', animejs: 'loading' };

  try {
    statusMessage.value = 'Loading pinned comparison engines. Network loading is excluded from the results.';
    const modules = await awaitWithAbort(loadCompetitorModules(), controller.signal);
    throwIfAborted(controller.signal);

    statusMessage.value = 'Calibrating the browser frame cadence…';
    const calibration = await calibrateFrameInterval(controller.signal);
    frameBudgetReferenceMs.value = calibration.intervalMs;
    frameBudgetSource.value = calibration.source;
    calibrationSamples.value = calibration.sampleCount;

    statusMessage.value = 'Warming up each engine with a small, unreported run…';
    const warmupOrder: EngineId[] = ['animejs', 'gsap', 're-flux'];
    for (const engine of warmupOrder) {
      throwIfAborted(controller.signal);
      currentEngine.value = engine;
      engineStatus.value[engine] = 'warming-up';
      await measureRun(engine, activeRenderer.value, selectedScenario.value, warmupTargets, warmupDurationMs, 0, modules, controller.signal, frameBudgetReferenceMs.value);
      progressStep.value += 1;
    }

    const runOrders: EngineId[][] = Array.from({ length: repetitions }, (_, index) => {
      const permutations: EngineId[][] = [
        ['re-flux', 'gsap', 'animejs'],
        ['animejs', 'gsap', 're-flux'],
        ['gsap', 're-flux', 'animejs'],
      ];
      return permutations[index % permutations.length]!;
    });
    engineStatus.value = { 're-flux': 'running', gsap: 'running', animejs: 'running' };
    for (let repetition = 1; repetition <= repetitions; repetition += 1) {
      for (const engine of runOrders[repetition - 1]!) {
        throwIfAborted(controller.signal);
        currentEngine.value = engine;
        statusMessage.value = `Repetition ${repetition} of ${repetitions} · ${engineName(engine)} · ${selectedScenarioMeta.value.label}`;
        const result = await measureRun(
          engine,
          activeRenderer.value,
          selectedScenario.value,
          selectedTargetCount.value,
          selectedDurationMs.value,
          repetition,
          modules,
          controller.signal,
          frameBudgetReferenceMs.value,
        );
        runResults.value = {
          ...runResults.value,
          [engine]: [...(runResults.value[engine] ?? []), result],
        };
        progressStep.value += 1;
      }
    }

    engineStatus.value = { 're-flux': 'complete', gsap: 'complete', animejs: 'complete' };
    report.value = buildReport();
    statusMessage.value = `All ${repetitions * engines.length} measured runs are complete. Export the JSON to keep or share this result.`;
  } catch (error) {
    if (isAbortError(error)) {
      statusMessage.value = 'Benchmark canceled. Completed runs remain available below.';
    } else {
      const message = error instanceof Error ? error.message : 'An unknown error occurred while running the benchmark.';
      errorMessage.value = message;
      statusMessage.value = 'The comparison did not complete. Check connectivity and try again.';
      if (currentEngine.value) engineStatus.value[currentEngine.value] = 'error';
    }
    if (measuredResultsExist.value) report.value = buildReport();
  } finally {
    activeController = null;
    isRunning.value = false;
    currentEngine.value = null;
  }
}

function cancelBenchmark(): void {
  activeController?.abort();
}

function formatMs(value: number | null, digits = 2): string {
  return value === null || !Number.isFinite(value) ? '—' : `${value.toFixed(digits)} ms`;
}

function formatCount(value: number | null): string {
  return value === null ? 'N/A' : value.toLocaleString();
}

function barWidth(value: number | null): string {
  if (value === null || maxRendererP95Ms.value <= 0) return '0%';
  return `${Math.max(2, (value / maxRendererP95Ms.value) * 100)}%`;
}

function downloadReport(): void {
  const data = report.value ?? (measuredResultsExist.value ? buildReport() : null);
  if (!data) return;
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `re-flux-browser-benchmark-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

onBeforeUnmount(() => activeController?.abort());
</script>

<template>
  <div class="browser-benchmarks">
    <section class="browser-benchmarks__hero">
      <div class="browser-benchmarks__eyebrow"><span class="browser-benchmarks__eyebrow-dot" /> PUBLIC PERFORMANCE LAB</div>
      <h1>Motion, measured <span>in your browser.</span></h1>
      <p class="browser-benchmarks__intro">
        Run the same browser-side workload with re;Flux, GSAP and Anime.js. Results are produced on your machine, using real DOM, SVG or Canvas targets—not prerecorded scores.
      </p>
      <div class="browser-benchmarks__hero-meta">
        <span><UiIcon icon="mdi-laptop" /> Client-side execution</span>
        <span><UiIcon icon="mdi-repeat" /> 10 measured repetitions per engine</span>
        <span><UiIcon icon="mdi-download-outline" /> Exportable JSON</span>
      </div>
    </section>

    <section class="browser-benchmarks__panel browser-benchmarks__configuration" aria-labelledby="benchmark-setup-title">
      <div class="browser-benchmarks__section-heading">
        <div>
          <div class="browser-benchmarks__kicker">01 / CONFIGURE</div>
          <h2 id="benchmark-setup-title">Choose a workload</h2>
        </div>
        <span class="browser-benchmarks__run-count">{{ repetitions }} runs per engine</span>
      </div>

      <div class="browser-benchmarks__controls">
        <label class="browser-benchmarks__field">
          <span>Scenario</span>
          <select v-model="selectedScenario" :disabled="isRunning">
            <option v-for="scenario in scenarios" :key="scenario.id" :value="scenario.id">{{ scenario.label }}</option>
          </select>
          <small>{{ selectedScenarioMeta.description }}</small>
        </label>
        <label v-if="selectedScenario === 'shared-renderer'" class="browser-benchmarks__field">
          <span>Render target</span>
          <select v-model="selectedRenderer" :disabled="isRunning">
            <option v-for="renderer in renderers" :key="renderer.id" :value="renderer.id">{{ renderer.label }}</option>
          </select>
          <small>{{ selectedRendererMeta.description }}</small>
        </label>
        <div v-else class="browser-benchmarks__field browser-benchmarks__field-note">
          <span>{{ selectedScenario === 'engine-only' ? 'Rendering' : 'Per-target update' }}</span>
          <small>{{ selectedRendererMeta.description }}</small>
        </div>
        <label class="browser-benchmarks__field">
          <span>Target count</span>
          <select v-model.number="selectedTargetCount" :disabled="isRunning">
            <option v-for="count in targetOptions" :key="count" :value="count">{{ count.toLocaleString() }} {{ count === 1 ? 'target' : 'targets' }}</option>
          </select>
          <small>Identical target count for all three engines.</small>
        </label>
        <label class="browser-benchmarks__field">
          <span>Animation duration</span>
          <select v-model.number="selectedDurationMs" :disabled="isRunning">
            <option v-for="duration in durationOptions" :key="duration" :value="duration">{{ (duration / 1000).toFixed(1) }} seconds</option>
          </select>
          <small>One duration and target count for all three engines.</small>
        </label>
      </div>

      <div class="browser-benchmarks__actions">
        <button class="browser-benchmarks__primary-button" type="button" :disabled="isRunning" @click="runComparison">
          <UiIcon :icon="isRunning ? 'mdi-loading' : 'mdi-play-circle-outline'" />
          {{ isRunning ? 'Benchmark running…' : measuredResultsExist ? 'Run again' : 'Run comparison' }}
        </button>
        <button v-if="isRunning" class="browser-benchmarks__secondary-button" type="button" @click="cancelBenchmark">Cancel</button>
        <button class="browser-benchmarks__secondary-button" type="button" :disabled="!report && !measuredResultsExist" @click="downloadReport">
          <UiIcon icon="mdi-download-outline" /> Export JSON
        </button>
        <span class="browser-benchmarks__actions-note">Keep this tab in the foreground. Loading GSAP and Anime.js requires a network connection.</span>
      </div>

      <div v-if="isRunning || progressStep > 0" class="browser-benchmarks__progress" role="status" aria-live="polite">
        <div class="browser-benchmarks__progress-copy"><span>{{ statusMessage }}</span><strong>{{ progressPercent }}%</strong></div>
        <div class="browser-benchmarks__progress-track"><span :style="{ width: `${progressPercent}%` }" /></div>
      </div>
      <p v-else class="browser-benchmarks__status"><span class="browser-benchmarks__status-dot" /> {{ statusMessage }}</p>
      <p v-if="errorMessage" class="browser-benchmarks__error" role="alert">{{ errorMessage }}</p>
      <p v-if="report" class="browser-benchmarks__calibration-note">
        Estimated rAF cadence: <strong>{{ estimatedRafCadenceHz.toFixed(1) }} Hz</strong>
        ({{ formatMs(frameBudgetReferenceMs, 2) }} median interval; {{ calibrationSamples }} calibration samples).
        This estimates callback cadence, not the display's physical refresh mode.
      </p>
    </section>

    <section class="browser-benchmarks__workspace" aria-label="Benchmark animation stage and live comparison results">
      <div class="browser-benchmarks__panel browser-benchmarks__stage-panel">
        <div class="browser-benchmarks__section-heading">
          <div>
            <div class="browser-benchmarks__kicker">02 / LIVE WORKLOAD</div>
            <h2>{{ selectedRendererMeta.label }}{{ selectedScenario === 'engine-only' ? ' workload' : ' scene' }}</h2>
          </div>
          <span class="browser-benchmarks__stage-targets">{{ selectedTargetCount.toLocaleString() }} {{ selectedScenario === 'engine-only' ? 'objects' : 'targets' }}</span>
        </div>
        <div class="browser-benchmarks__stage-frame">
          <div ref="stageHost" class="browser-benchmarks__stage" :data-renderer="activeRenderer" />
          <div v-if="!isRunning && !measuredResultsExist" class="browser-benchmarks__stage-placeholder">
            <span class="browser-benchmarks__stage-orb"><i /><i /><i /></span>
            <p>Ready when you are</p>
            <small>The scene is generated when a benchmark starts.</small>
          </div>
        </div>
        <div class="browser-benchmarks__stage-legend">
          <span><i class="browser-benchmarks__legend-swatch browser-benchmarks__legend-swatch--reflux" /> re;Flux</span>
          <span><i class="browser-benchmarks__legend-swatch browser-benchmarks__legend-swatch--gsap" /> GSAP</span>
          <span><i class="browser-benchmarks__legend-swatch browser-benchmarks__legend-swatch--anime" /> Anime.js</span>
        </div>
        <p class="browser-benchmarks__stage-note">{{ selectedScenario === 'shared-renderer' ? 'The scene shows the engine currently under test. Renderer work is shared across engines for the selected target type.' : selectedScenario === 'engine-only' ? 'The measured objects stay off-DOM to focus on per-target object updates. The stage is intentionally blank.' : 'Each engine animates opacity directly on real DOM targets; the shared scalar renderer is bypassed.' }}</p>
      </div>

      <div class="browser-benchmarks__panel browser-benchmarks__results-panel">
        <div class="browser-benchmarks__section-heading">
          <div>
            <div class="browser-benchmarks__kicker">03 / RESULTS</div>
            <h2>Measured on this device</h2>
          </div>
          <span class="browser-benchmarks__status-pill" :class="{ 'is-active': isRunning }">{{ statusLabel }}</span>
        </div>

        <div class="browser-benchmarks__engine-results">
          <article v-for="engine in summaries" :key="engine.id" class="browser-benchmarks__engine-card" :class="`engine-${engine.id}`">
            <div class="browser-benchmarks__engine-card-heading">
              <div>
                <span class="browser-benchmarks__engine-mark" aria-hidden="true">{{ engine.id === 're-flux' ? 're;' : engine.id === 'gsap' ? 'G' : 'A' }}</span>
                <h3>{{ engine.name }}</h3>
              </div>
              <span class="browser-benchmarks__engine-status">{{ engineStatus[engine.id] === 'complete' ? 'Complete' : engineStatus[engine.id] === 'error' ? 'Error' : engine.runs.length ? `${engine.runs.length}/${repetitions}` : 'Waiting' }}</span>
            </div>
            <p class="browser-benchmarks__engine-version">{{ engine.version }} · {{ engine.runs.length ? 'measured' : engine.subtitle }}</p>
            <div v-if="selectedScenario === 'shared-renderer'" class="browser-benchmarks__engine-primary">
              <span>Shared renderer callback p95</span>
              <strong>{{ engine.runs.length ? formatMs(engine.medianRendererP95Ms, 4) : '—' }}</strong>
            </div>
            <div v-else class="browser-benchmarks__engine-primary">
              <span>{{ selectedScenario === 'engine-only' ? 'Mode' : 'Update path' }}</span>
              <strong>{{ selectedScenario === 'engine-only' ? 'JS objects' : 'Direct DOM' }}</strong>
            </div>
            <div class="browser-benchmarks__engine-metrics">
              <div><span>Completion time</span><strong>{{ engine.runs.length ? formatMs(engine.medianCompletionMs) : '—' }}</strong></div>
              <div><span>Frame interval p95</span><strong>{{ formatMs(engine.medianFrameP95Ms) }}</strong></div>
              <div><span>Frame interval p99</span><strong>{{ formatMs(engine.medianFrameP99Ms) }}</strong></div>
              <div v-if="selectedScenario === 'shared-renderer'"><span>Shared renderer callbacks</span><strong>{{ engine.runs.length ? formatCount(engine.medianRenderCallbacks) : '—' }}</strong></div>
              <div><span>Estimated missed refreshes</span><strong>{{ engine.runs.length ? formatCount(engine.medianEstimatedMissedRefreshCount) : '—' }}</strong></div>
              <div><span>Intervals &gt; {{ formatMs(activeFrameThresholdMs, 1) }}</span><strong>{{ engine.runs.length ? formatCount(engine.medianStretchedFrameCount) : '—' }}</strong></div>
              <div><span>Long tasks</span><strong>{{ engine.runs.length ? formatCount(engine.medianLongTaskCount) : '—' }}</strong></div>
              <div><span>Long animation frames</span><strong>{{ engine.runs.length ? formatCount(engine.medianLongAnimationFrameCount) : '—' }}</strong></div>
              <div><span>Cleanup probe</span><strong>{{ !engine.runs.length || engine.cleanupPassed === null ? 'N/A' : engine.cleanupPassed ? 'Passed' : 'Failed' }}</strong></div>
            </div>
          </article>
        </div>

        <div v-if="measuredResultsExist && selectedScenario === 'shared-renderer'" class="browser-benchmarks__comparison-bars">
          <h3>Renderer callback p95 <span>shared DOM/SVG/Canvas write path</span></h3>
          <div v-for="engine in summaries" :key="engine.id" class="browser-benchmarks__bar-row">
            <span>{{ engine.name }}</span>
            <div class="browser-benchmarks__bar-track"><span :class="`bar-${engine.id}`" :style="{ width: barWidth(engine.medianRendererP95Ms) }" /></div>
            <strong>{{ formatMs(engine.medianRendererP95Ms, 4) }}</strong>
          </div>
        </div>
        <div v-else-if="!measuredResultsExist" class="browser-benchmarks__empty-result">
          <UiIcon icon="mdi-chart-timeline-variant-shimmer" />
          <p>Results will appear here after the first measured repetition.</p>
        </div>
      </div>
    </section>

    <section class="browser-benchmarks__methodology">
      <div class="browser-benchmarks__method-copy">
        <div class="browser-benchmarks__kicker">04 / METHODOLOGY</div>
        <h2>Compare the work, not the marketing.</h2>
        <p v-if="selectedScenario === 'shared-renderer'">Every engine animates one scalar progress value from 0 to 1. The same render function writes the selected number of real DOM, SVG or Canvas targets, so the renderer workload stays consistent while the animation engine changes.</p>
        <p v-else-if="selectedScenario === 'engine-only'">Every engine updates the same number of JavaScript object targets without touching the DOM. The report focuses on callback cadence, completion and main-thread diagnostics rather than renderer duration.</p>
        <p v-else>Every engine updates opacity on the same number of real DOM elements. re;Flux uses an Animation instance per target; GSAP and Anime.js use their multi-target APIs. The different native API shapes are part of this workload and are documented in the export.</p>
      </div>
      <div class="browser-benchmarks__method-list">
        <div><span>01</span><p><strong>Warm-up</strong> Each engine gets one short, unreported run before measurement.</p></div>
        <div><span>02</span><p><strong>10 repetitions</strong> The run order rotates through three permutations. Compare results on the same machine.</p></div>
        <div><span>03</span><p><strong>Refresh calibration</strong> The median requestAnimationFrame interval estimates the active callback cadence; it does not query the physical display mode.</p></div>
        <div><span>04</span><p><strong>Percentiles</strong> Frame interval p95/p99 and missed-refresh estimates show tail behavior, not actual display presentation.</p></div>
        <div><span>05</span><p><strong>Local report</strong> JSON is created in your browser. No benchmark result is uploaded.</p></div>
      </div>
    </section>

    <section class="browser-benchmarks__notes" aria-labelledby="benchmark-notes-title">
      <h2 id="benchmark-notes-title">Versions and limitations</h2>
      <div class="browser-benchmarks__library-links">
        <a v-for="engine in engines" :key="engine.id" :href="engine.href" target="_blank" rel="noopener noreferrer">
          <span>{{ engine.name }}</span><strong>{{ engine.version }}</strong><UiIcon icon="mdi-open-in-new" />
        </a>
      </div>
      <ul>
        <li>GSAP and Anime.js are loaded on demand from esm.sh at pinned versions. Their download time is not included, but results require the CDN to be reachable.</li>
        <li>The shared-renderer scenario compares a scalar-progress callback. Engine-only and per-target DOM scenarios compare each library's target API shape; re;Flux creates one Animation per target while GSAP and Anime.js use multi-target calls.</li>
        <li>Frame cadence is calibrated from requestAnimationFrame timestamps. Missed-refresh values are estimates from callback intervals, not proof of dropped physical presentations.</li>
        <li>Long Tasks and Long Animation Frames depend on browser support. “N/A” means the relevant observer is unavailable, not that the browser experienced zero work.</li>
        <li>Results vary with browser, refresh rate, operating system, thermal state, extensions, other tabs and system load. Use multiple runs and compare the same environment.</li>
      </ul>
    </section>
  </div>
</template>
