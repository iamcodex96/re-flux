# REFACTOR-005 — Remove delegate boilerplate between Tween, Keyframes and Animation

| Category | Impact | Risk | Effort | Priority score | Phase | Depends on |
|---|---|---|---|---|---|---|
| Refactor | 3 | 2 | 2 | **20** | 2 | [UNIT-010](./UNIT-010-safety-net-for-refactors.md) |

Priority = (Impact + Risk) × (6 − Effort). Back to the [roadmap](../roadmap.md).

## Problem

`Tween` and `Keyframes` re-implement every `Animation` control method one-for-one.

## Evidence

- `src/values/Tween.ts:46-110` and `src/values/Keyframes.ts:70-120` are line-for-line delegation of `play/pause/stop/restart/seek/seekLocal/resetInternal/then/catch/finally/toPromise`.
- `Tween` branch coverage is 0% and function coverage 66% (coverage run), so mistakes in delegation currently go unnoticed.

## Scope

- Introduce a small internal `AnimatedValue<T>` base/mixin holding the delegation; subclasses supply value publishing.
- Keep `stop()`/`restart()` value-reset semantics identical.

## Non-goals

- No change to `Tween`/`Keyframes` public surface.

## Risks

- Class hierarchy must not defeat tree-shaking or inflate `dist/values.js`.

## Acceptance criteria

Every box must be checkable by running the named command or inspecting the named file.

- [ ] Existing `tests/values/*.test.ts` and `tests/core/composition.test.ts` pass unchanged.
- [ ] New tests cover every delegated method for both classes (calls forwarded, return value is `this`).
- [ ] `npm run check:tree-shaking` passes; public `.d.ts` diff is empty.
- [ ] Net line count of `Tween.ts` + `Keyframes.ts` decreases (report before/after with `wc -l`).

## Shared gates

**Code gate** (see `roadmap/README.md`)
- [ ] `npm run typecheck` and `npm run typecheck:tests` pass.
- [ ] `npm test -- --runInBand` passes (record the test count; it must not decrease unless tests are intentionally replaced).
- [ ] `npm run check:tree-shaking`, `npm run check:package` and `npm run check:package:consumer` pass.
- [ ] No change to public `.d.ts` output unless intended; any intended change is recorded in `CHANGELOG.md` under Unreleased.
