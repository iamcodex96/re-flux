import { BehaviorSubject } from 'rxjs';
import { Animation } from '../dist/core/Animation.js';
import { Timeline } from '../dist/core/Timeline.js';
import { Keyframes } from '../dist/values/Keyframes.js';
import { Tween } from '../dist/values/Tween.js';
import { emitReport, forceGc, gcControl, harnessInfo, median, nonNegativeInteger, positiveInteger, round, variability } from './benchmark-utils.mjs';

/**
 * Retained heap per instance: create N instances, force a full collection, and divide the growth in used heap by N.
 * A collection is always forced here (retained-heap numbers are meaningless otherwise), independent of BENCH_GC.
 * Judged by roadmap item PERF-011.
 */
const instances = positiveInteger(process.env.BENCH_MEMORY_INSTANCES, 20_000, 'BENCH_MEMORY_INSTANCES');
const repeats = positiveInteger(process.env.BENCH_REPEATS, 10, 'BENCH_REPEATS');
const warmupRounds = nonNegativeInteger(process.env.BENCH_WARMUP_ROUNDS, 2, 'BENCH_WARMUP_ROUNDS');
const collect = forceGc();
const tick = () => new Promise((resolve) => setImmediate(resolve));

const subjects = [
  { name: 'rxjs BehaviorSubject (reference)', create: (i) => new BehaviorSubject(i) },
  { name: 'Animation', create: () => new Animation({ duration: 100 }) },
  { name: 'Tween<number>', create: () => new Tween({ from: 0, to: 1, duration: 100 }) },
  { name: 'Keyframes<number> (3 frames)', create: () => new Keyframes({ duration: 100, keyframes: [{ value: 0 }, { value: 1 }, { value: 2 }] }) },
  { name: 'Timeline (empty)', create: () => new Timeline() },
  { name: 'Timeline (10 Animations)', create: () => {
    const timeline = new Timeline();
    for (let index = 0; index < 10; index += 1) timeline.add(new Animation({ duration: 10 }));
    return timeline;
  } },
];

async function retainedHeap() {
  collect();
  collect();
  await tick();
  return process.memoryUsage().heapUsed;
}

async function measure(subject) {
  const create = (index) => subject.create(index);
  // Retained objects are kept in function-scope variables and explicitly released: a block-scoped array that is
  // live across an `await` can stay reachable from the async frame and silently inflate the next "before" reading.
  let held = null;
  for (let warmup = 0; warmup < warmupRounds; warmup += 1) {
    held = Array.from({ length: Math.min(instances, 2000) }, (_, index) => create(index));
    if (held.length === 0) throw new Error('warm-up produced no instances');
    held = null;
  }
  const runs = [];
  for (let repetition = 0; repetition < repeats; repetition += 1) {
    const before = await retainedHeap();
    held = new Array(instances);
    for (let index = 0; index < instances; index += 1) held[index] = create(index);
    const after = await retainedHeap();
    if (held.length !== instances || held[instances - 1] === undefined) throw new Error(`${subject.name}: instances were not retained.`);
    held = null; // release before the next repetition's "before" reading
    const bytesPerInstance = (after - before) / instances;
    if (!Number.isFinite(bytesPerInstance)) throw new Error(`${subject.name}: retained size is not finite.`);
    runs.push({ repetition: repetition + 1, bytesPerInstance: round(bytesPerInstance, 2) });
  }
  const values = runs.map((run) => run.bytesPerInstance);
  // A single run can come out slightly off if the collector frees unrelated garbage during it; the median
  // must still be positive or the measurement (usually too few instances) is meaningless.
  if (median(values) <= 0) throw new Error(`${subject.name}: median retained size is not positive (${median(values)}); raise BENCH_MEMORY_INSTANCES.`);
  return {
    name: `memory › ${subject.name}`,
    instances,
    summary: { medianBytesPerInstance: round(median(values), 1), bytesVariability: variability(values) },
    runs,
  };
}

const results = [];
for (const subject of subjects) results.push(await measure(subject));

emitReport({
  benchmark: 're;Flux retained heap per instance',
  runtime: { node: process.version, platform: process.platform, arch: process.arch },
  configuration: { instances, repeats, warmupRounds },
  harness: { ...harnessInfo(repeats), forcedGc: true, requestedGcControl: gcControl.controlled },
  note: 'Bytes are growth in process heapUsed after two forced full collections, divided by the instance count. They include everything an instance retains (subjects, promises, closures). Descriptive, not pass/fail.',
  results,
});
