import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFile(resolve(root, path), 'utf8');
const [router, layout, playground, canvasPanel, card, featured, typography, overview, locale, styles] = await Promise.all([
  read('apps/docs/src/router/index.ts'),
  read('apps/docs/src/components/Playground/PlaygroundLayout.vue'),
  read('apps/docs/src/components/Playground/MotionPanels/SteeringPanel.vue'),
  read('apps/docs/src/components/VisualLab/VisualCanvasPanel.vue'),
  read('apps/docs/src/components/VisualLab/VisualExperimentCard.vue'),
  read('apps/docs/src/components/VisualLab/VisualLabFeaturedStage.vue'),
  read('apps/docs/src/components/VisualLab/kineticTypographyMotion.ts'),
  read('apps/docs/src/views/VisualLabOverview.vue'),
  read('apps/docs/src/locales/en.json'),
  read('apps/docs/src/styles/views/playgrounds/_streams-and-adapters.scss'),
]);

assert.match(router, /path:\s*'steering'[\s\S]*?playground-steering[\s\S]*?SteeringPanel\.vue/, 'Steering Playground route must be registered.');
assert.match(layout, /key:\s*'motion-simulation'[\s\S]*?playground-steering/, 'Steering page must be discoverable from Playground navigation.');
for (const contract of ['createSteeringSwarm(', 'stepSteeringSwarm(', 'drawSteeringSwarm(', 'requestAnimationFrame(tick)', "document.addEventListener('visibilitychange'", 'resizeObserver?.disconnect()', 'onCanvasKeydown', "targetInfluence: pointerActive && mode.value === 'flow' ? 0.38 : 0"]) {
  assert.ok(playground.includes(contract), `Steering Playground is missing ${contract}.`);
}
for (const contract of ["id: 'flow-field'", 'createSteeringSwarm(', 'stepSteeringSwarm(', 'drawSteeringSwarm(', 'followFlowField', 'seek', 'separate', 'stepSteeringAgent', 'targetInfluence: pointerActive ? 0.38 : 0']) {
  assert.ok(canvasPanel.includes(contract), `Visual Labs flow-field scene is missing ${contract}.`);
}
for (const contract of ["props.kind === 'swarm'", 'createSteeringSwarm(', 'stepSteeringSwarm(', 'drawSteeringSwarm(']) {
  assert.ok(card.includes(contract), `Kinetic typography/swarm preview integration is missing ${contract}.`);
}
for (const [label, source] of [['featured Canvas typography', featured], ['DOM kinetic typography', typography]]) {
  for (const api of ['combineSteering', 'seek', 'separate', 'flee', 'stepSteeringAgent']) {
    assert.ok(source.includes(api), `${label} should use shared ${api} behavior.`);
  }
  assert.doesNotMatch(source, /function\s+limitVector\s*\(/, `${label} must not retain a private vector limiter.`);
}
assert.match(overview, /type SteeringAgent[\s\S]*?WeightedSteeringForce[\s\S]*?stepSteeringAgent/, 'Generated Visual Lab code must teach the public steering API.');
assert.doesNotMatch(overview, /function limitVector\s*\(/, 'Generated Visual Lab code must not duplicate vector limiting.');
assert.match(locale, /"motionPanelSteering"/, 'Steering Playground must have locale-backed copy.');
for (const key of ['steeringAndFlowFields', 'autonomousAgentsAndForceFields', 'steeringAgentsFollowAFlowField']) {
  assert.ok(locale.includes(`"${key}"`), `Locale is missing ${key}.`);
}
assert.match(styles, /\.steering-simulation-canvas/, 'Steering Playground canvas styles must exist.');
process.stdout.write('Steering integrations passed: Playground route and lifecycle, Visual Labs flow-field scene, swarm preview, shared typography steering, public API sample and locales.\n');
