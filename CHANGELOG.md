# Changelog

Notable changes to re;Flux are recorded here. This project is in public beta; the API may change before 1.0.0.

## Unreleased

### Added

- Add `npm run bench:save` and `npm run bench:compare`, and let `npm run bench` write its JSON report to a file with `--out <file>` or `BENCH_OUT`, so reports parse without stripping the npm banner and two runs can be compared (`benchmarks/compare.mjs` refuses to compare reports from different runtimes).
- Add exhaustive tests for every built-in easing, `cubicBezier` and `steps`, and tests for `Tween`, `Keyframes`, `AnimationScope`, `animateText`/`animateNumber`, `flip()` and `DOMAnimation` lifecycle behaviour.
- Report run-to-run variability (coefficient of variation, min/median/max spread) and garbage-collection activity (count, pause, kind, heap delta, and how often the slowest 1% of frames coincide with a GC pause) for every benchmark repetition; default benchmark repeats are now 10. Add opt-in GC control with `npm run bench:gc`, `--expose-gc` or `BENCH_GC=1`, a `noise` block in the aggregate report, per-workload noise bands in `bench:compare`, and machine-load tracking (`harness.system`, a warning from `bench`/`bench:compare` when the machine is busy).
- Add six hot-path benchmarks to `npm run bench` (`bench:interpolate`, `bench:keyframes`, `bench:css-interpolation`, `bench:path-morph`, `bench:timeline-completed`, `bench:memory`) with deterministic checksum guards.
- Enforce Jest coverage floors (global and `src/core`) and run coverage on the Node 24 CI leg, uploading the lcov report as an artifact.

### Changed

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
