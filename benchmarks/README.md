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

For useful comparisons, keep the machine, Node.js version, workload settings, and background load the same. Capture output before and after a change. Do not infer a performance regression from one timing sample; repeat runs and compare distributions. Every scenario also asserts that a shared scheduler serves all animations with one pending RAF callback and returns to idle after completion.
