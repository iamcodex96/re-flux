import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const html = await readFile(resolve(root, 'apps/docs/dist/404.html'), 'utf8');
const match = html.match(/<script>([\s\S]*?)<\/script>/i);
assert.ok(match, 'Built GitHub Pages 404.html must contain its fallback script.');
const baseMatch = match[1].match(/var base = ("(?:\\.|[^"\\])*");/);
assert.ok(baseMatch, 'Built fallback script must include the normalized Vite base path.');
const base = JSON.parse(baseMatch[1]);

function run(pathname, search = '', hash = '') {
  const location = { pathname, search, hash, redirectedTo: null, replace(url) { this.redirectedTo = url; } };
  runInNewContext(match[1], { window: { location } });
  return location.redirectedTo;
}

const deployedBase = base === '/' ? '/' : base;
const routePath = (route) => deployedBase === '/' ? route : `${deployedBase}${route.slice(1)}`;
assert.equal(run(routePath('/docs')), `${base}#/docs`, 'Built fallback must route clean documentation URLs.');
assert.equal(run(routePath('/benchmarks')), `${base}#/benchmarks`, 'Built fallback must route clean benchmark URLs.');
assert.equal(run(routePath('/docs/interactions'), '?example=1', '#section'), `${base}#/docs/interactions?example=1#section`, 'Built fallback must preserve query and anchor state.');
assert.equal(run(routePath('/assets/missing.js')), null, 'Built fallback must not redirect missing static assets.');

console.log(`Built route fallback passed for base ${JSON.stringify(base)}: Docs, Benchmarks, query/hash preservation and static asset guard.`);
