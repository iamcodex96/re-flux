/**
 * The `adapters` suite of the browser benchmark runner (PERF-010): counts the style recalculations and layouts Chrome
 * performs for `flip()`, `animate()`, `animateNumber()` and `followSvgPath$`, using the Chrome DevTools `Performance`
 * counters around operations of `tests/browser/layout-probe.ts`.
 *
 * Reading the numbers: a synchronous call cannot be interrupted by rendering, so every recalculation or layout counted
 * during one is *forced* by the call itself. Layout thrash shows as a count that grows with the element count; batched
 * work shows as 0 to 1. The suite measures a deliberately thrashing control and a batched control as well, so the
 * counters are shown to tell the two apart in the same browser.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { build as esbuild } from 'esbuild';
import { diffLayoutMetrics, median, readPerformanceMetrics, repositoryRoot, serveFiles } from './browser-bench.mjs';

const PROBE_ENTRY = path.join(repositoryRoot, 'tests/browser/layout-probe.ts');
const PROBE_HTML = path.join(repositoryRoot, 'tests/browser/layout-probe.html');

function summarize(samples, key) {
  const values = samples.map((sample) => sample[key]);
  return { min: Math.min(...values), median: median(values), max: Math.max(...values) };
}

function summarizeSyncCase(label, count, samples) {
  const ms = (key) => {
    const stat = summarize(samples, key);
    return { min: round(stat.min * 1000), median: round(stat.median * 1000), max: round(stat.max * 1000) };
  };
  return {
    case: label,
    elements: count,
    repetitions: samples.length,
    recalcStyleCount: summarize(samples, 'RecalcStyleCount'),
    layoutCount: summarize(samples, 'LayoutCount'),
    recalcStyleMs: ms('RecalcStyleDuration'),
    layoutMs: ms('LayoutDuration'),
    callMs: {
      min: round(Math.min(...samples.map((s) => s.callMs))),
      median: round(median(samples.map((s) => s.callMs))),
      max: round(Math.max(...samples.map((s) => s.callMs))),
    },
  };
}

function round(value, digits = 3) {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

export async function runLayoutProbeSuite({
  browser,
  log,
  counts = [100, 1000],
  repetitions = 7,
  frames = 60,
  cases = ['sync', 'frames', 'paths'],
}) {
  const bundle = await esbuild({
    entryPoints: [PROBE_ENTRY],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    write: false,
    logLevel: 'silent',
  });
  const script = bundle.outputFiles[0]?.text ?? '';
  const html = await readFile(PROBE_HTML, 'utf8');
  const server = await serveFiles({
    '/index.html': { body: html, contentType: 'text/html; charset=utf-8' },
    '/layout-probe.js': { body: script, contentType: 'text/javascript; charset=utf-8' },
  });
  const context = await browser.newContext({ viewport: { width: 1000, height: 800 } });
  const page = await context.newPage();
  const problems = [];
  page.on('pageerror', (error) => problems.push(error.message));
  try {
    await page.goto(server.origin, { waitUntil: 'load' });
    const cdp = await context.newCDPSession(page);
    await cdp.send('Performance.enable', { timeDomain: 'timeTicks' });

    const syncCases = [];
    const measureSync = async (label, count, prepare, action) => {
      const samples = [];
      for (let repetition = 0; repetition < repetitions; repetition += 1) {
        await page.evaluate(prepare, count);
        const before = await readPerformanceMetrics(cdp);
        const callMs = await page.evaluate(action);
        const after = await readPerformanceMetrics(cdp);
        samples.push({ ...diffLayoutMetrics(before, after), callMs });
        await page.evaluate(() => window.layoutProbe.dispose());
      }
      const result = summarizeSyncCase(label, count, samples);
      syncCases.push(result);
      log(
        `  ${label} x${count}: recalcStyle ${result.recalcStyleCount.median}, layout ${result.layoutCount.median} (median of ${repetitions}), call ${result.callMs.median} ms`,
      );
    };
    const build = (count) => window.layoutProbe.build(count);

    for (const count of cases.includes('sync') ? counts : []) {
      await measureSync('control: write+read per element (thrash by construction)', count, build, () =>
        window.layoutProbe.controlThrash(),
      );
      await measureSync('control: reads first, then writes (batched)', count, build, () =>
        window.layoutProbe.controlBatched(),
      );
      await measureSync('flip()', count, build, () => window.layoutProbe.flipGrid());
      await measureSync('animate() x3 properties, explicit [from, to]', count, build, () =>
        window.layoutProbe.animateGrid('explicit'),
      );
      await measureSync('animate() x3 properties, implicit start (computed)', count, build, () =>
        window.layoutProbe.animateGrid('implicit'),
      );
    }

    // Frame-driven cases: count recalculations and layouts per rendered frame while the animation runs.
    const frameCases = [];
    const measureFrames = async (label, count, run) => {
      const samples = [];
      for (let repetition = 0; repetition < Math.min(repetitions, 5); repetition += 1) {
        const before = await readPerformanceMetrics(cdp);
        const outcome = await run();
        const after = await readPerformanceMetrics(cdp);
        samples.push({ ...diffLayoutMetrics(before, after), frames: outcome.frames, callMs: 0 });
      }
      const perFrame = (key) => round(median(samples.map((sample) => sample[key] / sample.frames)));
      frameCases.push({
        case: label,
        elements: count,
        frames: samples[0].frames,
        repetitions: samples.length,
        recalcStylePerFrame: perFrame('RecalcStyleCount'),
        layoutPerFrame: perFrame('LayoutCount'),
        scriptMsPerFrame: round(median(samples.map((sample) => (sample.ScriptDuration * 1000) / sample.frames))),
      });
      const last = frameCases.at(-1);
      log(`  ${label} x${count}: ${last.recalcStylePerFrame} recalc/frame, ${last.layoutPerFrame} layout/frame`);
    };
    for (const count of cases.includes('frames') ? counts : []) {
      await measureFrames('animateNumber() on counters', count, () =>
        page.evaluate(([n, f]) => window.layoutProbe.numberFrames(n, f), [count, frames]),
      );
    }
    const idle = [];
    if (cases.includes('frames')) {
      await page.evaluate(() => window.layoutProbe.buildTrack(200));
      await page.evaluate(() => window.layoutProbe.build(1));
      await measureFrames('followSvgPath$ driving a transform (200-segment path)', 1, () =>
        page.evaluate((f) => window.layoutProbe.followPathFrames(f), frames),
      );
      for (let repetition = 0; repetition < 3; repetition += 1) {
        await page.evaluate(() => window.layoutProbe.build(1));
        const before = await readPerformanceMetrics(cdp);
        await page.evaluate((f) => window.layoutProbe.playFrames(f), frames);
        const after = await readPerformanceMetrics(cdp);
        idle.push({ ...diffLayoutMetrics(before, after), frames });
      }
    }
    const idleRecalc =
      idle.length > 0 ? round(median(idle.map((sample) => sample.RecalcStyleCount / sample.frames))) : null;
    const idleLayout = idle.length > 0 ? round(median(idle.map((sample) => sample.LayoutCount / sample.frames))) : null;

    // Cost of the three getPointAtLength calls per followSvgPath$ emission, on short and long paths.
    const pathCases = [];
    const pathPlan = cases.includes('paths')
      ? [
          [8, 2000],
          [200, 300],
          [2000, 40],
        ]
      : [];
    for (const [segments, emissions] of pathPlan) {
      const length = await page.evaluate((n) => window.layoutProbe.buildTrack(n), segments);
      const runs = [];
      for (let repetition = 0; repetition < repetitions; repetition += 1) {
        runs.push(await page.evaluate((n) => window.layoutProbe.followPathCost(n), emissions));
      }
      const pick = (key) => round(median(runs.map((run) => run[key] * 1000)));
      pathCases.push({
        segments,
        pathLength: round(length, 1),
        emissionsPerRun: emissions,
        followMicrosecondsPerEmission: pick('followMsPerEmission'),
        threeGetPointAtLengthMicroseconds: pick('threeCallsMsPerEmission'),
        oneGetPointAtLengthMicroseconds: pick('oneCallMsPerEmission'),
      });
      const last = pathCases.at(-1);
      log(
        `  followSvgPath$ ${segments} segments: ${last.followMicrosecondsPerEmission} us/emission (3 calls ${last.threeGetPointAtLengthMicroseconds}, 1 call ${last.oneGetPointAtLengthMicroseconds})`,
      );
    }

    return {
      description:
        'Chrome DevTools Performance counters around operations of tests/browser/layout-probe.ts. Synchronous cases: counts are forced work (no frame can render mid-call; a stray frame between the call and the read can add at most one, which the minimum filters). Frame cases: counts per rendered frame while the animation runs.',
      repetitions,
      synchronous: syncCases,
      framePlayback: {
        framesPerRepetition: frames,
        idleBaselineRecalcStylePerFrame: idleRecalc,
        idleBaselineLayoutPerFrame: idleLayout,
        cases: frameCases,
      },
      svgPathQueries: pathCases,
      pageErrors: problems,
    };
  } finally {
    await context.close();
    await server.close();
  }
}
