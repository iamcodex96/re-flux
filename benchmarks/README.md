# Performance benchmarks

These benchmarks are intentionally separate from `check:all`: elapsed-time limits vary by CPU, OS, Node.js release, and background load, so benchmark timings should inform optimization decisions rather than make ordinary CI flaky.

## Run the complete benchmark set

```bash
npm run bench
```

This builds the library and runs ten workloads in sequence:

| Report name | Script | What it measures | Roadmap items judged by it |
|---|---|---|---|
| `frameCoordinator` | `frame-coordinator.bench.mjs` | shared RAF coordinator vs one RAF per consumer | PERF-007 |
| `timeline` | `timeline.bench.mjs` | duration reads and overlapping nested scrub | PERF-009 |
| `animationLoad` | `animation-load.bench.mjs` (`npm run bench:animation-load`) | 100 / 1,000 / 5,000 concurrent `Animation`s, metrics observer on/off | PERF-007, PERF-011 |
| `adapterUpdates` | `adapters.bench.mjs` (`npm run bench:adapters`) | DOM/SVG/Canvas adapter updates: DOM-style, SVG-attribute and Canvas bindings on mock targets | PERF-006, PERF-008 |
| `interpolate` | `interpolate.bench.mjs` (`npm run bench:interpolate`) | per-frame value interpolation: numbers, colors, numeric templates, arrays, objects | PERF-002, REFACTOR-003 |
| `keyframes` | `keyframes.bench.mjs` (`npm run bench:keyframes`) | `Keyframes.seek()` with 2 / 5 / 20 frames, forward and scrub, several easing styles | PERF-005 |
| `cssInterpolation` | `css-interpolation.bench.mjs` (`npm run bench:css-interpolation`) | `interpolateCssValue` and the `animate()` pipeline over mock elements | PERF-003, PERF-006 |
| `pathMorph` | `path-morph.bench.mjs` (`npm run bench:path-morph`) | SVG path interpolator (8 / 64 / 128 segments) and normalization | PERF-004 |
| `timelineCompleted` | `timeline-completed.bench.mjs` (`npm run bench:timeline-completed`) | `Timeline.seek()` with 0% / 50% / 99% of 2,000 segments already finished; the `segments` getter | PERF-009 |
| `memory` | `memory.bench.mjs` (`npm run bench:memory`) | retained heap bytes per `Animation`, `Tween`, `Keyframes`, `Timeline` | PERF-011 |

The adapter benchmark uses lightweight mock targets to measure binding dispatch, value conversion, scheduled work, burst coalescing, and cleanup; it does not measure browser layout, SVG painting, or Canvas rasterization.

The adapter workload can be tuned with `BENCH_ADAPTER_TARGETS`, `BENCH_ADAPTER_FRAMES`, `BENCH_REPEATS`, `BENCH_WARMUP_ROUNDS`, and `BENCH_CANVAS_BURST_EMISSIONS`. Its JSON output reports frame-time distributions, adapter operations, pending RAF callbacks, and cleanup status.

## Run concurrent animations only

```bash
npm run bench:animation-load
```

Defaults exercise 100, 1,000, and 5,000 concurrent animations for 180 measured frame intervals. Each workload runs with frame metrics disabled and with a metrics observer attached. The report includes mean, p50, p95, p99, and maximum frame elapsed time, callback count, peak pending RAF callback count, and cleanup diagnostics.

Configuration for the concurrent-animation workload can be adjusted without editing source:

```bash
BENCH_ANIMATION_COUNTS=1000,5000,10000 \
BENCH_ANIMATION_FRAMES=240 \
BENCH_ANIMATION_CALLBACK_WORK=4 \
npm run bench:animation-load
```

`BENCH_ANIMATION_CALLBACK_WORK` adds deterministic CPU work to each animation's `onUpdate` callback. Keep it at `0` when measuring engine overhead; raise it to model application callback cost. `BENCH_ANIMATION_COUNTS` accepts comma-separated positive integers.

## Save a report and compare two runs

`npm run bench` prints the aggregate JSON report to stdout, preceded by npm's own banner. To get a file that parses without any clean-up, write the report to a path instead:

```bash
npm run bench -- --out reports/before.json        # or: BENCH_OUT=reports/before.json npm run bench
npm run bench:save                                # writes benchmarks/results/bench-<date>-<platform>-<arch>-node<version>.json (git-ignored)
```

The usual workflow is save → change → save → compare:

```bash
npm run bench:save -- --out reports/before.json
# ...make the change...
npm run bench:save -- --out reports/after.json
npm run bench:compare -- reports/before.json reports/after.json
```

`bench:compare` prints one row per workload and metric (median/p95/p99 frame time, worst frame, seek times, duration-read rate, shared-scheduler speed-up) with the percentage change. A row is labelled *within noise* when the change is inside a noise band: `--noise <percent>` if given, otherwise the band recorded in the report, otherwise a default of ±10%. That default is only a placeholder; repeated runs of identical code on a busy machine can differ by more than 10% in tail metrics, so judge tails over several saved runs.

The comparison is descriptive and **never gates CI**. It exits with status 2 and refuses to compare when the two reports come from different Node.js versions, platforms or architectures (override with `--allow-runtime-mismatch` only when you accept that the numbers are not comparable).

The first recorded baseline is stored in `roadmap/baseline/` (Node 24.15.0, darwin arm64) and is used by the acceptance criteria in `roadmap/`.

For useful comparisons, keep the machine, Node.js version, workload settings, and background load the same. Capture output before and after a change. Do not infer a performance regression from one timing sample; repeat runs and compare distributions. Every scenario also asserts that a shared scheduler serves all animations with one pending RAF callback and returns to idle after completion.

## Micro-benchmark workloads

`interpolate`, `keyframes`, `cssInterpolation`, `pathMorph` and `timelineCompleted` share one harness (`measureMicro()` in `benchmark-utils.mjs`). Each case runs a fixed number of operations per repetition and folds every result into a checksum. The checksum must be non-zero and identical on every repetition, so an operation that does nothing, or one that is not deterministic, fails the benchmark instead of reporting a spectacular time. Tune the work per repetition with `BENCH_MICRO_ITERATIONS` (each script has its own default; individual cases scale it) and `BENCH_REPEATS` / `BENCH_WARMUP_ROUNDS`. `BENCH_MEMORY_INSTANCES` sets the instance count of the `memory` workload (default 20,000; keep it high enough that the median retained size is positive).

Allocation is reported as `scavengesPerMillionOps`: young-generation collections per million operations. Short-lived garbage fills the new space at a rate proportional to the bytes an operation allocates, so the number is a relative allocation measure; compare it between two runs of the same case rather than reading it as bytes.

## Noise, variability and GC

Every benchmark repeats each workload at least **10 times** (`BENCH_REPEATS`, default 10) and reports, for each measured workload:

- `elapsedMs.cv`: the **coefficient of variation** across repetitions (sample standard deviation divided by the mean; `0.10` means ±10%), plus `stdevMs` and `maxOverMin`. A change is only meaningful when it is clearly larger than the CV of both runs being compared.
- `p99FrameVariability` (or `seekP99Variability`): the same statistics for the p99 frame time, which is much noisier than the mean.
- GC activity measured with `PerformanceObserver` for every repetition: `gc.count`, `gc.totalPauseMs`, `gc.maxPauseMs` and `gc.byKind` (scavenge / mark-compact / incremental) in each run, and `gcMedianCount`, `gcMedianPauseMs`, `gcMaxPauseMs`, `heapMedianDeltaMb` per workload.
- For frame-based workloads, `tailCorrelation`: how often the slowest 1% of frames overlap a GC pause compared with all frames (`lift` above 1 means slow frames coincide with GC more than chance).

The run-all report also contains a `noise` block (derived from the run-to-run variability in that same report) and `harness` metadata (repeats, whether GC was controlled).

### GC control (`--expose-gc` / `BENCH_GC=1`)

By default nothing forces garbage collection. To start every repetition from a freshly collected heap:

```bash
npm run bench:gc                       # node --expose-gc benchmarks/run-all.bench.mjs
BENCH_GC=1 npm run bench               # same effect without a flag (enables the V8 flag at runtime)
BENCH_GC=1 npm run bench:adapters      # any single workload
```

GC control is **opt-in because it changes what is measured**: a forced full collection before each repetition changes heap layout, and in the recorded experiments the GC-controlled medians of the adapter workloads were roughly 15–50% *higher* than uncontrolled ones. Never compare a GC-controlled report with an uncontrolled one; `harness.gcControlled` records which was used. The `memory` workload always forces collections, because retained-heap numbers are meaningless otherwise.

### Machine load comes first

Timings are only meaningful on a quiet machine. Every report records `harness.system` (logical core count, 1-minute load average at the start and end, load per core, and a `busy` flag set when the load per core exceeds 0.5). `npm run bench` prints a warning at the start when the machine is busy, and `npm run bench:compare` warns when either report was recorded on a busy machine or has no load record. Before measuring, close other builds, editors, browsers and agent sessions and check `uptime`. The local baselines in `roadmap/baseline/` (git-ignored) were recorded on a heavily loaded machine (load average above 100 on 8 cores); see `roadmap/baseline/README.md`.

### Reading results honestly

- **Variability within one process understates variability between processes.** Repetitions inside one invocation share JIT state, CPU frequency and background load, while other processes on the machine come and go between invocations. Two back-to-back GC-controlled full runs of unchanged code produced a `frameCoordinator` elapsed median of 4.8 ms and then 16.0 ms, and 100-target adapter workloads (under about 20 ms) drifted by tens of percent between invocations, while 1,000-target workloads (30 ms and more) stayed within a few percent (CV of the medians of five invocations: 1.7–6.5%). Those drifts were measured on a heavily loaded machine and are largely a load effect; expect much less on a quiet one. Treat sub-20 ms workloads as indicative only.
- **Before trusting a difference, repeat it.** Save at least three reports for each side (`npm run bench:save -- --out …`), compare every pair, and act only on differences that are outside the noise band in all pairs and have the same sign.
- `bench:compare` sizes a row's noise band from the coefficient of variation recorded for that workload in either report (twice the larger CV; floors of 5% for means and 10% for tail metrics). Because that CV only covers variability inside one process, treat the band as a minimum, not a guarantee.
- A forced-GC experiment (five invocations of the 1,000-target adapter benchmark with and without `BENCH_GC=1`) found that the slowest 1% of frames overlapped a GC pause 51–69% of the time without GC control (against about 1% of all frames, a lift of roughly 50×), but only 3–13% of the time with GC control. Garbage collection therefore explains most p99-class frames in uncontrolled runs, not necessarily every single worst-frame outlier.

