# PERF-005 — Keyframes: precompute per-segment easing and remember the last segment

| Category | Impact | Risk | Effort | Priority score | Phase | Depends on |
|---|---|---|---|---|---|---|
| Performance | 2 | 1 | 1 | **15** | 1 | [BENCH-008](./BENCH-008-hot-path-benchmarks.md), [UNIT-010](./UNIT-010-safety-net-for-refactors.md) |

Priority = (Impact + Risk) × (6 − Effort). Back to the [roadmap](../roadmap.md).

## Problem

`Keyframes.updateValue` scans segments linearly and resolves the easing for the segment on every frame.

## Evidence

- `src/values/Keyframes.ts:145` `const easing = resolveEasing(start.easing ?? this.defaultEasing);` inside `updateValue`, which runs every frame.
- `updateValue` loops `for (let index = 0; index < this.frames.length - 1; …)` from index 0 each frame; monotonic playback could resume from the previous segment.
- `Keyframes.ts` has 80% line coverage with 62.5% function coverage (coverage run), so the refactor needs UNIT-010 first.

## Scope

- Resolve `frames[i].easing` once in the constructor into an `easings[]` array.
- Keep a `lastSegment` cursor; fall back to a scan when time moves backward (scrubbing, yoyo).

## Non-goals

- No change to offset normalization rules.

## Risks

- Cursor bugs on backward seeks and yoyo; tests must cover forward, backward, scrub-to-start and repeat boundaries.

## Acceptance criteria

Every box must be checkable by running the named command or inspecting the named file.

- [ ] New tests: scrub forward, backward, to exactly an offset boundary, to 0 and 1, with yoyo + repeat, and with a different easing per keyframe — all produce the same values as the pre-change implementation (golden table).
- [ ] `grep -n "resolveEasing" src/values/Keyframes.ts` shows no use inside `updateValue`.
- [ ] `npm run bench:keyframes`: 20-keyframe case median ms/1e6 updates is not slower than baseline and is faster by the pre-recorded target.

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
