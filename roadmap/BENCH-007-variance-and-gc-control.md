# BENCH-007 — Quantify run-to-run noise and control GC in the harness

| Category | Impact | Risk | Effort | Priority score | Phase | Depends on |
|---|---|---|---|---|---|---|
| Benchmarks | 4 | 3 | 2 | **28** | 0 | [BENCH-006](./BENCH-006-clean-json-baseline-compare.md) |

Priority = (Impact + Risk) × (6 − Effort). Back to the [roadmap](../roadmap.md).

## Status

**Done 2026-11-22** (a follow-up added machine-load tracking, see the caveat below) (uncommitted on branch `chore/roadmap-phase0`; typecheck, `npm test`, tree-shaking, package and consumer checks pass; no `src/` or `.d.ts` change).

What was built (`benchmarks/benchmark-utils.mjs`, all four existing workloads, `run-all.bench.mjs`, `compare.mjs`):

- Default repeats raised from 5 to 10 (`BENCH_REPEATS`).
- Every measured repetition goes through `observeRun()`: `PerformanceObserver('gc')` entries (Node only delivers them after the event loop turns, so the helper yields once) give `gc.count`, `gc.totalPauseMs`, `gc.maxPauseMs`, `gc.byKind`, heap used before/after, and — for frame-based workloads — a `gcTail` correlation of the slowest 1% of frames with GC pauses.
- Variability: `elapsedMs.cv` / `stdevMs` / `maxOverMin` on every workload summary, `p99FrameVariability` / `seekP99Variability` for the tails.
- Opt-in GC control: `node --expose-gc …`, `npm run bench:gc`, or `BENCH_GC=1` (enables the V8 flag at runtime); `harness.gcControlled` records it.
- `noise` block in the run-all report (twice the median CV; floors 5% / 10%), and `compare.mjs` now sizes each row's band from that workload's own recorded CV.
- The `memory` workload is exempt from per-run `cv`/`gc` fields: it forces full collections by design and reports `bytesVariability.cv` instead. Observer-overhead comparisons carry a `classification` ("within noise" / "second slower" / "second faster") sized from the two workloads' CVs.

**Caveat added after the fact: every measurement below was taken on a heavily loaded machine** (load average above 100 on 8 cores, with other agent sessions and a `rustc` build running — noticed afterwards). The numbers describe that condition, not the library: CVs, drift and noise bands are inflated, and the "GC control lowers CV" comparison is between two loaded sessions. The harness now records machine load (`harness.system`) and warns when it is busy; re-run these experiments on a quiet machine before relying on the magnitudes. The relative finding that slow frames coincide with GC pauses is the part most likely to hold, but it should be re-verified too.

**Measured findings** (Node 24.15.0, darwin arm64, 2026-11-22, loaded machine):

1. *CV of 1,000-target adapter workloads.* Baseline from `bench-2026-11-16-…json` (5 repeats, one invocation, no GC control): `dom-style-binding` **CV 0.319** (elapsed 34.8–73.5 ms); `svg-attribute-binding` 0.402; `canvas-one-emission` 0.285; `canvas-burst-coalesced` 0.461 (42–166 ms). Five invocations × 10 repeats with GC control: `dom-style-binding` within-invocation CV 0.110 / 0.189 / 0.083 / 0.114 / 0.046 (**mean 0.108**, max 0.189); svg 0.073; canvas-one-emission 0.131; canvas-burst 0.155. Without GC control: dom 0.105, svg 0.178, canvas-one 0.191, canvas-burst 0.272. So the criterion is met (0.108 < 0.319) — **but** the dom-style improvement is mostly not due to GC control (0.105 uncontrolled); GC control clearly helps only the canvas workloads, and it raises the medians by roughly 15–50%, so a controlled report must never be compared with an uncontrolled one.
2. *Observer overhead.* Across three consecutive full GC-controlled runs, all 18 observed-vs-disabled `Animation`-load comparisons (6 per run) and all 3 frame-coordinator comparisons are labelled "within noise"; the deltas range from −10.2% to +22.7% with both signs, which confirms the earlier "observer is faster" reading was noise, not a speed-up.
3. *Between-invocation drift is larger than within-invocation CV.* Back-to-back full runs of unchanged code: `frameCoordinator` shared elapsed median 4.8 ms then 16.0 ms; 100-target adapter workloads moved by tens of percent; 1,000-target workloads stayed within a few percent (CV of the medians of five invocations 1.7–6.5%). Consequence documented in `benchmarks/README.md`: save ≥3 reports per side, and treat sub-20 ms workloads as indicative only.
4. *GC and the tail spikes (hypothesis confirmed for p99-class frames).* Without GC control, **51–69%** of the slowest 1% of frames overlapped a GC pause (dom 50.7%, svg 57.3%, canvas-one 68.7%, canvas-burst 64.0%) against **0.9–1.3%** of all frames — a lift of ~49–57×. With forced GC before each run the overlap drops to 3–13% (lift 2–17×). Longest GC pause observed in those 5 × 10 runs: 8.5 ms without control, 16.0 ms with. *Not* shown: that GC explains the single 44.6 ms worst frame recorded in the 2026-11-16 baseline — no GC pause longer than 16 ms was seen in these runs, so that outlier is more likely environmental (background load) than GC.

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

- [x] Each workload in the JSON report contains `cv` (stdev/mean of elapsed) and `gc: { count, totalPauseMs }` per run.
- [x] With GC control enabled, running `npm run bench:adapters` five times in a row yields a CV for 1000-target `dom-style-binding` that is documented in the PR and lower than the baseline CV computed from `roadmap/baseline/bench-2026-11-16-darwin-arm64-node24.15.0.json` (record both numbers).
- [x] The metrics-observed vs metrics-disabled comparison no longer reports the observed mode as meaningfully faster across 3 consecutive full runs (or the report explicitly labels the delta "within noise").
- [x] `benchmarks/README.md` explains `--expose-gc`, repeat counts and how to read CV.
- [x] The "suspected GC" hypothesis for tail spikes is either confirmed (spike frames correlate with recorded GC entries) or rejected, and the finding is written into this file.

## Shared gates

**Code gate** (see `roadmap/README.md`)
- [x] `npm run typecheck` and `npm run typecheck:tests` pass.
- [x] `npm test -- --runInBand` passes (record the test count; it must not decrease unless tests are intentionally replaced).
- [x] `npm run check:tree-shaking`, `npm run check:package` and `npm run check:package:consumer` pass.
- [x] No change to public `.d.ts` output unless intended; any intended change is recorded in `CHANGELOG.md` under Unreleased.
