# PERF-004 — Path morph: pre-split template and use typed arrays per frame

| Category | Impact | Risk | Effort | Priority score | Phase | Depends on |
|---|---|---|---|---|---|---|
| Performance | 3 | 2 | 2 | **20** | 1 | [BENCH-008](./BENCH-008-hot-path-benchmarks.md) |

Priority = (Impact + Risk) × (6 − Effort). Back to the [roadmap](../roadmap.md).

## Problem

Every frame the SVG path interpolator re-fills a template string with `String.prototype.replace` and a callback per number, reading each value out of two `number[]` arrays and formatting it.

## Evidence

> Corrected when work started (working rule 3). The audit text described the interpolator as it was before REFACTOR-003 (regex over the whole path and `Number()` on every token every frame, `toNumbers: string[]`). At `ea69062` the numbers are already parsed once (`tokenizeNumbers`) and the per-frame work is `renderNumericTemplate(template, produce)`: a `replace(/\u0000/g, callback)` over the template per frame, plus a `formatNumber` call per number. The original implementation is kept in the differential test as a second oracle.

- `src/adapters/svg/pathMorph.ts` `createSvgPathInterpolator`: the returned closure calls `renderNumericTemplate`, which runs a global regex replace with a callback for every slot, and indexes two `number[]`.
- `src/utils/valueTemplate.ts` already has `compileNumericTemplate`, which splits the template into literal pieces and `Float64Array` start/end values once; PERF-002 uses it for string endpoints.
- Paths may have up to 64 subpaths × 128 cubic segments (`MAX_SUBPATHS`, `maxSegmentsPerSubpath` default), but the 100,000-character input cap (`MAX_PATH_LENGTH`) limits a path to roughly 15 full 128-segment subpaths, i.e. about 11k numbers per frame.

## Scope

- At creation time, split the normalized `from` string into `strings[]` (static template pieces) and `Float64Array` start/end values; per frame build the string by joining formatted numbers.
- Keep `formatNumber` output identical.

## Non-goals

- No change to path normalization quality or limits.

## Risks

- String building cost may dominate; verify with the benchmark that the change is a win for small and large paths.

## Status and target (written before implementation)

**Status: implemented locally (uncommitted); correctness criteria verified, the timing criterion is annotated as unmet under its strict wording.** The differential test (`tests/adapters/svgPathMorph.differential.test.ts`) was written first and is green on the untouched code. It keeps two oracles inside the file: the `ea69062` interpolator verbatim, and the original pre-REFACTOR-003 regex implementation. It covers 65 path pairs × 11 progress values (arcs, relative commands, multiple subpaths, open/closed, exponent and negative numbers, `1e21` outputs, alignment off, the 100,000-character maximum: 15 × 128-segment subpaths and one 2,000-segment subpath with `maxSegmentsPerSubpath: 2048`, and 64 subpaths), plus out-of-range and non-finite progress and rejected inputs. A mutation check (`progress + 1e-4`, and `* 0.9999` in the new renderer) turned it red (64 and 67 failures) and was reverted. Baseline recorded on the unchanged build `ea69062`, built in a temporary git worktree outside the repo, via `node --expose-gc benchmarks/path-morph.bench.mjs --out <file>`.

**Baseline** (4 invocations × 10 repeats, GC-controlled, Node 24.15.0, darwin arm64, **machine busy: load average 21–27 on 8 cores**, `harness.system.busy: true` in every report). `elapsedMs` is the median of 10 repeats for one repetition (8-segment: 2,000 frames; 64-segment: 2,000; 128-segment and 8→128: 1,000 frames):

| Case | median ms / repetition (4 invocations) | ≈ µs / frame | within-run CV | scavenges / M ops |
|---|---|---|---|---|
| 8-segments | 24.0, 24.3, 23.6, 25.0 | ≈ 12.1 | 1.4–16% | 500 |
| 64-segments | 189.9, 193.9, 194.6, 193.1 | ≈ 96.5 | 0.6–5.7% | 2,500 |
| 128-segments | 190.7, 194.2, 193.1, 192.7 | ≈ 193 | 1.1–5.0% | 2,000 |
| 8-to-128-segments | 189.1, 190.4, 192.2, 204.6 | ≈ 192 | 0.5–7.0% | 2,000 |

Between invocations the 128-segment median varied by ≈ ±1% (190.7–194.2 ms), which is the noise band used below.

**What the baseline says about the ceiling.** A 128-segment normalized path has 770 numbers. A scratch measurement (not part of the repo) of `formatNumber` alone over those 770 numbers, joined with spaces and with no regex and no `Number()` parsing, took ≈ 175 µs/frame on the same loaded machine, against ≈ 193 µs for the whole current frame; `toFixed(5)` alone is ≈ 57 µs. So roughly 90% of the per-frame cost is `formatNumber` itself (`toFixed` + `Number` + `String`), which this item must keep byte-identical and unchanged. Removing the regex replace and the per-frame `Number()` parsing can recover at most the remaining ≈ 10% (≈ 18 µs/frame). This is the risk named above ("string building may dominate"), confirmed before any code was written.

**Target (derived from the baseline above; descriptive, never a CI gate).**

- 128-segment case: median `elapsedMs` at least **5% lower** than the baseline mean of ≈ 193 ms (that is ≤ ≈ 183 ms), reproduced on every interleaved before/after pair (≥ 3 invocations per side), outside the ≈ ±1% between-invocation band. A larger win is not expected; the arithmetic ceiling is ≈ 9–10%.
- 8-segment case: no regression. Median `elapsedMs` not more than **+3%** above the interleaved baseline on the same pairs (the 8-segment case is ≈ 12 µs/frame, so its CV is larger on a loaded machine; a result inside noise counts as "no regression", not as an improvement).
- Allocation: `scavengesPerMillionOps` (with `--min-semi-space-size=1 --max-semi-space-size=1`) must not increase for any case; a decrease is reported but not required.
- If the 128-segment target is missed, the criterion stays unticked and the shortfall is reported with the numbers.

## Status: what changed, results and caveats

**What changed**

- `src/adapters/svg/pathMorph.ts` `createSvgPathInterpolator`: after the structure check it builds `compileNumericTemplateJoined(fromTemplate, toTemplate)` once; the returned closure keeps the `Number.isFinite(progress)` `RangeError` and calls it. Normalization, limits and `formatNumber` are untouched.
- `src/utils/valueTemplate.ts` (internal, not exported from any entry point): new `compileNumericTemplateJoined`. It splits the template into literal pieces and `Float64Array` start/end values once; the pieces sit at the even indices of one reused `string[]`, each frame writes the formatted numbers into the odd indices and calls `join('')`. Same output as `compileNumericTemplate` (unit-tested in `tests/utils/valueTemplate.test.ts`). The array is retained for the interpolator's lifetime (2 × numbers + 1 slots, ≈ 12 KB for a 128-segment path).
- Public `.d.ts` output: identical before and after `npm run build:lib` (58 files, same list) **except** the internal `dist/utils/valueTemplate.d.ts`, which gains the `compileNumericTemplateJoined` declaration; the module is not reachable from any package entry point (`check:package` and `check:package:consumer` pass).

**Why not plain concatenation (`compileNumericTemplate`).** It was implemented and measured first: 12 interleaved pairs showed a paired median ratio ≈ 0.90 (faster) on the 128-segment case, but allocation with `--min-semi-space-size=1 --max-semi-space-size=1` **rose** (128-segment 90,000 → 106,000 scavenges per million ops; 8-segment 5,500 → 6,500; deterministic across 4 invocations): `+=` creates a cons-string node per number and `consume()`/`setAttribute` flatten it afterwards. That broke the "allocation must not increase" part of the target, so the joined variant replaced it (same speed class, allocation down instead of up).

**Measurements** (Node 24.15.0, darwin arm64, 8 cores, **machine busy throughout: load average 27–40, `harness.system.busy: true`**; 10 repeats per invocation, GC-controlled; before = unchanged `ea69062` build, after = this tree, 8 interleaved invocation pairs with alternating order; `elapsedMs` median per invocation, 8-segment: 2,000 frames, 64/128-segment: 1,000–2,000 frames as in the benchmark):

| Case | before (median of 8 invocation medians) | after | paired ratio after/before: median (range) | pairs faster |
|---|---|---|---|---|
| 8-segments | 25.0 ms | 22.5 ms | 0.896 (0.89–0.92; one outlier pair 0.26 where the before run hit a stall) | 8/8 |
| 64-segments | 197.1 ms | 183.4 ms | 0.916 (0.86–0.96) | 8/8 |
| 128-segments | 196.0 ms | 181.0 ms | 0.933 (0.83–0.98) | 8/8 |
| 8-to-128-segments | 195.7 ms | 183.6 ms | 0.943 (0.89–0.96) | 8/8 |

128-segment raw medians (ms), before: 218.1 201.9 189.3 192.0 195.6 193.4 199.3 196.4; after: 181.2 188.2 180.7 187.3 177.3 180.7 179.9 184.9. Against the recorded baseline mean (≈ 193 ms) the median after-value 181.0 ms is −6.2%, i.e. below the ≤ 183 ms target, but individual pairs 3 and 4 only reach −5% and −2%.

Allocation (`node --expose-gc --min-semi-space-size=1 --max-semi-space-size=1`, same flags on both sides, 3 interleaved invocation pairs; the count is deterministic, identical in every invocation):

| Case | scavenges / million ops before → after | change |
|---|---|---|
| 8-segments | 5,500 → 4,000 | −27% |
| 64-segments | 44,500 → 33,500 | −25% |
| 128-segments | 90,000 → 67,000 | −26% |
| 8-to-128-segments | 90,000 → 67,000 | −26% |

(`npm run bench:compare` on a pair of these reports labels the 8-segment and 64-segment elapsed rows "faster/better" and the allocation rows "faster/better"; on the default, non-constrained heap the scavenge counts are quantized to 1–3 collections per repetition and flip between "worse" and "better" from rounding alone, so allocation is only read from the constrained runs.) Raw reports, the interleaving script and the aggregation script are saved outside the repo in the shared notes folder, `…/side-session-notes/local_48213d00-0d84-4d49-b351-5a6d99323120/perf-004/` (`before-*`, `b2-*`, `after-*` for the `+=` variant, `joined-*`, `*-alloc-*`).

**Caveats**

- The machine was never quiet (`busy: true`, load per core 3–5 against the 0.5 threshold), so absolute numbers are inflated and the harness itself says not to draw conclusions; only the interleaved ratios and the deterministic scavenge counts are meaningful. The "outside noise" test is therefore indicative, and the timing criterion below stays unticked.
- The result is a 6–10% per-frame speed-up and −25% allocation, as predicted by the ceiling analysis; the item's expectation of a large win does not hold, because ≈ 90% of the frame is `formatNumber` itself (`toFixed` + `Number` + `String`), which is out of scope.
- The audit's "~49k numbers per frame" is not reachable: the 100,000-character input cap bounds a path to roughly 11–12k numbers.
- `check:browser-integration` (part of `check:all`) and `npm run build --workspace=re-flux-docs` were not run.
- **Follow-up evidence (not done here).** A scratch formatter that returns the same string as `formatNumber` for |x| < 1e9 (strip trailing zeros of `toFixed(5)`, `-0` → `0`, fall back to the current code otherwise) matched `formatNumber` on 2,000,000 random values and ran the 770-number frame in ≈ 66 µs against ≈ 175 µs, i.e. about 2.7× faster on the dominant cost. It touches a function shared by `interpolate()`, CSS interpolation and canvas, so it belongs in its own item with its own differential test.

## Acceptance criteria

Every box must be checkable by running the named command or inspecting the named file.

- [x] `tests/adapters/svg.test.ts` passes unchanged. (File not modified; passes in the full run.)
- [x] Differential test: new vs old interpolator output identical for ≥50 path pairs × 11 progress values (old implementation kept in the test file as oracle). (65 pairs, two oracles; `npm test -- --runInBand tests/adapters/svgPathMorph.differential.test.ts`.)
- [ ] `npm run bench:path-morph`: median ms/frame for the 128-segment case is lower than baseline by the pre-recorded target, outside noise; the 8-segment case does not regress. **Not ticked.** The 128-segment median is 181.0 ms against the ≤ 183 ms target and every pair is faster (8/8), and the 8-segment case is 10% faster, not slower; but the target required the gain on every interleaved pair (pairs 3 and 4 reached only −5% and −2%), and all runs were on a busy machine, so "outside noise" cannot be shown. Re-run on a quiet machine before ticking.

## Shared gates

**Code gate** (see `roadmap/README.md`)
- [x] `npm run typecheck` and `npm run typecheck:tests` pass.
- [x] `npm test -- --runInBand` passes (record the test count; it must not decrease unless tests are intentionally replaced). (46 suites, 836 tests; 762 before this item, +71 differential, +3 `compileNumericTemplateJoined`.)
- [x] `npm run check:tree-shaking`, `npm run check:package` and `npm run check:package:consumer` pass. (`npm run check:docs` also passes.)
- [x] No change to public `.d.ts` output unless intended; any intended change is recorded in `CHANGELOG.md` under Unreleased. (Only the internal, unexported `valueTemplate.d.ts` gained a declaration; see above.)

**Performance gate** (see `roadmap/README.md`)
- [ ] Performance comparison follows `roadmap/README.md` → "Performance gate": same machine and Node version as the baseline, median of ≥5 repeats (≥10 once BENCH-007 lands) of the named `bench:*` command, compared with `npm run bench:compare`. Timings are **never** a CI gate. **Partly met:** same machine and Node 24.15.0, 10 repeats, 8 interleaved invocations per side, `bench:compare` run on sample pairs; **not met:** the quiet-machine requirement (busy throughout).
- [x] The improvement target for this item is written into this file *before* implementation starts (taken from the BENCH-008 baseline); the PR links the before/after JSON. (Target written before any `src/` change and not edited afterwards; the JSON reports are in the notes folder above, to be attached to the PR.)
- [x] No other workload in `npm run bench` regresses beyond the measured noise band. (By inspection, not by measurement: only `benchmarks/path-morph.bench.mjs` uses the path interpolator, and `compileNumericTemplateJoined` is used nowhere else; the full suite was not re-run.)
