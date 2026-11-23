# DOCS-004 — Stop asserting literal source strings in the docs contract scripts

| Category | Impact | Risk | Effort | Priority score | Phase | Depends on |
|---|---|---|---|---|---|---|
| Docs / Maintainability | 3 | 3 | 4 | **12** | 3 | — |

Priority = (Impact + Risk) × (6 − Effort). Back to the [roadmap](../roadmap.md).

## Status

**Done 2026-11-23** on branch `claude/phase-3-9822a6` (scoped to what the item names: `BrowserBenchmarks.vue` and `scripts/check-browser-benchmark.mjs`; the frontend redesign will rewrite most of the rest of `apps/docs`, so the other contract scripts were audited, not rewritten).

### What changed

- `apps/docs/src/views/BrowserBenchmarks.vue` went from **1,218 to 375 lines**: the template is unchanged (209 lines) and the script is a thin view (state, computed values, the page's own formatting helpers and the export button). Everything else moved into plain TypeScript with no Vue or store imports in `apps/docs/src/benchmarks/`:
  - `types.ts` (report and run types, and `BenchmarkMessages`, the subset of the locale block the engine needs; `vue-tsc` checks that the locale provides every key),
  - `config.ts` (repetitions, warm-up, calibration count, target and duration options, pinned CDN URLs and versions, engine/scenario/renderer catalogs with their locale keys),
  - `statistics.ts` (`round`, `median`, `percentile`, `estimateMissedRefreshes`, `summarizeEngine`, the rotating `engineRunOrder`),
  - `environment.ts` (`BenchmarkEnvironment`: clock, frames, timers, visibility, performance observers and the report's environment block; `browserEnvironment()` wraps the real browser),
  - `scenes.ts` (DOM, SVG, Canvas and plain-object scenes), `runners.ts` (on-demand loading of GSAP/Anime.js, per-engine runners),
  - `measure.ts` (abort helpers, frame-cadence calibration, `measureRun`),
  - `report.ts` (the `schemaVersion: 2` export) and `session.ts` (`runBenchmarkSession`: load, calibrate, warm up, measure with rotating engine order, cancel/error outcome).
  Behaviour is the same code moved, with `window`/`performance`/`PerformanceObserver` reached through the injected environment and locale text passed in as `messages`.
- **Jest tests** (new `tests/docs/`, 5 files, 49 tests, with `tests/helpers/benchmarkEnvironment.ts`, a deterministic clock/frame/timer fake, and `benchmarkMessages.ts`): statistics (nearest-rank percentile, null diagnostics stay null, cleanup-probe aggregation, run-order rotation), calibration (steady cadence, outlier removal, 60 Hz fallbacks, abort), `measureRun` (renderer callback sampling, stretched/missed-refresh counting, the stale-callback cleanup probe, long-task window and rejected observers, timeout, cancel, missing stage), the session (order and counts: load, calibrate, 3 warm-ups, 10 × 3 measured runs, rotation, progress, cancel, failure with the engine that was running), the report (schema, library sources, methodology per scenario, null diagnostics) and the configuration contracts (pinned CDN versions equal the `gsap` / `animejs` devDependency versions the headless runner serves). `jest.config.cjs` and `tsconfig.test.json` gained the `@lib` alias the docs app already uses.
- **`scripts/check-browser-benchmark.mjs`** no longer contains any `page.includes(` assertion about local names or constants (`const repetitions = 10;`, `calibrationIntervalCount = 60`, `createPerTargetRunner`, `rendererWorkSamples`, `estimateMissedRefreshes`, the instrumentation fragment list, the `id: 'dom'` checks, …): those facts are now asserted on behaviour or configuration in `tests/docs/`. What it keeps are true contracts: the lazy `/benchmarks` route, navigation and footer links through locale data, the style entrypoint, the responsive/reduced-motion styles, the order of the panels in the page markup, the locale caveats, no static GSAP/Anime.js import anywhere in the page or the engine, and a new guard that the view stays under 400 lines. `.includes(` calls in `scripts/check-*.mjs`: 119 → 110 in total, 19 → 10 in this script.
- `/benchmarks` is still its own lazy chunk (`apps/docs/dist/assets/BrowserBenchmarks-*.js`; the entry chunk is 307.03 kB before and after, `check-route-delivery` passes).

### Audit of the other contract scripts (the item's first step, not acted on)

`.includes(` calls per script today: `check-home-experience` 49, `check-playground-layout` 17, `check-docs-redesign` 11, `check-browser-benchmark` 10, `check-visual-lab-complete` 9, `check-visual-lab` 6, `check-steering-integrations` 5, `check-scss-tokens` 5, `check-visual-lab-hover` 3, and one each in the tree-shaking and package scripts. The home, playground and Visual Lab checks assert markup and style literals of views that the frontend redesign (`roadmap/design/frontend-design-proposal.md`) is about to rewrite, so converting them now would be redone; they should be converted or deleted together with that redesign.

### Verified end to end

After the split, `node scripts/run-browser-benchmark.mjs` (BENCH-009) drove the refactored page in headless Chromium for `dom`, `engine-only` and `per-target-dom` (100 targets, 1 s): every engine returned 10 measured runs, the cleanup probe passed for the shared-renderer scenario, and the exported report has exactly the same key structure, methodology and caveats as the export of the old page. (This also closes the BENCH-009 gap that `engine-only` and `per-target-dom` had not been run through the runner.)

### Not verified

Appearance in a visible browser (no markup or style changed, but nothing was compared pixel by pixel); a manual run of the Lab by hand in the page (the runner exercises the same controls and export button).

## Problem

The 24 `scripts/check-*.mjs` files (~1,900 lines) rely heavily on asserting that source files *contain particular substrings* (123 `.includes(` calls), so harmless refactors can fail CI while real behaviour is not exercised.

## Evidence

- `scripts/check-browser-benchmark.mjs` asserts e.g. `page.includes('const repetitions = 10;')`, `page.includes('calibrationIntervalCount = 60')` and `page.includes('createPerTargetRunner')` against `BrowserBenchmarks.vue` (1218 lines).
- `npm run check:docs` chains 17 check scripts in one `&&` line in `package.json`; `grep -c ".includes(" scripts/check-*.mjs` totals 123 across the 24 scripts (largest users are `check-browser-benchmark`, `check-visual-lab-complete`, `check-visual-lab`). Auditing the rest is the first step of this item.
- Any refactor of the docs app (or of the Benchmark Lab for BENCH-009/PERF-010) must be accompanied by edits to these literals.

## Scope

- Split `BrowserBenchmarks.vue` into a pure TypeScript module (statistics, run orchestration) and a thin view; unit-test the module in Jest.
- Replace string-contains checks with behavioural checks (Jest or Playwright) where practical; keep string checks only for true contracts (route names, locale keys).

## Non-goals

- No visual redesign.

## Risks

- Moving logic changes Vite chunking; verify the `/benchmarks` route stays lazy-loaded.

## Acceptance criteria

Every box must be checkable by running the named command or inspecting the named file.

- [x] `BrowserBenchmarks.vue` is under 400 lines; statistics/orchestration live in `apps/docs/src/**/*.ts` covered by Jest tests (new `tests/docs/*.test.ts`).
- [x] `scripts/check-browser-benchmark.mjs` no longer contains `page.includes(` assertions about local variable names/constants.
- [x] `npm run check:docs` and `npm run build --workspace=re-flux-docs` pass.
- [x] The `/benchmarks` route is still a separate lazy chunk (inspect `apps/docs/dist/assets` after build or `check-route-delivery` output).

## Shared gates

**Code gate** (see `roadmap/README.md`)
- [x] `npm run typecheck` and `npm run typecheck:tests` pass.
- [x] `npm test -- --runInBand` passes (record the test count; it must not decrease unless tests are intentionally replaced): 63 suites / 1,590 tests (1,541 before this item; +49 in `tests/docs/`).
- [x] `npm run check:tree-shaking`, `npm run check:package` and `npm run check:package:consumer` pass.
- [x] No change to public `.d.ts` output (no `src/` change in this item).

**Docs gate** (see `roadmap/README.md`)
- [x] `npm run check:docs` passes (update the matching `scripts/check-*.mjs` contract in the same PR if a literal it asserts changes).
- [x] `npm run build --workspace=re-flux-docs` passes.
