import { createSvgPathInterpolator, normalizeSvgPathPair } from '../dist/adapters/svg.js';
import { consume, emitReport, harnessInfo, measureMicroCases, microSettings } from './benchmark-utils.mjs';

/**
 * SVG path morphing: per-frame cost of the interpolator returned by `createSvgPathInterpolator` for 8-, 64- and
 * 128-segment closed paths (128 is the default per-subpath limit), plus the one-time normalization cost.
 * Judged by roadmap item PERF-004.
 */
const settings = microSettings(2_000);

const fixed = (value) => value.toFixed(3);

/** A closed ring of `segments` cubic segments; `wobble` and `phase` make two rings differ. */
function ringPath(segments, radius, wobble, phase) {
  const point = (index) => {
    const angle = (index / segments) * Math.PI * 2;
    const r = radius * (1 + wobble * Math.sin(angle * 3 + phase));
    return [200 + r * Math.cos(angle), 200 + r * Math.sin(angle)];
  };
  const [startX, startY] = point(0);
  const parts = [`M ${fixed(startX)} ${fixed(startY)}`];
  for (let index = 0; index < segments; index += 1) {
    const [x0, y0] = point(index);
    const [x3, y3] = point(index + 1);
    const c1 = [x0 + (x3 - x0) / 3 + 2, y0 + (y3 - y0) / 3 - 2];
    const c2 = [x0 + (2 * (x3 - x0)) / 3 - 2, y0 + (2 * (y3 - y0)) / 3 + 2];
    parts.push(`C ${fixed(c1[0])} ${fixed(c1[1])} ${fixed(c2[0])} ${fixed(c2[1])} ${fixed(x3)} ${fixed(y3)}`);
  }
  parts.push('Z');
  return parts.join(' ');
}

const pairs = [
  { id: '8-segments', from: ringPath(8, 100, 0.1, 0), to: ringPath(8, 120, 0.3, 1) },
  { id: '64-segments', from: ringPath(64, 100, 0.1, 0), to: ringPath(64, 120, 0.3, 1) },
  { id: '128-segments', from: ringPath(128, 100, 0.1, 0), to: ringPath(128, 120, 0.3, 1) },
  { id: '8-to-128-segments (split to match)', from: ringPath(8, 100, 0.1, 0), to: ringPath(128, 120, 0.3, 1) },
];

const cases = [];
for (const pair of pairs) {
  const interpolator = createSvgPathInterpolator(pair.from, pair.to);
  cases.push({
    name: `path-morph › per-frame interpolator › ${pair.id}`,
    group: 'per-frame',
    scale: pair.id.startsWith('128') || pair.id.startsWith('8-to') ? 0.5 : 1,
    op: (index) => consume(interpolator(((index % 999) + 1) / 1000)),
  });
  cases.push({
    name: `path-morph › normalizeSvgPathPair (setup) › ${pair.id}`,
    group: 'setup',
    scale: 0.01,
    op: () => {
      const normalized = normalizeSvgPathPair(pair.from, pair.to);
      return normalized.from.length + normalized.to.length + normalized.subpathCount;
    },
  });
}

const results = await measureMicroCases(cases, settings);

emitReport({
  benchmark: 're;Flux SVG path morph cost',
  runtime: { node: process.version, platform: process.platform, arch: process.arch },
  configuration: { ...settings, pairs: pairs.map((pair) => pair.id) },
  harness: harnessInfo(settings.repeats),
  note: 'Per-frame operations build the interpolated `d` string for a deterministic progress; setup operations normalize a pair of paths. Timings are descriptive, not pass/fail thresholds.',
  results,
});
