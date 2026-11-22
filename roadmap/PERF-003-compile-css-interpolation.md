# PERF-003 — Tokenize CSS keyframe pairs once

| Category | Impact | Risk | Effort | Priority score | Phase | Depends on |
|---|---|---|---|---|---|---|
| Performance | 4 | 2 | 3 | **18** | 1 | [REFACTOR-003](./REFACTOR-003-unify-value-parsing.md), [BENCH-008](./BENCH-008-hot-path-benchmarks.md) |

Priority = (Impact + Risk) × (6 − Effort). Back to the [roadmap](../roadmap.md).

## Problem

`animate()` calls `interpolateCssValue` for every element × property × frame, and each call tokenizes both strings with a regex and rebuilds the string.

## Evidence

- `src/adapters/dom/cssInterpolation.ts` `interpolateCssValue`: calls `tokenizeCssValue(from)` and `tokenizeCssValue(to)` and `from.replace(NUMERIC_CSS_TOKEN, …)` on every invocation.
- `src/adapters/dom/animation.ts` `animate()` builds one `Keyframes<string>` per element per property with `interpolate: interpolateCssValue`, so cost is O(targets × properties × frames).
- Baseline `adapterUpdates`, `targetCount=1000`, `dom-style-binding`: mean frame 0.25 ms, p99 1.04 ms, worst 3.4 ms — on a *mock* style target and numeric-only values; real string values add this tokenization.

## Scope

- Add a `compileCssInterpolator(from, to)` that returns `(progress) => string`; `Keyframes` accepts an interpolator *factory* (internal) so `animate()` compiles once per segment.
- Retain the incompatible-template fallback (switch at the endpoint) and color path.

## Non-goals

- No change to how starting values are read from computed style (see PERF-010).

## Risks

- `Keyframes` public option `interpolate` must keep its current signature; factory support must be additive/internal.

## Status and target (written before measuring the implementation)

**Status: implemented locally (uncommitted); correctness criteria verified, targets met in every interleaved pair, the "quiet machine" part of the performance gate is annotated as unmet.** Order of work: (1) the differential test `tests/adapters/cssInterpolation.differential.test.ts` was written first, with a verbatim copy of the pre-PERF-003 `interpolateCssValue` as oracle, and was green on the untouched code (its candidate was the existing function); (2) the baseline below was recorded on the unchanged build `6dcc80e`, built in a temporary git worktree outside the repo, via `node --expose-gc benchmarks/css-interpolation.bench.mjs --out <file>`; (3) this target was written; (4) only then was the implementation measured. Honest note on ordering: a first draft of the `src/` change already existed on disk while the baseline was running (it was not built or run until the baseline had finished), and no after-number had been seen when this section was written.

> Evidence corrected when work started (working rule 3): the worktree branch was behind `main`; at `6dcc80e` the CSS path already uses the shared `valueTemplate` module (`tokenizeNumbers`, `parseColor`, `mixRgba`), so the per-call cost is two `tokenizeNumbers` regex passes, two `parseColor` attempts, a `renderNumericTemplate` regex replace with a callback per number, and (for same-template colors) `renderColorFunction`, which splits the template again on every call. It is not the old `replace`/`Number()` code the audit text describes.

**Baseline** (3 invocations of `css-interpolation.bench.mjs`, 10 repeats each, GC-controlled, Node 24.15.0, darwin arm64, **machine heavily busy: load average 55–58 on 8 cores, `harness.system.busy: true`**). `elapsedMs` is the median of 10 repeats for one repetition:

| Case | median ms / repetition (3 invocations) | ≈ µs / op | within-run CV | scavenges / M ops (default heap) |
|---|---|---|---|---|
| `animate()` pipeline, 10 elements × 3 properties (20,000 seeks) | 901.9, 980.2, 1062.1 | 45–53 | 17–21% | 2,350 |
| `animate()` pipeline, 100 elements × 3 properties (2,000 seeks) | 1234.2, 940.0, 850.2 | 425–617 | 3.2–46% | 12,000 |
| `interpolateCssValue` px-length (200,000 calls) | 380.8, 263.3, 145.9 | 0.73–1.90 | 2.5–42% | 345 |
| `interpolateCssValue` transform-list (200,000 calls) | 1062.6, 393.2, 296.2 | 1.5–5.3 | 14–41% | 195 |

Between invocations the one-shot micro-cases drift by up to 7× on this machine (load, not code), so they cannot show a difference; the pipeline cases drift by ±10–20% and are the only usable timing signal. Per-case numbers for all eight cases are in the Measurements table below.

**What the baseline says about the ceiling.** The 10-element pipeline spends about 1.5 µs per element × property × frame in `interpolateCssValue` for the transform value and well under 1 µs for the others, inside a ≈ 45–53 µs seek that also contains `Keyframes` bookkeeping, `BehaviorSubject`/`map` emission and `bindStyle`; and the number formatting (`formatNumber`: `toFixed` + `Number` + `String`) is the same before and after. A modest win is therefore expected, not a multiple.

**Target (derived from the baseline above; descriptive, never a CI gate).**

- Both `animate()` pipeline cases: median `elapsedMs` at least **15% lower** than the interleaved before-build (ratio ≤ 0.85), with the same sign on every pair of ≥ 3 interleaved invocations per side.
- Allocation: `scavengesPerMillionOps` with `--min-semi-space-size=1 --max-semi-space-size=1` at least **20% lower** for both pipeline cases (this count is deterministic, so it is the most defensible metric).
- `interpolateCssValue` micro-cases (public one-shot function, unchanged code): **no regression** (within the noise of the interleaved pairs; on this machine they cannot demonstrate an improvement or a regression below about ±50%).
- No-regression: `bench:adapters` `dom-style-binding` mean frame time (1000 targets, no CSS interpolation involved) and the `memory` workload `medianBytesPerInstance` must not rise beyond the interleaved noise band.
- Report, with no target: the construction cost of `animate()` (compile at construction instead of per frame) and whether memory is released after `dispose()`.
- If a target is missed or cannot be shown outside noise, its criterion stays unticked and the shortfall is reported with the numbers.

## Status: what changed, results and caveats

**What changed**

- `src/adapters/dom/cssInterpolation.ts`: new `compileCssInterpolator(from, to)` returning `(progress) => string`, and `compiledCssInterpolator()` (the `interpolate` option `animate()` now passes). The pair is tokenized and parsed once. Colors reuse `compileColorMix` (the `rgba(r, g, b, a)` output); numeric templates reuse `compileNumericTemplate` (up to 3 numbers) and `compileNumericTemplateJoined` (4 or more); same-template `rgb()`/`rgba()` pairs, which keep the author's function, spacing and percentages, use a new `compileColorTemplate`. The closure returns the exact input at progress 0 and 1, switches discretely for incompatible values, and sends non-finite progress to the unchanged one-shot `interpolateCssValue`, so even `NaN`/`Infinity` match the old output. `interpolateCssValue` itself is unchanged and still public.
- `src/values/compiledInterpolators.ts` (new, internal, not exported from any entry point): a `WeakMap` that lets an interpolator function carry a per-segment compiler (`withInterpolatorCompiler`, `getInterpolatorCompiler`). `Keyframes` asks it once in its constructor and compiles each segment; without a registered compiler the code path is the previous `resolveInterpolator`. The public `interpolate` option and `KeyframesOptions` types are untouched, and nothing runs at module load (the registry is filled lazily on the first `animate()` call), so `check:tree-shaking` is unaffected.
- `src/utils/valueTemplate.ts` (internal): new `compileColorTemplate`.
- `src/adapters/dom/animation.ts`: `animate()` passes `compiledCssInterpolator()` instead of `interpolateCssValue`.
- Public `.d.ts` output: `dist/adapters/dom.d.ts`, `dist/values/Keyframes.d.ts`, `dist/types/values.d.ts` and the other 55 declaration files are byte-identical before and after `npm run build:lib`. Internal additions only: `dist/adapters/dom/cssInterpolation.d.ts` (+`compileCssInterpolator`, +`compiledCssInterpolator`; `adapters/dom/index.ts` re-exports by name and does not reach them), `dist/utils/valueTemplate.d.ts` (+`compileColorTemplate`) and the new `dist/values/compiledInterpolators.d.ts`. None is reachable from a package entry point (`check:package` and `check:package:consumer` pass).

**Correctness evidence.** `tests/adapters/cssInterpolation.differential.test.ts` (9 tests) compares the compiled interpolator with the verbatim pre-PERF-003 implementation on 1,700+ pairs (about 40 hand-picked, 200 long templates with 9–32 numbers (`matrix3d`, shadow lists, dash arrays), 1,500 seeded random: signed, exponent, `.5`/`5.` numbers, px/%/em/deg/unitless, multi-token transforms, hex 3/4/6/8 digits, `rgb()`/`rgba()` with commas, spaces, `/`, percentages and out-of-range channels, leading/trailing spaces, upper case, incompatible pairs) × 20 progress values (0, −0, 1, overshoot ±, `NaN`, `±Infinity`, random) = more than 34,000 comparisons, using `Object.is` on the output strings; it also asserts that the generator reaches each branch and the 4–8 and 9+ number ranges. The same file checks that the public `interpolateCssValue` still equals the oracle, that `Keyframes` calls the compiler once per segment at construction and never per frame, and that `animate()` over a mock element writes the same declaration as a `Keyframes` using the oracle at 11 seek times across multi-keyframe sequences (length, transform, hex/rgb/`rgb( / )`/percent colors, incompatible, unitless). Mutation checks turned it red and were reverted (a `1e-6` perturbation of one end value in the joined path, a `*99` percent-alpha scale, removal of the non-finite fallback). `tests/adapters/dom.test.ts` and `tests/adapters/dom-scroll-trigger.test.ts` pass unchanged (files not modified). Full suite: 47 suites, 845 tests (836 before + 9).

**Measurements** (Node 24.15.0, darwin arm64, 8 cores; before = unchanged `6dcc80e` built in a temporary git worktree outside the repo, after = this tree built and snapshotted; 3 invocations per side, order alternated per pair, 10 repeats each; `node --expose-gc benchmarks/css-interpolation.bench.mjs --out <file>`; **the machine was busy throughout: load average 49–61 for the timing pairs and 24–41 for the allocation, adapters and memory pairs, `harness.system.busy: true` in every report**). `elapsedMs` median per repetition (20,000 seeks for 10 elements, 2,000 seeks for 100 elements):

| Case | before (ms, 3 pairs) | after (ms, 3 pairs) | paired ratio after/before | scavenges / M ops, default heap, before → after | scavenges / M ops, 1 MB semi-space, before → after |
|---|---|---|---|---|---|
| `animate()` pipeline, 10 elements × 3 properties | 890 / 895 / 856 | 439 / 435 / 428 | 0.49 / 0.49 / 0.50 | 2,350 → 1,125–1,225 | 77,950–78,025 → 35,000 (−55%) |
| `animate()` pipeline, 100 elements × 3 properties | 881 / 904 / 822 | 435 / 424 / 419 | 0.49 / 0.47 / 0.51 | 12,000 → 5,000 | 875,250–876,000 → 390,000–393,000 (−55%) |
| `interpolateCssValue` px-length (unchanged function) | 135 / 136 / 132 | 137 / 138 / 137 | 1.01 / 1.01 / 1.04 | 345 → 345 | 1,410 → 1,410 |
| `interpolateCssValue` unitless | 109 / 103 / 101 | 104 / 106 / 105 | 0.96 / 1.03 / 1.04 | 325 → 325 | 1,315 → 1,315 |
| `interpolateCssValue` transform-list | 277 / 285 / 277 | 300 / 288 / 288 | 1.08 / 1.01 / 1.04 | 195 → 195 | 1,580 → 1,580 |
| `interpolateCssValue` color-hex | 192 / 189 / 180 | 202 / 189 / 186 | 1.05 / 1.00 / 1.03 | 245 → 245 | 2,005 → 2,005 |
| `interpolateCssValue` color-rgb | 393 / 373 / 369 | 681 / 376 / 374 | 1.73 / 1.01 / 1.01 | 440 → 440 | 3,580 → 3,580 |
| `interpolateCssValue` incompatible-templates | 53 / 52 / 50 | 53 / 52 / 51 | 1.01 / 1.00 / 1.03 | 45 → 45 | 720 → 720 |

The `animate()` pipeline is about 2× faster per seek on every pair of both sizes, with the same sign everywhere and a ratio spread (0.47–0.51) far smaller than the 17–46% within-run variability and the ±10–20% between-invocation drift seen in the baseline; the allocation counts are deterministic (identical on every invocation). The one-shot micro-cases run the unchanged function: ratios within ±8% (one 1.73 is a single stalled `color-rgb` after-run, the other two pairs read 1.01) and identical allocation, as expected. The earlier baseline (3 invocations at load 55–58) read 901.9–1062.1 ms for the 10-element case, consistent with the interleaved before-side above.

`bench:adapters` `dom-style-binding` (mean frame, `medianOfRunMeanFrameMs`, 3 interleaved pairs): 100 targets 0.0479/0.0473/0.0475 ms before and 0.0492/0.0478/0.0476 after (ratios 1.03/1.01/1.00); 1,000 targets 0.2237/0.2225/0.2239 before and 0.2243/0.2145/0.2397 after (ratios 1.00/0.96/1.07). No consistent sign: no regression beyond noise (that workload feeds a mock target and does not use the CSS interpolator). `bench:memory` `medianBytesPerInstance`, before → after: `Animation` 1641.3 → 1641.3, `Tween<number>` 2433.9 → 2433.9, `Timeline` (empty) 1873.3 → 1873.3, `Timeline` (10 Animations) 18986.5 → 18986.5, `Keyframes<number>` (3 frames) 3154 → 3162 (**+8 bytes, +0.25%, deterministic**: the constructor's `map` callback now closes over the compiler lookup).

`animate()` construction and retention (scratch scripts `lifecycle.mjs` and `retention.mjs`, `node --expose-gc`, 3 interleaved invocations per side, saved in the notes folder):

| | before | after |
|---|---|---|
| `animate()` + `dispose()` over 100 elements × 3 properties, median ms (7 × 30 constructions) | 1.599 / 1.670 / 1.561 | 2.026 / 2.081 / 1.981 (≈ +0.4 ms, ≈ +1.4 µs per element × property) |
| retained heap of a live (not disposed) animation, 1,000 elements × 3 properties | 5,276 B per element × property | 6,200 B (+≈ 925 B, +17.5%) |
| 50 animations over 200 elements created in a helper function, then `dispose()` and 5 `gc()` rounds | 0 of 50 reachable | 0 of 50 reachable |
| same, dropped without `dispose()` | 0 of 50 reachable | 0 of 50 reachable |

The compile happens once per property pair when `animate()` constructs its `Keyframes` (so it is paid at construction, not per frame), costs about as much as 2 frames of the old per-call tokenization, and is repaid from the second seek on. Memory is not retained after `dispose()` or after dropping the animation (a `WeakRef` to the animation was cleared in every trial); the compiled closures, `Float64Array`s and literal pieces live and die with their `Keyframes`, and the registry is a `WeakMap` keyed by one module-level function. The price is about 0.9 KB more retained per element × property while an animation is alive.

**Threshold for the joined renderer.** `JOINED_TEMPLATE_THRESHOLD = 3` comes from a scratch measurement (`threshold.mjs`: 1 MB semi-space, 300,000 frames per size, loaded machine): `compileNumericTemplate` (`+=`) and `compileNumericTemplateJoined` give the same young-generation collections at 3 numbers and 24–32% fewer for the joined renderer from 4 numbers up (6: 647 → 520, 12: 1,327 → 980, 24: 2,700 → 1,913 per million frames) at about the same speed (joined 4–8% slower per op in that run, within the load noise). It is a heuristic taken from one machine, not a tuned optimum.

**Caveats**

- The machine was never quiet (load per core 3–7.5 against the 0.5 threshold in every measured run), so absolute times are inflated and the harness flags every report `busy`; the roughly 2× ratio and the deterministic scavenge counts are the meaningful figures, and the roadmap's "quiet machine" requirement is therefore not met (below).
- The measured after-build predates one cosmetic edit: the incompatible-template closure was `progress < 1 || progress === 0 ? from : to` and is now `progress < 1 ? from : to` (identical result, covered by the differential test); the full test suite and all checks were run on the final tree.
- The improvement applies to `animate()` (compile at construction). `interpolateCssValue` called directly, or passed by a user as `interpolate` to `Tween`/`Keyframes`, behaves and costs exactly as before.
- About 90% of a long numeric frame is `formatNumber` itself (see PERF-004), which is unchanged; the pipeline cases still pay for `Keyframes`, RxJS emission and `bindStyle` (PERF-006 targets the latter).
- Not done: identical `from`/`to` pairs across many elements are still compiled once per element (a per-`animate()` cache would make construction O(distinct pairs); not needed for the measured win). A literal U+0000 inside a CSS value makes the split-based renderers drop trailing pieces where the oracle's `replace` emits `NaN` (the same pattern exists in `compileNumericTemplate` from PERF-002).
- `check:browser-integration` (part of `check:all`) and `npm run build --workspace=re-flux-docs` were not run.
- Raw reports, the interleaving scripts, the aggregation scripts and the scratch measurements are in the shared notes folder `…/side-session-notes/local_48213d00-0d84-4d49-b351-5a6d99323120/perf-003/` (`before-{time,alloc,adapters,memory}-N.json`, `after-…`, `before-run{1,2,3}.json` for the initial baseline).

## Acceptance criteria

Every box must be checkable by running the named command or inspecting the named file.

- [x] `tests/adapters/dom.test.ts` and `tests/adapters/dom-scroll-trigger.test.ts` pass unchanged. (Files not modified; pass in the full run.)
- [x] Parity test: for ≥200 sampled from/to pairs (px, %, em, transform lists, rgb/hex colors, incompatible templates) and 11 progress values, compiled output equals `interpolateCssValue` output. (1,700+ pairs × 20 progress values against a verbatim copy of the old implementation; `npm test -- --runInBand tests/adapters/cssInterpolation.differential.test.ts`.)
- [x] `npm run bench:css-interpolation` median time per 1e6 calls is lower than baseline by the target recorded before work begins, outside noise; `bench:adapters` `dom-style-binding` (1000 targets) mean frame time does not regress. (Pipeline cases: ratio 0.47–0.51 against the ≤ 0.85 target on all 6 interleaved pairs, allocation −55% against the −20% target; `dom-style-binding` 1,000 targets ratios 1.00/0.96/1.07, no consistent sign. The criterion's wording "per 1e6 calls" refers to the one-shot micro-cases, which run unchanged code and cannot improve; the target was therefore set on the `animate()` pipeline cases. Measured on a busy machine, see the Performance gate below.)
- [x] `dist/adapters/dom.d.ts` has no unintended diff. (Byte-identical; only internal declarations were added, listed above.)

## Shared gates

**Code gate** (see `roadmap/README.md`)
- [x] `npm run typecheck` and `npm run typecheck:tests` pass.
- [x] `npm test -- --runInBand` passes (record the test count; it must not decrease unless tests are intentionally replaced). (47 suites, 845 tests; 836 before, +9 in the new differential file.)
- [x] `npm run check:tree-shaking`, `npm run check:package` and `npm run check:package:consumer` pass. (`npm run check:docs` also passes.)
- [x] No change to public `.d.ts` output unless intended; any intended change is recorded in `CHANGELOG.md` under Unreleased. (No public change; internal additions listed above.)

**Performance gate** (see `roadmap/README.md`)
- [ ] Performance comparison follows `roadmap/README.md` → "Performance gate": same machine and Node version as the baseline, median of ≥5 repeats (≥10 once BENCH-007 lands) of the named `bench:*` command, compared with `npm run bench:compare`. Timings are **never** a CI gate. **Partly met, not ticked:** same machine and Node 24.15.0, 10 repeats, 3 interleaved invocation pairs per side, paired ratios computed with a scratch script (`npm run bench:compare` was not run on these pairs); **not met:** the quiet-machine requirement (`busy: true`, load 24–61 on 8 cores in every run). The result is far outside the noise (about 2× against ±10–20% drift), so it is unlikely to change on a quiet machine, but that has not been shown.
- [x] The improvement target for this item is written into this file *before* implementation starts (taken from the BENCH-008 baseline); the PR links the before/after JSON. (Target written after the baseline and before any after-measurement; see the ordering note in the Status. The JSON reports are in the notes folder above, to attach to the PR.)
- [ ] No other workload in `npm run bench` regresses beyond the measured noise band. **Not ticked:** the full suite was not run before/after; measured instead: `css-interpolation` (all 8 cases), `adapters` (`dom-style-binding`, 100 and 1,000 targets) and `memory` (no change beyond +8 B on `Keyframes<number>`). `keyframes`, `interpolate`, `timeline` and the other workloads do not call the changed code except through `Keyframes`' constructor lookup, which is not on a per-frame path.
