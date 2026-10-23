import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveLocaleReferences } from './lib/locale.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFile(resolve(root, path), 'utf8');
const exists = (path) => access(resolve(root, path)).then(() => true, () => false);

const router = await read('apps/docs/src/router/index.ts');
const app = await read('apps/docs/src/App.vue');
const mainScss = await read('apps/docs/src/styles/main.scss');
const page = await read('apps/docs/src/views/BrowserBenchmarks.vue');
const styles = await read('apps/docs/src/styles/views/benchmarks.scss');
const locale = resolveLocaleReferences(JSON.parse(await read('apps/docs/src/locales/en.json')));
const benchmarkCopy = locale.app.view.browserBenchmarks.staticText;

assert.ok(router.includes("path: '/benchmarks'"), 'The public /benchmarks route is missing.');
assert.ok(router.includes("import('../views/BrowserBenchmarks.vue')"), 'The benchmark page must be lazy-loaded as a route chunk.');
assert.ok(app.includes('copy.value.benchmarkLab') && app.includes("to: '/benchmarks'"), 'The benchmark route must be discoverable in global navigation through locale data.');
assert.ok(app.includes('copy.benchmarkLab') && Object.values(locale.app.view.navigation).includes('Benchmark Lab'), 'The public page must be linked from the site footer using locale data.');
assert.ok(mainScss.includes("@use './views/benchmarks'"), 'Benchmark styles must be part of the docs style entrypoint.');
assert.ok(await exists('apps/docs/src/views/BrowserBenchmarks.vue'), 'Benchmark route component is missing.');

for (const fragment of [
  "https://esm.sh/gsap@3.15.0",
  "https://esm.sh/animejs@4.5.0",
  "requestAnimationFrame",
  "performance.now()",
  "long-animation-frame",
  "longtask",
  'frameBudgetReferenceMs',
  'renderedTargetsPerCallback',
  'calibrateFrameInterval',
  'estimatedRafCadenceHz',
  'estimatedMissedRefreshCount',
  'engine-only',
  'per-target-dom',
  'schemaVersion: 2',
  'methodology',
  'createObjectURL',
  'schemaVersion: 2',
  'methodology',
  'createObjectURL',
]) assert.ok(page.includes(fragment), `Browser benchmark is missing ${fragment}.`);
assert.ok(Object.values(benchmarkCopy).some((value) => value.includes('No benchmark results are uploaded')), 'Benchmark privacy caveat must remain available in locale data.');

assert.ok(page.includes("id: 'dom'") && page.includes("id: 'svg'") && page.includes("id: 'canvas'"), 'DOM, SVG and Canvas scenarios must be available.');
assert.ok(page.includes('runOrders'), 'The engine order must rotate across measured repetitions.');
assert.ok(page.includes('const repetitions = 10;'), 'The browser benchmark must run ten measured repetitions per engine.');
assert.ok(page.includes('calibrationIntervalCount = 60'), 'The active requestAnimationFrame cadence must be calibrated before measurement.');
assert.ok(page.includes('estimateMissedRefreshes'), 'Refresh-aware missed-frame estimates must be reported.');
assert.ok(page.includes('createPerTargetRunner'), 'Engine-only and per-target DOM workloads must use per-target animation paths.');
assert.ok(page.includes('rendererWorkSamples'), 'Shared renderer callback cost must be sampled.');
assert.ok(page.includes('longTaskSupported ? longTaskDurations.length : null'), 'Unsupported browser diagnostics must be represented as unavailable, not zero.');
assert.ok(styles.includes('@media (prefers-reduced-motion: reduce)'), 'Benchmark transitions must respect reduced-motion preferences.');
assert.ok(styles.includes('@media (max-width: breakpoints.$rx-breakpoint-tablet-narrow)'), 'Benchmark page must use the shared responsive breakpoint tokens.');
assert.ok(styles.includes('grid-template-columns: repeat(4, minmax(0, 1fr))'), 'Four benchmark controls must fit as a four-column desktop grid.');
const workspaceLayout = styles.match(/&__workspace\s*\{([^}]*)\}/s)?.[1] ?? '';
assert.match(workspaceLayout, /grid-template-columns:\s*minmax\(0,\s*1fr\)/, 'The live scene and results must stack in a single-column workspace.');
const engineResultsLayout = styles.match(/&__engine-results\s*\{([^}]*)\}/s)?.[1] ?? '';
assert.match(engineResultsLayout, /grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/, 'Engine result cards must use a three-column desktop layout.');
const stagePanelPosition = page.indexOf('class=\"browser-benchmarks__panel browser-benchmarks__stage-panel\"');
const callbackComparisonPosition = page.indexOf('class=\"browser-benchmarks__comparison-bars\"');
const resultsPanelPosition = page.indexOf('class=\"browser-benchmarks__panel browser-benchmarks__results-panel\"');
assert.ok(stagePanelPosition >= 0 && callbackComparisonPosition > stagePanelPosition && callbackComparisonPosition < resultsPanelPosition, 'Renderer callback comparison must sit beneath the live scene and above the results cards.');
assert.ok(Object.values(benchmarkCopy).some((value) => value.includes('Estimated rAF cadence:')), 'The calibrated callback cadence must be visible through locale data.');

// Keep third-party animation engines runtime-loaded instead of pulling them into the main application entrypoint.
assert.doesNotMatch(page, /from\s+['"](?:gsap|animejs)['"]/,
  'GSAP and Anime.js must stay out of the static import graph; load them on demand from pinned browser modules.');

process.stdout.write('✓ Public browser benchmark route, methodology, instrumentation, responsive styles and lazy competitors verified\n');
