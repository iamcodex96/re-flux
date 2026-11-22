import { Animation } from '../dist/core/Animation.js';
import { Timeline } from '../dist/core/Timeline.js';
import { createSequence, emitReport, harnessInfo, measureMicroCases, microSettings } from './benchmark-utils.mjs';

/**
 * Cost of `Timeline.seek()` when most of a 2,000-segment timeline has already finished. Every update currently
 * visits every segment, so the cost of already-completed segments is the part an "active window" would remove.
 * `segments-getter` measures the allocation cost of reading `timeline.segments`.
 * Judged by roadmap item PERF-009.
 */
const settings = microSettings(5_000);
const SEGMENTS = positiveSegments(process.env.BENCH_SEGMENTS, 2000);
const SEGMENT_MS = 10;
const TOTAL_MS = SEGMENTS * SEGMENT_MS;

function positiveSegments(raw, fallback) {
  const value = raw === undefined ? fallback : Number(raw);
  if (!Number.isSafeInteger(value) || value < 100) throw new RangeError(`BENCH_SEGMENTS must be an integer >= 100, received ${raw}.`);
  return value;
}

function buildTimeline() {
  const timeline = new Timeline();
  for (let index = 0; index < SEGMENTS; index += 1) timeline.add(new Animation({ duration: SEGMENT_MS }), index * SEGMENT_MS);
  return timeline;
}

const cases = [0, 0.5, 0.99].map((completedFraction) => {
  const label = `${Math.round(completedFraction * 100)}%`;
  return {
    name: `timeline › seek with ${label} of ${SEGMENTS} segments completed`,
    group: 'seek-completed',
    prepare: () => {
      const timeline = buildTimeline();
      const base = Math.floor(completedFraction * SEGMENTS) * SEGMENT_MS;
      timeline.seek(base); // finish every earlier segment once, outside the timed region
      return { timeline, base, random: createSequence(7) };
    },
    op: (_index, context) => {
      // Jump around inside the one active segment so only the already-completed ones can be "skipped".
      context.timeline.seek(context.base + context.random() * (SEGMENT_MS - 0.5));
      return context.timeline.progress$.value * 1000 + 1;
    },
  };
});

cases.push({
  name: `timeline › segments getter (${SEGMENTS} segments)`,
  group: 'segments-getter',
  scale: 0.05,
  prepare: () => buildTimeline(),
  op: (_index, timeline) => {
    const segments = timeline.segments;
    return segments.length + segments[segments.length - 1].endTime;
  },
});

const results = await measureMicroCases(cases, settings);

emitReport({
  benchmark: 're;Flux Timeline seek with completed segments',
  runtime: { node: process.version, platform: process.platform, arch: process.arch },
  configuration: { ...settings, segments: SEGMENTS, segmentMs: SEGMENT_MS, totalMs: TOTAL_MS, completedFractions: [0, 0.5, 0.99] },
  harness: harnessInfo(settings.repeats),
  note: 'Sequential non-overlapping segments; the playhead stays inside the first not-yet-finished segment. Timings are descriptive, not pass/fail thresholds.',
  results,
});
