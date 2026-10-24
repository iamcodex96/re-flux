import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFile(resolve(root, path), 'utf8');

const layout = await read('apps/docs/src/components/Playground/PlaygroundLayout.vue');
const shellStyles = await read('apps/docs/src/styles/components/playground-layout.scss');
const playgroundStyles = await read('apps/docs/src/styles/views/playgrounds/_layout.scss');
const playgroundIndex = await read('apps/docs/src/styles/views/_playgrounds.scss');
const locale = JSON.parse(await read('apps/docs/src/locales/en.json'));

assert.ok(layout.includes('playground-hero'), 'Playground needs a prominent, localized page hero.');
assert.ok(layout.includes('playground-directory'), 'Playground needs an integrated module directory above the workbench.');
assert.ok(layout.includes('playground-module-link'), 'Playground module links must use the redesigned tab-card treatment.');
assert.ok(layout.includes('playground-workspace'), 'Playground needs a clear workbench boundary.');
assert.ok(layout.includes('activePage.description'), 'The current module description must remain visible.');
assert.equal((layout.match(/name: 'playground-[^']+'/g) ?? []).length, 11, 'The redesign must preserve navigation to all eleven playground modules.');
assert.ok(shellStyles.includes('.playground-module-group--reactive-motion'), 'Reactive motion modules need a dedicated denser group layout.');
assert.ok(shellStyles.includes('prefers-reduced-motion: reduce'), 'Navigation transitions must respect reduced-motion preferences.');
assert.equal((layout.match(/<\/template>/g) ?? []).length, 1, 'PlaygroundLayout.vue must contain one valid root template and no nested/stray template close.');
assert.ok(shellStyles.includes('grid-template-columns: minmax(0, 1fr) minmax(0, 1.75fr)'), 'Desktop module directory must group core, reactive, and rendering modules.');
assert.ok(shellStyles.includes('$rx-breakpoint-header-compact'), 'Playground layout must reflow before the tablet breakpoint.');
for (const key of ['workspaceEyebrow', 'activeModule', 'interactiveWorkspace', 'exploreModules', 'moduleSelectionHint', 'workbench']) {
  assert.ok(typeof locale.app.view.playgroundLayout.staticText[key] === 'string', `Missing localized playground shell copy: ${key}`);
}
assert.ok(playgroundIndex.includes("@use './playgrounds/layout'"), 'Shared workbench route styles must be included globally.');
assert.ok(playgroundStyles.includes('.playground-route > .ui-row'), 'Animation and timeline routes must use the shared workbench grid.');
assert.ok(playgroundStyles.includes('.playground-route--easings > .ui-row'), 'Easings route must use the shared route grid.');
assert.ok(playgroundStyles.includes('.playground-route--api > .ui-row'), 'API route must use the shared route grid.');
assert.equal(locale.app.view.playgroundLayout.staticText.moduleIndex, 'MODULE INDEX', 'Module index label must remain localised.');

for (const [file, className] of [
  ['apps/docs/src/views/AnimationPlayground.vue', 'playground-route--animation'],
  ['apps/docs/src/views/TimelinePlayground.vue', 'playground-route--timeline'],
  ['apps/docs/src/views/EasingsPlayground.vue', 'playground-route--easings'],
  ['apps/docs/src/views/ApiPlayground.vue', 'playground-route--api'],
]) {
  const source = await read(file);
  assert.ok(source.includes(className), `${file}: missing ${className} workbench wrapper.`);
  assert.ok(!source.includes('<UiContainer'), `${file}: nested page container causes duplicated gutters and vertical spacing.`);
}

console.log('Playground layout contract checks passed.');
