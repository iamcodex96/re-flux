import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { createGithubPagesRouteFallbackHtml } from './lib/github-pages-route-fallback.mjs';

const [router, app, viteConfig] = await Promise.all([
  readFile(new URL('../apps/docs/src/router/index.ts', import.meta.url), 'utf8'),
  readFile(new URL('../apps/docs/src/App.vue', import.meta.url), 'utf8'),
  readFile(new URL('../apps/docs/vite.config.ts', import.meta.url), 'utf8'),
]);

assert.match(router, /createWebHashHistory\(import\.meta\.env\.BASE_URL\)/, 'Router history must respect Vite base path.');
assert.match(router, /path:\s*'\/benchmarks',\s*alias:\s*'\/bench',\s*name:\s*'benchmarks',\s*component:\s*\(\)\s*=>\s*import\('\.\.\/views\/BrowserBenchmarks\.vue'\)/, 'Benchmark route and /bench alias must resolve to BrowserBenchmarks.vue.');
assert.match(router, /path:\s*'\/docs',[\s\S]*?children:\s*\[[\s\S]*?path:\s*''\s*,\s*redirect:\s*\{\s*name:\s*'docs-introduction'\s*\}/, 'Docs root must redirect through a nested empty child route.');
assert.match(router, /name:\s*'docs-introduction'/, 'Docs introduction route must exist.');
assert.match(app, /to:\s*'\/docs'/, 'Primary navigation must link to Docs.');
assert.match(app, /to:\s*'\/benchmarks'/, 'Primary navigation must link to Benchmarks.');
assert.match(app, /if \(to === '\/benchmarks'\) return route\.name === 'benchmarks'/, 'Benchmark navigation must remain active on its route alias.');
assert.match(viteConfig, /githubPagesRouteFallback/, 'Production build must emit the GitHub Pages route fallback.');

function simulateRedirect(html, pathname, search = '', hash = '') {
  const match = html.match(/<script>([\s\S]*?)<\/script>/i);
  assert.ok(match, 'Fallback HTML must contain its redirect script.');
  const location = { pathname, search, hash, redirectedTo: null, replace(url) { this.redirectedTo = url; } };
  runInNewContext(match[1], { window: { location } });
  return location.redirectedTo;
}

const pagesFallback = createGithubPagesRouteFallbackHtml('/re-flux/');
assert.equal(simulateRedirect(pagesFallback, '/re-flux/docs'), '/re-flux/#/docs', 'Clean Docs URL must redirect to the hash route.');
assert.equal(simulateRedirect(pagesFallback, '/re-flux/docs/interactions'), '/re-flux/#/docs/interactions', 'Nested Docs URLs must redirect to their hash route.');
assert.equal(simulateRedirect(pagesFallback, '/re-flux/benchmarks'), '/re-flux/#/benchmarks', 'Clean benchmark URL must redirect to the hash route.');
assert.equal(simulateRedirect(pagesFallback, '/re-flux/bench'), '/re-flux/#/bench', 'Clean short benchmark URL must redirect to its hash alias.');
assert.equal(simulateRedirect(pagesFallback, '/re-flux'), '/re-flux/', 'Base path without trailing slash must normalize to the deployed app root.' );
assert.equal(simulateRedirect(pagesFallback, '/re-flux/docs', '?section=api', '#usage'), '/re-flux/#/docs?section=api#usage', 'Query and anchor state must survive the fallback.');
assert.equal(simulateRedirect(pagesFallback, '/re-flux/assets/missing.js'), null, 'Missing static assets must not redirect into the SPA.');
assert.equal(simulateRedirect(createGithubPagesRouteFallbackHtml('/'), '/docs'), '/#/docs', 'Root-host deployment fallback must work too.');

console.log('Route delivery checks passed: Docs and Benchmarks in-app routes, nested Docs redirect, GitHub Pages clean-URL fallback, and static-asset guard.');
