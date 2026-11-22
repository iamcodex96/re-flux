# PERF-010 — Investigate DOM read/write interleaving and per-frame SVG path queries

| Category | Impact | Risk | Effort | Priority score | Phase | Depends on |
|---|---|---|---|---|---|---|
| Performance (measure-first) | 3 | 2 | 3 | **15** | 3 | [BENCH-009](./BENCH-009-browser-benchmark-runner-and-ci-report.md) |

Priority = (Impact + Risk) × (6 − Effort). Back to the [roadmap](../roadmap.md).

## Problem

Several DOM helpers read layout or write styles outside the coordinator's read/write phases. This may be harmless or may cause forced style recalculation; it needs a real-browser trace to decide.

## Evidence

- `src/adapters/dom/layout.ts` `flip()`: in one `forEach` it calls `element.getBoundingClientRect()`, `window.getComputedStyle(element).transform`, then `animate(element, …)`, whose `bindStyle` subscribes to a `BehaviorSubject` and writes `style` synchronously — so a style write for element *i* precedes the layout read for element *i+1*.
- `src/adapters/dom/animation.ts` `animate()` → `resolveDOMPropertyKeyframes` → `readComputedValue` calls `getComputedStyle` per element × property while earlier elements' bindings may already have written styles.
- `src/adapters/dom/text.ts` `animateNumber` writes `target.textContent` inside `onUpdate` (frame-consumer phase), and `bindStyle` writes in the same phase, not in `scheduleWrite`.
- `src/adapters/svg.ts:146-148` `followSvgPath$` calls `getPointAtLength` three times per emission.
- `layout.ts` shows **0%** coverage in Jest (it may be covered by browser integration; verify).

## Scope

- Using the BENCH-009 browser runner and Chrome performance traces, count forced style/layout recalculations for `flip()` over 100/1000 elements and `animate()` over 1000 elements × 3 properties.
- If confirmed: collect all reads first, then create bindings; read computed styles once per element; consider routing binding writes through `scheduleWrite`.
- If not confirmed: close with the trace evidence.
- Consider a precomputed length→point table for `followSvgPath$` if a trace shows it matters.

## Non-goals

- Do not change the documented phase order (reads → consumers → writes).

## Risks

- Routing writes through the write phase adds up to one frame of latency for some updates; must be evaluated against drag/gesture responsiveness.

## Acceptance criteria

Every box must be checkable by running the named command or inspecting the named file.

- [ ] A written finding in this file, with trace screenshots or counts, states for each of `flip`, `animate`, `animateNumber`, `followSvgPath$` whether forced recalculation / layout thrash occurs.
- [ ] Measurements are taken with `node scripts/run-browser-benchmark.mjs` (BENCH-009) plus a Chrome performance trace.
- [ ] For each confirmed case: a browser-integration test (`tests/browser/fixture.ts`) asserts the corrected read/write ordering, and a browser benchmark scenario shows lower scripting+style time than baseline, outside noise.
- [ ] `npm run check:browser-integration`, `npm run check:renderer-cleanup` and `npm run check:docs` pass.

## Shared gates

**Code gate** (see `roadmap/README.md`)
- [ ] `npm run typecheck` and `npm run typecheck:tests` pass.
- [ ] `npm test -- --runInBand` passes (record the test count; it must not decrease unless tests are intentionally replaced).
- [ ] `npm run check:tree-shaking`, `npm run check:package` and `npm run check:package:consumer` pass.
- [ ] No change to public `.d.ts` output unless intended; any intended change is recorded in `CHANGELOG.md` under Unreleased.
