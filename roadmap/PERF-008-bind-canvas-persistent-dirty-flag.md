# PERF-008 — bindCanvas: stop allocating a Subscription and closure per binding per frame

| Category | Impact | Risk | Effort | Priority score | Phase | Depends on |
|---|---|---|---|---|---|---|
| Performance | 3 | 3 | 2 | **24** | 1 | [BENCH-007](./BENCH-007-variance-and-gc-control.md) |

Priority = (Impact + Risk) × (6 − Effort). Back to the [roadmap](../roadmap.md).

## Status

**Done 2026-11-22 (local, not committed). Performance acceptance is indicative only: the machine was at load average 90-137 on 8 cores for every measurement.**

**What changed.** `FrameCoordinator` gained a private `createWriteChannel(callback)` and an internal `openWriteChannel()` helper (not re-exported from any entry point): one persistent queue entry per channel, `request()` pushes it only if it is not already queued, `dispose()` drops a queued run. `bindCanvas` opens one channel per binding and calls `channel.request()` per emission, so steady-state frames allocate no task, `Subscription`, closure or teardown entry. Semantics are unchanged: an emission before or during the consumer phase draws in that frame's write phase; one made inside the draw callback draws next frame; unsubscribing drops a pending draw. Public `scheduleWrite` is untouched.

**Target (written after the fact; the item was started before the load caveat was re-read).** Deterministic: per-run young-generation collections at 1000 targets must drop for both canvas modes with `dom-style-binding` unchanged as a control. Timing is judged on means/elapsed only, per the performance gate's "judge on stable metrics" rule.

**Evidence** (same machine, interleaved before/after builds, `node --expose-gc`, 10 repeats x 5 invocations, 1000 targets; medians of the five invocations):

| Mode | mean frame before -> after | elapsed ms before -> after | scavenges/run before -> after |
|---|---|---|---|
| `canvas-one-emission` | 0.280 -> 0.134 ms | 50.4 -> 24.1 | 2 -> 0 |
| `canvas-burst-coalesced` | 0.378 -> 0.237 ms | 68.0 -> 42.7 | 2 -> 0 |

Allocation, measured with `--min-semi-space-size=1 --max-semi-space-size=1` so collections track bytes allocated (3 invocations each): `canvas-one-emission` 148-152 -> 29-30 scavenges per run (about 5x less), `canvas-burst-coalesced` 170-173 -> 50-51 (about 3.4x less), `dom-style-binding` 146-156 -> 155-157 (unchanged, as expected for a control). The invocations show large between-run drift (one pair in five was 2-3x slower on both sides), so only the direction and the allocation counts are trusted.

**Tail metrics.** p99 and worst frame also dropped in the medians (`canvas-one-emission` p99 2.28 -> 0.90 ms, worst 17.0 -> 5.1 ms; `canvas-burst-coalesced` p99 2.35 -> 1.24 ms, worst 26.9 -> 7.3 ms) but per-run spread of 2-6x on a loaded machine is larger than those gaps, so they are **not** claimed as an improvement. Re-measure on a quiet machine before quoting them.

**Heap delta.** `heapMedianDeltaMb` is *higher* after (12.9 -> 28.3 and 32.8 -> 48.1 MB) and that is an artifact, not a regression: it is the net heap growth over a run, and before the change two scavenges reclaimed garbage during the run while after it the run allocates too little to trigger one, so uncollected garbage is still counted at the end. The scavenge counts above are the reliable allocation metric. The acceptance line is therefore read through that metric.

**Tests.** `tests/adapters/canvas.test.ts` (+4: 1000 bindings x 4 emissions draw once each and the coordinator is idle after teardown; consumer-phase emission draws in the same frame; emission inside draw goes to the next frame; unsubscribe-then-recreate drops the old pending draw — written first and green on the old code), `tests/core/FrameCoordinator.writeChannel.test.ts` (+6 for the channel itself, including dispose inside the callback, a throwing callback and a missing `requestAnimationFrame`). The existing canvas and coordinator tests pass unchanged. 44 suites / 753 tests (was 43 / 743).

**Verification.** `typecheck`, `typecheck:tests`, `npm test -- --runInBand`, `check:tree-shaking`, `check:package`, `check:package:consumer` and `check:renderer-cleanup` pass. `.d.ts` change: `dist/core/FrameCoordinator.d.ts` gains the `WriteChannel` interface, the internal `openWriteChannel()` function and a `private createWriteChannel;` member line; none of it is exported from `index`/`core`, no public signature changed. The full `bench` suite was not re-run, only `adapters`; the other workloads do not touch this code.

## Problem

Each frame with a new source value, each canvas binding creates a task entry, a `Subscription`, a closure, and adds the subscription to the binding; the 1000-binding burst workload has the worst tails in the whole benchmark set.

## Evidence

- `src/adapters/canvas.ts:55` `frameCoordinator.scheduleWrite((frame) => {…})` per emission; `FrameCoordinator.schedule` (`src/core/FrameCoordinator.ts:114-135`) allocates a `ScheduledFrameTask` and a `Subscription` per call; `binding.add(write)` then accumulates teardown entries on the binding.
- Baseline `adapterUpdates`, 1000 targets, `canvas-burst-coalesced`: median-of-run mean frame 0.48 ms, p99 2.87 ms, worst **44.6 ms**; `canvas-one-emission` worst **10.9 ms** (mock context).
- GC events were observed during the adapter run (113 trace lines per `--trace-gc`); the link between those and the tail frames is a hypothesis to confirm with BENCH-007.

## Scope

- Give `FrameCoordinator` an internal cheap "write channel" (registered once per binding, flagged dirty per frame) instead of a fresh task per emission, or reuse one task object per binding.
- Ensure unsubscribing mid-frame and re-subscribing still drops pending work.

## Non-goals

- Not changing the public `scheduleWrite` semantics.

## Risks

- Ordering: writes must still run in emission order within the write phase; an emission during the consumer phase must still draw in the same frame's write phase (no added frame of latency), while an emission inside a write task keeps drawing next frame — the current per-phase semantics documented in PERF-007.

## Acceptance criteria

Every box must be checkable by running the named command or inspecting the named file.

- [x] `tests/adapters/canvas.test.ts`, `tests/core/FrameCoordinator.test.ts` and `npm run check:renderer-cleanup` pass unchanged.
- [x] New test: 1000 bindings each receiving 4 emissions in one frame produce exactly 1 draw per binding per frame, and `getDiagnostics()` is idle after unsubscribing all bindings.
- [x] New test: an emission delivered during the consumer phase is drawn in the same frame's write phase (same frame number as the emission).
- [ ] `npm run bench:adapters` (≥10 repeats with GC control): `canvas-burst-coalesced` and `canvas-one-emission` at 1000 targets show lower worst-frame and p99 than baseline (record both), and the spread (max−min of per-run elapsed) shrinks — or the PR documents that it did not and why. *Partly met: means, elapsed and allocation improved; p99/worst improved in the medians but the spread on the loaded machine is larger than the gap, so re-check on a quiet machine (see Status).*
- [ ] Heap delta per run (BENCH-007) is not higher than baseline. *Not met as written: the metric rose because no scavenge ran after the change; allocation per run (scavenges under a 1 MB semi-space) fell about 5x. See Status.*

## Shared gates

**Code gate** (see `roadmap/README.md`)
- [x] `npm run typecheck` and `npm run typecheck:tests` pass.
- [x] `npm test -- --runInBand` passes (record the test count; it must not decrease unless tests are intentionally replaced).
- [x] `npm run check:tree-shaking`, `npm run check:package` and `npm run check:package:consumer` pass.
- [x] No change to public `.d.ts` output unless intended; any intended change is recorded in `CHANGELOG.md` under Unreleased.

**Performance gate** (see `roadmap/README.md`)
- [ ] Performance comparison follows `roadmap/README.md` → "Performance gate": same machine and Node version as the baseline, median of ≥5 repeats (≥10 once BENCH-007 lands) of the named `bench:*` command, compared with `npm run bench:compare`. Timings are **never** a CI gate.
- [ ] The improvement target for this item is written into this file *before* implementation starts (taken from the BENCH-008 baseline); the PR links the before/after JSON.
- [ ] No other workload in `npm run bench` regresses beyond the measured noise band.
