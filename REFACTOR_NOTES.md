# re;Flux refactor notes

## Scope

This refactor is based on the uploaded `re-flux(1).zip` snapshot. The public GitHub `main` branch was observed to be ahead of that archive during review; compare this result with current `main` before applying it wholesale. This ZIP is not a claim that the stale upload and latest remote branch have been merged.

## Changes

- Roadmap now has one canonical data source: `apps/docs/src/data/roadmap.json`. The Vue roadmap reads it directly, and `scripts/sync-roadmap.mjs` generates `ROADMAP.md`; `check:roadmap` detects drift.
- README reduced to purpose, installation, a current DOM API example, and development commands. The docs URL placeholder was removed.
- Publishing/setup guidance now describes the existing npm Trusted Publishing (OIDC) contract, the committed lockfile, and the exact workflow names.
- GitHub Actions now includes CI on Node 22 and 24, documentation deployment after successful CI on `main`, and tag-based npm publication with OIDC. Workflow copies are also kept under `ci/workflows/`; `check:workflow-sync` verifies byte-for-byte parity.
- DOM adapter internals have been split into target resolution, property-option normalization, CSS interpolation, and style binding modules. Existing adapter exports are preserved.
- Public types are organized by domain under `src/types/`; `src/types.ts` remains a compatibility barrel.
- DOM property definitions support explicit `{ from, to }` pairs and target-aware value factories `(target, index, total)`, with factories evaluated once per target when the animation is created.
- Engine-owned BehaviorSubjects are private. Consumers retain `.value` snapshots and subscriptions through read-only views, but mutation methods are not exposed.
- Timeline structure is locked after playback begins or non-zero seeking; nested timelines are locked while parent-driven, `stop()` resets the lock, and direct/indirect nested Timeline cycles are rejected.
- Added regression tests for read-only views, explicit/factory DOM values, structural mutation guards, and nested cycles.

## Verification results

Passed:

- `npm run typecheck`
- `npm run typecheck:tests`
- `npm run build:lib`
- `npm run check:roadmap`
- `npm run check:workflow-sync`
- `node scripts/check-package-files.mjs`
- `npm run check:visual-lab`
- `npm run check:playground-lifecycle`
- `vue-tsc --noEmit -p apps/docs/tsconfig.app.json`
- Runtime smoke checks for `{ from, to }`, per-target factories, read-only stream surfaces, Timeline lock/unlock, and cycle rejection

Blocked by the supplied environment:

- The Jest suite did not execute because the archived `node_modules` dependency tree failed to resolve its configured `ts-jest` / Jest runner modules. `tsconfig.test.json` type-checks successfully, but this is **not** a passing Jest result.
- Tree-shaking and Vite production builds could not run with the archived dependencies because `esbuild` contains the macOS ARM64 binary while this runner is Linux x64. Reinstall dependencies with `npm ci` in a clean environment and rerun CI to verify these steps.

## Compatibility notes

- The package version remains unchanged; this patch does not publish anything.
- The package keeps `engines.node: >=18` to avoid silently making a published runtime support claim more restrictive. The repository CI validates Node 22 and 24.
- The new Timeline edit restriction is a deliberate pre-1.0 contract change: stop/reset before editing structure.
