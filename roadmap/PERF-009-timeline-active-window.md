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

- [ ] `tests/core/Timeline.contract.test.ts`, `Timeline.test.ts`, `composition.test.ts` pass unchanged, plus new differential test: random timelines (≥200 seeds) with random forward/backward scrubs produce an identical callback trace under old and new implementations.
- [ ] `npm run bench` (`timeline-completed`, BENCH-008): with 99% completed segments, mean seek time is lower than baseline by the pre-recorded target outside noise; with 0% completed it does not regress.
- [ ] Repeated reads of `timeline.segments` without structural change return the same array instance (test).

## Shared gates

**Code gate** (see `roadmap/README.md`)
- [ ] `npm run typecheck` and `npm run typecheck:tests` pass.
- [ ] `npm test -- --runInBand` passes (record the test count; it must not decrease unless tests are intentionally replaced).
- [ ] `npm run check:tree-shaking`, `npm run check:package` and `npm run check:package:consumer` pass.
- [ ] No change to public `.d.ts` output unless intended; any intended change is recorded in `CHANGELOG.md` under Unreleased.

**Performance gate** (see `roadmap/README.md`)
- [ ] Performance comparison follows `roadmap/README.md` → "Performance gate": same machine and Node version as the baseline, median of ≥5 repeats (≥10 once BENCH-007 lands) of the named `bench:*` command, compared with `npm run bench:compare`. Timings are **never** a CI gate.
- [ ] The improvement target for this item is written into this file *before* implementation starts (taken from the BENCH-008 baseline); the PR links the before/after JSON.
- [ ] No other workload in `npm run bench` regresses beyond the measured noise band.
