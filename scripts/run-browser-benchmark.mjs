/**
 * Headless real-browser benchmark runner. Opens the public Benchmark Lab (`/#/benchmarks`) of the built documentation
 * app in Chromium, runs the selected scenarios with the page's own controls, and writes the page's own JSON export
 * (`schemaVersion: 2`) for every scenario into one suite file.
 *
 * Results are descriptive only. This script never compares against a threshold and exits 0 on slow results; it exits
 * non-zero only when a run cannot be produced at all (build failure, page error, timeout).
 *
 *   node scripts/run-browser-benchmark.mjs --out reports/browser.json
 *   node scripts/run-browser-benchmark.mjs --out reports/browser.json --scenarios dom,svg,canvas,engine-only --targets 1000
 *
 * Options:
 *   --suite <name>      lab (default): the Benchmark Lab scenarios below; adapters: the layout/style-recalculation
 *                       probe of flip(), animate(), animateNumber() and followSvgPath$ (PERF-010)
 *   --out <file>        where to write the suite JSON (required unless --help)
 *   --scenarios <list>  comma list of: dom, svg, canvas (shared-renderer), engine-only, per-target-dom
 *                       (default dom,svg,canvas)
 *   --targets <n>       target count: 100, 250, 500, 1000, 2500 or 5000 (default 500)
 *   --duration <ms>     animation duration: 1000, 1500, 2000 or 2500 (default 1500)
 *   --dist <dir>        reuse an already built docs app (built with base "/") instead of building one
 *   --cdn               load GSAP / Anime.js from esm.sh like a visitor would, instead of the pinned npm copies
 *   --headed            run with a visible window (frame pacing then follows the real display)
 *   --trace <file>      also record a Chrome performance trace of the whole run (large; for investigation)
 *   --counts <list>     adapters suite: element counts (default 100,1000)
 *   --repetitions <n>   adapters suite: repetitions per case (default 7)
 *   --cases <list>      adapters suite: any of sync, frames, paths (default all three)
 *   --timeout <ms>      per-scenario timeout (default 600000)
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BUSY_LOAD_PER_CORE, systemLoad } from '../benchmarks/benchmark-utils.mjs';
import {
  buildDocsApp,
  bundleCompetitorLibraries,
  chromiumArguments,
  competitorLibraries,
  launchChromium,
  routeCompetitorLibraries,
  serveDirectory,
} from './lib/browser-bench.mjs';
import { runLayoutProbeSuite } from './lib/layout-probe-suite.mjs';

const SCENARIOS = new Map([
  ['dom', { scenario: 'shared-renderer', renderer: 'dom' }],
  ['svg', { scenario: 'shared-renderer', renderer: 'svg' }],
  ['canvas', { scenario: 'shared-renderer', renderer: 'canvas' }],
  ['engine-only', { scenario: 'engine-only', renderer: 'none' }],
  ['per-target-dom', { scenario: 'per-target-dom', renderer: 'dom' }],
]);
const TARGET_COUNTS = [100, 250, 500, 1000, 2500, 5000];
const DURATIONS_MS = [1000, 1500, 2000, 2500];

export function parseArguments(argv) {
  const options = {
    suite: 'lab',
    out: null,
    counts: [100, 1000],
    repetitions: 7,
    cases: ['sync', 'frames', 'paths'],
    scenarios: ['dom', 'svg', 'canvas'],
    targets: 500,
    duration: 1500,
    dist: null,
    cdn: false,
    headed: false,
    trace: null,
    timeout: 600_000,
    help: false,
  };
  const take = (index, name) => {
    const value = argv[index + 1];
    if (value === undefined || value.startsWith('--')) throw new RangeError(`${name} requires a value.`);
    return value;
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const [flag, inline] = argument.includes('=')
      ? [argument.slice(0, argument.indexOf('=')), argument.slice(argument.indexOf('=') + 1)]
      : [argument, undefined];
    const value = () => {
      if (inline !== undefined) return inline;
      const next = take(index, flag);
      index += 1;
      return next;
    };
    switch (flag) {
      case '--suite':
        options.suite = value();
        break;
      case '--counts':
        options.counts = value()
          .split(',')
          .map((item) => Number(item.trim()));
        break;
      case '--cases':
        options.cases = value()
          .split(',')
          .map((item) => item.trim());
        break;
      case '--repetitions':
        options.repetitions = Number(value());
        break;
      case '--out':
        options.out = path.resolve(value());
        break;
      case '--scenarios':
        options.scenarios = value()
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean);
        break;
      case '--targets':
        options.targets = Number(value());
        break;
      case '--duration':
        options.duration = Number(value());
        break;
      case '--dist':
        options.dist = path.resolve(value());
        break;
      case '--trace':
        options.trace = path.resolve(value());
        break;
      case '--timeout':
        options.timeout = Number(value());
        break;
      case '--cdn':
        options.cdn = true;
        break;
      case '--headed':
        options.headed = true;
        break;
      case '--help':
      case '-h':
        options.help = true;
        break;
      default:
        throw new RangeError(`Unknown option ${argument}. Run with --help.`);
    }
  }
  if (options.help) return options;
  if (options.out === null) throw new RangeError('--out <file> is required.');
  if (options.suite !== 'lab' && options.suite !== 'adapters') throw new RangeError('--suite must be lab or adapters.');
  if (!options.counts.every((count) => Number.isInteger(count) && count > 0))
    throw new RangeError('--counts must be positive integers.');
  if (!options.cases.every((item) => ['sync', 'frames', 'paths'].includes(item)))
    throw new RangeError('--cases must be sync, frames and/or paths.');
  if (!Number.isInteger(options.repetitions) || options.repetitions < 1)
    throw new RangeError('--repetitions must be a positive integer.');
  if (options.scenarios.length === 0) throw new RangeError('--scenarios needs at least one scenario.');
  for (const id of options.scenarios) {
    if (!SCENARIOS.has(id))
      throw new RangeError(`Unknown scenario "${id}". Choose from ${[...SCENARIOS.keys()].join(', ')}.`);
  }
  if (!TARGET_COUNTS.includes(options.targets))
    throw new RangeError(`--targets must be one of ${TARGET_COUNTS.join(', ')}.`);
  if (!DURATIONS_MS.includes(options.duration))
    throw new RangeError(`--duration must be one of ${DURATIONS_MS.join(', ')}.`);
  if (!Number.isFinite(options.timeout) || options.timeout <= 0)
    throw new RangeError('--timeout must be a positive number.');
  return options;
}

function gitRevision() {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
}

/** Run one Lab configuration in a fresh page and return the page's own JSON export. */
async function runScenario(context, origin, id, options, log) {
  const { scenario, renderer } = SCENARIOS.get(id);
  const page = await context.newPage();
  const problems = [];
  page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
  try {
    await page.goto(`${origin}/#/benchmarks`, { waitUntil: 'load' });
    const controls = page.locator('.browser-benchmarks__controls select');
    await controls.first().waitFor({ state: 'visible' });
    await controls.nth(0).selectOption(scenario);
    if (scenario === 'shared-renderer') await controls.nth(1).selectOption(renderer);
    const selects = await controls.count();
    await controls.nth(selects - 2).selectOption(String(options.targets));
    await controls.nth(selects - 1).selectOption(String(options.duration));

    log(`  running "${id}" (${scenario}, ${renderer}, ${options.targets} targets, ${options.duration} ms)...`);
    const startedAt = Date.now();
    await page.locator('.browser-benchmarks__primary-button').click();
    // The calibration note only renders once the final report exists; an error banner means the run gave up.
    const finished = page.locator('.browser-benchmarks__calibration-note, .browser-benchmarks__error');
    await finished.first().waitFor({ state: 'visible', timeout: options.timeout });
    const error = page.locator('.browser-benchmarks__error');
    if (await error.isVisible()) throw new Error(`Benchmark Lab reported: ${(await error.innerText()).trim()}`);

    const downloadPromise = page.waitForEvent('download', { timeout: 30_000 });
    await page.locator('.browser-benchmarks__actions .browser-benchmarks__secondary-button').first().click();
    const download = await downloadPromise;
    const exported = await readFile(await download.path(), 'utf8');
    const report = JSON.parse(exported);
    assert.equal(report.schemaVersion, 2, 'The Benchmark Lab export is not schemaVersion 2.');
    assert.equal(report.configuration.scenario, scenario);
    assert.equal(report.results.length, 3, 'Expected results for all three engines.');
    for (const result of report.results) {
      assert.ok(result.runs.length > 0, `${result.id} produced no measured runs.`);
    }
    log(`  "${id}" finished in ${((Date.now() - startedAt) / 1000).toFixed(1)} s`);
    if (problems.length > 0) report.runnerPageErrors = problems;
    return { id, report };
  } finally {
    await page.close();
  }
}

/** The `adapters` suite: style-recalculation and layout counters for the DOM/SVG helpers (PERF-010). */
async function runAdaptersSuite(options, log, loadAtStart) {
  const browser = await launchChromium({ headless: !options.headed });
  try {
    if (options.trace !== null) {
      await browser.startTracing(undefined, {
        path: options.trace,
        screenshots: false,
        categories: [
          'devtools.timeline',
          'disabled-by-default-devtools.timeline',
          'disabled-by-default-devtools.timeline.stack',
          'blink.user_timing',
        ],
      });
    }
    const probe = await runLayoutProbeSuite({
      browser,
      log,
      counts: options.counts,
      repetitions: options.repetitions,
      cases: options.cases,
    });
    if (options.trace !== null) await browser.stopTracing();
    const report = {
      benchmark: 're-flux-browser-adapter-layout-probe',
      schemaVersion: 2,
      kind: 'adapter-probe',
      createdAt: new Date().toISOString(),
      runner: {
        script: 'scripts/run-browser-benchmark.mjs --suite adapters',
        gitRevision: gitRevision(),
        headless: !options.headed,
        browser: { name: 'chromium', version: browser.version(), launchArguments: [...chromiumArguments] },
        node: process.version,
        platform: `${process.platform}-${process.arch}`,
        os: `${os.type()} ${os.release()}`,
        system: { atStart: loadAtStart, atEnd: systemLoad(), busyThresholdLoadPerCore: BUSY_LOAD_PER_CORE },
        trace: options.trace,
      },
      probe,
    };
    mkdirSync(path.dirname(options.out), { recursive: true });
    writeFileSync(options.out, `${JSON.stringify(report, null, 2)}\n`);
    log(`Wrote adapter layout probe to ${options.out}`);
  } finally {
    await browser.close();
  }
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseArguments(argv);
  if (options.help) {
    const source = await readFile(fileURLToPath(import.meta.url), 'utf8');
    console.log(source.match(/\/\*\*[\s\S]*?\*\//)?.[0] ?? '');
    return;
  }
  const log = (message) => process.stderr.write(`${message}\n`);
  const loadAtStart = systemLoad();
  if (loadAtStart.busy) {
    log(
      `WARNING: machine is busy (load ${loadAtStart.loadAvg1m} on ${loadAtStart.cpuCount} cores, above ${BUSY_LOAD_PER_CORE}/core). Frame timings will be noisy; treat them as indicative.`,
    );
  }

  if (options.suite === 'adapters') {
    await runAdaptersSuite(options, log, loadAtStart);
    return;
  }

  let docs = null;
  let server = null;
  let browser = null;
  try {
    let directory = options.dist;
    if (directory === null) {
      log('Building the documentation app (vite build, base "/")...');
      docs = await buildDocsApp();
      directory = docs.directory;
    }
    server = await serveDirectory(directory);
    browser = await launchChromium({ headless: !options.headed });
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
    let served = null;
    if (!options.cdn) {
      served = await routeCompetitorLibraries(context, await bundleCompetitorLibraries());
    }
    if (options.trace !== null) await browser.startTracing(undefined, { path: options.trace, screenshots: false });

    const reports = [];
    for (const id of options.scenarios) reports.push(await runScenario(context, server.origin, id, options, log));
    if (options.trace !== null) await browser.stopTracing();

    if (!options.cdn) {
      assert.equal(
        served.size,
        competitorLibraries.length,
        'The self-hosted comparison libraries were not all requested.',
      );
    }
    const loadAtEnd = systemLoad();
    const suite = {
      benchmark: 're-flux-browser-benchmark-suite',
      schemaVersion: 2,
      kind: 'suite',
      createdAt: new Date().toISOString(),
      runner: {
        script: 'scripts/run-browser-benchmark.mjs',
        gitRevision: gitRevision(),
        headless: !options.headed,
        frameTimingNote: options.headed
          ? 'Headed Chromium; frame pacing follows the display it is shown on.'
          : 'Headless Chromium: requestAnimationFrame is driven by a virtual 60 Hz timer, not a real display, so frame pacing, compositing and rasterization are not representative of a user device.',
        browser: { name: 'chromium', version: browser.version(), launchArguments: [...chromiumArguments] },
        node: process.version,
        platform: `${process.platform}-${process.arch}`,
        os: `${os.type()} ${os.release()}`,
        comparisonLibraries: competitorLibraries.map((library) => ({
          id: library.id,
          version: library.version,
          source: options.cdn
            ? library.cdnUrl
            : `npm ${library.id}@${library.version}, bundled locally and served in place of ${library.cdnUrl}`,
        })),
        system: { atStart: loadAtStart, atEnd: loadAtEnd, busyThresholdLoadPerCore: BUSY_LOAD_PER_CORE },
        scenarios: options.scenarios,
        trace: options.trace,
        usage:
          'Report-only. Comparison-library results are not for quotation in the docs or README; see benchmarks/README.md.',
      },
      reports: reports.map(({ id, report }) => ({ id, report })),
    };
    mkdirSync(path.dirname(options.out), { recursive: true });
    writeFileSync(options.out, `${JSON.stringify(suite, null, 2)}\n`);
    log(`Wrote browser benchmark suite to ${options.out}`);
  } finally {
    await browser?.close();
    await server?.close();
    await docs?.dispose();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof RangeError ? `Error: ${error.message}` : error);
    process.exitCode = 1;
  });
}
