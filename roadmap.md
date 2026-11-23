# re;Flux roadmap

Audit of benchmarks, performance, tests, structure and tooling for `@re-code/flux` **0.5.0-beta.0**.
Date: 2026-11-16 · Branch `main` @ `d2ef0c7` · Environment: Node 24.15.0, darwin arm64.
Acceptance criteria for every item live in [`roadmap/`](./roadmap/README.md) (one file per item, checkbox style).

> Scope of this audit: documents only. No source files were changed. Everything below is tied to something that was run or read; where something is a hypothesis it says so.

## 1. Executive summary

- **The core design is sound and measurably so.** One shared RAF clock is 4.2× cheaper than one RAF per consumer at 1,000 consumers, scheduler cost scales linearly (~0.15–0.20 µs per animation per frame), and every workload returns to idle with one pending RAF.
- **The risk is in the tails, not the means.** At 1,000 canvas bindings the worst frame is 44.6 ms and run-to-run elapsed time varies 4× (42–166 ms). Means look fine; p99 and worst-frame do not.
- **The benchmarks cannot yet prove small wins.** There is no stored baseline, no compare tool, no GC control, noise is larger than some effects the report interprets (the metrics observer "speeds up" 5,000 animations by 21%), and nothing benchmarks the code paths worth optimizing (value interpolation, CSS, SVG morphing, Keyframes, completed timeline segments, memory).
- **The best optimization candidates are per-frame allocations and re-parsing**, all in code that runs for every target on every frame: string/color/CSS/SVG interpolators re-parse their fixed endpoints every frame; the DOM and canvas bindings allocate objects per emission.
- **There is one real correctness smell**: three value parsers with different rules produce different output for equivalent input (`+5px`, `1e-3px`, rgb percent/clamping, 4 vs 5 decimals).
- **Tests are healthy overall (31 suites, 226 tests, 89.6% lines) but thinnest exactly where refactors would land** (`Tween` 0% branches, `easings` 24% functions, `layout.ts` 0% in Jest), and coverage has no floor.
- **Dependencies are clean** (`npm audit`: 0 vulnerabilities; runtime surface is only the `rxjs` peer dependency). Outdated items are dev-only.

## 2. Benchmark review

Command: `npm run bench` (builds the library, runs four workloads, 5 repeats each). Raw JSON is stored in [`roadmap/baseline/bench-2026-11-16-darwin-arm64-node24.15.0.json`](./roadmap/baseline/bench-2026-11-16-darwin-arm64-node24.15.0.json). Test suite on the same checkout: 31 suites, 226 tests, all passing.

### 2.1 Results

**Shared frame coordinator** (1,000 consumers × 180 frames)

| Mode | Mean frame (ms) | Worst frame (ms) | Peak RAF callbacks |
|---|---|---|---|
| shared, no metrics | 0.0175 | 0.565 | 1 |
| shared, metrics observed | 0.0164 | 0.107 | 1 |
| independent RAF per consumer | 0.0738 | 0.715 | 1000 |

Shared is **4.2×** faster than independent RAF loops; all runs return to idle (0 pending callbacks).

**Concurrent `Animation` load** (180 frames, metrics disabled, median of run statistics)

| Animations | Callback work | Mean (ms) | p95 (ms) | p99 (ms) | Worst (ms) | Mean per animation |
|---|---|---|---|---|---|---|
| 100 | 0 | 0.0154 | 0.0186 | 0.092 | 0.523 | 154 ns |
| 1,000 | 0 | 0.1633 | 0.318 | 1.036 | 9.17 | 163 ns |
| 5,000 | 0 | 0.9898 | 1.822 | 4.727 | 7.98 | 198 ns |
| 5,000 | 4 | 1.4561 | 2.229 | 4.110 | 10.15 | 291 ns |

At 5,000 animations the p99 frame is ~28% of a 16.7 ms frame budget *before* any rendering.

**Timeline** (2,000 segments)

- Duration reads: median 792k reads/ms (O(1), the 0.2.0 cache works).
- Nested overlapping scrub: mean 0.156 ms, p95 0.41, p99 0.86, worst 3.56 ms per seek; 86,682 callbacks/run.

**Adapter updates** (mock targets; 180 frames; mean / p99 / worst in ms)

| Targets | `dom-style-binding` | `svg-attribute-binding` | `canvas-one-emission` | `canvas-burst-coalesced` |
|---|---|---|---|---|
| 100 | 0.022 / 0.185 / 0.36 | 0.023 / 0.121 / 0.36 | 0.020 / 0.186 / 0.41 | 0.027 / 0.203 / 0.43 |
| 1,000 | 0.250 / 1.04 / 3.40 | 0.252 / 1.30 / 2.34 | 0.179 / 0.84 / **10.92** | 0.482 / 2.87 / **44.62** |

### 2.2 What the data supports

1. The shared-scheduler architecture delivers its main promise (single RAF, bounded cost, clean teardown).
2. Per-frame engine overhead is small at realistic scales (≤1,000 animations ≈ 0.16 ms mean).
3. Burst coalescing works functionally (`drawCalls == expectedDrawCalls` in every canvas scenario).
4. Timeline duration caching works.

### 2.3 What the data does **not** support

- **"Metrics observation has negligible/negative overhead."** At 5,000 animations / work 4, the observed mode ran in 208 ms vs 264 ms without the observer, and the frame-coordinator report shows the observer "−6.18%". An observer cannot make the engine faster; these are noise or order bias. The honest statement is "overhead is below the noise floor of this harness".
- **Any claim about tail behaviour being caused by GC.** `node --trace-gc` shows GC occurs during the adapter run (113 trace lines for the default run; 96 Scavenge + 2 Mark-Compact for a 1,000-target-only run), which makes GC a plausible cause of the 10–45 ms outliers — but no correlation has been measured. Treated as a hypothesis (BENCH-007).
- **Any browser-cost claim.** Adapter benchmarks use mock targets and "do not measure browser layout, SVG painting, or Canvas rasterization" (`benchmarks/README.md`). The `/benchmarks` Benchmark Lab does measure the browser (and compares GSAP 3.15.0 / anime.js 4.5.0) but its results are produced by hand and are not stored in the repo.
- **Performance of the code paths proposed for optimization**: none of them is benchmarked today.

### 2.4 Benchmark-harness weaknesses

| Weakness | Evidence | Item |
|---|---|---|
| Output not machine-readable via `npm run bench` | npm banner precedes the JSON; `JSON.parse` fails on the redirected file | BENCH-006 |
| No stored baseline / compare tool | none in repo; README says "capture output before and after" | BENCH-006 |
| High run-to-run variance, no GC control | canvas-burst elapsed 42–166 ms; dom-style 35–74 ms (1,000 targets) | BENCH-007 |
| Missing hot-path benchmarks | only coordinator, timeline, `Animation`, mock adapters exist | BENCH-008 |
| Not run in CI (even report-only); no real-browser capture | `.github/workflows/ci.yml` has no bench step | BENCH-009 |

### 2.5 Public claims check

The only "2× faster" string in the docs (`apps/docs/src/locales/en.json:2616`) is the label of the Visual Lab *time-scale* slider, not a performance claim. The docs explicitly state the architecture comparison is "not a performance ranking" (`en.json:1880`). No unsupported performance claim was found. Keep it that way: BENCH-009 includes a decision on whether comparison-library numbers may ever be quoted.

## 3. Audit findings by area

### 3.1 Performance (details in `roadmap/PERF-*.md`)

| Finding | Where |
|---|---|
| String/color tweens re-parse both endpoints with regexes every frame | `src/values/interpolate.ts:52-69` |
| CSS interpolation tokenizes both strings every call, per target × property × frame | `src/adapters/dom/cssInterpolation.ts`, `src/adapters/dom/animation.ts` |
| SVG morph regex-replaces the whole path and calls `Number()` per coordinate per frame (up to ~49k numbers) | `src/adapters/svg/pathMorph.ts` (`createSvgPathInterpolator`) |
| `Keyframes.updateValue` re-resolves easing and scans segments from 0 every frame | `src/values/Keyframes.ts:145` |
| Style/attribute bindings allocate an object, a `Set` and an entries array per emission and write unconditionally | `src/adapters/dom/styleBinding.ts:21,27`, `src/adapters/svg.ts:24,30` |
| `bindCanvas` allocates a task + `Subscription` + closure per binding per frame | `src/adapters/canvas.ts:55`, `FrameCoordinator.ts:114-135` |
| `FrameCoordinator` copies the subscriber set every frame; task removal is O(n) | `src/core/FrameCoordinator.ts:188,137-142` |
| `Timeline.updateAt` visits all segments each frame, including completed ones | `src/core/Timeline.ts:360-370` |
| Possible DOM read/write interleaving (`flip`, `animate`) and three `getPointAtLength` calls per frame — **hypotheses, need browser traces** | `layout.ts`, `animation.ts`, `svg.ts:146-148` |
| Per-instance allocation of `Animation` (two subjects, a Promise, observable views) — **unmeasured** | `Animation.ts:15-26`, `Completion.ts` |

### 3.2 Correctness / API

- Three value parsers disagree (REFACTOR-003). Verified on the current `dist/`: `interpolate("+5px","+15px",.5)` → `10px` but `interpolateCssValue` → `+10px`; `1e-3px→2e-3px` → `0.0015px` vs `1.5e-3px`; `rgb(300 0 0 / 50%)→rgb(0 0 300 / 100%)` → `rgba(128, 0, 128, 0.75)` vs `rgb(150 0 150 / 75%)`; 5 vs 4 decimals.
- `EasingOption = EasingFunction | EasingName | string` collapses to `string`; a mistyped name silently becomes linear (`resolveEasing`, `easings.ts:83-87`). `easeInOutElastic` is missing although other families have all three variants (API-001).

### 3.3 Tests

Coverage run (31 suites, 226 tests): statements 84.78%, branches 75.82%, functions 84.04%, lines 89.6%.

| File | Gap |
|---|---|
| `src/utils/easings.ts` | 41.6% stmts, **24.3% funcs** — public API |
| `src/values/Tween.ts` | **0% branches**, 66.7% funcs |
| `src/adapters/dom/layout.ts` | **0%** in Jest (may be covered by browser integration — verify) |
| `src/adapters/dom/scope.ts` | 67.9% (`createResponsiveScope`) |
| `src/adapters/dom/text.ts`, `animation.ts` | 74.6% / 71.2% |
| `jest.config.cjs` | `src/flowField.ts` missing from `collectCoverageFrom` though tested; `src/types.ts` included; no `coverageThreshold`; CI never runs coverage |

### 3.4 Structure and maintainability

- `Animation` and `Timeline` duplicate the lifecycle (`ensureMotionLifecycle`, `startClock`, `setState`, `STOPPED_ERROR`) — REFACTOR-004. `Tween` and `Keyframes` duplicate ~12 delegate methods — REFACTOR-005.
- No linter or formatter configured; 57 whitespace-only lines in `src/` (CHORE-006).
- The docs contract scripts (24 files, ~1,900 lines, 123 `.includes(` assertions) couple CI to literal source text; `BrowserBenchmarks.vue` is 1,218 lines (DOCS-004).

### 3.5 Dependencies and packaging

- `npm audit --omit=dev`: 0 vulnerabilities.
- Outdated (dev only): `ts-jest` 29.4.14→.15, `playwright` 1.64.1→1.65.1, `esbuild` 0.24→0.28, `typescript` 5.7→7.0; docs app: `vite` 6→8, `vue-router` 4→5, `pinia` 3→4, `@vitejs/plugin-vue` 5→6, `vue-tsc` 2→3, `sass`, `vue` patch.
- `@re-code/basics` (sibling package `../re-basics`, v0.1.0, zero-dependency) is not used anywhere today. Real overlap is small: `lerp` (identical), `isPlainRecord` (same logic), three private `clamp` copies, and `median` in the benchmarks; its `clamp` and `median` differ from re;Flux's on edge inputs. Adoption is a packaging decision (CHORE-011), not an automatic win. The reverse direction — generic helpers that could move *into* basics (`wrap`, `mapRange`, `snap`, `random`, `percentile`, grapheme splitting, `isIterable`, `pipe`/`flow`, …) — is catalogued in [`roadmap/basics-candidates.md`](roadmap/basics-candidates.md) and tracked in CHORE-012; three of them cannot keep their names because they collide with unrelated Lodash functions.
- `exports["."]` has no `default` condition while every subpath has one (CHORE-010).

### 3.6 What is already good (keep it)

Strict TypeScript flags (`exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`), tree-shaking and package-consumer checks, deterministic teardown assertions (`assertIdle`, diagnostics), per-instance reduced-motion/visibility policy, CI on Node 22 and 24, trusted-publishing workflow, benchmark README that explicitly refuses to gate CI on timings.

## 4. Prioritized item list

**Progress (2026-11-22):** done locally and recorded in each item's *Status* section — UNIT-009, BENCH-006, UNIT-008 (one criterion waits for the first CI run), CHORE-010, UNIT-010, REFACTOR-003, API-001, PERF-008 (timing criteria indicative only, machine loaded), PERF-002, PERF-004 (correctness criteria verified; the timing criterion is not ticked: about 6–10% faster per frame and about 25% fewer young-generation collections in interleaved runs, but on a busy machine and not on every pair), PERF-003 (compiled CSS interpolation: `animate()` pipeline about 2× faster per seek and about 55% fewer young-generation collections in interleaved runs, every pair; the criteria that need a quiet machine are left unticked because the machine was busy throughout, and the one-shot `interpolateCssValue` micro-cases are unchanged by design), PERF-006 (`bindStyle` / `bindSvgAttributes` / `animate()` allocate nothing per emission beyond RxJS delivery, with identical behaviour: about 92% fewer young-generation collections in the adapter benchmark and 39–44% fewer in the `animate()` pipeline in every interleaved pair; the "skip unchanged writes" part of the scope was dropped by decision because it changed two-`animate()` compositions on one property; timing criteria are left unticked, see its Status), PERF-005 (`Keyframes` segment cursor: only the linear scan remained of the item, the easing part had landed with API-001; kept with a measured threshold of 48 segments because the cursor was neutral to slower for short lists — about 28% faster forward playback and about 12% faster random jumps at 100 keyframes, 2/5/20-frame cases unchanged, behaviour verified against a frozen copy of the old implementation on 1,860 random seek sequences and more; the 20-frame speed-up target and the 15% 100-frame scrub target are reported as unmet, and the timing criteria are left unticked because the machine was busy throughout, see its Status), BENCH-007 and BENCH-008 (one criterion — a Node 22 run — could not be verified locally). Phase 0 is complete. New baselines (local only: `roadmap/baseline/*.json` is git-ignored): `roadmap/baseline/bench-2026-11-22-darwin-arm64-node24.15.0-run{1,2,3}.json` (default) and `-gc.json` (GC-controlled) cover all ten workloads, including the six hot-path benchmarks. **They were recorded on a heavily loaded machine (load average above 100 on 8 cores) and must be re-recorded on a quiet one before any PERF item is accepted** — see `roadmap/baseline/README.md`; the harness now records and warns about machine load. Items whose dependencies are all done and can start now: PERF-007, PERF-008, PERF-009, PERF-011, REFACTOR-005 (and the dependency-free CHORE-006, CHORE-007, DOCS-004, BENCH-009). Still blocked: REFACTOR-004 (needs PERF-007 and PERF-009). PERF-006 depended on PERF-003, which has landed.

**Progress, Phase 2 (2026-11-23):** done locally, one commit per item on branch `claude/phase-2-7ff826` (not merged, not pushed): REFACTOR-005 (`Tween` and `Keyframes` extend an internal `AnimatedValue` base that owns the delegation: 396 → 237 lines, compiled output −376 bytes, behaviour verified by the existing suites plus 24 new delegation tests that pass on the old and the new implementation; the "empty `.d.ts` diff" criterion is unmet because the declarations now show `extends AnimatedValue<T>`, recorded in `CHANGELOG.md`), PERF-007 (`FrameCoordinator` keeps a cached subscriber array rebuilt only on membership change and uses tombstone queues with reused batch arrays: cancelling 10,000 pending tasks about 14× faster and linear instead of quadratic, delivery rules pinned by 20 characterization tests plus a 40-seed model-based differential test that pass on the old and the new code, 8–12% fewer scavenges per run in every interleaved pair at 1000–10,000 animations; the pre-recorded 20% allocation target is unmet and the frame-time and `sharedSpeedupVsIndependent` criteria are left unticked because the machine load average was 60–290), PERF-009 (`Timeline` visits only segments that can still change, with an insertion-ordered active list, start/end-sorted wake-ups and a prototype-level settle probe for built-in children; identical traces to a frozen copy of the old implementation on 250 random timelines, mutation-checked; seek with 99% / 50% / 0% of 2,000 segments completed about 5× / 3.5× / 1.4× faster and allocation-free in three interleaved pairs at load ≈ 50–60, `timeline.segments` cached and frozen; the quiet-machine timing confirmation is left unticked and one behaviour difference for children driven directly by user code is recorded in `CHANGELOG.md`), REFACTOR-004 (`Animation` and `Timeline` share an internal `PlaybackController` for the clock subscription, state and motion lifecycle: `ensureMotionLifecycle` exists in one file, all 1,518 tests pass unchanged, `src/core` line coverage 97.11% → 98.07%, `dist/core*.js` −398 bytes, public declarations unchanged except private members; cost: +72 bytes per `Animation` instance in the memory benchmark, unchanged per-frame allocation), PERF-011 (measure-first; the measurement showed two ingredients make up about 1,200 of an `Animation`'s 1,714 bytes, so both were trimmed: read-only views without a per-instance `defineProperty` and a lazily created completion promise — `Animation` 1,714 → 666 bytes (−61%), `Tween` −55%, `Keyframes` −45%, empty `Timeline` −49%, `Timeline` with 10 animations −57%, stable across three runs; behaviour pinned by 16 new characterization tests that pass on the old code and a new `check:unhandled-rejections` script; per-frame allocation unchanged, frame time too noisy to claim). **Phase 2 is complete on branch `claude/phase-2-7ff826`; the quiet-machine timing confirmations of PERF-007 and PERF-009 are the only open criteria, and CHORE-006 has not been started.**

**Progress, Phase 3 (2026-11-23):** on branch `claude/phase-3-9822a6` (not merged, not pushed), one commit per item. CHORE-006 (Biome 2.6.8 as the single linter and formatter: `npm run lint`, `format`, `format:check`, run in CI and `check:all`; rules limited to unused variables/imports, `import type` and `noFloatingPromises` — a Biome *nursery* rule, so less complete than typescript-eslint's, see the ADR in its file; the repo was reformatted in a separate commit at line width 120 with byte-identical minified bundles for all 14 entry points and `.d.ts` differing only by trailing commas in three re-export lists; the 57 whitespace-only lines in `src/` are gone; 56 suites / 1,534 tests unchanged; `apps/docs` is not covered). BENCH-009 (`npm run bench:browser`: drives the unmodified Benchmark Lab in headless Chromium and saves a suite of the page's own schema-v2 exports for DOM, SVG and Canvas with all three engines, GSAP 3.15.0 and Anime.js 4.5.0 served from pinned npm copies; report-only `benchmarks.yml` workflow written and YAML-validated but not run on GitHub; decision: comparison-library numbers are not quoted in the docs; headless Chromium locks frame pacing to a 59.88 Hz virtual cadence so frame metrics do not discriminate; the existing Playwright Chromium cache was reused, nothing downloaded). PERF-010 (measure-first; `run-browser-benchmark.mjs --suite adapters` counts Chrome's style-recalculation and layout counters, with a thrash control and a batched control to validate the counters and a Chrome trace attributing forced events to functions: `flip()` forced 1,001 layouts + 1,001 recalculations for 1,000 elements and now 1 + 1 (call about 400 → about 12 ms), `animate()` with implicit start values only forced 3,000 recalculations and now 0 (about 20 → 9–16 ms; mixed explicit/implicit properties and function-valued definitions keep the old order because batching changed their start values, caught in review and verified in Chromium), measured in three interleaved before/after pairs on a machine with load average 33–81, so durations are indicative and the counts are the evidence; `flip()` keeps the old order when one target contains another because batching would displace the descendant twice; `animateNumber()` and `followSvgPath$` cause no forced work and were closed unchanged; new unactioned finding: `getPointAtLength` costs time proportional to path complexity and `followSvgPath$` calls it three times per emission; 57 suites / 1,544 tests after PERF-010). While running the Docs gate `npm run build --workspace=re-flux-docs` was found already failing on `main` since API-001 (`process` undeclared in the docs type-check) and fixed in its own small commit. DOCS-004 (`BrowserBenchmarks.vue` 1,218 → 375 lines with its logic in plain TypeScript under `apps/docs/src/benchmarks/` and 49 new Jest tests in `tests/docs/` driven by a deterministic fake browser environment; `check-browser-benchmark.mjs` has no `page.includes(` assertions about local names or constants left; the other contract scripts were audited but not rewritten because the frontend redesign will replace the views they assert on; the refactored page was re-run through the BENCH-009 runner for `dom`, `engine-only` and `per-target-dom` and exports the same report structure; the `/benchmarks` chunk is still lazy; 63 suites / 1,593 tests). **Phase 3 is complete on branch `claude/phase-3-9822a6`; nothing is pushed or merged.**

**Progress, Phase 4 (2026-11-23):** on branch `claude/chores-00a6db` (not merged, not pushed), one commit per item. CHORE-007 (`ts-jest` 29.4.15, `esbuild` 0.28.2 and `playwright` 1.65.1 taken, every gate green on Node 24; the Node 22 run could not be done because Node 22 is not installed here). CHORE-011 (decision B, dev-only: `@re-code/basics@~0.2.1` is used by the benchmark tooling and the docs app, not by the published package; a full runtime-adoption prototype made the bundled entries 150–450 bytes larger, none smaller, left engine paths unchanged within ±1% and slowed thin wrappers 2–5%, and six helper contracts are not drop-in, all recorded in the item). CHORE-012 (done: `percentile` (nearest rank, added in Basics 0.2.1 on request), `median`, standard deviation and coefficient of variation consumed in the benchmarks and docs with `@re-code/basics@~0.2.1`, `positive`/`nonNegative` deduped; the swaps in `src/` are skipped because of CHORE-011). CHORE-009 (spike, no-go for TypeScript 7 for now: the native compiler is 3.5–4.5× faster and emits byte-identical `.js`/`.d.ts`, but `ts-jest` 29 (peer `<7`) and `vue-tsc` 3.3 need the JavaScript API that `typescript@7` no longer ships; TypeScript 5.9.3 is a zero-change stepping stone, 6.0 needs `types: ["node"]` and, for the docs, `ignoreDeprecations`; TypeScript 5.9.3 was then taken: byte-identical `dist/`, `check:all` green; re-check 2026-12-23 for 6/7). The pre-existing `npm run lint` failure when `dist/` exists was fixed with a `void` in `scripts/check-unhandled-rejections.mjs`. CHORE-008 (done, five commits: `vue` 3.5.46 / `vue-router` 4.6.5 / `sass` 1.108.2, then `vite` 8.3.8 with `@vitejs/plugin-vue` 6.0.11, `vue-router` 5.5.1, `pinia` 4.1.0 and `vue-tsc` 3.3.14, each with a green docs build, `check:all` and a 19–26-route headless-Chromium smoke test; no source change was needed, the docs bundle is 2.6% smaller).

Priority = (Impact + Risk) × (6 − Effort). Work in phase order and respect `Depends on`; the score orders items inside a phase. Each ID links to its acceptance-criteria file.

### Phase 0 — Measure & safety nets

| ID | Item | Category | I | R | E | Score | Depends on |
|---|---|---|---|---|---|---|---|
| [UNIT-009](roadmap/UNIT-009-easings-coverage.md) | Test every public easing, `cubicBezier` and `steps` | Tests | 3 | 3 | 1 | 30 | — |
| [BENCH-006](roadmap/BENCH-006-clean-json-baseline-compare.md) | Machine-readable bench output, committed baseline, compare script | Benchmarks | 4 | 3 | 2 | 28 | — |
| [BENCH-007](roadmap/BENCH-007-variance-and-gc-control.md) | Quantify run-to-run noise and control GC in the harness | Benchmarks | 4 | 3 | 2 | 28 | BENCH-006 |
| [UNIT-008](roadmap/UNIT-008-coverage-config-and-thresholds.md) | Fix coverage scope and add regression thresholds | Tests | 2 | 3 | 1 | 25 | — |
| [BENCH-008](roadmap/BENCH-008-hot-path-benchmarks.md) | Benchmarks for the paths the optimization items target | Benchmarks | 4 | 3 | 3 | 21 | BENCH-006 |

### Phase 1 — Correctness and quick wins

| ID | Item | Category | I | R | E | Score | Depends on |
|---|---|---|---|---|---|---|---|
| [API-001](roadmap/API-001-easing-name-safety.md) | Stop silently falling back to linear on mistyped easing names; fill the easing set | API / DX | 3 | 3 | 2 | 24 | UNIT-009 |
| [PERF-008](roadmap/PERF-008-bind-canvas-persistent-dirty-flag.md) | bindCanvas: stop allocating a Subscription and closure per binding per frame | Performance | 3 | 3 | 2 | 24 | BENCH-007 |
| [REFACTOR-003](roadmap/REFACTOR-003-unify-value-parsing.md) | One shared numeric-token and color parser (fix divergences first) | Correctness / Refactor | 4 | 4 | 3 | 24 | UNIT-010 |
| [PERF-006](roadmap/PERF-006-dom-style-binding-allocations.md) | bindStyle / bindSvgAttributes: no per-frame allocations, skip unchanged writes | Performance | 4 | 3 | 3 | 21 | BENCH-008, PERF-003 |
| [PERF-002](roadmap/PERF-002-compile-value-interpolators.md) | Parse string/color endpoints once, not every frame | Performance | 3 | 2 | 2 | 20 | REFACTOR-003, BENCH-008 |
| [PERF-004](roadmap/PERF-004-path-morph-precomputed-numbers.md) | Path morph: pre-split template and use typed arrays per frame | Performance | 3 | 2 | 2 | 20 | BENCH-008 |
| [PERF-003](roadmap/PERF-003-compile-css-interpolation.md) | Tokenize CSS keyframe pairs once | Performance | 4 | 2 | 3 | 18 | REFACTOR-003, BENCH-008 |
| [UNIT-010](roadmap/UNIT-010-safety-net-for-refactors.md) | Raise coverage where refactors will land (Tween, Keyframes, DOM scope/text/layout) | Tests | 3 | 3 | 3 | 18 | — |
| [PERF-005](roadmap/PERF-005-keyframes-precomputed-segments.md) | Keyframes: precompute per-segment easing and remember the last segment | Performance | 2 | 1 | 1 | 15 | BENCH-008, UNIT-010 |

### Phase 2 — Core engine and refactors

| ID | Item | Category | I | R | E | Score | Depends on |
|---|---|---|---|---|---|---|---|
| [REFACTOR-005](roadmap/REFACTOR-005-value-animation-delegation.md) | Remove delegate boilerplate between Tween, Keyframes and Animation | Refactor | 3 | 2 | 2 | 20 | UNIT-010 |
| [PERF-007](roadmap/PERF-007-frame-coordinator-hot-path.md) | FrameCoordinator: avoid per-frame array copies and O(n) task removal | Performance | 3 | 3 | 3 | 18 | BENCH-007, BENCH-008, UNIT-008 |
| [REFACTOR-004](roadmap/REFACTOR-004-extract-playback-lifecycle.md) | Share the playback/motion-lifecycle logic between Animation and Timeline | Refactor | 4 | 3 | 4 | 14 | UNIT-010, PERF-007, PERF-009 |
| [PERF-009](roadmap/PERF-009-timeline-active-window.md) | Timeline: only touch segments that can change on this frame | Performance | 3 | 3 | 4 | 12 | BENCH-008, UNIT-010 |
| [PERF-011](roadmap/PERF-011-per-instance-memory.md) | Measure, then trim per-instance allocation of Animation | Performance | 2 | 1 | 3 | 9 | BENCH-007, BENCH-008 |

### Phase 3 — Browser reality, tooling and docs

| ID | Item | Category | I | R | E | Score | Depends on |
|---|---|---|---|---|---|---|---|
| [CHORE-006](roadmap/CHORE-006-lint-and-format.md) | Add a linter/formatter and remove leftover whitespace-only lines | Tooling | 3 | 2 | 2 | 20 | — |
| [PERF-010](roadmap/PERF-010-dom-batching-and-layout-reads.md) | Investigate DOM read/write interleaving and per-frame SVG path queries | Performance (measure-first) | 3 | 2 | 3 | 15 | BENCH-009 |
| [BENCH-009](roadmap/BENCH-009-browser-benchmark-runner-and-ci-report.md) | Headless real-browser benchmark runner and report-only CI job | Benchmarks | 3 | 3 | 4 | 12 | BENCH-006, BENCH-007 |
| [DOCS-004](roadmap/DOCS-004-decouple-contract-checks.md) | Stop asserting literal source strings in the docs contract scripts | Docs / Maintainability | 3 | 3 | 4 | 12 | — |

### Phase 4 — Dependencies and packaging

| ID | Item | Category | I | R | E | Score | Depends on |
|---|---|---|---|---|---|---|---|
| [CHORE-007](roadmap/CHORE-007-library-toolchain-updates.md) | Update library dev-toolchain patch/minor versions | Dependencies | 2 | 2 | 2 | 16 | UNIT-008 |
| [CHORE-010](roadmap/CHORE-010-exports-default-condition.md) | Add the `default` condition to the root export | Packaging | 1 | 2 | 1 | 15 | — |
| [CHORE-011](roadmap/CHORE-011-adopt-re-code-basics.md) | Decide and, if approved, adopt `@re-code/basics` for duplicated helpers | Dependencies / Refactor | 2 | 2 | 3 | 12 | REFACTOR-003, UNIT-008, CHORE-007 |
| [CHORE-012](roadmap/CHORE-012-upstream-generic-helpers-to-basics.md) | Upstream generic helpers into `@re-code/basics`, then consume them | Dependencies / Refactor | 2 | 1 | 3 | 9 | CHORE-011, REFACTOR-003, BENCH-007 |
| [CHORE-008](roadmap/CHORE-008-docs-app-major-upgrades.md) | Docs app: plan and land Vite/Vue-ecosystem major upgrades separately | Dependencies | 2 | 2 | 4 | 8 | DOCS-004 |
| [CHORE-009](roadmap/CHORE-009-typescript-7-spike.md) | Spike: TypeScript 5.7 → 7 | Dependencies | 2 | 2 | 4 | 8 | CHORE-007, CHORE-006 |

## 5. Sequencing notes

1. **Phase 0 first.** Without BENCH-006/007/008 no PERF item can be accepted under the performance gate; without UNIT-008 and UNIT-009 the thresholds and easing refactors have no net.
2. **Land CHORE-006 (formatter) either before Phase 1 or after Phase 2, never in between** — a repo-wide reformat conflicts with every open performance PR.
3. **PERF-007, PERF-009 and REFACTOR-004 touch the same files** (`FrameCoordinator`, `Timeline`, `Animation`); do the performance changes first, then extract the shared lifecycle.
4. **PERF-003 → PERF-006** (CSS compile before the binding fast path) and **REFACTOR-003 → PERF-002/003** (one parser before compiling it).
5. **Measure-first items (PERF-010, PERF-011) may end as "no change"**; that is a valid outcome.

## 6. Out of scope / not verified in this audit

- No real-browser benchmark was run (Node benchmarks only); browser-dependent items are therefore labelled hypotheses.
- Browser integration (`npm run check:browser-integration`) and docs contracts (`npm run check:docs`) were not re-run; only Jest, coverage, `npm outdated`, `npm audit` and the benchmark suite were.
- Source files under `src/operators/gestures.ts`, `adaptiveTween.ts`, `scrollTrigger.ts`, `draggable.ts`, `steering.ts`, `three.ts` were skimmed for hot-path patterns only; `scrollTrigger` already uses the coordinator read/write phases and passive listeners. A deeper review of these is not included.
- The docs app (`apps/docs`: ~150 files of Vue components, demos and SCSS) was **not** reviewed for optimizations or accessibility; only `BrowserBenchmarks.vue`, the locale file references and the `scripts/check-*.mjs` contracts were read.
- Timing numbers are from a single machine and a single session; treat them as a baseline for comparison, not as absolute figures.
