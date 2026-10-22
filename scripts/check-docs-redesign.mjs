import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFile(resolve(root, path), 'utf8');
const locale = JSON.parse(await read('apps/docs/src/locales/en.json'));
const docs = locale.app.view.docs;
const router = await read('apps/docs/src/router/index.ts');
const publicExports = await read('src/index.ts');
const mainScss = await read('apps/docs/src/styles/main.scss');
const docsResponsive = await read('apps/docs/src/styles/views/docs/_responsive.scss');
const docsShell = await read('apps/docs/src/styles/views/docs/_shell.scss');
const visualExample = await read('apps/docs/src/components/DocsComponents/DocsVisualExample.vue');
const visualExampleStyles = await read('apps/docs/src/styles/components/docs-visual-example.scss');

const requiredComponents = [
  'apps/docs/src/components/DocsComponents/DocsSpringSimulator.vue',
  'apps/docs/src/components/DocsComponents/DocsArchitecturePipeline.vue',
  'apps/docs/src/components/DocsComponents/DocsRuntimeTelemetry.vue',
  'apps/docs/src/components/DocsComponents/DocsRuntimeTelemetrySection.vue',
  'apps/docs/src/components/DocsComponents/DocsApiReference.vue',
  'apps/docs/src/styles/components/docs-spring-simulator.scss',
  'apps/docs/src/styles/components/docs-architecture-pipeline.scss',
  'apps/docs/src/styles/components/docs-code-window.scss',
  'apps/docs/src/styles/components/docs-runtime-telemetry.scss',
  'apps/docs/src/styles/components/docs-api-reference.scss',
];
for (const file of requiredComponents) await access(resolve(root, file));

const navigationPages = docs.pageNavigation.flatMap((group) => group.links);
assert.equal(new Set(navigationPages.map((link) => link.page)).size, navigationPages.length, 'Docs navigation contains duplicate page keys.');
for (const link of navigationPages) {
  assert.ok(docs.pages[link.page], `Missing localized page metadata for ${link.page}.`);
  assert.ok(link.to.startsWith('/docs/'), `Unexpected documentation route: ${link.to}`);
  const nestedPath = link.to.slice('/docs/'.length);
  assert.ok(router.includes(`path: '${nestedPath}'`), `Missing docs route for ${link.to}.`);
}
assert.ok(docs.pageNavigation.some((group) => group.links.some((link) => link.page === 'api-reference')), 'API reference is not present in the docs navigation.');
assert.ok(router.includes("name: 'docs-api-reference'"), 'API reference route is missing.');

assert.ok(visualExample.includes('docs-visual-example__workspace--with-code'), 'Documentation examples must render a split preview/source workspace.');
assert.ok(visualExample.includes('class="docs-visual-example__code"'), 'Documentation examples must show source beside the live preview.');
assert.ok(!visualExample.includes('<UiExpansionPanels'), 'Documentation example source should not be hidden behind an accordion.');
assert.match(visualExampleStyles, /&--with-code\s*\{\s*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\);/s, 'Documentation preview and source must use a two-column desktop layout.');
assert.match(visualExampleStyles, /@media \(max-width: breakpoints\.\$rx-breakpoint-desktop-compact\)[\s\S]*?\.docs-visual-example__workspace--with-code\s*\{\s*grid-template-columns:\s*minmax\(0, 1fr\);/s, 'Documentation example panels must stack at compact widths.');

// Mobile docs must use the browser's page scroll, not retain the desktop
// article's fixed-height overflow scroller after the responsive cascade.
const mobileDocsStyles = docsResponsive.split('@media (max-width: breakpoints.$rx-breakpoint-xs-mobile)')[0];
assert.match(mobileDocsStyles, /\.docs-article-column\s*\{[^}]*overflow:\s*visible;/s, 'Mobile docs article column must allow natural page scrolling.');
assert.match(mobileDocsStyles, /\.docs-content\s*\{[^}]*height:\s*auto;[^}]*flex:\s*0 0 auto;[^}]*overflow:\s*visible;/s, 'Mobile docs article must not keep the desktop nested scroll container.');
assert.match(mobileDocsStyles, /\.docs-mobile-toolbar\s*\{[^}]*top:\s*var\(--rx-site-header-height\)/s, 'Mobile docs toolbar must sit below the sticky site header.');
assert.match(docsResponsive, /@media \(max-width: breakpoints\.\$rx-breakpoint-mobile-navigation\)[\s\S]*?\.docs-mobile-toolbar\s*\{\s*top:\s*var\(--rx-site-header-height-mobile\)/s, 'Compact mobile docs toolbar offset must match the shorter header.');
assert.match(docsShell, /@media \(max-width: breakpoints\.\$rx-breakpoint-tablet-narrow\)[\s\S]*?\.site-shell--docs > \.site-header \{\s*flex-basis:\s*auto;/s, 'Mobile docs header must use its responsive height rather than the desktop flex-basis.');
assert.match(docsShell, /@media \(max-width: breakpoints\.\$rx-breakpoint-mobile-navigation\)[\s\S]*?\.site-main\.docs-main \{\s*min-height:\s*calc\(100svh - var\(--rx-site-header-height-mobile\)\)/s, 'Compact mobile docs viewport must account for the shorter header.');

for (const fragment of [
  "@use './components/docs-spring-simulator'",
  "@use './components/docs-architecture-pipeline'",
  "@use './components/docs-code-window'",
  "@use './components/docs-runtime-telemetry'",
  "@use './components/docs-api-reference'",
]) assert.ok(mainScss.includes(fragment), `Missing SCSS entrypoint import: ${fragment}`);

const simulator = await read(requiredComponents[0]);
const telemetry = await read(requiredComponents[2]);
const pipeline = await read(requiredComponents[1]);
const api = await read(requiredComponents[4]);
assert.ok(simulator.includes('RetargetableMotion'), 'Spring simulator must use the public RetargetableMotion API.');
assert.ok(simulator.includes('prefers-reduced-motion'), 'Spring simulator must account for reduced motion.');
assert.ok(telemetry.includes('frameCoordinator.metrics$'), 'Telemetry must use real FrameCoordinator metrics.');
assert.ok(telemetry.includes('lastFrameWorkMs'), 'Telemetry must show actual measured frame work.');
assert.ok(pipeline.includes('retargetMotion'), 'Architecture example must use the public retargetMotion operator.');
assert.ok(api.includes('stepSpring()') && api.includes('staggered()'), 'API reference must include core physics and composition exports.');
for (const exportName of [
  'Animation', 'Timeline', 'Tween', 'keyframes', 'sequence', 'parallel', 'staggered',
  'RetargetableMotion', 'stepSpring', 'retargetMotion', 'smoothStream', 'adaptiveTween',
  'pointerGestures$', 'dragInertia', 'slideFollow', 'projectInertiaTarget', 'stagger',
  'MotionPreferences', 'FrameCoordinator', 'frameCoordinator', 'createAnimationFrameObservable',
  'Easings', 'resolveEasing', 'cubicBezier', 'steps', 'interpolate',
]) assert.ok(publicExports.includes(exportName), `API reference entry does not match a public export: ${exportName}.`);

const localeKeys = ['installPanel', 'pipeline', 'springSimulator', 'apiReference', 'runtimeTelemetry'];
for (const key of localeKeys) assert.ok(docs[key], `Missing localized docs content: ${key}.`);
assert.match(docs.runtimeTelemetry.note, /vary by device|vary by browser/i, 'Telemetry note must describe measurement variability.');
assert.match(docs.runtimeTelemetry.paradigmNote, /qualitative architecture comparison/i, 'Architecture comparison must not imply an unmeasured performance ranking.');

process.stdout.write(`✓ Documentation redesign: ${requiredComponents.length} components/assets, ${navigationPages.length} routes, API/simulator/telemetry checks passed\n`);
