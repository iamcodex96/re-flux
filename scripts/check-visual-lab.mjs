import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const panelsDirectory = resolve(root, 'apps/docs/src/components/VisualLab');
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

  for (const card of cards) {
    const occurrences = source.split(card).length - 1;
    assert(occurrences === 1, `${file}: expected one occurrence of "${card}", found ${occurrences}.`);
  }

  for (const [tag, closingTag] of [['v-row', '</v-row>'], ['v-col', '</v-col>']]) {
    const openingCount = source.match(new RegExp(`<${tag}\\b`, 'g'))?.length ?? 0;
    const closingCount = source.split(closingTag).length - 1;
    assert(openingCount === closingCount, `${file}: unbalanced ${tag} tags (${openingCount} open, ${closingCount} close).`);
  }

  const columns = [...source.matchAll(/<v-col\b([^>]*)>/g)].map((match) => match[1]);
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

  console.log(`✓ ${file}: ${cards.length} unique scene card(s), balanced markup, full-width layout, unique refs and IDs`);
}


const showcase = await readFile(resolve(root, 'apps/docs/src/views/VisualShowcase.vue'), 'utf8');
const styles = await readFile(resolve(root, 'apps/docs/src/styles/visual-lab.css'), 'utf8');
assert(!/<v-row\s+align="start"\s+class="visual-lab__layout"/.test(showcase), 'VisualShowcase.vue: remove align="start" because it prevents the sidebar column from stretching alongside the scenes.');
assert(/\.visual-lab__layout\s*\{[^}]*align-items:\s*stretch/s.test(styles), 'visual-lab.css: the layout row must stretch the sidebar column to the content height.');
assert(/\.visual-lab-nav\s*\{[^}]*position:\s*sticky/s.test(styles), 'visual-lab.css: the desktop category panel must be sticky.');
assert(/\.visual-lab-nav\s*\{[^}]*max-height:\s*calc\(100vh - 96px\)/s.test(styles), 'visual-lab.css: sticky sidebar must be constrained to the viewport height.');
assert(/\.visual-lab-nav\s*\{[^}]*overflow-y:\s*auto/s.test(styles), 'visual-lab.css: long navigation must scroll inside the sticky panel.');
console.log('✓ VisualShowcase sidebar: sticky, viewport-bounded, independently scrollable, and parent column stretches to content height');

console.log('Visual Lab markup checks passed.');
