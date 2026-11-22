# Functions that can move from re;Flux to `@re-code/basics`

Companion to [CHORE-011](./CHORE-011-adopt-re-code-basics.md) (adopt what basics already has) and [CHORE-012](./CHORE-012-upstream-generic-helpers-to-basics.md) (upstream what it does not have yet). Back to the [roadmap](../roadmap.md).

Method: every exported or private helper in `src/utils/`, `src/values/interpolate.ts`, `src/core/Completion.ts`, `src/adapters/**`, `src/operators/**`, `src/physics/**`, `src/flowField.ts`, `src/steering.ts` and `benchmarks/benchmark-utils.mjs` was inventoried (function declarations, read where the body mattered) and compared with the 70+ utilities exported by `../re-basics/src/index.ts` (v0.1.0). A function is a *candidate* only if it has no animation, DOM, SVG, Canvas or RxJS concept in its signature.

Rules from `@re-code/basics` that shape this list (`../re-basics/README.md`, `CONTRIBUTING.md`):

- One public utility per module, named export, domain folder (`number/`, `string/`, `type/`, `function/`, …), zero runtime dependencies, TSDoc plus Given/When/Then tests, ≥95% coverage per module.
- **Utilities with a Lodash equivalent follow the reviewed Lodash contract** and are checked by differential tests. Several flux helpers have names that collide with a *different* Lodash function (`wrap`, `random`, `pipe`↔`flow`), so they cannot simply be copied under the same name — see the "Proposed basics module" column.
- "Do not … perform migrations from `re;Flux` without explicit approval." Nothing in this list is to be moved until that approval is given (CHORE-012 requires it as an acceptance criterion).

## A. Strong candidates — generic, not in basics yet

| # | Function | Where in re;Flux | Proposed basics module | Why it fits / what must be decided |
|---|---|---|---|---|
| A1 | `wrap(value, min, max)` | `src/utils/math.ts:53` (public export) | `number/wrapRange` | Wraps into `[min, max)`; throws `RangeError` if bounds are non-finite or equal. **Do not name it `wrap`**: Lodash `_.wrap` is an unrelated function wrapper. `flowField.ts:125` `wrapIndex` is the `min = 0` case. |
| A2 | `mapRange(value, inMin, inMax, outMin, outMax, clamp?)` | `src/utils/math.ts:29` | `number/mapRange` | Degenerate input range returns `outMin`. Depends on `clamp` + `lerp`, which basics already has (public utilities may not import each other in basics, so it would use the shared `internal/` module or inline). |
| A3 | `snap(value, interval \| list)` | `src/utils/math.ts:37` | `number/snap` | Rounds to nearest multiple or nearest list entry; throws on non-positive interval or empty list. No Lodash equivalent. |
| A4 | `random(min, max, source = Math.random)` | `src/utils/math.ts:60` | `number/randomBetween` | Injectable random source makes it deterministic in tests. **Do not name it `random`**: Lodash `_.random(lower, upper, floating)` has a different contract (integers by default). |
| A5 | `percentile(values, fraction)` | `benchmarks/benchmark-utils.mjs:47`; second copy `apps/docs/src/views/BrowserBenchmarks.vue:246` | `number/percentile` | Sits next to basics' existing `mean` and `median`. Two copies exist today with different empty-input results (`0` vs `null`) — the contract must pick one (basics' convention for empty input is `NaN`). |
| A6 | Standard deviation / coefficient of variation | needed by [BENCH-007](./BENCH-007-variance-and-gc-control.md) (new) | `number/standardDeviation` (+ `number/coefficientOfVariation` if wanted) | Not written yet in flux; implement it in basics first and consume it, instead of adding a fourth statistics helper to the benchmarks. |
| A7 | `splitGraphemes(text)` | `src/adapters/dom/text.ts:120` | `string/graphemes` | Uses `Intl.Segmenter` with an `Array.from` fallback. Generic Unicode-safe splitting; no Lodash equivalent under that name. Keep `splitWords` local (it keeps whitespace tokens, unlike Lodash `words`). |
| A8 | `isIterable(value)` | `src/adapters/dom/targets.ts:29` (`isIterableElementCollection`, minus the `Element` type) | `type/isIterable` | Pure type guard (`Symbol.iterator` is a function). The `Element` specialization stays in flux as `isIterable(v)` + element check. |
| A9 | `pipe(...fns)` | `src/utils/math.ts:90` (public export) | `function/flow` (Lodash contract) | Left-to-right composition. Basics should expose it as `flow` per its Lodash-contract rule; re;Flux's single-argument `pipe<T>` then becomes a thin typed re-export or stays. Decide before moving. |

## B. Medium candidates — move only after a local dedupe or a contract decision

| # | Function | Where in re;Flux | Proposed basics module | Condition |
|---|---|---|---|---|
| B1 | `interpolateRange(input, output, clamp?)` | `src/utils/math.ts:71` | `number/interpolateRange` | Piecewise-linear mapper; requires sorted input and equal lengths (throws otherwise). Move together with A2 so they share one contract. |
| B2 | `formatNumber(value)` ×3: `src/values/interpolate.ts:134`, `src/adapters/svg/pathMorph.ts:510`, inline in `cssInterpolation.ts` | — | `number/formatDecimal(value, precision)` | Three copies with different precision (5 vs 5 vs 4 digits) and `-0` handling. First unify locally in [REFACTOR-003](./REFACTOR-003-unify-value-parsing.md); upstream only the settled version. |
| B3 | `positive(value, fallback)` / `nonNegative(value, fallback)` | **identical copies** in `src/physics/spring.ts:91,95` and `src/operators/gestures.ts:522,526` | `number/positiveOr` / `number/nonNegativeOr` | Generic "finite and > 0 else fallback" option normalizers. Dedupe into one local module now (no cross-package decision needed); upstream later if other packages need them. |
| B4 | `Completion` (resettable deferred promise) | `src/core/Completion.ts` | `function/createDeferred` | The reusable core is "promise + resolve/reject + settled flag"; `restart`/`ensurePending` and the auto-attached `.catch` (to avoid unhandled rejections) are re-Flux policy and would stay as a thin wrapper. Needs a decision on whether basics wants a promise domain at all. |

## C. Already in basics — adopt, do not move (see CHORE-011)

| re;Flux code | Basics function | Note |
|---|---|---|
| `lerp` — `src/utils/math.ts:24` | `number/lerp` | Identical formula. |
| `isPlainRecord` — `src/values/interpolate.ts:138` | `type/isPlainObject` | Same logic. |
| Private `clamp` copies: `Keyframes.ts:229`, `adaptiveTween.ts:217`, `gestures.ts:518`, `draggable.ts:312` (`clampDraggableCoordinate`), `scrollTrigger.ts:357` (`clamp01`), `gestures.ts:514` (`clampVelocity`), `interpolate.ts:133` and `cssInterpolation.ts:72` (0–255 channel clamps) | `number/clamp` | Basics' `clamp` throws if `minimum > maximum`; only replace where bounds are provably ordered. Inline `Math.min(1, Math.max(0, x))` also appears in `Timeline.ts:55,191`, `smoothStream.ts:100`, `svg.ts:95`, `scroll.ts:39`. |
| Public `clamp` — `src/utils/math.ts:17` | `number/clamp` | Different semantics (either bound order, defaults 0..1): keep as a wrapper. |
| `median` — `benchmarks/benchmark-utils.mjs:37`, `BrowserBenchmarks.vue:236` | `number/median` | Empty input differs (`0` / `null` vs `NaN`). |

## D. Keep in re;Flux (reasons)

| Function(s) | Why it stays |
|---|---|
| `Easings`, `resolveEasing`, `cubicBezier`, `steps` | Animation vocabulary and public API; pure math but not an "everyday application problem". |
| `stagger`, `distribute`, `sequence`, `parallel`, `staggered` | Depend on easing/timeline concepts. |
| `Vector2` module (11 functions: `addVectors` … `lerpVector`) | Pure and generic, but a new *vector* domain is a scope decision for basics (its README curates "everyday" utilities). Recommended: do not move now; revisit if a second package needs them. Used by `steering.ts`, `flowField.ts`. |
| `readonlyBehavior`, `animationFrame$`, `FrameCoordinator`, all adapters, operators, physics | RxJS / DOM / RAF specific. |
| `assertFiniteNonNegative`, `assertRepeatCount`, `validateNonNegativeFinite` (`adaptiveTween.ts:213`), `isValidPoint` | Validation with re;Flux-specific messages; consolidate locally (one `validation` module) rather than upstream. |
| `toCssPropertyName` (`cssInterpolation.ts:123`) | Looks like `kebabCase`, but must preserve `--custom-properties` and vendor prefixes; Lodash-contract `kebabCase` does not. Keep local. |
| `clampIndex`, `wrapIndex` (`flowField.ts:125,129`) | Trivial once A1/clamp exist; keep as local one-liners over the shared functions. |
| `monotonicNow` (`FrameCoordinator.ts:248`) | One-line environment shim. |
| `positiveInteger`, `nonNegativeInteger`, `parseIntegerList`, `rotateOrder`, `restoreGlobalDescriptor` (`benchmarks/benchmark-utils.mjs`) | Dev-tooling for the benchmark CLI, not library code. |
| Path/SVG geometry (`pathMorph.ts`: `splitCubic`, `cubicPoint`, `arcAsCubics`, …) | Domain-specific (SVG), would need its own package. |

## Summary

- **9 strong candidates** (A1–A9), **4 medium** (B1–B4), **8 duplicates to adopt** (C), the rest stay.
- Three of the strong candidates **cannot keep their flux names** because of Lodash-contract collisions: `wrap` → `wrapRange`, `random` → `randomBetween`, `pipe` → `flow`.
- Fastest wins with no cross-package decision: B3 and the local clamp/format consolidation, which shrink flux regardless of what happens to basics.
