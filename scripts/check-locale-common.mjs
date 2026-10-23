import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LOCALE_REFERENCE_PREFIX, resolveLocaleReferences } from './lib/locale.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const locale = JSON.parse(await readFile(resolve(root, 'apps/docs/src/locales/en.json'), 'utf8'));
const common = locale.app?.view?.common;
assert.ok(common && typeof common === 'object', 'Shared locale copy must live under app.view.common.');

const literalOccurrences = new Map();
const references = [];
function collect(value, path = []) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => collect(item, [...path, String(index)]));
    return;
  }
  if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) collect(item, [...path, key]);
    return;
  }
  if (typeof value !== 'string') return;

  if (value.startsWith(LOCALE_REFERENCE_PREFIX)) {
    assert.match(value, /^@ref:app\.view\.common\./, `Locale reference must target common copy: ${path.join('.')}`);
    references.push({ value, path: path.join('.') });
    return;
  }

  const locations = literalOccurrences.get(value) ?? [];
  locations.push(path.join('.'));
  literalOccurrences.set(value, locations);
}
collect(locale);

const duplicateLiterals = [...literalOccurrences.entries()].filter(([, locations]) => locations.length > 1);
assert.deepEqual(
  duplicateLiterals,
  [],
  `Repeated literal copy must be externalized to common: ${duplicateLiterals.map(([value, paths]) => `${JSON.stringify(value)} at ${paths.join(', ')}`).join('; ')}`,
);
assert.ok(references.length > 0, 'Locale must contain shared-copy references.');

const resolvedLocale = resolveLocaleReferences(locale);
assert.ok(resolvedLocale?.app?.view?.common, 'Locale references must resolve to the shared copy section.');
assert.equal(resolvedLocale.app.view.docs.ui.installCommand, 'npm install @re-code/flux rxjs');

const commonValueCount = Object.values(common).reduce((total, group) => {
  assert.ok(group && typeof group === 'object' && !Array.isArray(group), 'Common copy groups must be objects.');
  return total + Object.keys(group).length;
}, 0);

console.log(`✓ Common locale contains ${commonValueCount} shared strings and ${references.length} references; no repeated literal copy remains.`);
