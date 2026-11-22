# UNIT-009 — Test every public easing, `cubicBezier` and `steps`

| Category | Impact | Risk | Effort | Priority score | Phase | Depends on |
|---|---|---|---|---|---|---|
| Tests | 3 | 3 | 1 | **30** | 0 | — |

Priority = (Impact + Risk) × (6 − Effort). Back to the [roadmap](../roadmap.md).

## Status

**Done 2026-11-22** (uncommitted in the working tree). `tests/utils/easings.test.ts` (176 tests): all 30 easings are exercised through a key-set check against `Easings`, endpoints, midpoint values, finiteness, monotonicity/overshoot rules; `cubicBezier` is checked against CSS `ease`, `ease-in`, `ease-out`, `ease-in-out` reference values from an independent bisection solver (tolerance 1e-4); `steps` and `resolveEasing` are covered. `easings.ts`: 96.8% statements, 96.05% branches, 100% functions. `npm run check:all` passed.

## Problem

The easing module is public API and under-tested.

## Evidence

- Coverage run: `src/utils/easings.ts` 41.6% statements, 31.6% branches, **24.3% functions**, uncovered lines 27-61, 92, 98-112 (most easing functions plus `cubicBezier` internals).
- `src/index.ts` exports `Easings`, `resolveEasing`, `cubicBezier`, `steps`.

## Scope

- Table-driven test over all keys of `Easings`: finite output on [0,1], `f(0)=0`, `f(1)=1` (document the intentional overshoot of back/elastic), monotonic where expected.
- `cubicBezier`: CSS reference values for `ease`, `ease-in`, `ease-out`, `ease-in-out`; invalid x control points throw; extreme curves converge.
- `steps`: `start`/`end` semantics, count validation.

## Non-goals

- No behaviour changes; this item only adds tests (API-001 changes behaviour).

## Risks

- None significant.

## Acceptance criteria

Every box must be checkable by running the named command or inspecting the named file.

- [x] `npm run test:coverage` reports `easings.ts` ≥ 95% statements and ≥ 95% functions.
- [x] Every key in `Easings` is exercised (test fails if a new easing is added without being listed in the table).
- [x] `cubicBezier(0.25,0.1,0.25,1)` matches CSS `ease` at t = 0.25, 0.5, 0.75 within 1e-4 (hard-coded reference values in the test).

## Shared gates

**Code gate** (see `roadmap/README.md`)
- [x] `npm run typecheck` and `npm run typecheck:tests` pass.
- [x] `npm test -- --runInBand` passes (record the test count; it must not decrease unless tests are intentionally replaced).
- [x] `npm run check:tree-shaking`, `npm run check:package` and `npm run check:package:consumer` pass.
- [x] No change to public `.d.ts` output unless intended; any intended change is recorded in `CHANGELOG.md` under Unreleased.
