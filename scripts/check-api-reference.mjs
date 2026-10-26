import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { resolveLocaleReferences } from './lib/locale.mjs';

const root = new URL('../', import.meta.url);
const [indexSource, localeSource, componentSource] = await Promise.all([
  readFile(new URL('src/index.ts', root), 'utf8'),
  readFile(new URL('apps/docs/src/locales/en.json', root), 'utf8'),
  readFile(new URL('apps/docs/src/components/DocsComponents/DocsApiReference.vue', root), 'utf8'),
]);
const locale = resolveLocaleReferences(JSON.parse(localeSource));
const api = locale.app?.view?.docs?.apiReference;
assert.ok(api && Array.isArray(api.entries) && Array.isArray(api.categories), 'API entries and categories must live in the locale file.');
assert.match(api.importNotice, /flow-field/, 'API reference import guidance must include the dedicated flow-field subpath.');

const rootRuntimeExports = new Set();
for (const match of indexSource.matchAll(/export\s+(?!type\b)\{([\s\S]*?)\}\s+from/g)) {
  for (const specifier of match[1].split(',')) {
    const name = specifier.trim().split(/\s+as\s+/)[0];
    if (name && !name.startsWith('type ')) rootRuntimeExports.add(name);
  }
}

const exportNames = api.entries.map((entry) => entry.exportName);
const declaredExports = new Set(exportNames);
assert.equal(declaredExports.size, exportNames.length, 'Each root runtime export must appear only once in the API catalog.');
assert.deepEqual(
  [...rootRuntimeExports].filter((name) => !declaredExports.has(name)).sort(),
  [],
  'The locale API catalog must include every runtime export from src/index.ts.',
);
assert.deepEqual(
  [...declaredExports].filter((name) => !rootRuntimeExports.has(name)).sort(),
  [],
  'The locale API catalog must not list nonexistent root runtime exports.',
);
const categoryKeys = new Set(api.categories.filter((item) => item.value !== 'all').map((item) => item.value));
for (const entry of api.entries) {
  assert.ok(entry.name && entry.exportName && entry.signature && entry.result && entry.description && entry.importPath, 'API entries must have their visible metadata in locale data.');
  assert.ok(categoryKeys.has(entry.category), `Unknown localized API category for ${entry.exportName}: ${entry.category}`);
}
assert.match(componentSource, /text\.value\.entries/, 'API reference component must read entries from the locale.');
assert.doesNotMatch(componentSource, /description:\s*['"]/, 'User-facing API descriptions must not be hard-coded in the Vue component.');
assert.doesNotMatch(componentSource, /const entries\s*:\s*ApiEntry\[\]\s*=/, 'API entry arrays must come from locale data.');
assert.doesNotMatch(componentSource, /const categories\s*:/, 'API category labels must come from locale data.');
console.log(`✓ API locale catalog contains all ${rootRuntimeExports.size} root runtime exports.`);
