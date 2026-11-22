# PERF-011 — Measure, then trim per-instance allocation of Animation

| Category | Impact | Risk | Effort | Priority score | Phase | Depends on |
|---|---|---|---|---|---|---|
| Performance | 2 | 1 | 3 | **9** | 2 | [BENCH-007](./BENCH-007-variance-and-gc-control.md), [BENCH-008](./BENCH-008-hot-path-benchmarks.md) |

Priority = (Impact + Risk) × (6 − Effort). Back to the [roadmap](../roadmap.md).

## Problem

Each `Animation` allocates two `BehaviorSubject`s, two `readonlyBehavior` Observables, a `Completion` (with a Promise and a `.catch` handler) and a frozen options copy even if nobody observes them.

## Evidence

- `src/core/Animation.ts:15-26,51`; `src/core/Completion.ts:createPromise` creates a Promise eagerly in the constructor and attaches `void promise.catch(() => undefined)`.
- No existing benchmark reports heap per instance (see BENCH-008), so the cost is unquantified — this item is *measure-first*.

## Scope

- Use BENCH-008 `memory.bench` to get bytes/instance for `Animation`, `Tween`, `Keyframes`, `Timeline`.
- If material, lazily create the Completion promise on first `then`/`toPromise`/`play` and lazily create `progress$`/`state$` observable views.

## Non-goals

- Do nothing if the measured saving is small — close the item with the numbers.

## Risks

- Lazy promise creation changes when unhandled rejections can occur; `Completion` exists precisely to avoid unobserved rejection errors.

## Acceptance criteria

Every box must be checkable by running the named command or inspecting the named file.

- [ ] The measured bytes/instance before and after are recorded in this file.
- [ ] If any code change is made: `tests/core/Completion.test.ts` and `Animation.contract.test.ts` pass unchanged, and no unhandled-rejection warning appears when `stop()` is called on an animation nobody awaited.
- [ ] `npm run bench` memory workload shows lower heap per instance than baseline by the pre-recorded target, or the item is closed as "not worth it" with evidence.

## Shared gates

**Code gate** (see `roadmap/README.md`)
- [ ] `npm run typecheck` and `npm run typecheck:tests` pass.
- [ ] `npm test -- --runInBand` passes (record the test count; it must not decrease unless tests are intentionally replaced).
- [ ] `npm run check:tree-shaking`, `npm run check:package` and `npm run check:package:consumer` pass.
- [ ] No change to public `.d.ts` output unless intended; any intended change is recorded in `CHANGELOG.md` under Unreleased.
