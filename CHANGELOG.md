## Unreleased

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

- Align the Bubble Chamber Visual Lab background with the cyan/violet brand palette and regenerate its seeded artwork when the featured typography is replayed.
- Animate Bubble Chamber bubble rings with staggered tracing arcs and move dotted orbital paths using phase-driven drift and dash offsets.
- Restore the Visual Lab experiment-card section to the centered content-width layout while keeping the featured hero full-bleed.
- Defer below-the-fold landing demonstrations until the user scrolls near them, while allowing the hero shader to load after the initial render without requiring scroll.
- Restore natural mobile documentation scrolling and align the sticky toolbar and header dimensions.
- Centralize the documentation API catalog in locale data and derive the displayed documentation version from the root package version.
- Clarify the public flow-field subpath in API-reference guidance, remove an unverified TypeScript minimum from the footer badge, and keep the README focused on installation and a quick start.
- Make npm publication select a prerelease dist-tag from the package version and reserve `latest` for stable versions.
- Standardize install instructions so projects install the RxJS peer dependency when it is not already available.

### Fixed

- Re-arm `Timeline.call()` markers correctly when backward scrubbing crosses an offset-zero marker.
- Keep `.github/workflows/` as the only canonical location for GitHub Actions workflows and remove the temporary `ci/workflows/` mirrors.
- Consolidate source-level documentation and UI contract checks under `npm run check:docs`.

# Changelog

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
