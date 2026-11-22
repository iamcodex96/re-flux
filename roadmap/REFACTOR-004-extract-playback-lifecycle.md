# REFACTOR-004 — Share the playback/motion-lifecycle logic between Animation and Timeline

| Category | Impact | Risk | Effort | Priority score | Phase | Depends on |
|---|---|---|---|---|---|---|
| Refactor | 4 | 3 | 4 | **14** | 2 | [UNIT-010](./UNIT-010-safety-net-for-refactors.md), [PERF-007](./PERF-007-frame-coordinator-hot-path.md), [PERF-009](./PERF-009-timeline-active-window.md) |

Priority = (Impact + Risk) × (6 − Effort). Back to the [roadmap](../roadmap.md).

## Problem

`Animation` and `Timeline` carry near-identical copies of clock start, pause/stop/restart bookkeeping, state transitions and motion-lifecycle wiring; fixes have to be applied twice.

## Evidence

- `Animation.ts:236-262` and `Timeline.ts:424-450` are the same `ensureMotionLifecycle` / `clearMotionLifecycle` bodies; `startClock`, `setState`, `hasActiveClock` and the constant `STOPPED_ERROR` are duplicated (`Animation.ts:11`, `Timeline.ts:9`).
- The CHANGELOG already records a Timeline-only fix for `call()` re-arm and ownership rules; divergence risk is real.
- Coverage: `Animation.ts` 94%, `Timeline.ts` 89% lines (uncovered: 77, 90, 101, 241-244, 263-264, 329-330, 413-433).

## Scope

- Extract an internal `PlaybackController` (clock subscription, state subject, completion, motion lifecycle) used by both; keep per-class seek/update logic.
- No public type changes.

## Non-goals

- No behaviour change; no new features.

## Risks

- Behaviour drift in rarely-tested branches. Do after the perf items that touch the same files to avoid merge conflicts.

## Acceptance criteria

Every box must be checkable by running the named command or inspecting the named file.

- [x] All tests under `tests/core/` pass unchanged; line coverage of `src/core/` is ≥ the pre-refactor value (`npm run test:coverage`): lines 97.11% → 98.07%, statements 95.30% → 96.38%, branches 89.20% → 90.09%, functions 93.33% → 96.55%; `Animation.ts` 96.95 → 96.66% lines, `Timeline.ts` 95.81 → 97.80%, new `PlaybackController.ts` 98.00%.
- [x] `grep -n "ensureMotionLifecycle" src/core` finds the implementation in exactly one file (`src/core/PlaybackController.ts`; `Animation.ts` and `Timeline.ts` no longer mention it).
- [x] `npm run check:browser-integration` passes (reduced-motion, hidden-page, pause precedence scenarios): 10 cases.
- [x] Bundle size of `dist/core.js` + `dist/core/*.js` is not larger than before (`du -b` does not exist on macOS; measured with `cat … | wc -c`): 62,902 → 62,504 bytes (−398) including the new file; `npm run check:tree-shaking` passes.
- [x] Public `.d.ts` diff is empty: the only differences in `dist/**/*.d.ts` are the private member lists of `Animation` and `Timeline` (their `stateSubject`, `clockSubscription`, `motionLifecycle`, `startClock`, `ensureMotionLifecycle`, `clearMotionLifecycle`, `hasActiveClock` and `setState` are replaced by one private `playback`) and a new internal `dist/core/PlaybackController.d.ts` (not re-exported). Every public and `@internal`-tagged signature is identical.

## Shared gates

**Code gate** (see `roadmap/README.md`)
- [x] `npm run typecheck` and `npm run typecheck:tests` pass.
- [x] `npm test -- --runInBand` passes: 54 suites, 1518 tests (unchanged from before this item; no test was edited).
- [x] `npm run check:tree-shaking`, `npm run check:package` and `npm run check:package:consumer` pass (also `check:docs` and `check:browser-integration`).
- [x] No change to public `.d.ts` output beyond private members (see above).

## Status

**Done 2026-11-23.** One commit on branch `claude/phase-2-7ff826`, after PERF-007 and PERF-009 as required.

What changed:

- New internal `src/core/PlaybackController.ts` (`PlaybackController<Host>`, `STOPPED_ERROR`, two small interfaces). It owns the public state subject and `state$`, the frame-clock subscription (`startClock`, `dropClock`, `pauseClock`, `hasClock`, `hasActiveClock`, the clock `error` handler) and the lazily created motion-preference lifecycle (`requestPlay`, `clearMotionLifecycle`, the single `ensureMotionLifecycle` with its reduced-motion / hidden-page / pause bridge). The completion promise (`Completion`) stays in the host and is handed to the controller only so the clock error handler can reject it.
- `Animation` and `Timeline` keep their seek / progress / update / completion logic, and now call the controller instead of carrying copies of `startClock`, `ensureMotionLifecycle`, `clearMotionLifecycle`, `hasActiveClock`, `setState` and the `STOPPED_ERROR` constant. What differs per class is the frame handler (advance by delta for `Animation`; scaled, directed `updateAt` with the first-frame rules for `Timeline`), supplied as one module-level `PlaybackHooks` object per class, so an instance holds no closures for it.
- Composition rather than a base class, because a base class would have changed the public declaration files (see REFACTOR-005).
- Lines: `Animation.ts` 301 → 233, `Timeline.ts` 713 → 646, plus 137 for the controller (net +1 line, but the duplicated logic now exists once).

Evidence: all 1,518 existing tests pass unchanged, including the 250-seed `Timeline.differential` test against the frozen pre-PERF-009 `Timeline` (so every trace of a Timeline driven by seeks, frames, reverse, pause, stop and restart is unchanged) and the `Animation` contract tests; browser integration passes; coverage and size numbers above.

Costs, measured (not criteria of this item): each `Animation` / `Tween` / `Keyframes` / `Timeline` now owns one extra small object. The BENCH-008 `memory` workload went from 1,641 to 1,714 bytes per `Animation` (+72, +4.4%), 2,434 → 2,506 for `Tween`, 2,963 → 3,035 for `Keyframes`, 2,049 → 2,122 for an empty `Timeline`, and 19,323 → 20,116 for a `Timeline` with 10 `Animation`s (three runs each, stable to ±0.5 byte). Frame-time allocation is unchanged: 553–554 young-generation collections for 400 frames of 5,000 playing animations (1 MB semi-space), before and after, in three alternated runs; setup allocates a little more (21–23 → 27–28 collections for creating and starting 5,000 animations). Frame times in the interleaved `animation-load` runs are not conclusive (load average 116–210). PERF-011 starts from the new numbers.
