# BENCH-008 — Benchmarks for the paths the optimization items target

| Category | Impact | Risk | Effort | Priority score | Phase | Depends on |
|---|---|---|---|---|---|---|
| Benchmarks | 4 | 3 | 3 | **21** | 0 | [BENCH-006](./BENCH-006-clean-json-baseline-compare.md) |

Priority = (Impact + Risk) × (6 − Effort). Back to the [roadmap](../roadmap.md).

## Status

**Done 2026-11-22** (uncommitted on branch `chore/roadmap-phase0`; "committed" below means saved under `roadmap/baseline/`, which is git-ignored on purpose (solo development, large machine-specific files), so the baselines exist only on the recording machine) except one criterion: the Node 22 run could not be verified because only Node 24.15.0 is installed here (no version manager); the scripts use only `perf_hooks`, `v8`, `vm` and `rxjs` APIs available in Node 22, but that is untested.

Added (all print one JSON report through `emitReport`, are registered in `run-all.bench.mjs`, and have npm scripts):

| Script | npm script | Cases |
|---|---|---|
| `benchmarks/interpolate.bench.mjs` | `bench:interpolate` | 7 value kinds × {resolved per-frame interpolator, one-shot `interpolate()`} |
| `benchmarks/keyframes.bench.mjs` | `bench:keyframes` | `Animation` reference; 2/5/20 frames × linear / named / function / per-segment easing (forward) and linear scrub |
| `benchmarks/css-interpolation.bench.mjs` | `bench:css-interpolation` | 6 `interpolateCssValue` kinds; `animate()` pipeline with 10 and 100 mock elements × 3 properties |
| `benchmarks/path-morph.bench.mjs` | `bench:path-morph` | per-frame interpolator and `normalizeSvgPathPair` for 8, 64, 128 and 8→128 segments |
| `benchmarks/timeline-completed.bench.mjs` | `bench:timeline-completed` | `Timeline.seek()` with 0 / 50 / 99% of 2,000 segments completed; `segments` getter |
| `benchmarks/memory.bench.mjs` | `bench:memory` | retained bytes per `BehaviorSubject` (reference), `Animation`, `Tween`, `Keyframes`, empty `Timeline`, `Timeline` with 10 `Animation`s |

Shared harness: `measureMicro()` (checksum must be finite, non-zero and identical on every repeat — verified: a no-op, a non-deterministic and a NaN operation all fail), `scavengesPerMillionOps` as a relative allocation measure, GC/CV reporting from BENCH-007. `compare.mjs` understands the new metrics (`medianOpsPerMs`, `scavengesPerMillionOps`, `medianBytesPerInstance`).

**Baselines** (Node 24.15.0, darwin arm64): `roadmap/baseline/bench-2026-11-22-darwin-arm64-node24.15.0-run1.json`, `-run2.json`, `-run3.json` (three default invocations, because invocation-to-invocation drift is large) and `-gc.json` (`BENCH_GC=1`, never compare with the others).

**First results — recorded on a heavily loaded machine, so treat absolutes as indicative (see `roadmap/baseline/README.md`); retained-bytes and checksum results are unaffected** (median ops/ms of the three default runs, recorded after fixing `css-interpolation.bench.mjs` so earlier animations are disposed between repetitions; the run-to-run spread is large, ratios are more stable than absolutes):

- `Timeline.seek()` with 2,000 segments: 0% completed 36.5 / 39.2 / 30.8 ops/ms vs 99% completed 12.2 / 12.0 / 3.2 → **3.0×, 3.3× and 9.6× slower with 99% of segments already finished** (the third run's 99% case was noisy), which supports the PERF-009 premise.
- SVG path interpolator, 128 segments: 3.5 / 3.6 / 3.1 ops/ms (≈ 0.28–0.32 ms per frame).
- `animate()` over 100 mock elements × 3 properties: 1.8 / 2.1 / 2.1 ops/ms (≈ 0.5 ms per frame, mock DOM only).
- Value interpolation (resolved per-frame interpolator): number 88k–204k ops/ms (this one drifted 2.3× between invocations); hex color ≈ 1.9k; numeric-template string ≈ 600–640 — one to two orders of magnitude slower than numbers.
- Retained heap per instance: `BehaviorSubject` 120 B, `Animation` 1,641 B, `Tween` 2,386 B, `Keyframes` (3 frames) 2,986 B, empty `Timeline` 1,873 B, `Timeline` with 10 `Animation`s 18,987 B — an `Animation` costs ≈ 14 `BehaviorSubject`s (CV < 0.4%), so PERF-011 is worth pursuing.
- Observer on/off comparisons in all three default runs are labelled "within noise". Noise bands on this machine: fallback 16–40% for means and 130–188% for tail metrics.

## Problem

Existing benchmarks use `Animation` with empty callbacks and mock adapters; none exercise value interpolation, `Keyframes`, CSS interpolation, SVG morphing, `Timeline` with many *completed* segments, or heap use per instance. Optimizing those without a benchmark is guesswork.

## Evidence

- `benchmarks/` contains only `frame-coordinator`, `timeline`, `animation-load`, `adapters` (+ utils, run-all).
- `benchmarks/animation-load.bench.mjs` drives `Animation`, not `Tween`/`Keyframes`, so `src/values/interpolate.ts` is never on the measured path.
- The adapter benchmark README line: "uses lightweight mock targets … does not measure browser layout, SVG painting, or Canvas rasterization".
- The nested timeline benchmark covers 2000 segments but its seek pattern is overlapping scrub; it does not isolate the cost of iterating segments that already finished (`Timeline.updateAt`, `src/core/Timeline.ts:360-370`).

## Scope

- `benchmarks/interpolate.bench.mjs`: number, hex/rgb color, numeric-template string, array, object tweens; ops/ms and allocations (heap delta).
- `benchmarks/keyframes.bench.mjs`: 2, 5, 20 keyframes, default vs per-frame easing.
- `benchmarks/css-interpolation.bench.mjs`: `interpolateCssValue` for px, transform lists, colors.
- `benchmarks/path-morph.bench.mjs`: `createSvgPathInterpolator` for 8-, 64- and 128-segment paths.
- `benchmarks/timeline-completed.bench.mjs`: 2000 segments of which 0%, 50%, 99% have completed.
- `benchmarks/memory.bench.mjs`: heap per `Animation`, `Tween`, `Keyframes` instance (requires BENCH-007 GC control).
- Register all of them in `run-all.bench.mjs` and add the scripts `bench:interpolate`, `bench:keyframes`, `bench:css-interpolation`, `bench:path-morph`, `bench:timeline-completed`, `bench:memory`.

## Non-goals

- No browser/layout measurement here (see BENCH-009).

## Risks

- Microbenchmarks can be dead-code-eliminated; each must consume results into a checksum sink like the existing `workSink`/`callbackSink`.

## Acceptance criteria

Every box must be checkable by running the named command or inspecting the named file.

- [x] Each new script prints one valid JSON report via the BENCH-006 mechanism and is included in `npm run bench`.
- [x] Each new script asserts a deterministic checksum so a no-op implementation fails (mirrors the existing sink pattern).
- [x] A new baseline file covering the new workloads is committed under `roadmap/baseline/` and referenced from `roadmap.md`.
- [x] Every PERF item in `roadmap/` names the benchmark command it is judged on (`grep -L "npm run bench\|run-browser-benchmark" roadmap/PERF-*.md` prints nothing).
- [ ] `npm run bench` still completes without errors on Node 22 and 24.

## Shared gates

**Code gate** (see `roadmap/README.md`)
- [x] `npm run typecheck` and `npm run typecheck:tests` pass.
- [x] `npm test -- --runInBand` passes (record the test count; it must not decrease unless tests are intentionally replaced).
- [x] `npm run check:tree-shaking`, `npm run check:package` and `npm run check:package:consumer` pass.
- [x] No change to public `.d.ts` output unless intended; any intended change is recorded in `CHANGELOG.md` under Unreleased.
