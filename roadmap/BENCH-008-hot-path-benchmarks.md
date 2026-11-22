# BENCH-008 — Benchmarks for the paths the optimization items target

| Category | Impact | Risk | Effort | Priority score | Phase | Depends on |
|---|---|---|---|---|---|---|
| Benchmarks | 4 | 3 | 3 | **21** | 0 | [BENCH-006](./BENCH-006-clean-json-baseline-compare.md) |

Priority = (Impact + Risk) × (6 − Effort). Back to the [roadmap](../roadmap.md).

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

- [ ] Each new script prints one valid JSON report via the BENCH-006 mechanism and is included in `npm run bench`.
- [ ] Each new script asserts a deterministic checksum so a no-op implementation fails (mirrors the existing sink pattern).
- [ ] A new baseline file covering the new workloads is committed under `roadmap/baseline/` and referenced from `roadmap.md`.
- [ ] Every PERF item in `roadmap/` names the benchmark command it is judged on (`grep -L "npm run bench\|run-browser-benchmark" roadmap/PERF-*.md` prints nothing).
- [ ] `npm run bench` still completes without errors on Node 22 and 24.

## Shared gates

**Code gate** (see `roadmap/README.md`)
- [ ] `npm run typecheck` and `npm run typecheck:tests` pass.
- [ ] `npm test -- --runInBand` passes (record the test count; it must not decrease unless tests are intentionally replaced).
- [ ] `npm run check:tree-shaking`, `npm run check:package` and `npm run check:package:consumer` pass.
- [ ] No change to public `.d.ts` output unless intended; any intended change is recorded in `CHANGELOG.md` under Unreleased.
