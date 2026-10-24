import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveLocaleReferences } from './lib/locale.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFile(resolve(root, path), 'utf8');
const exists = (path) => access(resolve(root, path)).then(() => true, () => false);

const [router, app, mainScss, page, setup, results, methodology, types, engineLoader, sceneFactory, statistics, runnerFactory, frameCalibration, measureRun, composable, styles, localeSource] = await Promise.all([
  read('apps/docs/src/router/index.ts'),
  read('apps/docs/src/App.vue'),
  read('apps/docs/src/styles/main.scss'),
  read('apps/docs/src/views/BrowserBenchmarks.vue'),
  read('apps/docs/src/components/BrowserBenchmarks/BrowserBenchmarkSetup.vue'),
  read('apps/docs/src/components/BrowserBenchmarks/BrowserBenchmarkResults.vue'),
  read('apps/docs/src/components/BrowserBenchmarks/BrowserBenchmarkMethodology.vue'),
  read('apps/docs/src/views/browser-benchmarks/types.ts'),
  read('apps/docs/src/views/browser-benchmarks/engineLoader.ts'),
  read('apps/docs/src/views/browser-benchmarks/sceneFactory.ts'),
  read('apps/docs/src/views/browser-benchmarks/statistics.ts'),
  read('apps/docs/src/views/browser-benchmarks/runnerFactory.ts'),
  read('apps/docs/src/views/browser-benchmarks/frameCalibration.ts'),
  read('apps/docs/src/views/browser-benchmarks/measureRun.ts'),
  read('apps/docs/src/views/browser-benchmarks/useBrowserBenchmarks.ts'),
  read('apps/docs/src/styles/views/benchmarks.scss'),
  read('apps/docs/src/locales/en.json'),
]);
const locale = resolveLocaleReferences(JSON.parse(localeSource));
const benchmarkCopy = locale.app.view.browserBenchmarks.staticText;

assert.ok(router.includes("path: '/benchmarks'"), 'The public /benchmarks route is missing.');
assert.ok(router.includes("import('../views/BrowserBenchmarks.vue')"), 'The benchmark page must be lazy-loaded as a route chunk.');
assert.ok(app.includes('copy.value.benchmarkLab') && app.includes("to: '/benchmarks'"), 'The benchmark route must be discoverable in global navigation through locale data.');
assert.ok(app.includes('copy.benchmarkLab') && Object.values(locale.app.view.navigation).includes('Benchmark Lab'), 'The public page must be linked from the site footer using locale data.');
assert.ok(mainScss.includes("@use './views/benchmarks'"), 'Benchmark styles must be part of the docs style entrypoint.');
assert.ok(await exists('apps/docs/src/views/BrowserBenchmarks.vue'), 'Benchmark route component is missing.');

for (const component of ['BrowserBenchmarkSetup', 'BrowserBenchmarkResults', 'BrowserBenchmarkMethodology']) {
  assert.ok(page.includes(`<${component}`), `Benchmark page must delegate ${component} to a focused component.`);
}
assert.ok(page.length < 15_000, 'BrowserBenchmarks.vue should remain a thin route-level composition, not contain benchmark implementation logic.');
assert.doesNotMatch(page, /\binterface\s+[A-Z]|\btype\s+[A-Z][A-Za-z0-9_]*\s*=/, 'Benchmark domain types must live outside Vue SFCs.');
assert.doesNotMatch(page, /https?:\/\//, 'Third-party benchmark URLs must live in the engine loader, not in the Vue view.');

for (const fragment of [
  'frameBudgetReferenceMs',
  'calibrateFrameInterval',
  'estimatedRafCadenceHz',
  'engine-only',
  'per-target-dom',
  'schemaVersion: 2',
  'methodology',
  'createObjectURL',
  'runOrders',
  'const repetitions = 10;',
]) assert.ok(composable.includes(fragment), `Browser benchmark orchestration is missing ${fragment}.`);

for (const fragment of ['createPerTargetRunner', 'createRunner', 'keyframes<number>']) {
  assert.ok(runnerFactory.includes(fragment), `The isolated runner factory is missing ${fragment}.`);
}
for (const fragment of ['calibrationIntervalCount = 60', 'estimateMissedRefreshes', 'requestAnimationFrame', 'awaitWithAbort', 'isAbortError']) {
  assert.ok(frameCalibration.includes(fragment), `Frame timing utilities are missing ${fragment}.`);
}
for (const fragment of ['performance.now()', 'long-animation-frame', 'longtask', 'rendererWorkSamples', 'renderedTargetsPerCallback', 'longTaskSupported ? longTaskDurations.length : null']) {
  assert.ok(measureRun.includes(fragment), `Measurement service is missing ${fragment}.`);
}
assert.ok(measureRun.includes("from './runnerFactory'") && measureRun.includes("from './frameCalibration'"), 'Measure run service must use the extracted runner and timing modules.');
assert.ok(measureRun.length < 18_000, 'The measure-run module should remain focused on one measured repetition.');
assert.ok(composable.length < 30_000, 'The benchmark composable should remain an orchestration layer, not contain renderer/measurement implementation details.');
assert.match(engineLoader, /https:\/\/esm\.sh\/gsap@3\.15\.0/, 'GSAP source must be pinned in the isolated loader.');
assert.match(engineLoader, /https:\/\/esm\.sh\/animejs@4\.5\.0/, 'Anime.js source must be pinned in the isolated loader.');
assert.match(engineLoader, /import\(\/\* @vite-ignore \*\/ url\)/, 'Competing engines must load on demand through the isolated runtime loader.');
assert.match(engineLoader, /cachedModules/, 'The runtime loader should cache successful competitor imports.');
assert.match(types, /export type EngineId[\s\S]*EngineMeta[\s\S]*BrowserRunResult/, 'Benchmark domain types must be centralized in the types module.');
assert.match(statistics, /export function median[\s\S]*export function percentile[\s\S]*export function summarizeEngine/, 'Benchmark statistics must be independent of Vue lifecycle code.');
assert.match(sceneFactory, /export function createScene[\s\S]*export function createObjectScene/, 'DOM/SVG/Canvas scene creation must live in its own module.');
assert.ok(composable.includes("from './types'") && composable.includes("from './engineLoader'") && composable.includes("from './measureRun'") && composable.includes("from './frameCalibration'") && composable.includes("from './statistics'"), 'Benchmark composable must import its separated modules with workspace-relative paths.');
assert.doesNotMatch(composable, /https:\/\/esm\.sh\//, 'Third-party module URLs should not be embedded in benchmark orchestration.');
assert.ok(Object.values(benchmarkCopy).some((value) => value.includes('No benchmark results are uploaded')), 'Benchmark privacy caveat must remain available in locale data.');
assert.ok(Object.values(benchmarkCopy).some((value) => value.includes('Estimated rAF cadence:')), 'The calibrated callback cadence must be visible through locale data.');

assert.ok(composable.includes("id: 'dom'") && composable.includes("id: 'svg'") && composable.includes("id: 'canvas'"), 'DOM, SVG and Canvas scenarios must be available.');
assert.ok(styles.includes('@media (prefers-reduced-motion: reduce)'), 'Benchmark transitions must respect reduced-motion preferences.');
assert.ok(styles.includes('@media (max-width: breakpoints.$rx-breakpoint-tablet-narrow)'), 'Benchmark page must use the shared responsive breakpoint tokens.');
assert.ok(styles.includes('grid-template-columns: repeat(4, minmax(0, 1fr))'), 'Four benchmark controls must fit as a four-column desktop grid.');
const workspaceLayout = styles.match(/&__workspace\s*\{([^}]*)\}/s)?.[1] ?? '';
assert.match(workspaceLayout, /grid-template-columns:\s*minmax\(0,\s*1fr\)/, 'The live scene and results must stack in a single-column workspace.');
const engineResultsLayout = styles.match(/&__engine-results\s*\{([^}]*)\}/s)?.[1] ?? '';
assert.match(engineResultsLayout, /grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/, 'Engine result cards must use a three-column desktop layout.');
const stagePanelPosition = page.indexOf('class="browser-benchmarks__panel browser-benchmarks__stage-panel"');
const callbackComparisonPosition = page.indexOf('class="browser-benchmarks__comparison-bars"');
const resultsComponentPosition = page.indexOf('<BrowserBenchmarkResults');
const resultsPanel = await read('apps/docs/src/components/BrowserBenchmarks/BrowserBenchmarkResults.vue');
const resultsPanelPosition = resultsPanel.indexOf('class="browser-benchmarks__panel browser-benchmarks__results-panel"');
assert.ok(stagePanelPosition >= 0 && callbackComparisonPosition > stagePanelPosition && resultsComponentPosition > callbackComparisonPosition && resultsPanelPosition >= 0, 'Renderer callback comparison must sit beneath the live scene and before the results component.');

for (const path of [
  'apps/docs/src/components/BrowserBenchmarks/BrowserBenchmarkSetup.vue',
  'apps/docs/src/components/BrowserBenchmarks/BrowserBenchmarkResults.vue',
  'apps/docs/src/components/BrowserBenchmarks/BrowserBenchmarkMethodology.vue',
]) {
  const source = await read(path);
  assert.doesNotMatch(source, /\binterface\s+[A-Z]|\btype\s+[A-Z][A-Za-z0-9_]*\s*=/, `${path} must consume centralized benchmark types rather than declaring domain types inline.`);
}

process.stdout.write('✓ Browser benchmark route, focused Vue components, centralized types, renderer factory, statistics, instrumentation, methodology and isolated lazy engine loader verified\n');
