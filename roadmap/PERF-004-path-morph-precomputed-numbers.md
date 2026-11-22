# PERF-004 — Path morph: pre-split template and use typed arrays per frame

| Category | Impact | Risk | Effort | Priority score | Phase | Depends on |
|---|---|---|---|---|---|---|
| Performance | 3 | 2 | 2 | **20** | 1 | [BENCH-008](./BENCH-008-hot-path-benchmarks.md) |

Priority = (Impact + Risk) × (6 − Effort). Back to the [roadmap](../roadmap.md).

## Problem

The SVG path interpolator regex-replaces the whole normalized path and calls `Number()` on every token every frame.

## Evidence

- `src/adapters/svg/pathMorph.ts` `createSvgPathInterpolator` (≈line 587-612): the returned closure runs `normalized.from.replace(/regex/g, …)` and `Number(token)`/`Number(endToken)` for every coordinate on every call; `toNumbers` is a `string[]` parsed with `Number()` each frame.
- Paths may have up to 64 subpaths × 128 cubic segments (`MAX_SUBPATHS`, `maxSegmentsPerSubpath` default), i.e. up to ~49k numbers per frame.

## Scope

- At creation time, split the normalized `from` string into `strings[]` (static template pieces) and `Float64Array` start/end values; per frame build the string by joining formatted numbers.
- Keep `formatNumber` output identical.

## Non-goals

- No change to path normalization quality or limits.

## Risks

- String building cost may dominate; verify with the benchmark that the change is a win for small and large paths.

## Acceptance criteria

Every box must be checkable by running the named command or inspecting the named file.

- [ ] `tests/adapters/svg.test.ts` passes unchanged.
- [ ] Differential test: new vs old interpolator output identical for ≥50 path pairs × 11 progress values (old implementation kept in the test file as oracle).
- [ ] `npm run bench:path-morph`: median ms/frame for the 128-segment case is lower than baseline by the pre-recorded target, outside noise; the 8-segment case does not regress.

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
