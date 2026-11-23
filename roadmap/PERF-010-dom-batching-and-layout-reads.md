# PERF-010 — Investigate DOM read/write interleaving and per-frame SVG path queries

| Category | Impact | Risk | Effort | Priority score | Phase | Depends on |
|---|---|---|---|---|---|---|
| Performance (measure-first) | 3 | 2 | 3 | **15** | 3 | [BENCH-009](./BENCH-009-browser-benchmark-runner-and-ci-report.md) |

Priority = (Impact + Risk) × (6 − Effort). Back to the [roadmap](../roadmap.md).

## Status

**Done 2026-11-23** on branch `claude/phase-3-9822a6`: two of the four suspected cases were confirmed and fixed (`flip()`, `animate()` with implicit start values); `animateNumber()` and `followSvgPath$` were measured and closed without a change to forced-layout behaviour. One new finding about `followSvgPath$` (cost per `getPointAtLength` call) is recorded below and **not** acted on.

### How it was measured

`node scripts/run-browser-benchmark.mjs --suite adapters --out <file>` (BENCH-009) drives `tests/browser/layout-probe.ts` in headless Chromium 156 and reads Chrome's `Performance.getMetrics` counters (`RecalcStyleCount`, `LayoutCount` and their durations) around each operation. For synchronous operations no frame can render mid-call, so every recalculation or layout counted during the call is *forced* by it; a stray rendered frame between the call and the read can add at most one or two, and the table uses the median of 7 repetitions. Two controls prove the counters tell thrash from batching in the same browser: a loop that writes a style and reads `getBoundingClientRect()` per element (thrash by construction) and a loop that reads all first (batched). A Chrome trace (`--trace`, categories incl. `devtools.timeline.stack`) attributes each forced `UpdateLayoutTree` / `Layout` event to the JavaScript function that caused it (`roadmap/perf-010/trace-by-function.mjs`). Frame-driven cases count recalculations and layouts per rendered frame. The Benchmark Lab scenarios were not used: they do not exercise these helpers. Raw reports and the trace summary are in `roadmap/perf-010/`.

**Machine load was very high throughout (load average 33–81 on 8 cores).** The counts are deterministic and unaffected; durations are indicative and were only trusted where the difference is tens of times.

### Findings

| Case | Forced recalc / layout before | After | Verdict |
|---|---|---|---|
| Control: write + read per element | 100 / 100 (100 elements), 1000 / 1000 (1000) | same | the counters detect thrash |
| Control: reads first, then writes | 0–1 / 0–1 | same | the counters detect batching |
| `flip()` | **100 / 100** (100 elements), **1001 / 1001** (1000) | 1 / 1, 1–2 / 1–2 | **confirmed** and fixed |
| `animate()`, explicit `[from, to]` pairs (3 properties) | 0–1 / 0–1 | same | no reads at all, nothing to fix |
| `animate()`, implicit start values (3 properties) | **299 / 0** (100), **3000 / 0** (1000) | 0 / 0 | **confirmed** and fixed |
| `animateNumber()` on 100 / 1000 counters | 1 recalc and 1 layout per frame | unchanged | the browser's one normal pass for a text change; **no forced work**, closed without change |
| `followSvgPath$` driving a `transform` (200-segment path) | 1.03 recalc, 0.05 layout per frame | unchanged | **no forced work**; see the cost finding below |

Trace attribution (`roadmap/perf-010/trace-summary.txt`, 1000 elements, 2 repetitions): forced events caused by `flip()` fell from 2000 layouts (842 ms) and 2000 style recalculations to 2 layouts (0.9 ms) and 2 style recalculations; forced style recalculations caused by `animate()` with implicit starts fell from 5,998 to 0. The thrashing control produced 2000 layouts (705–883 ms) in both traces, as expected.

Durations (three interleaved before/after pairs, 1000 elements, median of 5 repetitions per run, loaded machine):

- `flip()` call: 396 / 413 / 415 ms before, 13.1 / 13.4 / 11.5 ms after (about 30–35× less); forced layout time 374–385 ms before, 0.5–1.4 ms after.
- `animate()` with implicit start values, 3 properties: 19.2–20.7 ms before, 8.2–9.5 ms after (about 2×); forced style-recalculation time 6.1–6.4 ms before, 0 after.
- Explicit-pair `animate()` is unchanged (it is the same 8–10 ms construction cost).

### What changed

- `flip()` (`src/adapters/dom/layout.ts`) reads every element's final bounding rectangle and computed transform in one pass before it creates any animation, so the browser lays out once. **When one target contains another target** (checked by walking each target's ancestors) it keeps the old interleaved order on purpose: a descendant has to be measured after its ancestor's inverted transform has been applied, otherwise the ancestor's displacement is counted twice (measured in Chromium for a flipped parent with a flipped child: the interleaved order gives the child `translate(0px, 0px)`, while an unconditional batched read gave `translate(-100px, 0px)`, a visible double offset). That case is pinned by a browser-integration test.
- `animate()` (`src/adapters/dom/animation.ts`) resolves the keyframes of every element × property (the only place computed styles are read) before it creates any `Keyframes` or binding. User callbacks (`stagger`, per-element frame factories) are called in the same order as before. Behaviour difference: a validation error thrown while creating an earlier element's `Keyframes` is now raised after the later elements' frame factories have run, and no binding has been created yet when a factory throws (the animation is disposed either way).
- Tests: `tests/adapters/dom-read-write-order.test.ts` (7 tests: the two ordering tests failed on the old code, the others pin behaviour that did not change), and browser-integration cases (`scripts/check-browser-integration.mjs`, now 13) for read-before-write order of `flip()` and `animate()` on the real DOM (spies on `getBoundingClientRect`, `getComputedStyle` and `CSSStyleDeclaration.setProperty`), for the forced recalculation and layout counts over 200 elements (CDP counters), and for the nested-target case. The order and count cases fail on the old source (verified by running the new script against a copy of it).
- No public API or `.d.ts` change (declaration output diffed identical).

### `followSvgPath$` — cost per query, not thrash (not changed)

It calls `getPointAtLength` three times per emission (point, `distance − lookAhead`, `distance + lookAhead`) and causes no forced layout. But in Chromium one `getPointAtLength` call costs time proportional to the path's complexity (it rebuilds the path measurement each call): on this loaded machine about 0.14 ms per call at 8 segments, 2.5 ms at 200 segments and 26 ms at 2000 segments (readings: 0.44 / 7.4 / 78 ms per emission). The load inflates every figure, but the linear growth is the finding: a single follower on a 200-segment path could spend several milliseconds per frame on this alone.

The precomputed length→point table from the scope was analysed and **not implemented**: it needs a new option (an approximation with a user-chosen accuracy), and it only pays for itself when the number of emissions exceeds about a third of the sample count (each sample costs one query, each exact emission three). A 2-second animation at 60 fps (about 120 emissions) on a path where 1-unit accuracy needs thousands of samples would cost more to build than it saves; the table helps for long or looping playback, scrubbing, and many followers sharing one path. Candidate follow-up, if wanted: an opt-in `sampleCount` (or a shared, reusable sampled path) with a documented error bound, measured on a quiet machine.

### Not verified

Quiet-machine timings; a real display (headless frame pacing); browsers other than Chromium (Firefox and Safari may count forced work differently); `scheduleWrite` routing of binding writes (not needed: no forced work remains, so the latency trade-off in Risks was not taken).

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

- [x] A written finding in this file, with trace screenshots or counts, states for each of `flip`, `animate`, `animateNumber`, `followSvgPath$` whether forced recalculation / layout thrash occurs.
- [x] Measurements are taken with `node scripts/run-browser-benchmark.mjs --suite adapters` (BENCH-009) plus a Chrome performance trace.
- [x] For each confirmed case: a browser-integration test (`tests/browser/fixture.ts`) asserts the corrected read/write ordering, and a browser benchmark scenario shows lower scripting+style time than baseline, outside noise.
- [x] `npm run check:browser-integration`, `npm run check:renderer-cleanup` and `npm run check:docs` pass.

## Shared gates

**Code gate** (see `roadmap/README.md`)
- [x] `npm run typecheck` and `npm run typecheck:tests` pass.
- [x] `npm test -- --runInBand` passes (record the test count; it must not decrease unless tests are intentionally replaced): 57 suites / 1,541 tests (1,534 before Phase 3; +7 in `dom-read-write-order.test.ts`).
- [x] `npm run check:tree-shaking`, `npm run check:package` and `npm run check:package:consumer` pass.
- [x] No change to public `.d.ts` output (diffed identical against a build of the previous source).
