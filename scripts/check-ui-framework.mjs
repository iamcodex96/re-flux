import { readFile, readdir } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const docsPackage = JSON.parse(await readFile(resolve(root, 'apps/docs/package.json'), 'utf8'));
const lock = JSON.parse(await readFile(resolve(root, 'package-lock.json'), 'utf8'));
const viteConfig = await readFile(resolve(root, 'apps/docs/vite.config.ts'), 'utf8');
const main = await readFile(resolve(root, 'apps/docs/src/main.ts'), 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(!docsPackage.dependencies?.vuetify, 'The docs package must not depend on Vuetify.');
assert(!docsPackage.devDependencies?.['vite-plugin-vuetify'], 'The docs package must not depend on the Vuetify Vite plugin.');
assert(!Object.keys(lock.packages).some((name) => name === 'node_modules/vuetify' || name === 'node_modules/vite-plugin-vuetify' || name.startsWith('node_modules/@vuetify/')), 'The lockfile still contains packages owned by Vuetify.');
assert(!/vuetify|vite-plugin-vuetify/i.test(viteConfig), 'The Vite config still references the removed framework.');
assert(!/from\s+['"]vuetify|vuetify\/styles|createVuetify|useTheme\(/i.test(main), 'The application entry still initializes the removed framework.');

async function walk(directory) {
  const results = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) results.push(...await walk(path));
    else if (/\.(vue|ts|scss)$/.test(entry.name)) results.push(path);
  }
  return results;
}

const sourceRoot = resolve(root, 'apps/docs/src');
const files = await walk(sourceRoot);
for (const file of files) {
  const source = await readFile(file, 'utf8');
  const path = relative(root, file);
  assert(!/<\/?v-[a-z][\w-]*\b/i.test(source), `${path}: legacy framework component tag remains.`);
  assert(!/from\s+['"][^'"]*vuetify|--v-theme-/i.test(source), `${path}: legacy framework import or theme token remains.`);
}

assert(!await exists(resolve(sourceRoot, 'plugins/vuetify.ts')), 'The old framework plugin file still exists.');
console.log(`UI framework removal checks passed (${files.length} source files inspected).`);

async function exists(path) {
  try { await readFile(path); return true; }
  catch { return false; }
}
