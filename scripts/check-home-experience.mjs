import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = async (path) => readFile(resolve(root, path), 'utf8');
const exists = async (path) => access(resolve(root, path)).then(() => true, () => false);

const home = await source('apps/docs/src/views/Home.vue');
const codeMotion = await source('apps/docs/src/components/LandingCodeMotion.vue');
const docsTimeline = await source('apps/docs/src/components/DocsComponents/DocsTimelineSections.vue');
const principleVisual = await source('apps/docs/src/components/LandingPrincipleVisual.vue');
const labPreview = await source('apps/docs/src/components/LandingLabPreview.vue');
const app = await source('apps/docs/src/App.vue');

for (const section of ['home-hero', 'home-story-runway', 'home-lab', 'home-principles', 'home-closing']) {
  assert.ok(home.includes(section), `Home is missing the ${section} section.`);
}
assert.ok(home.includes('<LandingTelemetryStage'), 'Home must render the telemetry hero visual.');
assert.match(home, /<VisualLabShaderPreview[\s\S]*?kind="shader-fluid"[\s\S]*?:active="heroFluidActive"/, 'The Fluid Noise shader should be mounted as the Home hero background.');
assert.ok(home.includes('defineAsyncComponent(() => import('), 'The heavy Home shader component must be code-split and loaded asynchronously.');
assert.ok(home.includes('scheduleHeroShader') && home.includes('requestIdleCallback'), 'The Home shader should be requested during idle time, not during initial rendering.');
assert.ok(home.includes('!heroMotionPreferences.snapshot.visible'), 'The Home shader must stay deferred while the document is hidden.');
assert.ok(home.includes('v-if="!heroShaderRequested"'), 'The Home hero must show a static visual while the shader chunk is deferred.');
assert.ok(home.includes('new MotionPreferences()'), 'Home shader background must use shared motion preferences.');
assert.ok(home.includes('heroVisibilityObserver?.disconnect()'), 'Home shader background must stop observing visibility on unmount.');
assert.ok(home.includes('heroMotionPreferences.destroy()'), 'Home must release its motion preferences listeners.');
assert.ok(!home.includes('home-hero__wave-field') && !home.includes('home-wave-flow'), 'The old SVG-wave hero treatment should be removed in favor of the Fluid Noise shader.');
assert.ok(home.includes('<LandingCodeMotion'), 'Home must render Code in Motion.');
assert.ok(docsTimeline.includes('<LandingCodeMotion initial-demo="timeline" embedded />'), 'Timeline docs should reuse the Home Code in Motion workbench for a consistent preview/code layout.');
assert.ok(codeMotion.includes('initialDemo?: DemoMode; embedded?: boolean'), 'Code in Motion must support embedding a selected example in documentation.');
assert.ok(codeMotion.includes('landing-code-motion--embedded') && codeMotion.includes('!props.embedded'), 'Embedded Code in Motion should hide the Home-only heading and mode selector.');
assert.ok(home.includes('<LandingPrincipleVisual'), 'Home must render animated principle illustrations.');
assert.ok(home.includes('springMotion?.dispose()'), 'The story spring must be disposed on unmount.');

for (const concept of ['RetargetableMotion', 'new Timeline()', 'bindSvgPathMorph', 'prefers-reduced-motion', 'IntersectionObserver', 'onBeforeUnmount']) {
  assert.ok(codeMotion.includes(concept), `Code in Motion is missing ${concept}.`);
}
for (const mode of ["'spring'", "'timeline'", "'svg'"]) {
  assert.ok(codeMotion.includes(mode), `Code in Motion is missing demo mode ${mode}.`);
}
assert.ok(codeMotion.includes('navigator.clipboard.writeText(sourceCode.value)'), 'Code examples must be copyable.');
assert.ok(codeMotion.includes('document.visibilityState'), 'Code Motion playback must respect document visibility.');
assert.ok(codeMotion.includes("playbackState.value === 'reduced-motion'"), 'Code Motion must resume if the user turns reduced motion off.');
assert.ok(codeMotion.includes('springTarget.toFixed(2)'), 'Spring preview must display its actual target value.');

assert.ok(principleVisual.includes('new Tween'), 'Principle illustrations must be driven by re;Flux.');
assert.ok(principleVisual.includes('prefers-reduced-motion'), 'Principle illustrations must respect reduced motion.');
assert.ok(principleVisual.includes('valueSubscription?.unsubscribe()'), 'Principle illustrations must release subscriptions.');
assert.ok(labPreview.includes('bindSvgPathMorph'), 'SVG preview must use re;Flux SVG bindings.');
assert.ok(labPreview.includes('bindCanvas'), 'Canvas preview must use re;Flux Canvas bindings.');
assert.ok(labPreview.includes('draggable('), 'Interaction preview must use the gesture adapter.');
assert.ok(labPreview.includes('function syncDraggableMotionPolicy()'), 'Drag behavior must adapt to reduced-motion changes.');
assert.ok(labPreview.includes('dragHandle?.destroy()'), 'Drag listeners must be destroyed on policy changes and unmount.');
assert.ok(app.includes('site-navigation'), 'The global navigation shell is missing.');
const responsiveStyles = await source('apps/docs/src/styles/views/home/_responsive.scss');
assert.ok(responsiveStyles.includes('@media (prefers-reduced-motion: reduce)'), 'Home needs a reduced-motion style path.');
assert.ok(responsiveStyles.includes("@use '../../abstracts/breakpoints' as breakpoints;") && responsiveStyles.includes("@media (max-width: breakpoints.$rx-breakpoint-small)"), 'Home needs a tokenized small-screen layout.');
assert.ok(!home.includes('x: 524.23') && !home.includes('v: 188.94'), 'Home must not present invented telemetry values as live metrics.');

for (const obsolete of [
  'apps/docs/src/components/LandingCapabilitiesShowcase.vue',
  'apps/docs/src/components/LandingHeroVisual.vue',
  'apps/docs/src/components/LandingMotionShowcase.vue',
  'apps/docs/src/styles/views/_landing.scss',
]) {
  assert.equal(await exists(obsolete), false, `${obsolete} is obsolete and should not return as dead code.`);
}

process.stdout.write('✓ Home experience, demos, lifecycle guards, and dead-code cleanup verified\n');
