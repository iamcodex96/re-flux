import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { resolveLocaleReferences } from './lib/locale.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const read = (path) => readFile(resolve(root, path), 'utf8');
const [overview, stage, card, shaderPreview, shadersPanel, router, showcase, styles, cardStyles, shadersStyles, home, localeSource, bubbleBackground] = await Promise.all([
  read('apps/docs/src/views/VisualLabOverview.vue'),
  read('apps/docs/src/components/VisualLab/VisualLabFeaturedStage.vue'),
  read('apps/docs/src/components/VisualLab/VisualExperimentCard.vue'),
  read('apps/docs/src/components/VisualLab/VisualLabShaderPreview.vue'),
  read('apps/docs/src/components/VisualLab/VisualShadersPanel.vue'),
  read('apps/docs/src/router/index.ts'),
  read('apps/docs/src/views/VisualShowcase.vue'),
  read('apps/docs/src/styles/views/visual-lab/_overview.scss'),
  read('apps/docs/src/styles/components/_visual-experiment-card.scss'),
  read('apps/docs/src/styles/views/visual-lab/_shaders.scss'),
  read('apps/docs/src/views/Home.vue'),
  read('apps/docs/src/locales/en.json'),
  read('apps/docs/src/components/VisualLab/bubbleChamberBackground.ts'),
]);
const locale = resolveLocaleReferences(JSON.parse(localeSource));
const shaderCopy = locale.app.view.visualLabShaderPreview.staticText;

const experimentStart = overview.indexOf('const experiments: VisualLabExperiment[] = [');
const experimentEnd = overview.indexOf('\n];', experimentStart);
assert.ok(experimentStart >= 0 && experimentEnd > experimentStart, 'Visual Lab experiment registry must be a static typed catalog.');
const registry = overview.slice(experimentStart, experimentEnd);
assert.equal((registry.match(/code:\s*'EXP-\d+'/g) ?? []).length, 17, 'Catalog must contain 17 categorized demos; the featured kinetic typography and Fluid Noise hero visual live outside the card catalog.');
for (const [category, expected] of Object.entries({ physics: 6, shader: 3, svg: 5, canvas: 3 })) {
  const actual = (registry.match(new RegExp(`category:\\s*'${category}'`, 'g')) ?? []).length;
  assert.equal(actual, expected, `Expected ${expected} ${category} experiments, found ${actual}.`);
}

for (const contract of [
  /activeFilter\s*=\s*filter\.id/,
  /visibleExperiments\.length/,
  /@input="updateConfig\(/,
  /function applyPreset\(/,
  /function resetCenter\(/,
  /function generatedStreamCode\(/,
  /function downloadStream\(/,
  /function copyConfig\(/,
  /new Blob\(\[generatedStreamCode\(\)\]/,
  /RetargetableMotion/,
  /aria-pressed=/,
]) assert.match(overview, contract, `Overview is missing required functional contract: ${contract}`);

for (const kind of ['dispersion', 'shader-aurora', 'shader-spectrum']) {
  assert.ok(shaderPreview.includes(kind), `WebGL shader preview is missing ${kind}.`);
  assert.ok(registry.includes(`kind: '${kind}'`), `Catalog has no ${kind} experiment.`);
}
assert.ok(shaderPreview.includes('shader-fluid'), 'Fluid Noise shader implementation must remain available for the Home hero.');
assert.match(home, /<VisualLabShaderPreview[\s\S]*?kind="shader-fluid"[\s\S]*?:active="heroFluidActive"/, 'Fluid Noise Field must be rendered as the Home hero background.');
assert.doesNotMatch(registry, /shader-fluid|Fluid Noise Field/, 'Fluid Noise Field must not remain as a Visual Lab card.');
assert.doesNotMatch(shadersPanel, /shader-fluid|Fluid noise field/i, 'Fluid Noise Field must not remain selectable on the Visual Lab shader page.');
assert.match(shaderPreview, /getContext\('webgl'/, 'Shader previews must use a real WebGL context.');
assert.match(shaderPreview, /function syncAnimation\(\)[\s\S]*?initializeWebGL\(\)/, 'WebGL previews must initialize lazily on activation.');
assert.ok(shaderPreview.includes('const shaderReady = ref(false);'), 'WebGL previews must remain on their CSS fallback until the first frame is ready.');
assert.ok(shaderPreview.includes('shaderReady.value = true;'), 'WebGL preview readiness must be signaled after the first successful draw.');
assert.match(shaderPreview, /v-if="webglUnavailable \|\| !shaderReady"/, 'The CSS fallback must remain visible until WebGL is ready.');
assert.match(shaderPreview, /new IntersectionObserver[\s\S]*?initializeWebGL\(\)[\s\S]*?intersectionObserver\?\.disconnect\(\)/, 'Inactive shader previews should initialize near the viewport, not all at startup.');
assert.match(shaderPreview, /gl\.uniform1f\(uniforms\.time, time\)/, 'The animated stream must update the shader time uniform.');
assert.match(shaderPreview, /copy\.staticText\.webglUnavailableFallbackActive/, 'A locale-backed fallback is required when WebGL is unavailable.');
assert.equal(shaderCopy.webglUnavailableFallbackActive, 'WEBGL UNAVAILABLE · FALLBACK ACTIVE', 'The WebGL unavailable fallback label must remain available in locale data.');
assert.match(shaderPreview, /copy\.staticText\.fallbackActive/, 'The fallback state label must be locale-backed.');
assert.equal(shaderCopy.fallbackActive, 'FALLBACK ACTIVE', 'The fallback state label must remain available in locale data.');
assert.match(shaderPreview, /timeSubscription\?\.unsubscribe\(\)/, 'WebGL uniform subscription must be released.');
assert.match(shaderPreview, /gl\.deleteProgram\(program\)/, 'WebGL program must be released at teardown.');
assert.doesNotMatch(shaderPreview, /smoothstep\(\s*1\.1\s*,\s*0\.15\s*,|smoothstep\(\s*0\.22\s*,\s*0\.0\s*,|smoothstep\(\s*0\.16\s*,\s*0\.0\s*,/, 'GLSL smoothstep edges must be ordered.');

for (const contract of ["const GLYPH_TEXT = 're;Flux'", 'function drawKineticTypography', 'function applyGlyphSteering', 'const steeringBodies: SteeringAgent[] = glyphAgents.map', 'applyGlyphSteering(agent, body, steeringBodies, frame, deltaSeconds)', 'createBubbleChamberLayer', 'drawBubbleChamberDrift', 'function replayTypography', 'MAX_GLYPH_FORCE', 'new RetargetableMotion', 'bindCanvas', 'IntersectionObserver', 'performance.now()', 'latestDrawTimeMs', 'emitTelemetry', 'reducedMotion', 'if (!isPointerActive.value)', 'renderSubscription?.unsubscribe()']) {
  assert.ok(stage.includes(contract), `Featured kinetic typography is missing ${contract}.`);
}

assert.match(overview, /<button[^>]*@click="replayTypography"[\s\S]*?copy\.staticText\.replayTypographyAnimation/, 'The featured kinetic typography hero must provide a locale-backed replay button.');
assert.match(overview, /<section class="lab-feature"[\s\S]*?<section class="lab-explorer"/, 'The featured hero must lead the experiment filters, matching the home page story hierarchy.');
assert.match(styles, /&__content\s*\{[^}]*min-height:\s*clamp\(40rem,\s*calc\(100svh/s, 'The featured Visual Lab stage must be sized as a full hero.');
assert.match(bubbleBackground, /function drawGrain[\s\S]*?function drawOrbitTrails[\s\S]*?function drawBubble[\s\S]*?function drawGalaxy/, 'The procedural background must include grain, orbital curves, bubbles and particle galaxies.');
assert.match(bubbleBackground, /export function drawBubbleChamberMotion[\s\S]*?drawOrbitTrails\([\s\S]*?phase[\s\S]*?drawBubble\([\s\S]*?revealProgress/, 'The Bubble Chamber background must animate dashed orbit trails and progressively traced bubble rings.');
assert.match(stage, /drawBubbleChamberMotion\(context, width, height, scenePhase, backgroundSeed, palette\)/, 'The featured typography stage must draw animated Bubble Chamber rings and moving lines each frame.');
assert.match(bubbleBackground, /export function drawBubbleChamberDrift/, 'The Bubble Chamber background must include a lightweight animated dust layer.');
assert.match(bubbleBackground, /export function createBubbleChamberLayer\([\s\S]*?seed = 1124,[\s\S]*?theme: BubbleChamberPalette/, 'The Bubble Chamber artwork must accept an explicit seed and the active UI palette.');
assert.match(bubbleBackground, /theme\.cyan[\s\S]*?theme\.violet[\s\S]*?theme\.background/, 'The Bubble Chamber palette must be based on re;Flux theme colors rather than warm unrelated accents.');
assert.doesNotMatch(bubbleBackground, /#F28B50|#F2E088|#D96B43/i, 'The Bubble Chamber background must not reintroduce the old orange/yellow palette.');
assert.ok(bubbleBackground.includes('const rgb = color.match(/^rgba?\\(([^)]+)\\)$/i)?.[1];'), 'Theme RGB colors must support alpha blending for the procedural renderer.');
assert.match(stage, /function replayTypography\(\): void \{[\s\S]*?backgroundSeed = createBackgroundSeed(?:\(backgroundSeed\))?;[\s\S]*?bubbleBackgroundLayer = null;[\s\S]*?bubbleBackgroundSignature = '';/, 'Replay must regenerate the procedural background as well as the typography animation.');
assert.match(styles, /\.lab-modules \{[\s\S]*?width: min\(calc\(100% - var\(--rx-page-gutter\) \* 2\), var\(--rx-content-wide\)\);[\s\S]*?margin-inline: auto;/, 'Visual Lab experiment cards must remain in their previous centered, content-width section rather than stretching across the hero canvas.');

for (const contract of ['@pointerenter="onPointerEnter"', '@pointerleave="onPointerLeave"', '@focusin="onFocusIn"', '@focusout="onFocusOut"', 'playPreview()', 'resetPreview()', 'createKineticTypography(', 'VisualLabShaderPreview', 'onBeforeUnmount']) {
  assert.ok(card.includes(contract), `Experiment card is missing ${contract}.`);
}

assert.match(router, /path:\s*'shaders',[\s\S]*?VisualShadersPanel\.vue/, 'The dedicated WebGL shader route must be registered.');
assert.match(showcase, /name:\s*'visuals-shaders'/, 'Visual showcase navigation must link to the shader studies.');
for (const selector of ['&__vignette', '&__hint', '&__actions', '&__launchers']) {
  assert.ok(styles.includes(selector), `Responsive overview styles must include ${selector}.`);
}
assert.match(styles, /@media\s*\(prefers-reduced-motion:\s*reduce\)/, 'Overview must respect reduced motion.');
assert.match(cardStyles, /@media\s*\(prefers-reduced-motion:\s*reduce\)/, 'Card effects must respect reduced motion.');
assert.match(card, /canvasUnavailable\.value = true[\s\S]*?experiment-art__canvas-fallback/, 'Canvas previews must expose a graceful fallback if Canvas 2D is unavailable.');
assert.match(shadersStyles, /@media\s*\(max-width:/, 'Shader details must have responsive layout rules.');
assert.match(shadersPanel, /preferenceSubscription\.unsubscribe\(\)/, 'Shader page motion preference subscription must be released.');
assert.match(stage, /function getColor[\s\S]*?return `rgb\(\$\{value\}\)`/, 'Canvas colors must normalize comma-separated RGB design tokens to valid CSS colors.');

const publicText = `${overview}\n${stage}\n${shaderPreview}\n${shadersPanel}`;
assert.doesNotMatch(publicText, /212\.0\s*FPS|0\s*ALLOC(?:ATION)?\s*LEAK|50K\s*COMPUTE|100%\s*GC/i, 'Do not publish fabricated benchmark or leak counters.');

console.log('✓ Visual Lab complete: 17 categorized catalog entries, home-style kinetic typography hero, Bubble Chamber background, replay control, category counts, measured telemetry, interactive sandbox, WebGL fallbacks, routing, cleanup and responsive styles');
