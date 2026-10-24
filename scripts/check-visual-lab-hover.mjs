import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const read = (path) => readFile(resolve(root, path), 'utf8');

const [router, card, overview, stage, cardStyles, overviewStyles, typographyPanel, typographyMotion] = await Promise.all([
  read('apps/docs/src/router/index.ts'),
  read('apps/docs/src/components/VisualLab/VisualExperimentCard.vue'),
  read('apps/docs/src/views/VisualLabOverview.vue'),
  read('apps/docs/src/components/VisualLab/VisualLabFeaturedStage.vue'),
  read('apps/docs/src/styles/components/_visual-experiment-card.scss'),
  read('apps/docs/src/styles/views/visual-lab/_overview.scss'),
  read('apps/docs/src/components/VisualLab/VisualInteractionsPanel.vue'),
  read('apps/docs/src/components/VisualLab/kineticTypographyMotion.ts'),
]);

function requireMatch(source, pattern, message) {
  assert.match(source, pattern, message);
}

requireMatch(router, /path:\s*['"]\/visuals['"][\s\S]*?path:\s*['"]['"][\s\S]*?VisualLabOverview\.vue/, 'Visual Lab root route must load its experiment catalog.');
requireMatch(overview, /<VisualExperimentCard\b[\s\S]*?:preferences="preferences"/, 'Every catalog card must receive the shared motion preferences controller.');
requireMatch(overview, /@click="activeFilter = filter\.id"/, 'Experiment category filters must be interactive.');
requireMatch(overview, /@input="updateConfig\(/, 'The sandbox sliders must update the featured stage configuration.');

for (const [pattern, message] of [
  [/@pointerenter="onPointerEnter"/, 'Pointer enter must activate a preview.'],
  [/@pointerleave="onPointerLeave"/, 'Pointer leave must reset a preview.'],
  [/@focusin="onFocusIn"/, 'Keyboard focus must activate a preview.'],
  [/@focusout="onFocusOut"/, 'Keyboard focus leaving the card must reset a preview.'],
  [/function playPreview\(\)[\s\S]*?kineticTypography \?\?= createKineticTypography\(target\)/, 'The typography card must create the steering-based glyph simulation on activation.'],
  [/kineticTypography\?\.settle\(motionReduced\.value\)/, 'Leaving the typography card must settle glyph agents and respect reduced motion.'],
  [/sceneTween\.restart\(\)/, 'Non-typography previews must restart their value-driven scene on activation.'],
  [/sceneTween\?\.stop\(\)/, 'Leaving a non-typography card must stop/reset its value stream.'],
  [/new MotionPreferences|MotionPreferences/, 'Cards must use motion preferences.'],
  [/onReducedMotionChange[\s\S]*?resetPreview\(\)/, 'Reduced-motion preference changes must stop card previews.'],
  [/preferenceSubscription\?\.unsubscribe\(\)/, 'Motion preference subscription must be released on unmount.'],
  [/resizeObserver\?\.disconnect\(\)/, 'ResizeObserver must be disconnected on unmount.'],
  [/cleanups\.splice\(0\)\.reverse\(\)/, 'Preview bindings must clean up in reverse acquisition order.'],
]) {
  requireMatch(card, pattern, message);
}

for (const contract of ['homeDistance', 'MAX_FORCE', 'SEPARATION_DISTANCE', 'POINTER_RADIUS', 'requestAnimationFrame(tick)', "pointermove", "pointerleave", "visibilitychange", "aria-hidden", "target.replaceChildren(...originalNodes)"]) {
  assert.ok(typographyMotion.includes(contract), `Kinetic typography steering helper is missing ${contract}.`);
}
requireMatch(typographyPanel, /createKineticTypography\(target\)[\s\S]*?state\.reducedMotion[\s\S]*?handle\.settle\(true\)/, 'The dedicated typography scene must use the shared steering helper and stop for reduced motion.');
requireMatch(typographyPanel, /@click="replayKineticText"/, 'Kinetic typography must expose a replay action.');

for (const kind of ['setupSvgPreview', 'setupCanvasPreview', 'VisualLabShaderPreview']) {
  assert.ok(card.includes(kind), `VisualExperimentCard.vue must initialize ${kind}.`);
}

for (const kind of ['typography', 'spline', 'particles', 'cloth', 'dispersion', 'swarm']) {
  assert.ok(card.includes(`'${kind}'`), `VisualExperimentCard.vue must support the ${kind} preview kind.`);
}

requireMatch(stage, /@pointermove="onPointerMove"[\s\S]*?@pointerleave="clearPointer"/, 'Featured kinetic typography must respond to pointer movement and clear the target on leave.');
requireMatch(stage, /phaseTween(?:\?\.|\.)play\(\)/, 'Featured typography must play the phase tween while visible.');
requireMatch(stage, /phaseTween\?\.stop\(\)/, 'Featured typography must stop while hidden or reduced-motion is enabled.');
requireMatch(stage, /performance\.now\(\)[\s\S]*?latestDrawTimeMs/, 'Featured Canvas telemetry must measure draw time.');
requireMatch(stage, /new RetargetableMotion/, 'Featured pointer displacement must use RetargetableMotion.');
requireMatch(stage, /xMotion\?\.to\(x, options\)[\s\S]*?yMotion\?\.to\(y, options\)/, 'Featured pointer movement must retarget both axes using the active spring options.');
requireMatch(stage, /renderSubscription\?\.unsubscribe\(\)/, 'Featured Canvas binding must be unsubscribed on teardown.');
requireMatch(stage, /role="group"/, 'The interactive featured stage must expose an interactive semantic role.');

requireMatch(cardStyles, /&:focus-within/, 'Cards must have a visible keyboard focus treatment.');
requireMatch(cardStyles, /@media\s*\(prefers-reduced-motion:\s*reduce\)/, 'Card styles must honor prefers-reduced-motion.');
requireMatch(overviewStyles, /grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/, 'Desktop catalog must use a responsive three-column grid.');
requireMatch(overviewStyles, /rx-breakpoint-(?:mobile|tablet-narrow|lg)/, 'Visual Lab layout must use shared responsive breakpoints.');

console.log('✓ Visual Lab hover previews: enter/focus activation, animated typography, reset-on-leave, motion preference, Canvas/SVG cleanup, featured-stage interactions and responsive styles');
