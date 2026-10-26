import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const componentFiles = [
  'apps/docs/src/components/Playground/MotionPanels/TweenPanel.vue',
  'apps/docs/src/components/Playground/MotionPanels/SteeringPanel.vue',
  'apps/docs/src/views/AnimationPlayground.vue',
  'apps/docs/src/views/TimelinePlayground.vue',
  'apps/docs/src/views/EasingsPlayground.vue',
  'apps/docs/src/views/ApiPlayground.vue',
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

for (const file of componentFiles) {
  const source = await readFile(resolve(root, file), 'utf8');
  const returnedPromiseLikeEvent = /@click="[^"\n]*(?:animation|timeline|tween|sequence)\.(?:play|pause|stop|restart)\(\)"/;
  assert(!returnedPromiseLikeEvent.test(source), `${file}: wrap PromiseLike motion controls in void-returning handlers.`);
  const returnedPromiseLikeCleanup = /onBeforeUnmount\(\(\)\s*=>\s*(?:animation|timeline|tween|sequence)\.stop\(\)\s*\)/;
  assert(!returnedPromiseLikeCleanup.test(source), `${file}: lifecycle cleanup must not return a PromiseLike animation.`);
}

const router = await readFile(resolve(root, 'apps/docs/src/router/index.ts'), 'utf8');
assert(/scrollBehavior:\s*\(\)\s*=>\s*\(\{\s*top:\s*0,\s*left:\s*0,\s*behavior:\s*'auto'\s*\}\)/s.test(router), 'Route navigation should reset scroll instantly rather than animate during view replacement.');

const resetStyles = await readFile(resolve(root, 'apps/docs/src/styles/base/_reset.scss'), 'utf8');
const uiStyles = await readFile(resolve(root, 'apps/docs/src/styles/components/_ui-primitives.scss'), 'utf8');
assert(/html\s*\{[^}]*scroll-behavior:\s*auto/s.test(resetStyles), 'Global scrolling must remain instant; opt into smooth scrolling at intentional in-page interactions.');
assert(!/background-attachment:\s*fixed\s*;/i.test(uiStyles), 'Avoid fixed gradient backgrounds that can flash during route scroll/repaint.');

console.log('Playground lifecycle and route-transition checks passed.');
