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

- [x] New characterization tests (written first, green on the untouched implementation: `tests/core/FrameCoordinator.semantics.test.ts`, 20 tests, plus a model-based differential `tests/core/FrameCoordinator.model.test.ts`, 40 seeds, green on old and new) pin the per-phase semantics: subscriber added in a read task → receives that frame; added in the consumer or write phase → does not; unsubscribed during the frame → receives no later callback in the same frame; write scheduled in the consumer phase → runs this frame; write scheduled inside a write task → runs next frame; an error in one task does not skip others; mass cancel of 10k scheduled tasks leaves `getDiagnostics().isIdle === true`. The same tests stay green after the change.
- [x] `tests/core/*.test.ts` and `npm run check:browser-integration` pass unchanged (10 browser cases).
- [ ] `npm run bench:animation-load` with `BENCH_ANIMATION_COUNTS=1000,5000,10000`: median-of-run mean frame time and p99 are no worse than baseline and improve at 5000+ by the pre-recorded target outside noise. **Not ticked:** the machine load average was 60–290 on 8 cores during the interleaved runs, so frame-time medians swing by 5–10× between pairs; see Status.
- [ ] `npm run bench` frame-coordinator `sharedSpeedupVsIndependent` stays ≥ the baseline value of 4.2 (within noise). **Not ticked:** measured 1.97 / 2.98 / 2.88 before and 3.91 / 3.40 / 3.75 after (interleaved, loaded machine); the benchmark does not exercise the changed paths much and the value is dominated by load; see Status.

## Targets (recorded before implementation, 2026-11-23)

Derived from the three default baselines `bench-2026-11-22-…-run{1,2,3}.json` (recorded under heavy load; so these are expectations to test, not promises). `animation-load`, `callbackWork = 0`, `metrics-disabled`: median-of-run mean frame time 0.116–0.137 ms at 1000 animations and 1.03–1.19 ms at 5000; p99 3.9–4.2 ms at 5000. The array copy removed here is `N × 8` bytes per frame (about 40 KB at 5000), i.e. about 7 MB per 180-frame run, which is large next to the other young-generation allocation of that loop.

- **Allocation (the stable metric on this machine):** with `--min-semi-space-size=1 --max-semi-space-size=1`, scavenges per 180-frame run at 5000 and 10,000 animations fall by at least 20% in interleaved before/after runs (every pair), and do not rise at 100 or 1000.
- **Time:** median-of-run mean frame time at 5000 and 10,000 animations is lower by at least 3% across at least three interleaved invocations, outside the measured noise band; at 100 and 1000 it is no worse. p95/p99/worst are indicative only on a loaded machine.
- **Cancellation:** cancelling 10,000 pending tasks (scheduled write tasks, `Subscription.unsubscribe()` each) is at least 10× faster than the `indexOf` + `splice` removal and stays linear from 2,500 to 10,000 tasks (a scratch micro-benchmark, because no workload in `npm run bench` isolates it).
- `sharedSpeedupVsIndependent` stays at or above 4.2 within noise.

## Shared gates

**Code gate** (see `roadmap/README.md`)
- [x] `npm run typecheck` and `npm run typecheck:tests` pass.
- [x] `npm test -- --runInBand` passes: 52 suites, 1257 tests (was 50 / 1197).
- [x] `npm run check:tree-shaking`, `npm run check:package` and `npm run check:package:consumer` pass (also `check:docs` and `check:browser-integration`).
- [x] No change to public `.d.ts` output: the only diff in `dist/**/*.d.ts` is the private member list of `FrameCoordinator` (`frameSubscriberSnapshot` added, `removeTask` removed).

**Performance gate** (see `roadmap/README.md`)
- [ ] Performance comparison follows `roadmap/README.md` → "Performance gate": same machine and Node version as the baseline, median of ≥5 repeats (≥10 once BENCH-007 lands) of the named `bench:*` command, compared with `npm run bench:compare`. Timings are **never** a CI gate. **Not ticked:** the machine was far from quiet (see Status).
- [x] The improvement target for this item is written into this file *before* implementation starts (see "Targets"). The before/after JSON reports are kept in the shared notes folder (`phase-2/perf-007/`); nothing was pushed, so there is no PR to link.
- [ ] No other workload in `npm run bench` regresses beyond the measured noise band. **Not verified:** only `animation-load` and `frame-coordinator` were compared (the other workloads do not touch this code).

## Status

**Done 2026-11-23 (code and correctness); the timing criteria are not met or not verifiable on this machine.** One commit on branch `claude/phase-2-7ff826`.

What changed (`src/core/FrameCoordinator.ts` only; no public type changes):

- The consumer phase iterates a cached array of the subscribers instead of building `[...this.frameSubscribers]` every frame. The array is never mutated: any `frames$` subscribe or unsubscribe drops it (`null`) and it is rebuilt lazily at the start of the next consumer phase, after the read phase. That keeps the old rules exactly: a subscriber added in a read task is in the array and gets that frame, one added during the consumer or write phase is not, and a subscriber unsubscribed mid-iteration is skipped through `subscriber.closed`.
- Each phase (reads, writes) is a small internal `PhaseQueue`. Cancelling a pending task is O(1): the entry stays as a tombstone (`queued = false`) and is skipped when the batch runs; a `live` counter drives `getDiagnostics()` and the idle check, so tombstones are never visible. Tombstones are compacted when at least 32 pile up and outnumber the live entries, and the array is emptied when the last live entry is cancelled (so mass-cancelling 10,000 tasks leaves the coordinator idle with an empty queue). A frame detaches the whole batch with `take()` and returns the emptied array with `release()`, so two arrays are reused forever instead of `splice(0)` allocating one per phase per frame. An entry carries the batch generation it was pushed in, so cancelling a task that is already in the running batch only flags it (as before) and never corrupts the live count.
- Ordering and re-entrancy are unchanged: reads → consumers → writes; a write scheduled before or during the consumer phase runs this frame, one scheduled from inside a write task or a read scheduled after the read phase runs next frame; a throwing task does not skip the others (the error is rethrown in a microtask as before); a clock error still releases every queued task and errors every subscriber.

Evidence:

- Correctness: 20 characterization tests that pin every rule listed in the criterion (and several more: cancel inside a batch, partial cancels of 2,000 tasks, write-channel disposal among cancelled tasks, restart after idle, RAF failure) were written first and are green on the untouched implementation; a model-based differential test (40 seeds × 120 frames of random schedule / cancel / spawn / cancel-from-task traces against a trivially correct array model, checking run order and pending counts every frame) is green on the old and the new implementation. `tests/core` and `check:browser-integration` pass unchanged.
- Cancellation (scratch micro-benchmark `perf-007/cancel.mjs`, old and new `dist` alternated in one process, median of 9, loaded machine): cancelling N pending write tasks one by one takes 0.58 / 1.88 / 6.3 / 27.6 ms for N = 2,500 / 5,000 / 10,000 / 20,000 before (quadratic) and 0.19 / 0.26 / 0.46 / 1.07 ms after (linear); cancelling in reverse order 0.99 / 3.2 / 11.5 / 44.6 ms before and 0.18 / 0.29 / 0.45 / 1.13 ms after. That is about 14× (forward) and 25× (reverse) at 10,000: the "at least 10×, linear" target is met.
- Allocation (1 MB semi-space, `animation-load`, `callbackWork = 0`, 180 frames, three interleaved before/after pairs, scavenges per run, median of 10 repeats): 100 animations 6 → 5–6; 1000: 58–59.5 → 49–52 (−12%); 5000: 280–292 → 254–262 (−11%); 10,000: 545–575 → 506–523 (−8%). Fewer in every pair at 1000, 5000 and 10,000 (two of three pairs at 100). The pre-recorded target (≥20% fewer at 5000 and 10,000) is **not met**: the per-frame array copy was a smaller part of the allocation than estimated (the rest is RxJS delivery and the animations themselves).
- Frame time: **not demonstrated.** Load average was 60–290 on 8 cores while the pairs ran; the medians of the mean frame time at 5000 animations ranged 1.0–7.3 ms for the *same* build, and the "faster / slower" direction flipped between pairs (see `perf-007/summary.txt`). No claim is made.
- `sharedSpeedupVsIndependent`: 1.97 / 2.98 / 2.88 before, 3.91 / 3.40 / 3.75 after, all below the 4.2 baseline because of load; the workload mostly measures RxJS fan-out, not the changed paths. Not ticked.

To close the open criteria: re-run `animation-load` (counts 1000, 5000, 10000) and `frame-coordinator` interleaved with `benchmarks/compare.mjs` on a quiet machine (`uptime` well below 4 on this 8-core machine).
