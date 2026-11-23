/**
 * Plumbing shared by the headless real-browser benchmark runners: a static file server, the Chromium launcher,
 * self-hosted copies of the comparison libraries, and Chrome DevTools Protocol counters.
 */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { median as basicsMedian } from '@re-code/basics/number/median';
import { build as esbuild } from 'esbuild';
import { chromium } from 'playwright';

export const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * Pinned comparison libraries, as the Benchmark Lab imports them from the CDN. The runner answers these exact URLs
 * with a bundle of the same version installed from npm (see `devDependencies`), so a run needs no network.
 */
export const competitorLibraries = Object.freeze([
  { id: 'gsap', version: '3.15.0', cdnUrl: 'https://esm.sh/gsap@3.15.0', entry: 'node_modules/gsap/index.js' },
  {
    id: 'animejs',
    version: '4.5.0',
    cdnUrl: 'https://esm.sh/animejs@4.5.0',
    entry: 'node_modules/animejs/dist/modules/index.js',
  },
]);

const CONTENT_TYPES = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.woff2', 'font/woff2'],
  ['.woff', 'font/woff'],
  ['.ttf', 'font/ttf'],
  ['.png', 'image/png'],
  ['.ico', 'image/x-icon'],
]);

/**
 * Serve a directory over HTTP on a free loopback port. `/` maps to `index.html`; unknown paths are a 404 (the docs app
 * uses a hash router, so no history fallback is needed).
 */
export async function serveDirectory(directory) {
  const server = createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://127.0.0.1').pathname);
      const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
      const file = path.resolve(directory, relative);
      if (file !== directory && !file.startsWith(directory + path.sep)) {
        response.writeHead(403).end('Forbidden');
        return;
      }
      const info = await stat(file);
      if (!info.isFile()) throw new Error('Not a file');
      response.writeHead(200, {
        'content-type': CONTENT_TYPES.get(path.extname(file)) ?? 'application/octet-stream',
        'cache-control': 'no-store',
      });
      response.end(await readFile(file));
    } catch {
      response.writeHead(404).end('Not found');
    }
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address !== 'string', 'Expected the static server to bind to a TCP port.');
  return {
    origin: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

/**
 * Build the documentation app with Vite into a temporary directory (base `/`, no type check: the contract checks and
 * `npm run build --workspace=re-flux-docs` own that). Returns the directory and a disposer.
 */
export async function buildDocsApp() {
  const outDir = await mkdtemp(path.join(tmpdir(), 're-flux-docs-'));
  const previousBase = process.env.VITE_BASE_PATH;
  process.env.VITE_BASE_PATH = '/';
  try {
    const { build } = await import('vite');
    await build({
      root: path.join(repositoryRoot, 'apps/docs'),
      configFile: path.join(repositoryRoot, 'apps/docs/vite.config.ts'),
      logLevel: 'warn',
      build: { outDir, emptyOutDir: true, reportCompressedSize: false },
    });
  } catch (error) {
    await rm(outDir, { recursive: true, force: true });
    throw error;
  } finally {
    if (previousBase === undefined) Reflect.deleteProperty(process.env, 'VITE_BASE_PATH');
    else process.env.VITE_BASE_PATH = previousBase;
  }
  return { directory: outDir, dispose: () => rm(outDir, { recursive: true, force: true }) };
}

/** Bundle the installed copy of each comparison library into one minified browser ES module. */
export async function bundleCompetitorLibraries() {
  const bundles = new Map();
  for (const library of competitorLibraries) {
    const result = await esbuild({
      entryPoints: [path.join(repositoryRoot, library.entry)],
      bundle: true,
      format: 'esm',
      platform: 'browser',
      target: 'es2022',
      minify: true,
      write: false,
      logLevel: 'silent',
    });
    const output = result.outputFiles[0]?.text;
    assert.ok(output, `Expected esbuild to bundle ${library.id}.`);
    const installed = JSON.parse(
      await readFile(path.join(repositoryRoot, 'node_modules', library.id, 'package.json'), 'utf8'),
    );
    assert.equal(
      installed.version,
      library.version,
      `${library.id}@${installed.version} is installed but the Benchmark Lab pins ${library.version}; update the pins together.`,
    );
    bundles.set(library.cdnUrl, output);
  }
  return bundles;
}

/**
 * Answer the Benchmark Lab's CDN imports with the self-hosted bundles; any other request to the CDN host is refused
 * so a run can never silently depend on the network. Returns what was actually served for the report.
 */
export async function routeCompetitorLibraries(context, bundles) {
  const served = new Set();
  await context.route(/^https:\/\/esm\.sh\//, async (route) => {
    const url = route.request().url().split('?')[0];
    const source = bundles.get(url);
    if (source === undefined) {
      await route.abort('blockedbyclient');
      return;
    }
    served.add(url);
    await route.fulfill({
      status: 200,
      contentType: 'text/javascript; charset=utf-8',
      headers: { 'access-control-allow-origin': '*' },
      body: source,
    });
  });
  return served;
}

/**
 * Chromium flags that keep frame pacing predictable in headless runs. They stop background throttling heuristics from
 * slowing `requestAnimationFrame`; they do not turn a headless compositor into a real display.
 */
export const chromiumArguments = Object.freeze([
  '--disable-background-timer-throttling',
  '--disable-renderer-backgrounding',
  '--disable-backgrounding-occluded-windows',
]);

export async function launchChromium({ headless = true } = {}) {
  try {
    return await chromium.launch({ headless, args: [...chromiumArguments] });
  } catch (error) {
    throw new Error('Chromium is not installed for Playwright. Run "npx playwright install chromium" first.', {
      cause: error,
    });
  }
}

/** Read the Chrome DevTools `Performance` domain counters into a plain object keyed by metric name. */
export async function readPerformanceMetrics(session) {
  const { metrics } = await session.send('Performance.getMetrics');
  return Object.fromEntries(metrics.map((metric) => [metric.name, metric.value]));
}

/**
 * Counters that matter for layout thrash: how many style recalculations and layouts happened between two reads, and how
 * long they took (seconds, as reported by Chrome).
 */
export function diffLayoutMetrics(before, after) {
  const keys = [
    'RecalcStyleCount',
    'LayoutCount',
    'RecalcStyleDuration',
    'LayoutDuration',
    'ScriptDuration',
    'TaskDuration',
  ];
  return Object.fromEntries(keys.map((key) => [key, (after[key] ?? 0) - (before[key] ?? 0)]));
}

/** Serve in-memory files (`{ '/path': { body, contentType } }`) on a free loopback port. */
export async function serveFiles(files) {
  const server = createServer((request, response) => {
    const pathname = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
    const file = files[pathname === '/' ? '/index.html' : pathname];
    if (!file) {
      response.writeHead(404).end('Not found');
      return;
    }
    response.writeHead(200, { 'content-type': file.contentType, 'cache-control': 'no-store' });
    response.end(file.body);
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address !== 'string', 'Expected the static server to bind to a TCP port.');
  return {
    origin: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

/** Median of a list of numbers (null for an empty list). */
export function median(values) {
  return values.length === 0 ? null : basicsMedian(values);
}
