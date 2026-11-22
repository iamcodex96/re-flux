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

- [ ] All tests under `tests/core/` pass unchanged; line coverage of `src/core/` is ≥ the pre-refactor value (`npm run test:coverage`, record both).
- [ ] `grep -n "ensureMotionLifecycle" src/core` finds the implementation in exactly one file.
- [ ] `npm run check:browser-integration` passes (reduced-motion, hidden-page, pause precedence scenarios).
- [ ] Bundle size of `dist/core.js` + `dist/core/*.js` is not larger than before (`du -b`), and `npm run check:tree-shaking` passes.
- [ ] Public `.d.ts` diff is empty.

## Shared gates

**Code gate** (see `roadmap/README.md`)
- [ ] `npm run typecheck` and `npm run typecheck:tests` pass.
- [ ] `npm test -- --runInBand` passes (record the test count; it must not decrease unless tests are intentionally replaced).
- [ ] `npm run check:tree-shaking`, `npm run check:package` and `npm run check:package:consumer` pass.
- [ ] No change to public `.d.ts` output unless intended; any intended change is recorded in `CHANGELOG.md` under Unreleased.
