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

- [x] Existing `tests/values/*.test.ts` and `tests/core/composition.test.ts` pass unchanged.
- [x] New tests cover every delegated method for both classes (calls forwarded, return value is `this`): `tests/values/AnimatedValue.delegation.test.ts` (24 tests, green on the old implementation and on the new one).
- [x] `npm run check:tree-shaking` passes.
- [ ] Public `.d.ts` diff is empty. **Not literally achievable and not met:** a shared base class has to appear in `Tween.d.ts` / `Keyframes.d.ts` as `extends AnimatedValue<T>`. The public instance surface (every method and property a user can call or read, with the same signatures and JSDoc) is unchanged, and the change is recorded in `CHANGELOG.md`; see Status.
- [x] Net line count of `Tween.ts` + `Keyframes.ts` decreases: 396 → 237 lines (110 + 286 → 29 + 208); including the new `AnimatedValue.ts` (107 lines) the three files total 344.

## Shared gates

**Code gate** (see `roadmap/README.md`)
- [x] `npm run typecheck` and `npm run typecheck:tests` pass.
- [x] `npm test -- --runInBand` passes: 50 suites, 1197 tests (was 49 / 1173).
- [x] `npm run check:tree-shaking`, `npm run check:package` and `npm run check:package:consumer` pass.
- [x] No change to public `.d.ts` output unless intended; the intended change (class hierarchy) is recorded in `CHANGELOG.md` under Unreleased.

## Status

**Done 2026-11-23** (one commit on branch `claude/phase-2-7ff826`). `Tween` and `Keyframes` now extend an internal `AnimatedValue<T>` (`src/values/AnimatedValue.ts`, not exported from any entry point) that owns the `Animation`, the value subject, `value$` / `progress$` / `state$` and the whole delegation (`play`, `pause`, `pauseFromParent`, `stop`, `restart`, `seek`, `seekLocal`, `resetInternal`, `toPromise`, `then`, `catch`, `finally`, `duration`). Subclasses supply `updateValue(progress, easedProgress)`; `Keyframes` also overrides `publishInitialValue()` because its `stop()` / `restart()` notify the `onUpdate` callback while `resetInternal()` stays silent, exactly as before.

- Order of effects is preserved: `stop()` stops the animation, then publishes the first value; `restart()` publishes first, then restarts; `resetInternal()` resets the animation, then the value. Constructor validation order is also preserved (interpolators, normalization and easings are resolved before the `Animation` is built, as they were), which needed code before `super()` — allowed by TypeScript 5.7 because none of it touches `this`.
- Lines: `Tween.ts` 110 → 29, `Keyframes.ts` 286 → 208 (396 → 237); with `AnimatedValue.ts` (107) 344 in total.
- Output size: all of `dist/**/*.js` went from 270,758 to 270,382 bytes (−376) including the new file; `values.js` plus `values/*.js` from 20,024 to 19,648. Tree-shaking check passes.
- Tests: the existing UNIT-010 delegation suites (`Tween.delegation`, `Keyframes.delegation`) and `composition` pass unchanged. Added `tests/values/AnimatedValue.delegation.test.ts` (24 tests, parameterised over both classes: each control method forwards to the `Animation` once with its arguments and returns the instance, effect ordering for `stop` / `restart` / `resetInternal`, `then` / `catch` / `finally` / `toPromise` forwarding, `progress$` / `state$` identity). It passes on the old implementation (verified by restoring the old `Tween.ts` / `Keyframes.ts`) and on the new one. Whole suite: 50 suites, 1197 tests (was 49 / 1173).
- **`.d.ts` caveat.** `dist/values/Tween.d.ts` and `Keyframes.d.ts` now declare `extends AnimatedValue<T>` and no longer list the delegated methods themselves; a new `dist/values/AnimatedValue.d.ts` appears, which also shows two `protected` members (`valueSubject`, `initialValue`) and the abstract hook. Every public method and property keeps its name, signature and doc comment, but the declaration files are not byte-identical, so that criterion is unmet as written. Diff kept in the shared notes folder (`phase-2/refactor-005-dts-diff.txt`).
- Not measured: no performance claim is made. The only runtime difference is one more prototype level for the delegated calls.
