# API-001 — Stop silently falling back to linear on mistyped easing names; fill the easing set

| Category | Impact | Risk | Effort | Priority score | Phase | Depends on |
|---|---|---|---|---|---|---|
| API / DX | 3 | 3 | 2 | **24** | 1 | [UNIT-009](./UNIT-009-easings-coverage.md) |

Priority = (Impact + Risk) × (6 − Effort). Back to the [roadmap](../roadmap.md).

## Status

**Done 2026-11-22 (local).**

**Decision (ADR):** policy **(b)** — keep the `linear` fallback and `console.warn` once per distinct unknown name outside production (`NODE_ENV === 'production'` silences it). Rationale: `EasingOption` is a public beta type and strings may come from configuration at runtime, so a `RangeError` (a) would be a breaking change with no migration path; the cost of (b) is that a typo is only a warning, which the `(string & {})` autocomplete now makes much less likely. Resolution happens at construction only. Revisit (a) at 1.0.

**What changed:** `resolveEasing` (`src/utils/easings.ts`) warns once per name; `EasingOption` is `EasingFunction | EasingName | (string & {})`; `Easings.easeInOutElastic` added (symmetric about (0.5, 0.5), 0 and 1 anchored); `Keyframes` precomputes one easing per segment in the constructor, so `grep -n resolveEasing src/values/Keyframes.ts` shows constructor-time use only (a per-keyframe typo is now also reported at construction instead of silently on the first frame).

**Tests:** `tests/core/easingPolicy.test.ts` (Animation, Tween, Keyframes default and per-keyframe, `animate()`: exactly one warning at construction, none while running, linear behaviour), `tests/types/easing.types.test.ts` (`Equal<>` assertions that `EasingOption` is not `string`, every `EasingName` is a runtime key), `tests/utils/easings.test.ts` (warn-once, production silence, `easeInOutElastic` symmetry). 43 suites / 743 tests (was 41 / 726 after REFACTOR-003).

**Verification:** `typecheck`, `typecheck:tests`, `npm test -- --runInBand`, `check:tree-shaking`, `check:package`, `check:package:consumer` and `check:docs` pass. `.d.ts` change is intended and recorded in CHANGELOG: `dist/types/easing.d.ts` (new union member, `(string & {})`) and `dist/utils/easings.d.ts` is unchanged (`Easings` is still `Readonly<Record<string, EasingFunction>>`).

## Problem

A typo like `easeOutQaud` runs a linear animation with no signal, and the TypeScript type offers no help because the union collapses to `string`.

## Evidence

- `src/types/easing.ts`: `export type EasingOption = EasingFunction | EasingName | string;` — `EasingName | string` is just `string`, so no autocomplete or typo checking.
- `src/utils/easings.ts:83-87` `resolveEasing`: unknown names `return Easings.linear!` silently.
- `Easings` defines `easeInElastic` and `easeOutElastic` but no `easeInOutElastic`, although every other family has `In`, `Out` and `InOut` variants (see the `Easings` object at the end of `src/utils/easings.ts`; `EasingName` in `src/types/easing.ts` likewise).
- Per-frame cost of `resolveEasing` is a `hasOwnProperty` lookup (`Keyframes.ts:145`) — cheap, so this is a correctness/DX item, not a performance one.

## Scope

- Decide the policy: (a) throw `RangeError` for unknown names at construction time (breaking), or (b) `console.warn` once per unknown name in non-production builds and keep fallback. Record the choice as an ADR in the PR.
- Use the `EasingName | (string & {})` pattern so editors suggest known names while still allowing custom strings if (b) is chosen.
- Add `easeInOutElastic` (additive).

## Non-goals

- No new easing curves beyond `easeInOutElastic`.

## Risks

- Option (a) is a behaviour change for a public beta API; must be called out in CHANGELOG. Resolution must happen at construction, never per frame.

## Acceptance criteria

Every box must be checkable by running the named command or inspecting the named file.

- [x] A test passes an unknown easing name to `Animation`, `Tween`, `Keyframes` and `animate()` and observes the chosen policy (throw or single warning) — same behaviour in all four.
- [x] A type-level test (a `tests/**/*.ts` file checked by `npm run typecheck:tests`) asserts `EasingOption` is **not** identical to `string` (e.g. an `Equal<>` helper) and that every `EasingName` literal is assignable; under policy (a) it additionally asserts that an unknown literal is a compile error.
- [x] `Easings.easeInOutElastic(0) === 0`, `(1) === 1`, and is symmetric with `easeInElastic`/`easeOutElastic` (unit test).
- [x] No call to `resolveEasing` remains inside a per-frame method (`grep -n "resolveEasing" src/values/Keyframes.ts` shows constructor-time use only).
- [x] CHANGELOG Unreleased documents the policy and the new easing.

## Shared gates

**Code gate** (see `roadmap/README.md`)
- [x] `npm run typecheck` and `npm run typecheck:tests` pass.
- [x] `npm test -- --runInBand` passes (record the test count; it must not decrease unless tests are intentionally replaced).
- [x] `npm run check:tree-shaking`, `npm run check:package` and `npm run check:package:consumer` pass.
- [x] No change to public `.d.ts` output unless intended; any intended change is recorded in `CHANGELOG.md` under Unreleased.
