# Changelog

Notable changes to re;Flux are recorded here. This project is in public beta; the API may change before 1.0.0.

## Unreleased

### Added

- Add `npm run bench:browser -- --out <file>` (`scripts/run-browser-benchmark.mjs`): it builds the docs app, drives the Benchmark Lab in headless Chromium for the DOM, SVG and Canvas scenarios (or `engine-only` / `per-target-dom`) and saves the page's own `schemaVersion: 2` JSON for re;Flux, GSAP and Anime.js, with GSAP 3.15.0 and Anime.js 4.5.0 served from pinned npm copies instead of the CDN (`--cdn` restores the live CDN). Add a report-only workflow (`.github/workflows/benchmarks.yml`, manual and weekly, `continue-on-error`) that uploads the Node and browser reports as artifacts, and document the headless frame-pacing caveat and why comparison-library numbers are not quoted in the docs. `gsap` and `animejs` become exact `devDependencies`. No change to the published package.
- Add Biome as the repository's linter and formatter (`npm run lint`, `npm run lint:fix`, `npm run format`, `npm run format:check`; rules: no unused variables/imports, `import type` for type-only imports, no floating promises) and run lint and the format check in CI and `check:all`. `src/`, `tests/`, `scripts/` and `benchmarks/` were reformatted in a separate commit (listed in `.git-blame-ignore-revs`); the compiled output is unchanged apart from layout, and the `.d.ts` files differ only by trailing commas in three re-export lists. No runtime or public API change.
- Add `npm run bench:save` and `npm run bench:compare`, and let `npm run bench` write its JSON report to a file with `--out <file>` or `BENCH_OUT`, so reports parse without stripping the npm banner and two runs can be compared (`benchmarks/compare.mjs` refuses to compare reports from different runtimes).
- Add exhaustive tests for every built-in easing, `cubicBezier` and `steps`, and tests for `Tween`, `Keyframes`, `AnimationScope`, `animateText`/`animateNumber`, `flip()` and `DOMAnimation` lifecycle behaviour.
- Report run-to-run variability (coefficient of variation, min/median/max spread) and garbage-collection activity (count, pause, kind, heap delta, and how often the slowest 1% of frames coincide with a GC pause) for every benchmark repetition; default benchmark repeats are now 10. Add opt-in GC control with `npm run bench:gc`, `--expose-gc` or `BENCH_GC=1`, a `noise` block in the aggregate report, per-workload noise bands in `bench:compare`, and machine-load tracking (`harness.system`, a warning from `bench`/`bench:compare` when the machine is busy).
- Add six hot-path benchmarks to `npm run bench` (`bench:interpolate`, `bench:keyframes`, `bench:css-interpolation`, `bench:path-morph`, `bench:timeline-completed`, `bench:memory`) with deterministic checksum guards.
- Add `Easings.easeInOutElastic` (and `'easeInOutElastic'` to `EasingName`), completing the In/Out/InOut set for the elastic family.
- Enforce Jest coverage floors (global and `src/core`) and run coverage on the Node 24 CI leg, uploading the lcov report as an artifact.

### Changed

- Each `Animation`, `Tween`, `Keyframes` and `Timeline` now retains far less memory: in the retained-heap benchmark an `Animation` went from 1,714 to 666 bytes (−61%), a `Tween` from 2,506 to 1,130 (−55%), a `Keyframes` from 3,035 to 1,659 (−45%), an empty `Timeline` from 2,122 to 1,074 (−49%) and a `Timeline` with ten animations from 20.1 KB to 8.6 KB (−57%). Two causes: the read-only `progress$` / `state$` / `value$` views no longer define a `value` accessor on every instance (it is now a prototype getter, so `Object.keys(view)` no longer lists `value`; reads, subscription and `'value' in view` are unchanged), and the completion promise behind `then()` / `await` / `toPromise()` is created when first used instead of with every instance (a late `await` after `stop()` still rejects with the stop error, and a `stop()` nobody awaits still raises no unhandled rejection). Add `npm run check:unhandled-rejections` (part of `check:all`).
- `flip()` and `animate()` no longer make the browser recalculate style and layout once per element. Measured in Chromium with Chrome's own counters (1,000 elements): `flip()` forced 1,001 layouts and 1,001 style recalculations and now forces 1 of each (about 400 ms → about 12 ms for the call on a loaded machine); `animate()` with implicit start values only (a single target value such as `{ opacity: 0.4 }`, no explicit `[from, to]` pairs, no function-valued properties) forced 3,000 style recalculations for 3 properties and now forces none (about 20 ms → 9–16 ms). `flip()` now reads every element's final geometry before it writes any inline style, except when one target contains another target, where the old per-element order is kept so the descendant is not displaced twice; `animate()` resolves every element's start values before it creates any binding only when every property starts from its computed value and neither the property definitions nor `stagger` are functions, and keeps the original per-element order otherwise (so an implicit start still sees an explicit frame written before it, and callbacks still see the DOM as earlier elements left it). Output is unchanged. `animateNumber()` and `followSvgPath$` were measured and cause no forced layout; `followSvgPath$` costs three `getPointAtLength` calls per emission, and a call takes time proportional to the path's complexity in Chromium (see `roadmap/PERF-010-dom-batching-and-layout-reads.md`). No public API change (one internal helper is added to a declaration file the package entry points do not re-export).
- `Animation` and `Timeline` now share one internal `PlaybackController` for the frame-clock subscription, the public state and the motion-preference lifecycle (reduced motion, hidden page, pause precedence) instead of two copies of that logic. Behaviour is unchanged (all tests, including the old-versus-new `Timeline` differential test and the browser integration checks, pass unmodified); the public declarations are unchanged apart from private members. Each instance holds one extra small object: about 72 more bytes per `Animation` (+4.4%) in the memory benchmark. `dist/core*.js` shrinks by about 0.4 KB.
- `Timeline` no longer visits every segment on every update. Children that have not started (and were already reset) and built-in children that have finished (`Animation`, `Tween`, `Keyframes`, nested `Timeline`) are skipped until the playhead reaches their start or moves back before their end; custom `AnimatableItem`s and `call()` markers are still visited on every update. Call order, callbacks and playhead state are unchanged (verified against a frozen copy of the old implementation on 250 random timelines with seeks in both directions, clock frames, reverse, restarts and structure edits). In a 2,000-segment sequential timeline a `seek()` is about 5× faster with 99% of the segments finished, about 3.5× with 50% and about 1.4× with none, and allocates nothing (was 400 young-generation collections per million seeks at 99%). One observable difference: a finished child that user code stops or seeks directly while its parent keeps playing forward is no longer snapped back to its end on the next frame; it is re-synchronised when the playhead moves back, or the timeline is stopped or restarted.
- `timeline.segments` returns one cached frozen array (with frozen entries) until a segment is added instead of allocating a new array and an object per segment on every read, about 30–100× faster for 2,000 segments. Code that sorted or modified the returned array in place now gets a `TypeError`; copy it first (`[...timeline.segments]`). Only private members of the `Timeline` declaration changed.
- `FrameCoordinator` no longer copies its subscriber set into a new array on every frame (the array is kept and rebuilt only when a frame subscriber is added or removed) and no longer allocates an array per phase per frame; cancelling a queued read/write task is now O(1) (tombstone, compacted lazily) instead of an `indexOf` + `splice` scan, so cancelling 10,000 pending tasks takes about 0.5 ms instead of about 6 ms (about 14×, linear instead of quadratic). Delivery rules are unchanged and are now pinned by tests: reads → frame consumers → writes; a subscriber added in a read task gets that frame, one added later does not; a write scheduled before or during the consumer phase runs the same frame, one scheduled inside a write task runs next frame. In a 1 MB semi-space benchmark with 1,000 to 10,000 animations the shared loop does about 8–12% fewer young-generation collections per 180 frames; frame-time gains could not be measured on a busy machine. Only private members of the `FrameCoordinator` declaration changed.
- `Tween` and `Keyframes` now share one internal base class (`AnimatedValue`, not exported from the package) that holds their playback delegation instead of repeating it line for line; behaviour is unchanged (tests pass on the old and the new implementation). The generated declaration files change shape accordingly: `Tween<T>` and `Keyframes<T>` are declared as `extends AnimatedValue<T>` (instance methods and properties, with the same signatures, are inherited), and `dist/values/AnimatedValue.d.ts` is new, with two `protected` members. `Tween.ts` + `Keyframes.ts` shrink from 396 to 237 lines and the compiled output by about 0.4 KB.
- `Keyframes` with more than 48 segments (50 or more keyframes) now remembers the segment of the previous update and resumes from it, with a binary search for jumps and backward moves, instead of scanning from the first segment on every frame. Output is unchanged (verified against a frozen copy of the previous implementation on 1,860 seeded random seek sequences plus forward, backward, boundary, yoyo/repeat/delay and playback cases). In a local benchmark with 100 keyframes a `seek()` became about 28% faster for forward playback and about 12% faster for random jumps (machine busy; in-process alternating-batch runs agree); lists of up to 48 segments keep the original scan, and the 2-, 5- and 20-keyframe cases did not change measurably. No public API or `.d.ts` change.
- `Tween` and `Keyframes` now parse their string, color and numeric-template endpoints once when they are created instead of on every frame, and build the per-frame string from pre-split pieces. Output is unchanged (verified against the one-shot `interpolate()` on 1,200 random pairs). In a local benchmark per-frame interpolation of colors and CSS-like strings became about 2-3.7x faster with several times fewer young-generation collections; plain objects are unchanged.
- `createSvgPathInterpolator()` / `bindSvgPathMorph()` now split the normalized path into literal pieces and `Float64Array` start/end values once, so each frame only formats numbers and joins them instead of running a regex replace with a callback per number. Output is byte-identical (verified against the previous implementation and the original regex one on 65 path pairs × 11 progress values). In a local interleaved benchmark (loaded machine, so indicative only) per-frame time was about 6–10% lower for 8- to 128-segment paths and young-generation collections per frame were about 25% lower; most of the remaining cost is number formatting.
- `animate()` now tokenizes and parses each CSS keyframe pair once, when the animation is created, instead of on every element × property × frame: the per-frame work is only mixing and formatting numbers (colors, numeric templates, and same-template `rgb()`/`rgba()` colors that keep the author's function, spacing and percentages). Output is unchanged (verified against the previous implementation on 1,700+ random and hand-picked pairs × 20 progress values, including overshoot and non-finite progress), and `interpolateCssValue()` itself is unchanged. In a local interleaved benchmark (mock elements, loaded machine, so indicative only) a seek of 10 or 100 elements × 3 properties took about half as long and caused about 55% fewer young-generation collections; the cost is about 0.4 ms more to construct 100 elements × 3 properties and about 0.9 KB more retained memory per element × property while the animation is alive (nothing is retained after `dispose()`). No public API or `.d.ts` change.
- `bindCanvas` no longer allocates a scheduled task, `Subscription` and closure for every coalesced draw: each binding owns one persistent write slot that an emission only flags. Draw timing and coalescing are unchanged; in a 1000-binding benchmark (mock context, loaded machine) young-generation collections per run dropped about 5x for single emissions and 3.4x for bursts.
- `animate()`, `bindStyle()` and `bindSvgAttributes()` allocate less per frame. `animate()` binds each element × property through an internal single-property binding instead of creating a `{ [property]: value }` map for every emission, and the public bindings track their keys with a per-key state and two reused arrays instead of a `Set`, `Object.keys()` and `Object.entries()` per emission. Behaviour is identical: every emission with a value still calls `setProperty` / `setAttribute` (unchanged values included), omitted or nulled keys and `unsubscribe()` restore in the same order as before, and the DOM call sequence is unchanged (verified by running the same characterization tests against the previous build). In a local interleaved benchmark (1,000 mock targets × 180 frames, 1 MB young generation, loaded machine so timings are indicative only) young-generation collections per run in the public-binding workloads fell from about 157 to 12, binding-attributable allocation went from roughly 125–160 bytes per emission to none (what remains is RxJS delivery), and `animate()` seeks over 10 or 100 elements × 3 properties caused about 39–44% fewer young-generation collections. No public API or `.d.ts` signature change.
- An unknown easing name (for example a typo such as `easeOutQaud`) still falls back to `linear`, but `resolveEasing()` now logs one `console.warn` per distinct name outside production builds (`NODE_ENV !== 'production'`), at construction time in `Animation`, `Tween`, `Keyframes` (including per-keyframe easings) and `animate()`. `EasingOption` is now `EasingFunction | EasingName | (string & {})` instead of collapsing to `string`, so editors suggest the known names; arbitrary strings remain assignable. `Keyframes` resolves every segment's easing once in the constructor instead of on every frame.
- Add the `default` condition to the root `exports["."]` entry, matching every subpath, so `require.resolve("@re-code/flux")` and bundlers that do not request the `import` condition can resolve the package. The package remains ESM-only.
- Include `src/flowField.ts` in coverage collection and drop the types-only `src/types.ts`.
- Parse numbers and colors with one internal module (`src/utils/valueTemplate.ts`, not exported) in `interpolate()`, `interpolateCssValue()` and the SVG path morpher, so the same string no longer interpolates differently depending on the entry point. The CSS path still keeps the author's template (units, spacing, `rgb()`/`rgba()` function, percentages) and returns the exact input at progress 0 and 1; `interpolate()` still normalizes colors to `rgba(r, g, b, a)`. Output changes, all for previously inconsistent inputs:
  - `interpolateCssValue()` and the path morpher now round to 5 decimals like `interpolate()` (CSS output was 4): `0.1234567px → 1.9876543px` at 0.5 gives `1.05556px` instead of `1.0556px`, and `rgba(0,0,0,.123456) → rgba(0,0,0,.9)` gives `rgba(0,0,0,0.51173)` instead of `rgba(0,0,0,0.5117)`.
  - `interpolateCssValue()` reads exponent numbers as one number (`1e-3px → 2e-3px` gives `0.0015px`, was `1.5e-3px`; `1e-3px → 1e-2px` gives `0.0055px`, was the invalid `1e-2.5px`) and a leading `+` as part of the number: `+5px → +15px` gives `10px` (was `+10px`), and `+5px → -5px` or `+5px → 15px` now interpolate instead of staying at `+5px`.
  - `interpolateCssValue()` interpolates same-template colors as colors: input channels are clamped to 0..255 and output channels rounded, so `rgb(300 0 0 / 50%) → rgb(0 0 300 / 100%)` gives `rgb(128 0 128 / 75%)` (was `rgb(150 0 150 / 75%)`), `progress` overshoot can no longer produce `rgb(306,306,306)`, and hex pairs with the same digit layout (`#112233 → #445566`, `#123 → #456`) give `rgba(43, 60, 77, 1)` instead of `#278899.5` / `#289.5`.
  - Color alpha is clamped to 0..1 on both paths (`rgba(0,0,0,0) → rgba(0,0,0,1)` at progress 1.2 gives alpha `1`, was `1.2`).
  - `rgb()` colors with percentage channels are colors on both paths: `interpolate('rgb(10% 20% 30%)', 'rgb(50% 60% 70%)', 0.5)` now returns `rgba(77, 102, 128, 1)` (was `rgb(30% 40% 50%)`), and `interpolate('rgb(10% 20% 30%)', '#ffffff', 0.5)` no longer throws. `interpolateCssValue()` keeps the percentages (`rgb(30% 40% 50%)`).

### Fixed

- Support direct GitHub Pages URLs for documentation and benchmark routes by redirecting clean paths into the hash router, and make the `/docs` default redirect an explicit nested child route.
- Keep the Benchmark Lab navigation item active when visiting its `/bench` alias.

## 0.5.0-beta.0 — 2026-10-27

### Added

- Add shared 2D vector utilities and renderer-independent steering behaviors, including arrival, fleeing, separation, and weighted force composition.
- Add elapsed-time steering integration with speed limits, exponential damping, and optional frame-gap caps.
- Add immutable flow-field grids, clamped/wrapped/zero-edge sampling, and flow-field-following steering behavior.
- Add an interactive Playground steering lab with flow-following, seek and arrive modes, adjustable swarm parameters, pointer/keyboard targeting, and pause/reset lifecycle handling.
- Add a Canvas Visual Lab flow-field scene and use shared steering/integration primitives in the autonomous swarm and kinetic-typography studies.
- Add selectable scene tabs and matching copyable TypeScript examples to the SVG, Canvas, DOM interaction, and Scroll Visual Lab panels.
- Promote the Fluid Noise Field WebGL shader to the Home hero and refine it into a softly domain-warped, loopable teal/violet field.
- Add release checks for package-consumer behavior and the complete documentation contract suite.
- Expand browser integration coverage for reduced-motion preference changes, per-animation policy isolation, hidden-page pause/resume, and explicit-pause precedence.
- Document the complete benchmark suite, including DOM/SVG/Canvas adapter workloads.

### Changed

- Remove the unregistered legacy Canvas lattice preview branch and omit local IDE workspace files from source snapshots; retain active Canvas, SVG, and WebGL demonstrations.
- Align the Bubble Chamber Visual Lab background with the cyan/violet brand palette and regenerate its seeded artwork when the featured typography is replayed.
- Animate Bubble Chamber bubble rings with staggered tracing arcs and move dotted orbital paths using phase-driven drift and dash offsets.
- Restore the Visual Lab experiment-card section to the centered content-width layout while keeping the featured hero full-bleed.
- Defer below-the-fold landing demonstrations until the user scrolls near them, while allowing the hero shader to load after the initial render without requiring scroll.
- Restore natural mobile documentation scrolling and align the sticky toolbar and header dimensions.
- Centralize the documentation API catalog in locale data and derive the displayed documentation version from the root package version.
- Clarify the public flow-field subpath in API-reference guidance, remove an unverified TypeScript minimum from the footer badge, and keep the README focused on installation and a quick start.
- Make npm publication select a prerelease dist-tag from the package version and reserve `latest` for stable versions.
- Standardize install instructions so projects install the RxJS peer dependency when it is not already available.
- Detect prerelease versions in the docs install commands so beta builds recommend the matching npm dist-tag and stable builds retain the default package command.
- Add GitHub issue templates for reproducible bug reports and structured beta feedback.

### Fixed

- Re-arm `Timeline.call()` markers correctly when backward scrubbing crosses an offset-zero marker.
- Keep `.github/workflows/` as the only canonical location for GitHub Actions workflows and remove the temporary `ci/workflows/` mirrors.
- Consolidate source-level documentation and UI contract checks under `npm run check:docs`.

## 0.2.0 — 2026-10-16

### Performance

- Cache timeline duration so repeated reads are constant-time instead of scanning every segment.
- Avoid resetting future timeline segments on every frame; reset only when the playhead crosses back before a segment's start.
- Skip frame-work timing and metrics object creation when `metrics$` has no subscribers.
- Avoid allocating empty read/write task arrays when the coordinator queues are empty.
- Add frame-coordinator and timeline benchmark scripts.

### Runtime contracts

- Prevent timeline self-containment and cycles.
- Give nested timelines a single parent owner and prevent independent control or structural changes while parent-owned.
- Add regression checks for timeline reset behavior, ownership, and lazy metrics snapshots.

### Developer experience and maintenance

- Enable `noUnusedLocals` and `noUnusedParameters` in TypeScript configuration and remove unused declarations.
- Add a benchmark command covering shared frame scheduling and timeline operations.

### Compatibility

- The package now declares Node.js `>=22` as its supported minimum.
- Nested timelines are treated as owned by their first parent after insertion; do not reuse the same timeline instance in multiple positions or parents.

### Historical validation note

The original `0.2.0` release-preparation environment could not complete the full Jest suite or the platform-native tree-shaking/documentation builds because dependency installation was unreliable there. This records that environment's limitation, not the status of later commits or releases. For each subsequent release, use the tagged CI workflow and current release gate described in [the publishing guide](./guidelines/PUBLISHING.md).
