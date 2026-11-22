# BENCH-007 — Quantify run-to-run noise and control GC in the harness

| Category | Impact | Risk | Effort | Priority score | Phase | Depends on |
|---|---|---|---|---|---|---|
| Benchmarks | 4 | 3 | 2 | **28** | 0 | [BENCH-006](./BENCH-006-clean-json-baseline-compare.md) |

Priority = (Impact + Risk) × (6 − Effort). Back to the [roadmap](../roadmap.md).

## Problem

Five repeats with no GC control produce variance larger than several effects the report tries to interpret, so small regressions and wins cannot be told from noise.

## Evidence

- Baseline (`roadmap/baseline/bench-2026-11-16-darwin-arm64-node24.15.0.json`): 5000 animations with `callbackWork=4` measured 208 ms elapsed median *with* the metrics observer and 264 ms *without* it. An observer cannot make the engine faster; this is variance or run-order bias.
- Baseline adapters, 1000 targets, `canvas-burst-coalesced`: elapsed 42–166 ms across 5 runs (median 87); worst frame 44.6 ms. `dom-style-binding` 35–74 ms.
- Baseline frame-coordinator: `observedVsUnobservedElapsedDeltaPercent` is −6.18% (observed "faster"), again inside noise; total elapsed per run is ~3 ms, close to timer-resolution territory.
- `node --trace-gc benchmarks/adapters.bench.mjs` showed 113 GC trace lines for the default adapter run (98 for a 1000-target-only run: 96 Scavenge, 2 Mark-Compact), so GC is present while measuring; it is *suspected*, not proven, to explain the tail spikes.

## Scope

- Optional `--expose-gc` path: call `global.gc()` between runs and record heap used before/after each run.
- Raise default repeats (≥10) and report coefficient of variation (CV) and a min/median/max spread per workload.
- Record GC count and total pause for each run via `PerformanceObserver({entryTypes:['gc']})`.
- Emit a `noise` block in the JSON so BENCH-006's compare script can classify deltas as "within noise".

## Non-goals

- Not trying to eliminate variance entirely; goal is to measure and report it.

## Risks

- `--expose-gc` changes behaviour vs. a stock Node; keep it opt-in and record it in the report metadata.

## Acceptance criteria

Every box must be checkable by running the named command or inspecting the named file.

- [ ] Each workload in the JSON report contains `cv` (stdev/mean of elapsed) and `gc: { count, totalPauseMs }` per run.
- [ ] With GC control enabled, running `npm run bench:adapters` five times in a row yields a CV for 1000-target `dom-style-binding` that is documented in the PR and lower than the baseline CV computed from `roadmap/baseline/bench-2026-11-16-darwin-arm64-node24.15.0.json` (record both numbers).
- [ ] The metrics-observed vs metrics-disabled comparison no longer reports the observed mode as meaningfully faster across 3 consecutive full runs (or the report explicitly labels the delta "within noise").
- [ ] `benchmarks/README.md` explains `--expose-gc`, repeat counts and how to read CV.
- [ ] The "suspected GC" hypothesis for tail spikes is either confirmed (spike frames correlate with recorded GC entries) or rejected, and the finding is written into this file.

## Shared gates

**Code gate** (see `roadmap/README.md`)
- [ ] `npm run typecheck` and `npm run typecheck:tests` pass.
- [ ] `npm test -- --runInBand` passes (record the test count; it must not decrease unless tests are intentionally replaced).
- [ ] `npm run check:tree-shaking`, `npm run check:package` and `npm run check:package:consumer` pass.
- [ ] No change to public `.d.ts` output unless intended; any intended change is recorded in `CHANGELOG.md` under Unreleased.
