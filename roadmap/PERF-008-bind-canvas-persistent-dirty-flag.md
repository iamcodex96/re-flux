# PERF-008 — bindCanvas: stop allocating a Subscription and closure per binding per frame

| Category | Impact | Risk | Effort | Priority score | Phase | Depends on |
|---|---|---|---|---|---|---|
| Performance | 3 | 3 | 2 | **24** | 1 | [BENCH-007](./BENCH-007-variance-and-gc-control.md) |

Priority = (Impact + Risk) × (6 − Effort). Back to the [roadmap](../roadmap.md).

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

- [ ] `tests/adapters/canvas.test.ts`, `tests/core/FrameCoordinator.test.ts` and `npm run check:renderer-cleanup` pass unchanged.
- [ ] New test: 1000 bindings each receiving 4 emissions in one frame produce exactly 1 draw per binding per frame, and `getDiagnostics()` is idle after unsubscribing all bindings.
- [ ] New test: an emission delivered during the consumer phase is drawn in the same frame's write phase (same frame number as the emission).
- [ ] `npm run bench:adapters` (≥10 repeats with GC control): `canvas-burst-coalesced` and `canvas-one-emission` at 1000 targets show lower worst-frame and p99 than baseline (record both), and the spread (max−min of per-run elapsed) shrinks — or the PR documents that it did not and why.
- [ ] Heap delta per run (BENCH-007) is not higher than baseline.

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
