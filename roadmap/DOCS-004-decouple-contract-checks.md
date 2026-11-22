# DOCS-004 — Stop asserting literal source strings in the docs contract scripts

| Category | Impact | Risk | Effort | Priority score | Phase | Depends on |
|---|---|---|---|---|---|---|
| Docs / Maintainability | 3 | 3 | 4 | **12** | 3 | — |

Priority = (Impact + Risk) × (6 − Effort). Back to the [roadmap](../roadmap.md).

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

- [ ] `BrowserBenchmarks.vue` is under 400 lines; statistics/orchestration live in `apps/docs/src/**/*.ts` covered by Jest tests (new `tests/docs/*.test.ts`).
- [ ] `scripts/check-browser-benchmark.mjs` no longer contains `page.includes(` assertions about local variable names/constants.
- [ ] `npm run check:docs` and `npm run build --workspace=re-flux-docs` pass.
- [ ] The `/benchmarks` route is still a separate lazy chunk (inspect `apps/docs/dist/assets` after build or `check-route-delivery` output).

## Shared gates

**Code gate** (see `roadmap/README.md`)
- [ ] `npm run typecheck` and `npm run typecheck:tests` pass.
- [ ] `npm test -- --runInBand` passes (record the test count; it must not decrease unless tests are intentionally replaced).
- [ ] `npm run check:tree-shaking`, `npm run check:package` and `npm run check:package:consumer` pass.
- [ ] No change to public `.d.ts` output unless intended; any intended change is recorded in `CHANGELOG.md` under Unreleased.

**Docs gate** (see `roadmap/README.md`)
- [ ] `npm run check:docs` passes (update the matching `scripts/check-*.mjs` contract in the same PR if a literal it asserts changes).
- [ ] `npm run build --workspace=re-flux-docs` passes.
