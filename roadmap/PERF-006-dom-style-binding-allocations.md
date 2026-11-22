# PERF-006 — bindStyle / bindSvgAttributes: no per-frame allocations, skip unchanged writes

| Category | Impact | Risk | Effort | Priority score | Phase | Depends on |
|---|---|---|---|---|---|---|
| Performance | 4 | 3 | 3 | **21** | 1 | [BENCH-008](./BENCH-008-hot-path-benchmarks.md), [PERF-003](./PERF-003-compile-css-interpolation.md) |

Priority = (Impact + Risk) × (6 − Effort). Back to the [roadmap](../roadmap.md).

## Problem

Every value emission allocates a style-map object, a `Set`, and an entries array, and writes to the DOM even when the value did not change.

## Evidence

- `src/adapters/dom/animation.ts` `animate()`: `keyframeItem.value$.pipe(map((value) => ({ [property.cssProperty]: value })))` creates a new object per emission per target.
- `src/adapters/dom/styleBinding.ts:21` `const nextKeys = new Set(Object.keys(styles));` and `:27` `Object.entries(styles)` run per emission; `target.style.setProperty(key, value)` is unconditional.
- `src/adapters/svg.ts:24,30` repeat the same pattern for SVG attributes.
- Baseline `adapterUpdates` 1000 targets: `dom-style-binding` p99 1.04 ms, worst 3.4 ms; `svg-attribute-binding` p99 1.30 ms, worst 2.3 ms (mock targets).

## Scope

- Add an internal single-property binding fast path (`bindStyleProperty(target, name, value$)`) used by `animate()`; keep `bindStyle` public behaviour intact.
- ~~Remember the last written value per key and skip `setProperty`/`setAttribute` when unchanged.~~ **Dropped by decision (see Status):** skipping unchanged writes changes observable behaviour (two `animate()` calls on the same property, also inside one `Timeline`, stop behaving as "the latest emission wins"), so every emission with a value still writes, exactly as before.
- Apply the allocation part (no per-emission `Set` / `Object.keys` / `Object.entries`) to the SVG attribute binding.

## Non-goals

- Not moving writes into the coordinator's write phase (see PERF-010).

## Risks

- The refactor must not change any observable behaviour: DOM call sequence (including the order restores happen in), original capture on the first emission, restore on omit / null / unsubscribe. *(The original risk about stale caches no longer applies because writes are not skipped.)*

## Acceptance criteria

Every box must be checkable by running the named command or inspecting the named file.

- [x] `tests/adapters/dom.test.ts`, `svg.test.ts` and `npm run check:renderer-cleanup` pass unchanged (restoration of original inline styles still works).
- [x] ~~New test: emitting the same value twice results in one `setProperty` call (spy)~~ — **discarded with the skip-unchanged scope**. Replaced by parity tests: emitting the same value twice still calls `setProperty` twice, and restoring omitted keys still works through the public `bindStyle` (`tests/adapters/styleBinding.characterization.test.ts`, which passes unchanged against both the `6401f2c` build and this change).
- [ ] `npm run bench:adapters`, 1000 targets: `dom-style-binding` and `svg-attribute-binding` median-of-run-p99 frame time and heap delta are no worse than baseline and improve by the pre-recorded target outside noise; `--trace-gc` Scavenge count drops (record both). *(Skipped-write targets discarded; see Status.)*
- [x] `dist/adapters/dom.d.ts` / `svg.d.ts` have no unintended diff.

## Shared gates

**Code gate** (see `roadmap/README.md`)
- [x] `npm run typecheck` and `npm run typecheck:tests` pass.
- [x] `npm test -- --runInBand` passes (record the test count; it must not decrease unless tests are intentionally replaced).
- [x] `npm run check:tree-shaking`, `npm run check:package` and `npm run check:package:consumer` pass.
- [x] No change to public `.d.ts` output unless intended; any intended change is recorded in `CHANGELOG.md` under Unreleased.

**Performance gate** (see `roadmap/README.md`)
- [ ] *(Interleaved before/after, same machine and Node, 10 repeats × 3 invocations per side, `bench:compare` run on each pair — but the machine was busy throughout, so not ticked.)* Performance comparison follows `roadmap/README.md` → "Performance gate": same machine and Node version as the baseline, median of ≥5 repeats (≥10 once BENCH-007 lands) of the named `bench:*` command, compared with `npm run bench:compare`. Timings are **never** a CI gate.
- [x] The improvement target for this item is written into this file *before* implementation starts (taken from the BENCH-008 baseline); the PR links the before/after JSON. *(Target written and met for allocation, see above; before/after JSON are saved in the shared notes folder, not linked from a PR because nothing is committed.)*
- [ ] No other workload in `npm run bench` regresses beyond the measured noise band. *(Not checked: only the adapter and `animate()` pipeline workloads were measured.)*

## Target and status

### Pre-implementation baseline and target (recorded before touching `src/`)

Unchanged code at `6401f2c`, built in a separate git worktree, Node 24.15.0, darwin arm64, 8 logical cores. **The machine was heavily loaded the whole time** (`uptime` 1-minute load 40–80, the harness flags `busy: true` on every report), so timings are indicative only. Commands: `BENCH_ADAPTER_TARGETS=1000 node --expose-gc benchmarks/adapters.bench.mjs --out …` (3 invocations), the same with `--min-semi-space-size=1 --max-semi-space-size=1` for the allocation metric (3 invocations), and `node --expose-gc --min-semi-space-size=1 --max-semi-space-size=1 benchmarks/css-interpolation.bench.mjs` (3 invocations).

**What the existing adapter modes can and cannot show.** The single-property fast path used by `animate()` is internal and unreachable from `adapters.bench.mjs`; it is judged by the `animate() pipeline` cases of `css-interpolation.bench.mjs`. The adapter modes `dom-style-binding` / `svg-attribute-binding` change every value on every frame; two modes were added to `benchmarks/adapters.bench.mjs`, `dom-style-binding-steady` and `svg-attribute-binding-steady`, that emit equal values on every frame (a held animation) to show that holding a value costs the same as changing it.

| Metric (unchanged code, 1,000 targets × 180 frames = 180,000 emissions per repetition) | Baseline |
|---|---|
| Scavenges per repetition at 1 MB semi-space, all four DOM/SVG modes (median of 10 reps, 3 invocations) | 152.5 – 158 (≈ 850 – 880 per million emissions) |
| DOM/SVG writes per target per frame, changing and steady modes | 3.0 (every key, every frame) |
| `animate() pipeline`, 10 elements × 3 properties, scavenges per million ops (1 MB semi-space) | 35,050 – 35,250 |
| `animate() pipeline`, 100 elements × 3 properties, scavenges per million ops | 391,000 – 393,500 |

Targets, fixed before implementation:

- **Allocation (stable metric, judged):** scavenges per repetition at 1 MB semi-space drop by **at least 50%** in all four adapter modes, and `animate() pipeline` scavenges per million ops drop by **at least 20%** at both element counts.
- **Time (indicative only):** no worse than baseline in every interleaved pair; an improvement is not claimed unless it shows with the same sign in every pair and clearly exceeds the noise.
- *(An earlier version of this section also set a target for skipped writes in the `-steady` modes. That target was dropped together with the scope item, see below.)*

### Decision: "skip unchanged writes" is out of scope

The first implementation also remembered the last value written per key and skipped `setProperty` / `setAttribute` for an equal value. It was removed because it changes observable behaviour: a binding stopped being "the latest emission wins". Measured against `6401f2c`: two `animate()` children of one `Timeline` on the same property (fade-in at 0, fade-out at 100, seeks `[50,150,50,60,60,150,0,200,120,120,75,75,30,100,100]`) produced different inline opacity on 2 of 15 seeks (`1 0.5 1 0.6 0.6 0.5 1 0 0.8 0.8 1 0.75 0.3 1 1` before, `0.5 0.5 1 0.6 0.6 0.5 1 0 0.8 0.8 1 1 0.3 1 1` with skipping), two independent `animate()` calls on one property no longer overwrote each other on equal values, and external changes to an inline declaration survived equal re-emissions. The measured results of that variant (about 92% fewer scavenges in the `-steady` modes together with 3.0 → 0.017 writes per target per frame) therefore no longer apply; the numbers below are for the behaviour-preserving implementation. If the skip is ever revisited it needs an explicit API decision (for example an opt-in), not a silent change.

### Status (implemented, uncommitted)

**What changed.**

- `src/adapters/dom/styleBinding.ts`: `bindStyle` keeps one state object per key (original inline value and priority, emission stamp) in a first-capture-order array plus a lookup `Map`, and two reused arrays (swapped each emission, filled by index so their backing stores are never freed) holding the keys of the previous / current emission in emission order. Per emission it marks the keys it carries (`for…in` + `Object.hasOwn`), restores omitted keys first **in the previous emission's key order**, then writes every key; unsubscribe restores in first-capture order. Nothing is allocated per emission (no `Set`, `Object.keys`, `Object.entries`). New internal `bindStyleProperty(target, property, value$)` (`@internal`, not exported from `dom/index.ts` / `dom.ts`) is the single-property variant: captures the original on the first emission, writes every emission, restores on unsubscribe, no maps or arrays.
- `src/adapters/dom/animation.ts`: `animate()` binds `keyframeItem.value$` straight into `bindStyleProperty`; the `map((value) => ({ [cssProperty]: value }))` stage is gone. The compiled CSS interpolator from PERF-003 is untouched.
- `src/adapters/svg.ts`: same structure for `bindSvgAttributes`; every emission still calls `setAttribute` / `removeAttribute`.
- `benchmarks/adapters.bench.mjs` (+ README note): the two `-steady` modes.
- Tests: `tests/adapters/styleBinding.characterization.test.ts` (28 tests: exact `setProperty` / `removeProperty` / `setAttribute` sequences for single- and multi-property bindings, value **and** priority restoration, restore order, first write, unsubscribe mid-run and twice, external mutation being overwritten by an equal re-emission, `animate()` seek sequences, two `animate()` calls on one property, two `animate()` children of a `Timeline` on one property). **All 28 pass unchanged against the unmodified `6401f2c` build** (run there with a map-based `bindStyleProperty` shim added) and against this change, together with the untouched `dom.test.ts` and `svg.test.ts`: that is the evidence that behaviour is identical.

**Behaviour.** Identical to `6401f2c`, including the order in which omitted keys are restored (previous emission's key order, preserved without allocating by the two reused arrays).

**Results.** Before = `6401f2c`, after = this change, Node 24.15.0 darwin arm64, **interleaved per invocation (before, after, before, after…), 3 invocations per side, 10 repetitions each**, 1,000 targets × 180 frames. The machine was busy throughout (1-minute load 37–60 on 8 cores; `harness.system.busy: true` on every report). Raw JSON, scripts and gate output are in the shared notes folder `perf-006/` (`bench/v2*` are these runs; `bench/v2-discarded-truncating-array/` holds an intermediate implementation that used `array.length = 0`, which frees the backing store and re-allocated about 150 bytes per emission — fixed by filling by index; `bench/ab-*` and `abcss-*` are the discarded skip-unchanged variant).

Allocation, `--expose-gc --min-semi-space-size=1 --max-semi-space-size=1` (scavenges per repetition, median of 10 reps):

| Mode | Before | After | Change |
|---|---|---|---|
| `dom-style-binding` | 157 – 157.5 | 12 | −92% |
| `svg-attribute-binding` | 157 – 158 | 12 | −92% |
| `dom-style-binding-steady` | 157.5 – 158 | 12 | −92% |
| `svg-attribute-binding-steady` | 157 – 158 | 12 | −92% |
| `animate() pipeline` 10 el × 3 props, scavenges / M ops | 35,050 – 35,150 | 21,250 | −39% (all 3 pairs) |
| `animate() pipeline` 100 el × 3 props, scavenges / M ops | 392,500 – 392,750 | 220,500 – 221,000 | −44% (all 3 pairs) |
| DOM/SVG writes per target per frame (all modes) | 3.0 | 3.0 | unchanged by design |

Standalone check (heapUsed delta, 64 MB young generation, 1,000 subscribers × 300 emissions): 163 – 194 bytes per target-emission before, about 40 after; a bare RxJS `Subject` → subscriber with an empty callback also costs about 40 bytes, so **the binding-attributable allocation per emission is now ≈ 0 and what is left is RxJS delivery**. The 12 remaining scavenges are mostly set-up (1,000 mock targets plus bindings).

Time, `medianOfRunMeanFrameMs`, before → after per interleaved pair (the machine was busy, and in-run CV is 9–53%):

| Mode | default flags | 1 MB semi-space |
|---|---|---|
| `dom-style-binding` | 0.250→0.209, 0.222→0.202, 0.246→0.213 | 0.324→0.260, 0.322→0.225, 0.340→0.270 |
| `svg-attribute-binding` | 0.235→0.211, 0.215→0.195, 0.220→0.203 | 0.313→0.239, 0.313→0.218, 0.321→0.263 |
| `dom-style-binding-steady` | 0.212→0.197, 0.212→0.189, 0.213→0.208 | 0.295→0.249, 0.290→0.216, 0.305→0.241 |
| `svg-attribute-binding-steady` | 0.219→0.200, 0.209→0.192, 0.216→0.195 | 0.301→0.233, 0.292→0.207, 0.280→0.270 |
| `animate() pipeline` `medianOpsPerMs`, 10 el (1 MB) | 39.7→61.7, 41.3→59.7, 41.6→64.3 | |
| `animate() pipeline` `medianOpsPerMs`, 100 el (1 MB) | 3.5→6.3, 4.1→6.0, 3.7→6.0 | |

**Caveats and unmet criteria.**

- **Timing is not claimed.** The after build is faster in all 24 adapter cells (−2% to −31%) and in all 6 `animate()` pipeline pairs (+45% to +70% `medianOpsPerMs`), but `bench:compare` labels almost every row "within noise" (bands ±16% to ±182%), and the *unchanged* `canvas-one-emission` / `canvas-burst-coalesced` rows, which this change cannot affect, also came out 3–16% faster "after" than "before" at default flags (a position-in-pair or load-drift effect of that size) and moved from −1% to +59% at 1 MB. Differences below roughly 16% at default flags are therefore not attributable. The 1 MB DOM/SVG effect (−4% to −30%) is consistent with the allocation drop but is indicative only. Time criteria unticked.
- `heapMedianDeltaMb` is **worse** with default flags (about 0.15 → 10 MB) and better with a 1 MB young generation (5.6 → 2.7–3.4 MB). With the default 16 MB young generation the after build allocates less than one semi-space, so *no* scavenge runs and the set-up garbage of the mock targets plus bindings is still on the heap when the run ends, while the before build scavenged twice. Heap delta is not an allocation measure when GC counts differ; scavenges per run is. The "heap delta no worse than baseline" part of the third criterion therefore cannot be shown with default flags and is not ticked.
- `--trace-gc` was not captured; the `PerformanceObserver` scavenge count the harness records (`gcMedianCount`) was used instead (2 → 0 at default flags, 157 → 12 at 1 MB).
- `p99` / worst-frame metrics are indicative only (noise bands up to ±200%) and are not used.
- "No other workload in `npm run bench` regresses" was **not** checked: only `adapters.bench.mjs` and the `animate() pipeline` cases of `css-interpolation.bench.mjs` were measured.
- The machine was busy for all runs, so the "quiet machine" gate item is not met and nothing here is a quiet-machine measurement.
- Before/after JSON are saved outside the repository (shared notes folder); not linked from a PR because nothing is committed.
- `dist/**/*.d.ts` diff after `npm run build:lib`: only the new `@internal` `bindStyleProperty` declaration in `dist/adapters/dom/styleBinding.d.ts` (not re-exported from `dist/adapters/dom.d.ts`). No public signature or comment changed.
- Verified: `npm run typecheck`, `typecheck:tests`, `npm test -- --runInBand` (47 → 48 suites, 845 → 873 tests), `check:tree-shaking`, `check:package`, `check:package:consumer`, `check:docs` (includes `check:renderer-cleanup`) and `check:browser-integration` (real Chromium, 10 cases) pass. `npm run build --workspace=re-flux-docs` was not run.
