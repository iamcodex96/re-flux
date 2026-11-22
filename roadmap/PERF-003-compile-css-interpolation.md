# PERF-003 — Tokenize CSS keyframe pairs once

| Category | Impact | Risk | Effort | Priority score | Phase | Depends on |
|---|---|---|---|---|---|---|
| Performance | 4 | 2 | 3 | **18** | 1 | [REFACTOR-003](./REFACTOR-003-unify-value-parsing.md), [BENCH-008](./BENCH-008-hot-path-benchmarks.md) |

Priority = (Impact + Risk) × (6 − Effort). Back to the [roadmap](../roadmap.md).

## Problem

`animate()` calls `interpolateCssValue` for every element × property × frame, and each call tokenizes both strings with a regex and rebuilds the string.

## Evidence

- `src/adapters/dom/cssInterpolation.ts` `interpolateCssValue`: calls `tokenizeCssValue(from)` and `tokenizeCssValue(to)` and `from.replace(NUMERIC_CSS_TOKEN, …)` on every invocation.
- `src/adapters/dom/animation.ts` `animate()` builds one `Keyframes<string>` per element per property with `interpolate: interpolateCssValue`, so cost is O(targets × properties × frames).
- Baseline `adapterUpdates`, `targetCount=1000`, `dom-style-binding`: mean frame 0.25 ms, p99 1.04 ms, worst 3.4 ms — on a *mock* style target and numeric-only values; real string values add this tokenization.

## Scope

- Add a `compileCssInterpolator(from, to)` that returns `(progress) => string`; `Keyframes` accepts an interpolator *factory* (internal) so `animate()` compiles once per segment.
- Retain the incompatible-template fallback (switch at the endpoint) and color path.

## Non-goals

- No change to how starting values are read from computed style (see PERF-010).

## Risks

- `Keyframes` public option `interpolate` must keep its current signature; factory support must be additive/internal.

## Acceptance criteria

Every box must be checkable by running the named command or inspecting the named file.

- [ ] `tests/adapters/dom.test.ts` and `tests/adapters/dom-scroll-trigger.test.ts` pass unchanged.
- [ ] Parity test: for ≥200 sampled from/to pairs (px, %, em, transform lists, rgb/hex colors, incompatible templates) and 11 progress values, compiled output equals `interpolateCssValue` output.
- [ ] `npm run bench:css-interpolation` median time per 1e6 calls is lower than baseline by the target recorded before work begins, outside noise; `bench:adapters` `dom-style-binding` (1000 targets) mean frame time does not regress.
- [ ] `dist/adapters/dom.d.ts` has no unintended diff.

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
