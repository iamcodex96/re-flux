# PERF-007 — FrameCoordinator: avoid per-frame array copies and O(n) task removal

| Category | Impact | Risk | Effort | Priority score | Phase | Depends on |
|---|---|---|---|---|---|---|
| Performance | 3 | 3 | 3 | **18** | 2 | [BENCH-007](./BENCH-007-variance-and-gc-control.md), [BENCH-008](./BENCH-008-hot-path-benchmarks.md), [UNIT-008](./UNIT-008-coverage-config-and-thresholds.md) |

Priority = (Impact + Risk) × (6 − Effort). Back to the [roadmap](../roadmap.md).

## Problem

The coordinator copies the subscriber set into a new array every frame and removes cancelled tasks with `indexOf` + `splice`, which is O(n) per cancellation.

## Evidence

- `src/core/FrameCoordinator.ts:188` `for (const subscriber of [...this.frameSubscribers])` allocates an array of N subscribers every frame; `:186`/`:194` use `queue.splice(0)`.
- `:137-142` `removeTask` does `indexOf` on both queues; cancelling many pending tasks is O(n²).
- Baseline: 5000 `Animation`s → mean 0.99 ms/frame, p99 4.73 ms, worst 7.98 ms; per-animation cost rises from ~0.15 µs (1000) to ~0.20 µs (5000), i.e. mildly super-linear. Scaling is otherwise linear and the shared clock is 4.2× faster than one RAF per consumer at 1000 consumers (baseline).
- Current delivery semantics come from the order in `handleFrame` (`FrameCoordinator.ts:177-206`): read tasks are spliced and run first (`:186`), the subscriber snapshot is taken *after* them (`:188`), then write tasks are spliced and run (`:194`). Consequently a subscriber added during a read task is in the snapshot and receives that frame; one added during the consumer or write phase does not; unsubscribing mid-iteration is safe via `subscriber.closed`; a write scheduled before or during the consumer phase runs in the same frame (this is how an animation emission reaches `bindCanvas`), while a write scheduled from inside a write task, or a read scheduled after the read phase, runs next frame. Any change must preserve exactly these semantics.

## Scope

- Iterate a stable snapshot without allocating per frame (e.g. generation-stamped array that is rebuilt only when membership changes).
- Replace `indexOf` removal with a tombstone flag + compaction at frame end.

## Non-goals

- No change to read → consumers → write phase ordering or to the public API.

## Risks

- Subtle re-entrancy: subscriber added during frame, unsubscribed during frame, error during frame. Needs explicit tests before the change.

## Acceptance criteria

Every box must be checkable by running the named command or inspecting the named file.

- [ ] New characterization tests (written first, green on `main`) pin the per-phase semantics: subscriber added in a read task → receives that frame; added in the consumer or write phase → does not; unsubscribed during the frame → receives no later callback in the same frame; write scheduled in the consumer phase → runs this frame; write scheduled inside a write task → runs next frame; an error in one task does not skip others; mass cancel of 10k scheduled tasks leaves `getDiagnostics().isIdle === true`. The same tests stay green after the change.
- [ ] `tests/core/*.test.ts` and `npm run check:browser-integration` pass unchanged.
- [ ] `npm run bench:animation-load` with `BENCH_ANIMATION_COUNTS=1000,5000,10000`: median-of-run mean frame time and p99 are no worse than baseline and improve at 5000+ by the pre-recorded target outside noise.
- [ ] `npm run bench` frame-coordinator `sharedSpeedupVsIndependent` stays ≥ the baseline value of 4.2 (within noise).

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
