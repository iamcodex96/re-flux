import { resolveInterpolator, interpolate } from '../dist/values/interpolate.js';
import { consume, emitReport, harnessInfo, measureMicroCases, microSettings } from './benchmark-utils.mjs';

/**
 * Per-frame cost of value interpolation. `resolved` is the path a Tween/Keyframes takes every frame
 * (`resolveInterpolator(from, to)` once, then a call per frame); `one-shot` is the public `interpolate()` helper.
 * Judged by roadmap items REFACTOR-003 and PERF-002.
 */
const settings = microSettings(300_000);

const samples = [
  { id: 'number', from: 0, to: 100 },
  { id: 'color-hex', from: '#102030', to: '#f0e0d0' },
  { id: 'color-rgba', from: 'rgba(10, 20, 30, 0.2)', to: 'rgba(240, 220, 200, 0.9)' },
  { id: 'numeric-template', from: 'translate(0px, 10px) scale(1)', to: 'translate(100px, 50px) scale(2)' },
  { id: 'unit-string', from: '0px', to: '320px' },
  { id: 'array-4-numbers', from: [0, 10, 20, 30], to: [100, 110, 120, 130] },
  { id: 'object-3-fields', from: { x: 0, y: 10, z: 20 }, to: { x: 100, y: 60, z: 40 } },
];

function progressAt(index) {
  return (index % 1000) / 1000;
}

const cases = samples.flatMap((sample) => {
  const interpolator = resolveInterpolator(sample.from, sample.to);
  return [
    { name: `interpolate › ${sample.id} › resolved`, group: 'resolved', op: (index) => consume(interpolator(sample.from, sample.to, progressAt(index))) },
    { name: `interpolate › ${sample.id} › one-shot`, group: 'one-shot', scale: 0.5, op: (index) => consume(interpolate(sample.from, sample.to, progressAt(index))) },
  ];
});

const results = await measureMicroCases(cases, settings);

emitReport({
  benchmark: 're;Flux value interpolation per-frame cost',
  runtime: { node: process.version, platform: process.platform, arch: process.arch },
  configuration: { ...settings, samples: samples.map((sample) => sample.id) },
  harness: harnessInfo(settings.repeats),
  note: 'Each operation interpolates one value at a deterministic progress and folds the result into a checksum. Timings are descriptive, not pass/fail thresholds.',
  results,
});
