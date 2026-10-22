import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const panelsDirectory = resolve(root, 'apps/docs/src/components/VisualLab');
const locale = JSON.parse(await readFile(resolve(root, 'apps/docs/src/locales/en.json'), 'utf8'));
const checks = [
  {
    file: 'VisualSvgPanel.vue',
    cards: [
      'Draw the line, not the element.',
      'Change the geometry itself.',
      'Distort the pixels, not just the path.',
      'Move along a curve, with tangent rotation.',
    ],
  },
  {
    file: 'VisualCanvasPanel.vue',
    cards: [
      'Animate data, not only coordinates.',
      'Burst, trail and fade — without a mutable particle engine.',
      'Emergent motion from simple rules.',
      'Waveforms as live data.',
      'Animate geometry in three dimensions.',
      'Procedural data becomes an instrument.',
    ],
  },
  {
    file: 'VisualInteractionsPanel.vue',
    cards: [
      'Values can be the animation.',
      'Drag it. Release it. Let physics finish.',
      'Let type become a visual element.',
      'Animate layout changes, not just transforms.',
    ],
  },
  {
    file: 'VisualScrollPanel.vue',
    cards: ['Scroll is another stream.'],
  },
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

for (const { file, cards } of checks) {
  const source = await readFile(resolve(panelsDirectory, file), 'utf8');
  const localeSection = file.replace(/\.vue$/, '').replace(/^./, (letter) => letter.toLowerCase());
  const localizedValues = Object.values(locale.app.view[localeSection]?.staticText ?? {});

  for (const card of cards) {
    const occurrences = localizedValues.filter((value) => value === card).length;
    assert(occurrences === 1, `${file}: expected one locale entry for "${card}", found ${occurrences}.`);
  }

  for (const [tag, closingTag] of [['UiRow', '</UiRow>'], ['UiCol', '</UiCol>']]) {
    const openingCount = source.match(new RegExp(`<${tag}\\b`, 'g'))?.length ?? 0;
    const closingCount = source.split(closingTag).length - 1;
    assert(openingCount === closingCount, `${file}: unbalanced ${tag} tags (${openingCount} open, ${closingCount} close).`);
  }

  const columns = [...source.matchAll(/<UiCol\b([^>]*)>/g)].map((match) => match[1]);
  for (const attributes of columns) {
    assert(/\bcols="12"/.test(attributes), `${file}: visual cards should use full-width cols="12" (${attributes.trim()}).`);
    assert(!/\b(?:sm|md|lg|xl)=/.test(attributes), `${file}: remove breakpoint column sizing to keep one card per row (${attributes.trim()}).`);
  }

  const refs = [...source.matchAll(/\bref="([A-Za-z_$][\w$]*)"/g)].map((match) => match[1]);
  const duplicateRefs = refs.filter((ref, index) => refs.indexOf(ref) !== index);
  assert(duplicateRefs.length === 0, `${file}: duplicate template refs: ${[...new Set(duplicateRefs)].join(', ')}.`);

  const ids = [...source.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
  const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);
  assert(duplicateIds.length === 0, `${file}: duplicate template IDs: ${[...new Set(duplicateIds)].join(', ')}.`);

  console.log(`✓ ${file}: ${cards.length} scene(s), balanced markup, full-width stage contract, unique refs and IDs`);
}


const showcase = await readFile(resolve(root, 'apps/docs/src/views/VisualShowcase.vue'), 'utf8');
const [layoutStyles, navigationStyles, scrollPanel, explorerStyles, explorerComponent] = await Promise.all([
  readFile(resolve(root, 'apps/docs/src/styles/views/visual-lab/_layout.scss'), 'utf8'),
  readFile(resolve(root, 'apps/docs/src/styles/views/visual-lab/_navigation.scss'), 'utf8'),
  readFile(resolve(panelsDirectory, 'VisualScrollPanel.vue'), 'utf8'),
  readFile(resolve(root, 'apps/docs/src/styles/views/visual-lab/_scene-explorer.scss'), 'utf8'),
  readFile(resolve(panelsDirectory, 'VisualLabSceneExplorer.vue'), 'utf8'),
]);
const styles = `${layoutStyles}\n${navigationStyles}`;
assert(/&__stage\s*\{[^}]*min-width:\s*0[^}]*overflow:\s*hidden/s.test(explorerStyles), '_scene-explorer.scss: the active stage must fill and clip within the available content width.');
assert(/&__preview\s*\{[^}]*min-width:\s*0/s.test(explorerStyles), '_scene-explorer.scss: active scene preview must be allowed to use the full content width.');
assert(/>\s*\*\s*\{\s*width:\s*100%/.test(explorerStyles), '_scene-explorer.scss: active scene content must fill the preview panel.');
assert(/role="tablist"[\s\S]*?role="tab"[\s\S]*?aria-selected=/.test(explorerComponent), 'VisualLabSceneExplorer.vue: scene switching must use accessible tabs.');
assert(/@keydown="onTabKeydown/.test(explorerComponent), 'VisualLabSceneExplorer.vue: scene tabs must support keyboard navigation.');
assert(/copy\.staticText\.copySnippet/.test(explorerComponent) && /navigator\.clipboard/.test(explorerComponent), 'VisualLabSceneExplorer.vue: code panel must expose a localized, working copy action.');
for (const file of ['VisualSvgPanel.vue', 'VisualCanvasPanel.vue', 'VisualInteractionsPanel.vue', 'VisualScrollPanel.vue']) {
  const source = await readFile(resolve(panelsDirectory, file), 'utf8');
  assert(/<VisualLabSceneExplorer\b/.test(source), `${file}: scenes must use the shared stage and source viewer.`);
  assert(/v-model="activeScene"/.test(source) && /:scenes="scenes"/.test(source), `${file}: selected scene state must be connected to the shared tab/code viewer.`);
}
for (const file of ['VisualSvgPanel.vue', 'VisualCanvasPanel.vue', 'VisualInteractionsPanel.vue']) {
  const source = await readFile(resolve(panelsDirectory, file), 'utf8');
  assert(/watch\(activeScene[\s\S]*?cleanupActiveScene\(\)/.test(source), `${file}: changing tabs must dispose the previous scene before mounting another.`);
  assert(/if \(kind !== activeScene.value\) return/.test(source), `${file}: stale asynchronous tab activation must be ignored.`);
}
assert(/:show-selector="false"/.test(scrollPanel), 'VisualScrollPanel.vue: a single scene should omit a redundant one-item tab bar.');
assert(!/<UiRow\s+align="start"\s+class="visual-lab__layout"/.test(showcase), 'VisualShowcase.vue: remove align="start" because it prevents the sidebar column from stretching alongside the scenes.');
assert(/\.visual-lab\s*\{[\s\S]*?&__layout\s*\{[^}]*align-items:\s*stretch/s.test(styles), '_visual-lab.scss: the layout row must stretch the sidebar column to the content height.');
assert(/\.visual-lab-nav\s*\{[^}]*position:\s*sticky/s.test(styles), '_visual-lab.scss: the desktop category panel must be sticky.');
assert(/\.visual-lab-nav\s*\{[^}]*max-height:\s*calc\(100vh - 96px\)/s.test(styles), '_visual-lab.scss: sticky sidebar must be constrained to the viewport height.');
assert(/\.visual-lab-nav\s*\{[^}]*overflow-y:\s*auto/s.test(styles), '_visual-lab.scss: long navigation must scroll inside the sticky panel.');
console.log('✓ VisualShowcase sidebar: sticky, viewport-bounded, independently scrollable, and parent column stretches to content height');

const homeView = await readFile(resolve(root, 'apps/docs/src/views/Home.vue'), 'utf8');
const landingPreview = await readFile(resolve(root, 'apps/docs/src/components/LandingLabPreview.vue'), 'utf8');
const landingPreviewStyles = await readFile(resolve(root, 'apps/docs/src/styles/components/landing-lab-preview.scss'), 'utf8');
assert(/<LandingLabPreview\b/.test(homeView), 'Home.vue: Visual Lab cards must use live LandingLabPreview components.');
assert(homeView.includes('class=\"home-lab-card__inspect\"'), 'Home.vue: each preview needs a direct, keyboard-accessible link to its full scene.');
for (const adapter of ['bindSvgPathMorph', 'bindCanvas', 'drawParticleConstellation', 'draggable']) {
  assert(landingPreview.includes(adapter), `LandingLabPreview.vue: expected the real ${adapter} integration.`);
}
for (const lifecycleContract of ['IntersectionObserver', 'MotionPreferences', 'onBeforeUnmount', 'preferences.destroy()']) {
  assert(landingPreview.includes(lifecycleContract), `LandingLabPreview.vue: missing animation lifecycle contract ${lifecycleContract}.`);
}
assert(landingPreview.includes('cleanups.splice(0).reverse()'), 'LandingLabPreview.vue: preview cleanups should be executed in reverse acquisition order.');
assert(landingPreviewStyles.includes('@media (prefers-reduced-motion: reduce)'), 'landing-lab-preview.scss: include reduced-motion styling.');
assert(!homeView.includes('home-lab-art-particle') && !homeView.includes('home-lab-art-svg'), 'Home.vue: remove the old CSS-only gallery artwork.');
console.log('✓ Home Visual Lab previews: SVG morph, Canvas particles, draggable motion, visibility pause, reduced-motion handling and teardown');

console.log('Visual Lab markup checks passed.');
