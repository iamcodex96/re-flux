# UNIT-010 — Raise coverage where refactors will land (Tween, Keyframes, DOM scope/text/layout)

| Category | Impact | Risk | Effort | Priority score | Phase | Depends on |
|---|---|---|---|---|---|---|
| Tests | 3 | 3 | 3 | **18** | 1 | — |

Priority = (Impact + Risk) × (6 − Effort). Back to the [roadmap](../roadmap.md).

## Status

**Done 2026-11-22.** New tests: `tests/values/Tween.delegation.test.ts`, `tests/values/Keyframes.delegation.test.ts`, `tests/adapters/dom-scope.test.ts`, `dom-text.test.ts`, `dom-layout.test.ts`, `dom-animation-lifecycle.test.ts`, plus `tests/helpers/fakeDom.ts`. Coverage after: `Tween.ts` 100% statements / 100% branches / 100% functions (was 75.8 / 0 / 66.7); `Keyframes.ts` 99.1% statements (was 82.2); `scope.ts` 100%; `text.ts` 100%; `layout.ts` 100% lines in Jest with a stubbed DOM (was 0%); `animation.ts` 93.9%. Total suite: 38 suites, 480 tests (was 31 / 226). Note for future test authors: an animation left running leaks the shared frame clock into later tests, so each test must `stop()` what it plays.

## Problem

The files targeted by the refactor/perf items have the weakest coverage, so those refactors would run without a safety net.

## Evidence

- Coverage run: `Tween.ts` 75.8% statements, **0% branches**, 66.7% functions (uncovered 55-56, 71-73, 100-108); `Keyframes.ts` 82.2% statements, 62.5% functions (60-83, 103-118); `adapters/dom/scope.ts` 67.9% (22-40, 61, 67-70 — `createResponsiveScope`); `adapters/dom/text.ts` 74.6% (58-60, 77-78, 124-127); `adapters/dom/layout.ts` **0%**; `adapters/dom/animation.ts` 71.2% (51-59 `dispose` error aggregation).
- `Timeline.ts` uncovered: 77, 90, 101 (validation errors), 241-244, 263-264, 329-330, 413-433.

## Scope

- Unit-test the delegation methods, error branches and `dispose` aggregation.
- Test `createResponsiveScope` with a fake `matchMedia`.
- Cover `flip()` either in Jest with a stubbed DOM or via a scenario in `tests/browser/fixture.ts`.

## Non-goals

- Not chasing 100%; focus on branches that refactors touch.

## Risks

- Browser-fixture tests run only on the Node 24 CI leg.

## Acceptance criteria

Every box must be checkable by running the named command or inspecting the named file.

- [x] `npm run test:coverage`: `Tween.ts` branch coverage > 0 and ≥ 80%; `Keyframes.ts`, `scope.ts`, `text.ts` ≥ 90% statements; `layout.ts` is covered either by Jest with a stubbed DOM (>0% in the coverage report) or by a named `flip()` scenario in `tests/browser/fixture.ts` (the Playwright check emits no coverage numbers, so name the scenario).
- [x] Tests assert behaviour (values, calls, restored DOM), not implementation details such as private fields.
- [x] New tests all pass on current `main` before any refactor is merged.

## Shared gates

**Code gate** (see `roadmap/README.md`)
- [x] `npm run typecheck` and `npm run typecheck:tests` pass.
- [x] `npm test -- --runInBand` passes (record the test count; it must not decrease unless tests are intentionally replaced).
- [x] `npm run check:tree-shaking`, `npm run check:package` and `npm run check:package:consumer` pass.
- [x] No change to public `.d.ts` output unless intended; any intended change is recorded in `CHANGELOG.md` under Unreleased.
