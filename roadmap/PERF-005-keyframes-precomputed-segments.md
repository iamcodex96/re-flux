# PERF-005 — Keyframes: precompute per-segment easing and remember the last segment

| Category | Impact | Risk | Effort | Priority score | Phase | Depends on |
|---|---|---|---|---|---|---|
| Performance | 2 | 1 | 1 | **15** | 1 | [BENCH-008](./BENCH-008-hot-path-benchmarks.md), [UNIT-010](./UNIT-010-safety-net-for-refactors.md) |

Priority = (Impact + Risk) × (6 − Effort). Back to the [roadmap](../roadmap.md).

## Problem

`Keyframes.updateValue` scans segments linearly and resolves the easing for the segment on every frame.

## Evidence

- ~~`src/values/Keyframes.ts:145` `const easing = resolveEasing(start.easing ?? this.defaultEasing);` inside `updateValue`, which runs every frame.~~ **Stale (found when work started, working rule 3):** API-001 already moved this into the constructor (`segmentEasings`, one `EasingFunction` per segment, including per-keyframe easings), and PERF-002 / PERF-003 already compile the per-segment interpolators once. `updateValue` no longer calls `resolveEasing`. Only the segment scan below remains.
- `updateValue` loops `for (let index = 0; index < this.frames.length - 1; …)` from index 0 each frame; monotonic playback could resume from the previous segment.
- `Keyframes.ts` has 80% line coverage with 62.5% function coverage (coverage run), so the refactor needs UNIT-010 first.

## Scope

- ~~Resolve `frames[i].easing` once in the constructor into an `easings[]` array.~~ Already done (API-001), see Evidence.
- Keep a `lastSegment` cursor and resume from it; when time moves backward or jumps (scrubbing, seeks, yoyo, repeat boundaries) fall back to a correct search. Output values must stay bit-identical.

## Non-goals

- No change to offset normalization rules, to boundary semantics (the segment that owns an exact offset is the earlier one: `normalizedProgress <= candidateEnd.offset`) or to any output value.

## Risks

- Cursor bugs on backward seeks and yoyo; tests must cover forward, backward, scrub-to-start and repeat boundaries.

## Baseline and target (written before implementing)

Baseline = unchanged `c24f194` built in a temporary git worktree outside the repository, `node --expose-gc benchmarks/keyframes.bench.mjs`, **3 invocations**, 10 repetitions × 200,000 `seek()` operations each, Node 24.15.0 darwin arm64. **The machine was heavily loaded (1-minute load average 85–90 on 8 cores, `harness.system.busy: true` in all three reports)**; the three invocations nevertheless agreed within about 2% (except one 100-frame scrub outlier), but this is not a quiet-machine baseline. A 100-frame case (linear forward, per-segment forward, linear scrub) was added to `benchmarks/keyframes.bench.mjs` for this item because that is the only size at which the linear scan is large enough to show; the 2 / 5 / 20-frame cases are unchanged. Median `elapsedMs` per 200,000 ops, per invocation:

| Case | Invocation 1 / 2 / 3 | Median |
|---|---|---|
| `animation-only (reference)` | 14.9 / 14.8 / 14.8 | 14.8 |
| 2 frames › linear › forward | 24.2 / 24.1 / 23.5 | 24.1 |
| 2 frames › linear › scrub | 26.2 / 25.5 / 26.0 | 26.0 |
| 5 frames › linear › forward | 24.9 / 24.9 / 24.8 | 24.9 |
| 5 frames › linear › scrub | 26.2 / 26.5 / 26.4 | 26.4 |
| 20 frames › linear › forward | 26.2 / 26.3 / 26.6 | 26.3 |
| 20 frames › per-segment › forward | 29.9 / 29.9 / 30.0 | 29.9 |
| 20 frames › linear › scrub | 28.5 / 28.8 / 29.0 | 28.8 |
| 100 frames › linear › forward | 36.8 / 35.8 / 36.6 | 36.6 |
| 100 frames › per-segment › forward | 40.7 / 41.0 / 42.0 | 41.0 |
| 100 frames › linear › scrub | 38.1 / 38.8 / 45.1 | 38.8 |

Young-generation collections per million ops are 60–120 in every case (set by `Animation` plus RxJS delivery, not by the scan). The scan allocates nothing, so **allocation is not expected to change** and is only checked for no regression.

What the baseline says: going from 5 to 100 frames costs about 11.7 ms per 200,000 ops, which is the scan (about 50 comparisons per op on average over a uniform forward pass, about 1.2 ns each). With 20 frames the same arithmetic gives about 2–3 ms of 26 ms, and with 2 frames nothing is skippable. Everything else per op (`Animation.seek`, clamping, easing, interpolation, `BehaviorSubject.next`) is untouched by this item.

**Target (modest, and a number the benchmark can actually show):**

- 100-frame forward (linear and per-segment) and 100-frame scrub: median `elapsedMs` at least 15% lower than baseline, in the same direction in every interleaved pair.
- 20-frame forward and scrub: at least 5% lower, or at minimum not slower; if the difference is inside the noise band the result is reported as "no measurable gain" for that case.
- 2-frame and 5-frame cases (including the `animation-only` reference): **no regression** beyond the in-run noise band (about ±3%). The cursor must not slow the common small case; if it does, the cursor is dropped or the lookup is specialised for small frame counts.
- Allocation (`scavengesPerMillionOps`, 1 MB semi-space): unchanged.
- The machine is busy, so none of this can be accepted as a quiet-machine result; before/after are compared interleaved on the same machine and the caveats say what the numbers can and cannot support.

## Status: what changed, results and caveats

**Outcome.** Kept, with a measured threshold: the segment cursor is used only for lists of more than 48 segments (50 or more keyframes); shorter lists keep the original linear scan, so the 2 / 5 / 20-frame cases cost exactly what they did. Output is byte-identical in every case checked. For long lists forward playback is about 27–32% faster per `seek()` and random jumps are about 12% faster at 100 frames. The "20-keyframe case faster by the pre-recorded target" criterion is **not met, by design** (see "Why a threshold").

**What changed**

- `src/values/Keyframes.ts`: `updateValue` asks `locateSegment(progress)` for the segment index instead of looping inline. Below `SEGMENT_CURSOR_MIN_SEGMENTS = 48` segments it runs the same scan as before (`scanForSegment`, first `i` with `progress <= frames[i + 1].offset`, none → segment 0). Above it, the constructor builds two `Float64Array`s (segment start offsets, with the first at `-Infinity`, and segment end offsets) and `lastSegment` is a hint: a hit is `progress > starts[c] && progress <= ends[c]`; on a miss `searchSegment` tries the next segment (forward playback crossing a boundary) and otherwise binary-searches the end offsets. The hint is re-validated on every call, so it is never reset by `stop()`, `restart()`, `resetInternal()` or a parent `Timeline`, and the result cannot depend on history. A NaN progress (impossible through `seek()`, which maps non-finite input to 0) matches no segment and still uses the first one, as before.
- Offset normalization, boundary ownership (an exact offset belongs to the earlier segment: `normalizedProgress <= candidateEnd.offset`), easing resolution and interpolator compilation are untouched.
- `benchmarks/keyframes.bench.mjs` / `benchmarks/README.md`: added 100-frame cases (linear and per-segment forward, linear scrub), the only size at which the scan is large enough to show. The 2 / 5 / 20-frame cases are unchanged.
- `tests/values/Keyframes.segments.golden.test.ts` (new, 300 tests): see below.
- `dist/**/*.d.ts` after `npm run build:lib`: only `dist/values/Keyframes.d.ts` differs from the baseline build, by six new `private` members (`segmentStarts`, `segmentEnds`, `lastSegment`, `locateSegment`, `scanForSegment`, `searchSegment`, with their doc comments). No public signature changed.

**Evidence corrected (working rule 3).** The item text predates API-001 / PERF-002 / PERF-003: `updateValue` no longer resolves easings (`grep -n resolveEasing src/values/Keyframes.ts` shows only the constructor, lines 55–56) and the interpolators are compiled once. The first scope bullet was already done; only the segment scan remained.

**Correctness evidence.** `tests/values/Keyframes.segments.golden.test.ts` carries a verbatim, frozen copy of the pre-change `Keyframes` (`PinnedKeyframes`, linear scan from frame 0) as the oracle and compares every emission (value and reported progress, in order) and `value$` after each step with `toEqual` (so `+0`/`-0` and NaN are distinguished). It is green on the unchanged `c24f194` source (322 tests with the existing `Keyframes*.test.ts`, run in the temporary baseline worktree) and green on the change. Coverage: frame counts 1, 2, 5, 20, 49, 50 and 100 (49 is the last size on the scan path, 50 the first on the cursor path) × implicit, dyadic, uneven (quadratic), partially explicit and inset offsets (first offset > 0 and last < 1) × linear, named, function and per-keyframe easing × numeric and "tagged" interpolators (the tagged output names the segment endpoints, so a segment mix-up changes the value); forward, backward, boundary (every normalized offset, ±1e-9, ±1 ms, float32-rounded neighbours), zig-zag, `0` and `1` sweeps; 1,860 seeded random sequences (mulberry32) mixing small drifts, jumps, exact boundaries and `0` / duration; `delay` + `repeat` + `yoyo` seeks across cycle edges for 2 / 5 / 20 / 50 / 100 frames; frame-clock playback with `delay`, `repeat: 2` and `yoyo` on and off under an irregular frame step; `stop()` followed by a second `play()`; `duration: 0`; NaN / ±Infinity seeks; and a direct NaN update with 3 and 60 frames. One hand-written test pins the boundary-ownership rule with literal expected values. The suite catches deliberate mutations of the implementation (dropping the lower-bound check on a cursor hit: 94 failures; `<` instead of `<=` in the binary search: 50; `<` in the scan: 65; dropping the NaN guard: 1). One mutation (`>=` instead of `>` against the next segment's start) cannot change any output, because a progress equal to that start would already have been a cursor hit, so it is an equivalent mutant.

**Why a threshold (the investigation, in order).**

1. First implementation: cursor for every list, binary search on a miss. Interleaved harness runs (8 invocations per side) were on a machine at load 23–138 and the unchanged `animation-only` control row moved by +24%, so they were discarded as evidence (kept in the notes folder under `bench/v1-cursor-everywhere/`). Their per-invocation minimums, however, pointed at a regression for short lists, which a second method confirmed.
2. Second method, used for the decision: `abin.mjs` loads the before and after builds into **one process** and times alternating batches of 10,000 `seek()` calls (400–500 rounds, order rotated every round, control build measured twice), reporting the minimum and 10th percentile ns/op. That is stable even on a busy machine. With the cursor on every size it showed, in ns/op (minimum): 2 frames forward 111→118 (+6%), 5 frames random jumps +9%, 20 frames random jumps +14%, but 20 frames forward only −0 to −7%, 50 frames forward −16%, 100 frames forward −27%. Typed arrays and an inlined hit check removed the 2-frame cost; the random-jump cost for short lists remained (about 10 ns, two mispredicted branches: the failed hit check and the loop exit), also with a linear scan as the fallback.
3. Cursor everywhere against the scan, from 10 to 75 frames (`bench/abin-crossover.txt`): forward playback is neutral at 10 frames, 4% faster at 20, 8% at 28, 12–16% at 34–50 and 19–24% at 60–75. Random jumps are 5–11% **slower** from 10 to 40 frames, 1.6% slower at 50, break even at about 60 and 6% faster at 75. So 48 segments is the largest size where the cursor never costs a random jump more than about 2%; the threshold is that point, not a round number.

**Results (final build, threshold 48).** Before = unchanged `c24f194`, after = this change; Node 24.15.0 darwin arm64; both built in separate worktrees, benchmark script byte-identical on both sides (`cmp`). Raw JSON, scripts and variants are in the shared notes folder `perf-005/`.

Harness (`node --expose-gc benchmarks/keyframes.bench.mjs`), **8 invocations per side interleaved ABBA**, 10 repetitions × 200,000 `seek()` per invocation. Machine busy throughout (1-minute load 14–62 on 8 cores, `busy: true` in every report); medians are noisy (single repetitions up to 4× slower under load), so the table gives the median of per-invocation medians and, in the last column, the median of per-invocation **minimums**, which is far less sensitive to load. Elapsed ms per 200,000 ops:

| Case | Before (median) | After (median) | Δ median | Δ min |
|---|---|---|---|---|
| `animation-only` (control, code not touched) | 15.8 | 14.5 | −8.2% | −4.0% |
| 2 frames › linear › forward | 25.0 | 24.8 | −0.6% | +0.7% |
| 2 frames › linear › scrub | 26.4 | 25.8 | −2.6% | −1.6% |
| 5 frames › linear › forward | 25.1 | 25.9 | +3.2% | +1.5% |
| 5 frames › linear › scrub | 28.1 | 26.0 | −7.5% | −2.3% |
| 20 frames › linear › forward | 26.8 | 26.3 | −2.2% | −2.9% |
| 20 frames › per-segment › forward | 30.1 | 30.2 | +0.3% | −3.4% |
| 20 frames › linear › scrub | 28.6 | 28.8 | +0.7% | −1.1% |
| **100 frames › linear › forward** | 36.2 | 24.6 | **−31.9%** (7/8 pairs faster) | −30.9% (8/8) |
| **100 frames › per-segment › forward** | 40.6 | 29.8 | **−26.7%** (7/8) | −28.2% (7/8) |
| **100 frames › linear › scrub** | 39.2 | 34.3 | **−12.6%** (7/8) | −13.5% (7/8) |

(Every other 2 / 5 / 20-frame row, named and function easings included, lies within −7.5% … +3.2% by median and −3.4% … +1.5% by minimum, the band the untouched control row also moves in; those cases run the unchanged scan, so differences there are machine noise and position-in-pair drift, not an effect.)

Allocation, `--expose-gc --min-semi-space-size=1 --max-semi-space-size=1`, 6 invocations per side interleaved ABBA, young-generation collections per million ops: **identical in every case** (2 frames 460–490, 5 frames 475–490, 20 frames 60→60 at default flags and 475–490 here, 100 frames 475 / 490 / 485 → 475 / 490 / 500). The one difference, 100-frame scrub 485 → 500 (+3%), is not explained by the code (the scan and the cursor allocate nothing per call; the two typed arrays are built once per instance) and is the only cell that moved. At 1 MB the minimum elapsed ms per 200,000 ops changed by −0.3% … +0.7% for 2 / 5 frames, −0.8% … −2.2% for 20 frames, and by −28.4% (linear forward), −28.0% (per-segment forward) and −11.6% (scrub) for 100 frames, every pair faster (6/6).

In-process alternating batches (`abin.mjs`, 500 rounds × 10,000 ops, load 8–17, build measured against a second copy of the baseline as control; ns/op, minimum):

| Case | Before | Control (2nd baseline) | After |
|---|---|---|---|
| 2 frames forward / scrub | 106.7 / 105.4 | 109.1 / 105.5 | 107.0 / 105.9 |
| 5 frames forward / scrub | 114.2 / 115.2 | 114.5 / 115.2 | 115.2 / 115.7 |
| 20 frames forward / scrub | 122.2 / 123.2 | 121.5 / 123.3 | 120.4 / 122.2 |
| 49 frames forward / scrub (scan path) | 136.9 / 139.1 | 136.9 / 138.9 | 133.6 / 136.2 |
| 50 frames forward / scrub (first cursor size) | 137.6 / 136.8 | 137.7 / 137.2 | **114.6 (−16.7%)** / 139.7 (+2.1%) |
| 100 frames forward / scrub | 164.0 / 164.8 | 164.9 / 164.9 | **115.0 (−29.9%)** / **145.0 (−12.0%)** |

**Against the pre-recorded target.**

- 100-frame forward (linear and per-segment) and scrub at least 15% faster: **forward met** (−27% … −32%, 7–8 of 8 pairs at default flags and 6/6 at 1 MB); **scrub not met** in the harness (−12.6% median, −13.5% minimum, −11.6% at 1 MB; in-process −12.0%), a consistent but smaller gain than the 15% written down. The binary search on a miss is the cost.
- 20-frame forward and scrub at least 5% faster, "or at minimum not slower": **not faster, not slower** — the 20-frame lists run the original scan (about 9.5 comparisons on average at about 1 ns each, which the cursor does not beat once its own checks are paid; see "Why a threshold"), and every 20-frame cell is within −3.4% … +0.7% of the baseline in the harness and within 1.5% in-process. The 5% target is therefore reported as **unmet**, by design.
- 2 / 5-frame cases no slower: met (the harness differences are inside the band the untouched control row moves in; within 2% in-process).
- Allocation unchanged: met (one 3% cell, see above).

**Caveats.**

- **Not a quiet-machine measurement.** The harness ran at load 14–62 and the report flag `busy` is true for all 28 reports; the in-process runs at load 8–17, still above the 0.5-per-core threshold (4 on this machine). The relative numbers hold across 14 independent interleaved invocations and two methods, but the absolute milliseconds do not transfer, and the roadmap baselines under `roadmap/baseline/` (also recorded on a loaded machine) were not used. `npm run bench:compare` was not run on the pairs; the comparison used `cmp.mjs` / `cmpmin.mjs` / `abin.mjs` (in the notes folder), which compute the same medians.
- The benchmark measures `seek()` through `Animation`, so 20–30 ms of every 200,000 ops is `Animation`, RxJS and the checksum; the scan was about 1.2 ns per step, so with 100 frames it was about a third of the per-op cost and with 20 frames about a tenth. In an application with real subscribers and DOM writes the per-frame saving (about 50 ns at 100 frames) is far below what a frame costs; the change matters only for keyframe lists of tens of stops (gradients, long paths of values) driven many times per frame.
- Random jumps with 50–55 frames are about 2% slower with the cursor (50 frames in-process +2.1%); the threshold accepts that on purpose.
- The "No other workload in `npm run bench` regresses" criterion was not measured: only `keyframes.bench.mjs` was run. `Keyframes` is also used by `animate()`'s compiled path; its pipeline benchmark was not re-run.
- `npm run build --workspace=re-flux-docs` was not run.
- Verified: `npm run typecheck`, `typecheck:tests`, `npm test -- --runInBand` (48 → 49 suites, 873 → 1,173 tests), `check:tree-shaking`, `check:package`, `check:package:consumer` and `check:docs` pass.

## Acceptance criteria

Every box must be checkable by running the named command or inspecting the named file.

- [x] New tests: scrub forward, backward, to exactly an offset boundary, to 0 and 1, with yoyo + repeat, and with a different easing per keyframe — all produce the same values as the pre-change implementation (golden table).
- [x] `grep -n "resolveEasing" src/values/Keyframes.ts` shows no use inside `updateValue` (already true after API-001: only constructor lines 55–56).
- [ ] `npm run bench:keyframes`: 20-keyframe case median ms/1e6 updates is not slower than baseline and is faster by the pre-recorded target. **Partly met:** not slower (within noise), but not faster by the 5% target, because lists of up to 48 segments deliberately keep the scan (the cursor measured slower for random jumps and no faster for forward playback below about 20 frames). The 100-frame target is met for forward playback (−27% … −32%) and just short for scrub (−12% against −15%). See Status.

## Shared gates

**Code gate** (see `roadmap/README.md`)
- [x] `npm run typecheck` and `npm run typecheck:tests` pass.
- [x] `npm test -- --runInBand` passes (49 suites, 1,173 tests; was 48 / 873) (record the test count; it must not decrease unless tests are intentionally replaced).
- [x] `npm run check:tree-shaking`, `npm run check:package` and `npm run check:package:consumer` pass.
- [x] No change to public `.d.ts` output (only private members were added to `Keyframes.d.ts`) unless intended; any intended change is recorded in `CHANGELOG.md` under Unreleased.

**Performance gate** (see `roadmap/README.md`)
- [ ] Performance comparison follows `roadmap/README.md` → "Performance gate": same machine and Node version as the baseline, median of ≥5 repeats (≥10 once BENCH-007 lands) of the named `bench:*` command, compared with `npm run bench:compare`. Timings are **never** a CI gate.
- [x] The improvement target for this item is written into this file *before* implementation starts (taken from the BENCH-008 baseline); the PR links the before/after JSON.
- [ ] No other workload in `npm run bench` regresses beyond the measured noise band.
