import type { EngineId, RendererId, ScenarioId } from './types';

/** Measured repetitions per engine and scenario. */
export const REPETITIONS = 10;
/** Size and length of the unreported warm-up run every engine gets before measurement. */
export const WARMUP_TARGETS = 80;
export const WARMUP_DURATION_MS = 250;
/** Frame interval assumed when the requestAnimationFrame calibration cannot be trusted (60 Hz). */
export const FALLBACK_FRAME_INTERVAL_MS = 1000 / 60;
/** requestAnimationFrame intervals sampled to estimate the active callback cadence. */
export const CALIBRATION_INTERVAL_COUNT = 60;
export const TARGET_COUNT_OPTIONS = [100, 250, 500, 1000, 2500, 5000] as const;
export const DURATION_OPTIONS_MS = [1000, 1500, 2000, 2500] as const;

/** Pinned comparison-library versions. `scripts/lib/browser-bench.mjs` (the headless runner) pins the same ones. */
export const COMPETITOR_VERSIONS = { gsap: '3.15.0', animejs: '4.5.0' } as const;
export const CDN_URLS = {
  gsap: `https://esm.sh/gsap@${COMPETITOR_VERSIONS.gsap}`,
  animejs: `https://esm.sh/animejs@${COMPETITOR_VERSIONS.animejs}`,
} as const;

/** Engines in the order they appear in the UI and in exports. */
export const ENGINE_CATALOG = [
  { id: 're-flux', name: 're;Flux', href: 'https://github.com/iamcodex96/re-flux' },
  { id: 'gsap', name: 'GSAP', href: 'https://gsap.com/' },
  { id: 'animejs', name: 'Anime.js', href: 'https://animejs.com/' },
] as const satisfies ReadonlyArray<{ id: EngineId; name: string; href: string }>;

/** Order in which the engines are warmed up (competitors first, the library last). */
export const WARMUP_ORDER: readonly EngineId[] = ['animejs', 'gsap', 're-flux'];

/** Workload scenarios, with the locale keys (in the page's `staticText`) that describe them. */
export const SCENARIOS = [
  { id: 'engine-only', labelKey: 'engineOverhead', descriptionKey: 'engineOverheadDescription' },
  { id: 'per-target-dom', labelKey: 'perTargetDom', descriptionKey: 'perTargetDomDescription' },
  { id: 'shared-renderer', labelKey: 'sharedRenderer', descriptionKey: 'sharedRendererDescription' },
] as const satisfies ReadonlyArray<{ id: ScenarioId; labelKey: string; descriptionKey: string }>;

/** Render targets of the shared-renderer scenario. */
export const RENDERERS = [
  { id: 'dom', labelKey: 'domRenderer', descriptionKey: 'domRendererDescription' },
  { id: 'svg', labelKey: 'svgRenderer', descriptionKey: 'svgRendererDescription' },
  { id: 'canvas', labelKey: 'canvas2dRenderer', descriptionKey: 'canvas2dRendererDescription' },
] as const satisfies ReadonlyArray<{ id: RendererId; labelKey: string; descriptionKey: string }>;
