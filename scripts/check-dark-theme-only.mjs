import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('../', import.meta.url)));
const read = (path) => readFile(resolve(root, path), 'utf8');
const [app, html, tokens, appStyles, localeSource, designSystem] = await Promise.all([
  read('apps/docs/src/App.vue'),
  read('apps/docs/index.html'),
  read('apps/docs/src/styles/abstracts/_tokens.scss'),
  read('apps/docs/src/styles/components/app.scss'),
  read('apps/docs/src/locales/en.json'),
  read('guidelines/DESIGN_SYSTEM.md'),
]);
const locale = JSON.parse(localeSource);
const navigationCopy = locale.app?.view?.navigation ?? {};

assert.match(html, /<html\s+lang="en"\s+data-rx-theme="dark"\s+style="color-scheme:\s*dark;"/i,
  'The document root must select the dark palette before the app renders.');
assert.match(html, /<meta\s+name="theme-color"\s+content="#0c0e13"/i,
  'The browser chrome color must match the dark brand background.');
assert.doesNotMatch(app, /site-theme-toggle|switchToLightTheme|switchToDarkTheme|toggleTheme|ThemeName|matchMedia\('\(prefers-color-scheme:\s*light\)'\)|re-flux-theme/,
  'The app must not expose or restore a theme-switching system.');
assert.doesNotMatch(appStyles, /site-theme-toggle/,
  'Styles for the removed theme toggle must not remain.');
assert.doesNotMatch(tokens, /data-rx-theme=['"]light['"]|\.rx-theme--light|color-scheme:\s*light/i,
  'The design tokens must not define a light theme.');
assert.doesNotMatch(tokens, /:root,\s*\.rx-theme--dark,\s*\.rx-theme--light/,
  'Semantic tokens must not include the removed light theme class.');
assert.equal(navigationCopy.switchToLightTheme, undefined, 'Unused light-theme locale text must be removed.');
assert.equal(navigationCopy.switchToDarkTheme, undefined, 'Unused dark-theme toggle locale text must be removed.');
assert.match(designSystem, /single dark theme/i, 'The design-system guideline must describe the supported dark-only theme.');
assert.doesNotMatch(designSystem, /Check both themes|rx-theme--light/,
  'The design-system guideline must not instruct contributors to support the removed light theme.');

console.log('Dark-theme-only checks passed: no theme toggle, light palette, or stale theme copy remains.');
