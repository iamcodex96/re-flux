import { performance } from 'node:perf_hooks';
import { Animation } from '../dist/core/Animation.js';
import { Timeline } from '../dist/core/Timeline.js';
import {
  median,
  nonNegativeInteger,
  positiveInteger,
  round,
  summarizeRuns,
  summarizeSamples,
} from './benchmark-utils.mjs';

const segmentCount = positiveInteger(process.env.BENCH_SEGMENTS, 2000, 'BENCH_SEGMENTS');
const durationReads = positiveInteger(process.env.BENCH_DURATION_READS, 1_000_000, 'BENCH_DURATION_READS');
const seekFrameCount = positiveInteger(process.env.BENCH_SEEK_FRAMES, 180, 'BENCH_SEEK_FRAMES');
const repeats = positiveInteger(process.env.BENCH_REPEATS, 5, 'BENCH_REPEATS');
const warmupRounds = nonNegativeInteger(process.env.BENCH_WARMUP_ROUNDS, 2, 'BENCH_WARMUP_ROUNDS');
const callbackWorkIterations = nonNegativeInteger(process.env.BENCH_TIMELINE_CALLBACK_WORK, 0, 'BENCH_TIMELINE_CALLBACK_WORK');
const groupSize = 50;
let callbackSink = 0;
let callbackCountSink = 0;

function buildDurationTimeline() {
  const timeline = new Timeline();
  for (let index = 0; index < segmentCount; index += 1) {
    timeline.add(new Animation({ duration: 1 + (index % 11) }));
  }
  return timeline;
}

function measureDurationReads(timeline, reads) {
  let durationChecksum = 0;
  const startedAt = performance.now();
  for (let index = 0; index < reads; index += 1) durationChecksum += timeline.duration;
  return { durationMs: performance.now() - startedAt, durationChecksum };
}

function buildNestedTimeline() {
  const root = new Timeline();
  let nestedTimelineCount = 0;
  let localCallbackCount = 0;
  let localSink = 0;

  for (let baseIndex = 0; baseIndex < segmentCount; baseIndex += groupSize) {
    const nested = new Timeline();
    const remaining = Math.min(groupSize, segmentCount - baseIndex);
    for (let localIndex = 0; localIndex < remaining; localIndex += 1) {
      const absoluteIndex = baseIndex + localIndex;
      const duration = 40 + ((absoluteIndex * 13) % 81);
      const offset = (localIndex * 17) % 80;
      nested.add(new Animation({
        duration,
        onUpdate: (progress, easedProgress) => {
          localCallbackCount += 1;
          let value = progress + easedProgress;
          for (let work = 0; work < callbackWorkIterations; work += 1) value = Math.sin(value + work);
          localSink += value;
        },
      }), offset);
    }
    root.add(nested, nestedTimelineCount * 4);
    nestedTimelineCount += 1;
  }

  return { timeline: root, nestedTimelineCount, get callbackCount() { return localCallbackCount; }, get sink() { return localSink; } };
}

function measureNestedScrub(framesToRun) {
  const buildStartedAt = performance.now();
  const scenario = buildNestedTimeline();
  const buildMs = performance.now() - buildStartedAt;
  const seekSamples = [];
  const timeline = scenario.timeline;
  const totalDuration = timeline.duration;

  for (let frame = 0; frame < framesToRun; frame += 1) {
    const normalizedPosition = framesToRun === 1 ? 1 : frame / (framesToRun - 1);
    const target = totalDuration * normalizedPosition;
    const seekStartedAt = performance.now();
    timeline.seek(target);
    seekSamples.push(performance.now() - seekStartedAt);
  }

  const result = {
    buildMs: round(buildMs, 3),
    seekElapsedMs: round(seekSamples.reduce((sum, value) => sum + value, 0), 3),
    seekFrameStats: summarizeSamples(seekSamples),
    segmentCount,
    nestedTimelineCount: scenario.nestedTimelineCount,
    groupSize,
    timelineDurationMs: round(totalDuration, 3),
    seekFrames: seekSamples.length,
    callbacks: scenario.callbackCount,
    callbackWorkIterations,
  };
  timeline.stop();
  callbackCountSink += scenario.callbackCount;
  callbackSink += scenario.sink;
  return result;
}

function runDurationReadBenchmark() {
  const buildStartedAt = performance.now();
  const timeline = buildDurationTimeline();
  // Keep timeline construction separate from the duration-read microbenchmark.
  const setupMs = performance.now() - buildStartedAt;
  const warmupReads = Math.min(durationReads, 200_000);
  for (let warmup = 0; warmup < warmupRounds; warmup += 1) measureDurationReads(timeline, warmupReads);
  const runs = [];
  for (let repetition = 0; repetition < repeats; repetition += 1) {
    runs.push({ repetition: repetition + 1, ...measureDurationReads(timeline, durationReads) });
  }
  return {
    segmentCount,
    durationReadsPerRun: durationReads,
    setupMs: round(setupMs, 3),
    summary: {
      elapsedMs: summarizeRuns(runs, (run) => run.durationMs),
      medianReadsPerMs: round(durationReads / Math.max(0.000001, median(runs.map((run) => run.durationMs))), 2),
    },
    runs: runs.map((run) => ({ repetition: run.repetition, durationMs: round(run.durationMs, 4), durationChecksum: run.durationChecksum })),
    durationChecksum: runs.at(-1)?.durationChecksum ?? 0,
  };
}

try {
  const durationReadResults = runDurationReadBenchmark();
  const warmupFrameCount = Math.min(seekFrameCount, 60);
  for (let warmup = 0; warmup < warmupRounds; warmup += 1) measureNestedScrub(warmupFrameCount);
  const scrubRuns = [];
  for (let repetition = 0; repetition < repeats; repetition += 1) {
    const result = measureNestedScrub(seekFrameCount);
    scrubRuns.push({ repetition: repetition + 1, ...result });
  }

  console.log(JSON.stringify({
    benchmark: 're;Flux timeline duration reads and nested overlapping scrub',
    runtime: { node: process.version, platform: process.platform, arch: process.arch },
    configuration: { segmentCount, durationReads, seekFrameCount, warmupRounds, warmupFrameCount, repeats, callbackWorkIterations, nestedTimelineGroupSize: groupSize },
    durationReads: durationReadResults,
    nestedTimelineScrub: {
      summary: {
        buildMs: summarizeRuns(scrubRuns, (run) => run.buildMs),
        seekElapsedMs: summarizeRuns(scrubRuns, (run) => run.seekElapsedMs),
        medianMeanSeekMs: round(median(scrubRuns.map((run) => run.seekFrameStats.meanMs))),
        medianP50SeekMs: round(median(scrubRuns.map((run) => run.seekFrameStats.p50Ms))),
        medianP95SeekMs: round(median(scrubRuns.map((run) => run.seekFrameStats.p95Ms))),
        medianP99SeekMs: round(median(scrubRuns.map((run) => run.seekFrameStats.p99Ms))),
        worstSeekAcrossRunsMs: round(Math.max(...scrubRuns.map((run) => run.seekFrameStats.maxMs))),
        callbacksPerRun: scrubRuns.map((run) => run.callbacks),
      },
      runs: scrubRuns.map((run) => ({
        repetition: run.repetition,
        buildMs: run.buildMs,
        seekElapsedMs: run.seekElapsedMs,
        seekFrameStats: run.seekFrameStats,
        segmentCount: run.segmentCount,
        nestedTimelineCount: run.nestedTimelineCount,
        timelineDurationMs: run.timelineDurationMs,
        callbacks: run.callbacks,
      })),
    },
    note: 'The nested scrub scenario uses deterministic overlapping child timelines and onUpdate callbacks. It measures scheduling-free seek work, not browser rendering or DOM/SVG/Canvas paint.',
    callbackSink,
    callbackCountSink,
  }, null, 2));
} finally {
  // No global RAF is created by seek-only tests. stop() ensures all children return to idle.
}
