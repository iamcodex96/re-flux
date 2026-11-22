# PERF-006 — bindStyle / bindSvgAttributes: no per-frame allocations, skip unchanged writes

| Category | Impact | Risk | Effort | Priority score | Phase | Depends on |
|---|---|---|---|---|---|---|
| Performance | 4 | 3 | 3 | **21** | 1 | [BENCH-008](./BENCH-008-hot-path-benchmarks.md), [PERF-003](./PERF-003-compile-css-interpolation.md) |

Priority = (Impact + Risk) × (6 − Effort). Back to the [roadmap](../roadmap.md).

## Problem

Every value emission allocates a style-map object, a `Set`, and an entries array, and writes to the DOM even when the value did not change.

## Evidence

- `src/adapters/dom/animation.ts` `animate()`: `keyframeItem.value$.pipe(map((value) => ({ [property.cssProperty]: value })))` creates a new object per emission per target.
- `src/adapters/dom/styleBinding.ts:21` `const nextKeys = new Set(Object.keys(styles));` and `:27` `Object.entries(styles)` run per emission; `target.style.setProperty(key, value)` is unconditional.
- `src/adapters/svg.ts:24,30` repeat the same pattern for SVG attributes.
- Baseline `adapterUpdates` 1000 targets: `dom-style-binding` p99 1.04 ms, worst 3.4 ms; `svg-attribute-binding` p99 1.30 ms, worst 2.3 ms (mock targets).

## Scope

- Add an internal single-property binding fast path (`bindStyleProperty(target, name, value$)`) used by `animate()`; keep `bindStyle` public behaviour intact.
- Remember the last written value per key and skip `setProperty`/`setAttribute` when unchanged.
- Apply the same to the SVG attribute binding.

## Non-goals

- Not moving writes into the coordinator's write phase (see PERF-010).

## Risks

- Skipping "unchanged" writes must not skip the first write or the restore-on-unsubscribe behaviour; if user code mutates the style externally, the cache can go stale — document that bindings own the property.

## Acceptance criteria

Every box must be checkable by running the named command or inspecting the named file.

- [ ] `tests/adapters/dom.test.ts`, `svg.test.ts` and `npm run check:renderer-cleanup` pass unchanged (restoration of original inline styles still works).
- [ ] New test: emitting the same value twice results in one `setProperty` call (spy); restoring omitted keys still works through the public `bindStyle`.
- [ ] `npm run bench:adapters`, 1000 targets: `dom-style-binding` and `svg-attribute-binding` median-of-run-p99 frame time and heap delta are no worse than baseline and improve by the pre-recorded target outside noise; `--trace-gc` Scavenge count drops (record both).
- [ ] `dist/adapters/dom.d.ts` / `svg.d.ts` have no unintended diff.

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
