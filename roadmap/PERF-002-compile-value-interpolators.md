# PERF-002 — Parse string/color endpoints once, not every frame

| Category | Impact | Risk | Effort | Priority score | Phase | Depends on |
|---|---|---|---|---|---|---|
| Performance | 3 | 2 | 2 | **20** | 1 | [REFACTOR-003](./REFACTOR-003-unify-value-parsing.md), [BENCH-008](./BENCH-008-hot-path-benchmarks.md) |

Priority = (Impact + Risk) × (6 − Effort). Back to the [roadmap](../roadmap.md).

## Problem

String and color tweens re-parse both fixed endpoints with regexes on every frame.

## Evidence

- `src/values/interpolate.ts:52-69` `interpolateValue`: for strings it calls `parseColor(from)`, `parseColor(to)` and, when not colors, `parseNumericTemplate(from)` and `(to)` on every call; `resolveInterpolator` (line 5-14) only validates once and then returns a thunk that re-enters `interpolateValue`.
- Arrays/objects recurse through the same path allocating new arrays/objects per frame (`interpolate.ts:70-77`).
- Per-frame cost scales with `Tween` count; baseline mean frame cost at 5000 plain `Animation`s is 0.99 ms (no interpolation), so interpolation work is *additional* to that.

## Scope

- In `resolveInterpolator`, compile `(from, to)` into a closure holding pre-parsed numbers/channels and the output template.
- Keep `interpolate()` (the allocation-free one-shot) working by compiling on demand.
- Do not change output strings (guarded by REFACTOR-003 parity tests).

## Non-goals

- No caching keyed by string across Tweens (memory/leak risk).

## Risks

- Closures hold parsed copies; confirm no retention of large objects after dispose.

## Acceptance criteria

Every box must be checkable by running the named command or inspecting the named file.

- [ ] All existing `tests/values/*.test.ts` pass unchanged.
- [ ] A property-style test compares compiled vs. legacy output for ≥1000 random pairs of numbers, hex/rgb colors and numeric templates at random progress values: identical strings.
- [ ] `grep -n "parseColor\|parseNumericTemplate" src/values/interpolate.ts` shows no call reachable from the per-frame closure.
- [ ] `npm run bench:interpolate` (BENCH-008): median ops/ms for the `resolved` color and numeric-template cases is higher than the BENCH-008 baseline by the target recorded in this file before work begins, outside the BENCH-007 noise band; number-only tweens do not regress.
- [ ] `scavengesPerMillionOps` for the same cases (BENCH-008, relative allocation measure) does not increase, and the GC-controlled `heapMedianDeltaMb` does not increase.

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
