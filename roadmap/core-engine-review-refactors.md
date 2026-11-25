# Core engine review — refactor and fix list

Findings from the level-1 code review of the core engine (2026-11-25): `src/core/FrameCoordinator.ts`, `Timeline.ts`, `Animation.ts`, `PlaybackController.ts`, `MotionLifecycleController.ts`, `Completion.ts`, `MotionPreferences.ts`. Back to the [roadmap](../roadmap.md).

## How to read this file

- This is a working backlog, not a set of roadmap items yet. When an entry is picked up, promote it to its own `roadmap/<ID>-<slug>.md` following [`README.md`](./README.md) (scoring, acceptance criteria, gates).
- The review was done by a read-only reviewer agent. It reproduced each finding against a build of `src/` with a fake `requestAnimationFrame` (typecheck, lint and `jest tests/core` were green: 15 suites, 409 tests). **The findings below were not independently re-run by the maintainer.** Re-reproduce each one in a failing test before changing code (working rule 2 in the README).
- `dist/` is older than REFACTOR-004. Build before reproducing against it.
- Only level 1 (core engine) was reviewed. Adapters, operators, values/physics, packaging, CI and the docs app are not covered here.
- Finding numbers (`F1`…`F11`) and suggestion numbers (`S1`…`S11`) are the review's own and are used for traceability.

Priority order below follows user impact first, then blast radius. Every entry is a *proposal*; none has been started.

## Backlog

| ID | Title | Fixes | Files | Priority |
|---|---|---|---|---|
| R1 | Re-entrancy epoch for `Timeline` updates | F5, F6 | `Timeline.ts` | High |
| R2 | Resolve completion before user callbacks; `onStop` last | F4, F8 | `Animation.ts`, `Timeline.ts` | High |
| R3 | Track which end a `Timeline` completed at | F1 | `Timeline.ts` | High |
| R4 | Playback direction: reset on stop, honour it under reduced motion, guard infinite durations | F2, F3, F7, S9 | `Timeline.ts`, `PlaybackController.ts`, `Animation.ts` | High |
| R5 | `MotionLifecycleController` / `PlaybackController` hygiene | F9, F11, S6, S7 | `MotionLifecycleController.ts`, `PlaybackController.ts` | Medium |
| R6 | `WriteChannel.dispose()` during its own callback | F10 | `FrameCoordinator.ts` | Low |
| R7 | Small validation and consistency fixes | S8, S10, S11 | `Timeline.ts` | Low |

Suggested order: write the characterization tests (see below) → R3 → R2 → R1 → R4 → R5 → R6 → R7. R1, R2 and R3 all touch `Timeline.ts` `updateAt`, so do them one at a time, each with its own commit.

---

### R1 — Re-entrancy epoch for `Timeline` updates

**Problem.** A child callback (for example `call(() => tl.stop())`) that calls `stop()`, `restart()` or `resetInternal()` sets `windowValid = false`, but the outer `updateAt` pass overwrites it with `true` because it only checks `reenteredWhileUpdating`. Segments reset by the re-entrant call stay unvisited. After the callback `updateAt` also keeps going with stale data: it emits the old progress and, when `completeNow`, completes anyway and calls `dropClock()` on a clock that was just restarted.

**Evidence (F5, F6).**
- `Timeline.ts:469` (with `:326`, `:347`, `:571`): `tl.add(a(100ms), 0).add(b(1000ms), 0).call(() => tl.stop() /* once */, 500)`; play to 512, then `tl.seek(800)`: `a` is left at 0 / `idle` (expected 1 / `completed`). With `stop()` called from outside the callback it ends 1 / `completed`.
- `Timeline.ts:399-419`: `tl.add(a).call(() => tl.restart())` ends `completed`, t = 0, clock stopped (the restart is lost). `call(() => tl.stop())` at the end fires `onStop` and then `onComplete`, state `completed`.
- PERF-009's document says the window is rebuilt after `stop()`/`restart()`. This contradicts it, so F5 is a regression against that item.

**Proposal (S1).** An epoch counter incremented by `stop`, `restart` and `resetInternal`. `updateAt` reads it before `visitSegments` and aborts the rest of the pass (no progress emit, no completion, no `dropClock`) if it changed. `visitSegments` must not mark the window valid when the epoch moved.

**Tests first.** Re-entrant `stop()` / `restart()` / `play()` from `call()` callbacks and child `onComplete`, with a subsequent `seek`. Extend the differential test in `Timeline.window.test.ts` so it also calls `stop()` / `restart()` from inside callbacks (today it only calls them from outside, which is why it missed F5).

**Risk.** Behaviour change for callers that relied on the current (buggy) completion after a re-entrant `stop()`. Record in `CHANGELOG.md`.

### R2 — Resolve completion before user callbacks; `onStop` last

**Problem.** `onComplete` runs before `completion.resolve()`. A `restart()` or `play()` inside `onComplete` (the usual looping pattern) corrupts the promises. `onStop` runs before the state is reset and the promise rejected, so a `play()` inside `onStop` leaves a running clock with state `idle` and a rejected cycle promise.

**Evidence (F4, F8).**
- `Animation.ts:165-166`, `Timeline.ts:417-418`: `const p = anim.toPromise(); onComplete: () => anim.restart()` → `p` rejects with "Animation stopped before completion" although the cycle finished; the second cycle's promise comes out already resolved with the animation `running` at progress 0. `play()` inside `onComplete` gives the second symptom.
- `Animation.ts:91`, `Timeline.ts:316`: `onStop: () => a.play(); a.stop()` → state `idle` with `clockActive: true`; it later reaches `completed` but its promise stays rejected.

**Proposal (S2).** Resolve the `Completion` first, then call `onComplete`. In `stop()`, finish the state reset and the rejection, then call `onStop` last.

**Tests first.** `restart()` / `play()` inside `onComplete` with a promise obtained beforehand; `play()` inside `onStop`. `scripts/check-unhandled-rejections.mjs` should stay green (PERF-011 made the promise lazy).

**Risk.** Observable ordering of callback vs. promise settlement changes (promise `then` handlers are microtasks, so synchronous callback code is unaffected). CHANGELOG entry.

### R3 — Track which end a `Timeline` completed at

**Problem.** `hasCompleted` is a boolean that does not say whether the timeline completed at the end or at the start (after `reverse()`). After completing in reverse (t = 0), a jump to the end is discarded by `if (completeNow && this.hasCompleted) return`.

**Evidence (F1).** `Timeline.ts:385`: `tl.play()` to the end, `tl.reverse()` to 0, then `tl.seek(tl.duration)` or `seekProgress(1)`: `currentTime` stays 0, the child stays at progress 0, `progress$` stays 0. A seek to an intermediate time works.

**Proposal (S3).** Store `'end' | 'start' | undefined` instead of a boolean; `SETTLE_PROBE` must report "settled" only for `'end'`. Keep the PERF-009 settle logic unchanged for the forward case.

**Tests first.** `play → reverse → seek(duration)`, `seekProgress(1)`, and the mirror case (`reverse` first, complete at 0, then seek to 0 should stay a no-op).

### R4 — Playback direction

Three related defects around `playbackDirection` and infinite durations.

- **F3 — `stop()` does not reset the direction.** `Timeline.ts:281-293`, `312-331`. `tl.reverse(); tl.stop(); tl.play()` completes in 2 frames at t = 0 with `onComplete` fired and nothing played. Fix: reset the direction to forward in `stop()`. `reverse(); pause(); play()` currently continues backwards (496 → 288); decide whether that is intended and document it either way.
- **F2 — reduced motion ignores the direction.** `PlaybackController.ts:127-132` (called from `Timeline.ts:269-279`): `finishForReducedMotion` always does `seekLocal(duration)`. With `reducedMotion: true`, `tl.play()` leaves t = 100, and `tl.reverse()` (for example closing a menu) also leaves t = 100, child at 1, `completed`. Expected: t = 0. Fix: pass the direction in and seek to the matching end.
- **F7 / S9 — infinite durations.** `Timeline.ts:272`: `reverse()` on a timeline whose duration is `Infinity` sets `currentTime = Infinity`; the child then receives `onUpdate(NaN)` every frame, never completes and the clock stays active. `Animation.ts:127, 216-217`: `seekLocal(Infinity)` with `repeat: Infinity` yields `NaN`. Fix: make `reverse()` throw (or be a documented no-op) for infinite durations, and clamp or ignore `seekLocal(Infinity)`.

**Tests first.** `reverse → stop → play`; reverse under reduced motion; reverse with `repeat: Infinity`.

**Risk.** Throwing in `reverse()` is a public behaviour change; a documented no-op is the lower-risk choice.

### R5 — `MotionLifecycleController` / `PlaybackController` hygiene

- **F9.** `PlaybackController.ts:126`: the deferred start (after the page becomes visible) calls `startClock` without `lockStructure()`, and frames use `updateAt`, which does not lock either. With `pauseWhenHidden`, `play()` while hidden then visible lets `tl.add(...)` succeed during playback. Fix: lock the structure on the deferred start path too.
- **F11.** `MotionLifecycleController.ts:88-89`: `reducedMotionWasRunning` includes `pausedForReducedMotion`, so a second emission with reduced motion on sets it to `true` although the animation never started. Result: a spurious `onResume` before `onStart` when reduced motion is later switched off.
- **S6.** `MotionLifecycleController.ts:58-63`: `hasSkippedInitial` assumes `state$` emits synchronously on subscribe. `MotionPreferencesSource` only requires an `Observable`, so a cold source loses the first real change. Compare with the `snapshot` instead of counting emissions, or document the contract.
- **S7.** `PlaybackController.ts:101-108`: after a user `pause()` the `preferences.state$` subscription stays alive until `stop()` or completion, so an abandoned paused animation is retained by a global `MotionPreferences`. Unsubscribe on user pause, or document that `stop()` is the dispose.

**Tests first.** `MotionLifecycleController` has no suite of its own. Add one covering: `Timeline` with `pauseWhenHidden`, deferred start with structure lock, reduced-motion + visibility sequences, `preferences` destroyed before `play()`, and a source without a synchronous first emission.

### R6 — `WriteChannel.dispose()` during its own callback

**Problem.** `FrameCoordinator.ts:235-243`: `dispose()` called from inside the channel's own callback returns early on `entry.running` without cancelling an entry that the same callback re-queued.

**Evidence (F10).** A callback that does `ch.request(); ch.dispose()` leaves `pendingWriteTasks: 1`, `clockActive: true` and `isIdle: false` after the frame. It clears itself one frame later (one extra `requestAnimationFrame`), but `assertIdle()` would fail in between.

**Proposal.** In `dispose()`, mark the channel disposed and cancel any queued entry even when `entry.running` is true.

**Tests first.** `request()` followed by `dispose()` inside the channel callback (`writeChannel.test.ts:80` only covers plain `dispose`).

### R7 — Small validation and consistency fixes

- **S8.** `Timeline.ts:125-139`: `add()` rejects a running or duplicated `Timeline`, but not an `Animation` whose own clock is active, nor the same item added twice.
- **S10.** `Timeline.ts:180` vs `:195`: `addLabel` trims the name; `removeLabel` and `labelTime` do not.
- **S11.** `Timeline.ts:269-279`: `reverse()` on a fresh timeline jumps to the end on the first frame and fires every `call()` and every child `onStart` / `onComplete`. Document this (or change it, which is a larger decision than this backlog covers).

---

## Open decisions (need a maintainer call, not a refactor yet)

- **S4 — `FrameCoordinator` delta has no upper bound** (`FrameCoordinator.ts:316`). After a hidden tab (without `pauseWhenHidden`, which is the default) the first frame carries the whole gap, so a 1 s animation can jump to `completed` after 60 s away. If wall-clock semantics are deliberate, document them; otherwise add an optional `maxDelta`.
- **S5 — task errors are rethrown with `queueMicrotask`** (`FrameCoordinator.ts:356-359`). In Node this is an uncaught exception that ends the process. It matches PERF-007; document it.
- **F3, second half** — whether `reverse(); pause(); play()` continuing backwards is intended.

## Test gaps to close before refactoring

From the review; these are the characterization tests the README asks for before behaviour changes.

- `reverse()`: only 5 uses in `tests/core`. Missing: seek to the end after a reverse completion (F1), `reverse → stop → play` (F3), reverse with reduced motion (F2), reverse with infinite duration (F7).
- Timeline re-entrancy: `Timeline.window.test.ts:165` covers only a re-entrant `seek()`. The differential test never calls `stop()` / `restart()` from inside callbacks.
- Completion and callbacks: no test for `restart()` / `play()` inside `onComplete` with a promise already obtained, nor `play()` inside `onStop`.
- `MotionLifecycleController`: no suite of its own (see R5).
- `FrameCoordinator`: `request()` then `dispose()` inside the channel callback (F10); a large delta after a hidden-tab gap; cancelling the last task of a batch mid-frame with a re-schedule in the same frame.
- SSR: `play()` without `requestAnimationFrame` does not throw, leaves the state `idle` and rejects the promise (checked by hand by the reviewer). There is a coordinator-level test but none at `Animation` / `Timeline` level.

## What is already fine (do not refactor)

- `FrameCoordinator` follows the PERF-007 phase semantics: generation-based `PhaseQueue` keeps `live` intact when cancelling mid-batch, the subscriber snapshot is immutable and checks `closed`, a task error does not break the loop or skip the other tasks, and a negative delta is clamped to 0.
- No `requestAnimationFrame` leaks in what was reviewed; `stopIfIdle` cancels and `share()` plus the `subscriber.closed` check in `animationFrame.ts:16-18` prevent double loops.
- `Completion` is lazy and never double-resolves or leaves unhandled rejections.
- `MotionPreferences` is safe without `window` / `matchMedia`, falls back to `addListener`, and `destroy()` is idempotent.
- The PERF-009 active window is correct on the non-re-entrant paths.

## Shared gates

Every entry that changes `src/` must pass the **Code gate** in [`README.md`](./README.md): `npm run typecheck`, `npm run typecheck:tests`, `npm test -- --runInBand`, `npm run check:tree-shaking`, `npm run check:package`, `npm run check:package:consumer`, and a `dist/**/*.d.ts` diff recorded in `CHANGELOG.md` if public output changes. Entries touching `FrameCoordinator.ts`, `Timeline.ts` or `Animation.ts` hot paths should also re-run `npm run check:browser-integration`, and, if per-frame work changes, the Performance gate.
