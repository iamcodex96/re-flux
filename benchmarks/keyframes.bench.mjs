import { Animation } from '../dist/core/Animation.js';
import { Keyframes } from '../dist/values/Keyframes.js';
import {
  consume,
  createSequence,
  emitReport,
  harnessInfo,
  measureMicroCases,
  microSettings,
} from './benchmark-utils.mjs';

/**
 * Per-frame cost of `Keyframes` (segment lookup, easing resolution, interpolation, publishing) driven through
 * `seek()` with a forward pass and a deterministic random scrub. `animation-only` is the reference without any
 * keyframe work. Judged by roadmap item PERF-005.
 */
const settings = microSettings(200_000);
const DURATION = 1000;

function makeFrames(count, easing) {
  return Array.from({ length: count }, (_, index) => ({
    value: index * 10,
    ...(easing === 'per-segment' && index < count - 1
      ? { easing: index % 2 === 0 ? 'easeInQuad' : 'easeOutCubic' }
      : {}),
  }));
}

function makeOptions(count, easing) {
  return {
    duration: DURATION,
    keyframes: makeFrames(count, easing),
    ...(easing === 'named' ? { easing: 'easeInOutQuad' } : {}),
    ...(easing === 'function' ? { easing: (t) => t * t } : {}),
  };
}

const forward = (index) => (index * 0.37) % DURATION;
const cases = [
  {
    name: 'keyframes › animation-only (reference)',
    group: 'reference',
    prepare: () => new Animation({ duration: DURATION }),
    op: (index, animation) => {
      animation.seek(forward(index));
      return animation.progress$.value + 1;
    },
  },
];

for (const frames of [2, 5, 20, 100]) {
  for (const easing of ['linear', 'named', 'function', 'per-segment']) {
    if (easing === 'per-segment' && frames === 2) continue;
    // 100 frames exists to show the cost of the segment lookup itself; the easing variants add nothing there.
    if (frames === 100 && easing !== 'linear' && easing !== 'per-segment') continue;
    cases.push({
      name: `keyframes › ${frames}-frames › ${easing} › forward`,
      group: 'forward',
      prepare: () => new Keyframes(makeOptions(frames, easing)),
      op: (index, sequence) => {
        sequence.seek(forward(index));
        return consume(sequence.value$.value) + 1;
      },
    });
  }
  cases.push({
    name: `keyframes › ${frames}-frames › linear › scrub`,
    group: 'scrub',
    prepare: () => ({ sequence: new Keyframes(makeOptions(frames, 'linear')), random: createSequence(frames) }),
    op: (_index, context) => {
      context.sequence.seek(context.random() * DURATION);
      return consume(context.sequence.value$.value) + 1;
    },
  });
}

const results = await measureMicroCases(cases, settings);

emitReport({
  benchmark: 're;Flux Keyframes per-frame cost',
  runtime: { node: process.version, platform: process.platform, arch: process.arch },
  configuration: { ...settings, durationMs: DURATION, frameCounts: [2, 5, 20, 100] },
  harness: harnessInfo(settings.repeats),
  note: 'Each operation seeks a Keyframes<number> and folds the published value into a checksum. `forward` advances monotonically (wrapping); `scrub` jumps to deterministic pseudo-random positions. Timings are descriptive, not pass/fail thresholds.',
  results,
});
