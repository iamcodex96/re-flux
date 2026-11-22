# API-001 — Stop silently falling back to linear on mistyped easing names; fill the easing set

| Category | Impact | Risk | Effort | Priority score | Phase | Depends on |
|---|---|---|---|---|---|---|
| API / DX | 3 | 3 | 2 | **24** | 1 | [UNIT-009](./UNIT-009-easings-coverage.md) |

Priority = (Impact + Risk) × (6 − Effort). Back to the [roadmap](../roadmap.md).

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

- [ ] A test passes an unknown easing name to `Animation`, `Tween`, `Keyframes` and `animate()` and observes the chosen policy (throw or single warning) — same behaviour in all four.
- [ ] A type-level test (a `tests/**/*.ts` file checked by `npm run typecheck:tests`) asserts `EasingOption` is **not** identical to `string` (e.g. an `Equal<>` helper) and that every `EasingName` literal is assignable; under policy (a) it additionally asserts that an unknown literal is a compile error.
- [ ] `Easings.easeInOutElastic(0) === 0`, `(1) === 1`, and is symmetric with `easeInElastic`/`easeOutElastic` (unit test).
- [ ] No call to `resolveEasing` remains inside a per-frame method (`grep -n "resolveEasing" src/values/Keyframes.ts` shows constructor-time use only).
- [ ] CHANGELOG Unreleased documents the policy and the new easing.

## Shared gates

**Code gate** (see `roadmap/README.md`)
- [ ] `npm run typecheck` and `npm run typecheck:tests` pass.
- [ ] `npm test -- --runInBand` passes (record the test count; it must not decrease unless tests are intentionally replaced).
- [ ] `npm run check:tree-shaking`, `npm run check:package` and `npm run check:package:consumer` pass.
- [ ] No change to public `.d.ts` output unless intended; any intended change is recorded in `CHANGELOG.md` under Unreleased.
