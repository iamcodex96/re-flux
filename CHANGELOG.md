## Unreleased

### Maintenance

- Remove the temporary `ci/workflows/` mirrors and keep `.github/workflows/` as the sole source of truth for GitHub Actions.
- Fix `Timeline.call()` markers at offset zero so backward scrubbing re-arms the callback without invoking it repeatedly at the marker.
- Consolidate source-level documentation and UI contract checks into `npm run check:docs` and run the full set in CI.
- Simplify the library build TypeScript include list to match the source tree.
- Fix mobile documentation scrolling by restoring natural page scroll, keeping the article from becoming a nested scroll container, and aligning the sticky toolbar/header sizes.

- Promoted the Fluid Noise Field WebGL shader to the Home hero background and removed it from the Visual Lab catalog and shader selector to avoid duplicating the signature effect.
- Reworked the fluid shader into a softly domain-warped, loopable teal/violet field and added visibility/reduced-motion lifecycle handling on Home.
- Updated Visual Lab counts and static checks to keep the catalog and hero ownership in sync.

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

### Validation notes

- TypeScript library and test checks, library build, package allowlist validation, release-tag validation, and public-subpath consumer smoke tests passed in the release preparation environment.
- The full Jest suite and platform-native tree-shaking/docs builds were not verified in this environment because dependency installation could not complete reliably. Run the GitHub Actions workflows on a clean Linux runner before publishing.
