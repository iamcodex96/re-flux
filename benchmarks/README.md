# Performance benchmarks

These benchmarks are intentionally separate from `check:all`: elapsed-time limits vary by CPU, OS, Node.js release, and background load, so benchmark timings should inform optimization decisions rather than make ordinary CI flaky.

## Run the complete benchmark set

```bash
npm run bench
```

This builds the library and runs four workloads: shared frame coordination, timeline duration/seek operations, concurrent `Animation` instances, and DOM/SVG/Canvas adapter updates. The adapter benchmark uses lightweight mock targets to measure binding dispatch, value conversion, scheduled work, burst coalescing, and cleanup; it does not measure browser layout, SVG painting, or Canvas rasterization.

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
