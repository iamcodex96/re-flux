import { performance } from 'node:perf_hooks';
import { Animation } from '../dist/core/Animation.js';
import { Timeline } from '../dist/core/Timeline.js';

const segmentCount = Number(process.env.BENCH_SEGMENTS ?? 2000);
const durationReads = Number(process.env.BENCH_DURATION_READS ?? 1000000);
const seekFrames = Number(process.env.BENCH_SEEK_FRAMES ?? 180);
const timeline = new Timeline();

for (let index = 0; index < segmentCount; index += 1) {
  timeline.add(new Animation({ duration: 1 }));
}

let durationChecksum = 0;
const durationStartedAt = performance.now();
for (let index = 0; index < durationReads; index += 1) durationChecksum += timeline.duration;
const durationElapsedMs = performance.now() - durationStartedAt;

const seekStartedAt = performance.now();
for (let frame = 0; frame < seekFrames; frame += 1) timeline.seek((timeline.duration * frame) / seekFrames);
const seekElapsedMs = performance.now() - seekStartedAt;

timeline.stop();
console.log(JSON.stringify({
  segmentCount,
  durationReads,
  seekFrames,
  durationMs: durationElapsedMs,
  seekMs: seekElapsedMs,
  durationChecksum,
}, null, 2));
