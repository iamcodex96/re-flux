# PERF-009 — Timeline: only touch segments that can change on this frame

| Category | Impact | Risk | Effort | Priority score | Phase | Depends on |
|---|---|---|---|---|---|---|
| Performance | 3 | 3 | 4 | **12** | 2 | [BENCH-008](./BENCH-008-hot-path-benchmarks.md), [UNIT-010](./UNIT-010-safety-net-for-refactors.md) |

Priority = (Impact + Risk) × (6 − Effort). Back to the [roadmap](../roadmap.md).

## Problem

`Timeline.updateAt` visits every segment on every frame, including ones that finished long ago, and re-calls `seekLocal` on them.

## Evidence

- `src/core/Timeline.ts:360-370`: `for (const segment of this.entries)` runs for all segments each update; completed `Animation`s then early-return in `applyLocalTime` (`Animation.ts:169`) after a function call and property reads.
- Baseline `timeline` nested scrub (2000 segments, 40 nested timelines): mean 0.156 ms, p99 0.86 ms, worst 3.56 ms per seek; 86,682 callbacks per run.
- `Timeline.segments` getter (`Timeline.ts:66-73`) allocates a new frozen object per segment on every read (relevant to Gantt UIs, not the frame loop).
- Behaviour that must be kept is covered by `tests/core/Timeline.contract.test.ts` and `Timeline.test.ts` (backward scrub resets, `call()` re-arm at offset 0, nested ownership, structure locking).

## Scope

- Keep segments sorted by start (stable) and maintain an "active window"; on forward playback only advance the cursor, on backward/scrub fall back to the full pass.
- Cache the frozen `segments` snapshot until the structure changes.

## Non-goals

- No change to public Timeline API, offsets or label semantics.

## Risks

- High: `call()` markers, resets on backward scrub and nested timelines are subtle. Do not start before BENCH-008 isolates the completed-segment cost and UNIT-010 adds missing cases (Timeline function coverage 84%, lines 413-433 uncovered).

## Acceptance criteria

Every box must be checkable by running the named command or inspecting the named file.

- [x] `tests/core/Timeline.contract.test.ts`, `Timeline.test.ts`, `composition.test.ts` pass unchanged, plus new differential test (`tests/core/Timeline.differential.test.ts`, 250 seeds against a frozen copy of the old Timeline in `tests/helpers/legacy/LegacyTimeline.ts`): random timelines with nested timelines, markers, custom items, random seeks in both directions, clock frames, reverse, pause, stop, restart and late structure edits produce an identical trace of every child callback, custom-item call and playhead state. Mutation-checked: disabling the backward wake, the forward wake, the window reset on `stop()` or making every item settleable each fails the test (233, 242, 71 and 151 of 250 seeds).
- [x] `npm run bench` (`timeline-completed`, BENCH-008): with 99% completed segments, mean seek time is lower than baseline by the pre-recorded target outside noise; with 0% completed it does not regress. Three interleaved before/after pairs at load average ≈ 50–60: 99% completed 5.2 / 5.7 / 5.0× more seeks per ms, 50% 4.1 / 3.4 / 3.5×, 0% 1.4 / 1.5 / 1.4× (not slower). Under the 1 MB semi-space variant the ratios were 4.4–4.5× (99%) and 2.8–2.9× (50%), i.e. slightly under the 5× / 3× targets; the default-configuration runs meet them. The machine was busy (not the quiet machine the performance gate asks for), so this is evidence, not a final measurement; see Status.
- [x] Repeated reads of `timeline.segments` without structural change return the same array instance (test: `tests/core/Timeline.window.test.ts`). The array and its entries are frozen.

## Targets (recorded before implementation, 2026-11-23)

Derived from the three default baselines `bench-2026-11-22-…-run{1,2,3}.json` (heavy load; indicative only). `timeline-completed` (`Timeline.seek()` inside the one active segment of a 2,000-segment sequential timeline), `medianOpsPerMs`: 0% completed 30.8 / 36.5 / 39.2; 50% completed 8.5 / 14.3 / 17.9; 99% completed 3.2 / 12.0 / 12.2; `segments getter` 6.4 / 13.7 / 14.2. Every update visits all 2,000 segments, so the completed-segment cost is the whole difference between the 0% and the 99% rows.

- **99% completed:** `medianOpsPerMs` at least 5× the baseline median in interleaved before/after runs, in every pair. **50% completed:** at least 3×. The window removes the visits to completed segments entirely, so the remaining cost is the active segment plus bookkeeping; this target is deliberately conservative because the machine is loaded.
- **0% completed:** no regression beyond the noise band (the not-yet-started segments are already the cheap case; the window must not make it slower).
- **Allocation:** the seek path allocates nothing per call beyond what it did (scavenges per million ops not higher).
- **`timeline.segments`:** repeated reads without a structural change return the same frozen array instance (unit test); the benchmark case therefore stops allocating (at least 20× faster).
- Correctness is the gate, not speed: a differential test against a frozen copy of the old `Timeline` (≥200 seeds, random timelines with nested timelines, markers, custom items, random forward / backward seeks and clock-driven frames) must see the identical callback and state trace.

## Shared gates

**Code gate** (see `roadmap/README.md`)
- [x] `npm run typecheck` and `npm run typecheck:tests` pass.
- [x] `npm test -- --runInBand` passes: 54 suites, 1518 tests (was 52 / 1257).
- [x] `npm run check:tree-shaking`, `npm run check:package` and `npm run check:package:consumer` pass (also `check:docs` and `check:browser-integration`).
- [x] No change to public `.d.ts` output beyond private members: `Timeline.d.ts` lists the new private fields and methods, and an internal `dist/core/settle.d.ts` appears (not re-exported). Every public signature is unchanged.

**Performance gate** (see `roadmap/README.md`)
- [ ] Performance comparison follows `roadmap/README.md` → "Performance gate": same machine and Node version as the baseline, median of ≥5 repeats (≥10 once BENCH-007 lands) of the named `bench:*` command, compared with `npm run bench:compare`. Timings are **never** a CI gate. **Not ticked:** the machine was busy (load ≈ 50–60 on 8 cores) and `bench:compare` was not used; the comparison is three interleaved pairs of the default benchmark configuration.
- [x] The improvement target for this item is written into this file *before* implementation starts (see "Targets"); the before/after JSON is kept in the shared notes folder (`phase-2/perf-009/`; nothing was pushed, so there is no PR).
- [x] No other workload in `npm run bench` regresses beyond the measured noise band: the only other workload that drives `Timeline` is `bench:timeline` (nested scrub, 86,682 callbacks per run both before and after): median mean seek 0.200 / 0.187 / 0.194 ms before and 0.173 / 0.177 / 0.228 ms after, i.e. neutral within noise.

## Status

**Done 2026-11-23.** One commit on branch `claude/phase-2-7ff826`. The one thing that needs a quiet machine is the final timing confirmation (above).

What changed:

- `src/core/Timeline.ts`: `updateAt` no longer loops over every segment. Segments that cannot change are *quiet* and are not visited: (a) a segment before its start that has already been reset (`QUIET_BEFORE`), and (b) a completed built-in child (`QUIET_AFTER`) whose `seekLocal()` is a no-op once it has completed. Only the remaining segments sit in an `activeSegments` list, kept in insertion order, so the call order among visited children is unchanged. A quiet segment is woken only when the playhead crosses its start going forward (found by binary search in a start-sorted copy) or moves back before its end (binary search in an end-sorted copy, widened by a relative 1e-9 slack and then re-checked with the exact `to - start < duration` test, because over-waking is harmless and under-waking is not). Woken segments are merged into the list by insertion index. The window is rebuilt from `entries` (every segment visited once, as before) after anything that could invalidate it: `add()`, `stop()`, `restart()`, `resetInternal()`, an update that throws, and an update that was re-entered from a child callback (the nested call runs the plain full pass and the outer call does not trust its list afterwards). Direction does not matter: the same rules serve forward frames, backward scrubs, reverse playback and `seek()` jumps.
- `src/core/settle.ts` (new, internal): `SETTLE_PROBE`, a symbol-keyed method installed with `Object.defineProperty` on the prototypes of `Animation`, `AnimatedValue` (so `Tween` and `Keyframes`) and `Timeline`, returning whether the item is in its completed state. It lives outside the class bodies on purpose: no instance pays for it and the class declarations do not change. Items without the probe (custom `AnimatableItem`s, `call()` markers) are never treated as settled and are visited on every update, exactly as before.
- `timeline.segments` returns one cached, frozen array (and frozen entries) until `add()`.

Behaviour that is *not* identical to the old code, deliberately:

- A child that has finished under the timeline is no longer re-seeked on every later update. If user code changes such a child directly (`child.stop()`, `child.seek()`, `child.restart()`) while the parent timeline keeps playing forward, the old code snapped the child back to its end on the next frame; now it stays where the user put it until the playhead moves back before its end, or the timeline is stopped, restarted or its structure edited. Driving a child that a timeline owns is not a supported pattern, but it was observable.
- `timeline.segments` is now a frozen array shared between calls: code that sorted or otherwise mutated the returned array in place used to work on a private copy and now throws a `TypeError` in strict mode.
- `call()` markers are never settled (their exact re-arm rule depends on every delivered time), so a timeline with very many markers keeps visiting them once the playhead has passed.

Evidence: the differential and mutation results above; a targeted test that a finished `Animation` is not seeked again while the active ones are, that moving back wakes it, and that a custom item is still called on every update; re-entrant and throwing-callback traces equal to the old implementation; 99% / 50% / 0% / segments-getter benchmark ratios above and scavenges per million operations of the seek cases 400 → 0 (99%) and 200 → 0 (50%) in the default configuration (400/15,800/31,000 → 400 in the 1 MB configuration); the remaining cost at 99% (≈ 50–59 seeks per ms) equals the 0%-completed case, i.e. the fixed cost of a seek (progress emission, state, one active child).
