# CHORE-008 — Docs app: plan and land Vite/Vue-ecosystem major upgrades separately

| Category | Impact | Risk | Effort | Priority score | Phase | Depends on |
|---|---|---|---|---|---|---|
| Dependencies | 2 | 2 | 4 | **8** | 4 | [DOCS-004](./DOCS-004-decouple-contract-checks.md) |

Priority = (Impact + Risk) × (6 − Effort). Back to the [roadmap](../roadmap.md).

## Problem

The docs workspace is on previous majors; upgrading them in one go risks the 17 string-based contract checks.

## Evidence

- `npm outdated`: `vite` 6.4.4 → 8.3.8, `vue-router` 4.6.4 → 5.5.1, `pinia` 3.0.4 → 4.1.0, `@vitejs/plugin-vue` 5.2.4 → 6.0.11, `vue-tsc` 2.2.12 → 3.3.14, `sass` 1.89.2 → 1.108.2, `vue` 3.5.43 → 3.5.45.
- The docs app is `private` and does not affect the published package, so it can lag without user impact — this is maintenance, not urgency.

## Scope

- One PR per major (vite+plugin-vue together, router, pinia, vue-tsc); patch/minor (`vue`, `sass`) first.

## Non-goals

- No library (`src/`) changes.

## Risks

- `check-built-route-fallback` (GitHub Pages hash-router fallback) and `check-route-delivery` are sensitive to router/Vite changes.

## Acceptance criteria

Every box must be checkable by running the named command or inspecting the named file.

- [ ] After each PR: `npm run build --workspace=re-flux-docs`, `npm run check:docs` and `npm run check:all` pass.
- [ ] Deployed-route behaviour verified: `node scripts/check-built-route-fallback.mjs` passes.
- [ ] No change to the published package contents (`npm run check:package`).

## Shared gates

**Docs gate** (see `roadmap/README.md`)
- [ ] `npm run check:docs` passes (update the matching `scripts/check-*.mjs` contract in the same PR if a literal it asserts changes).
- [ ] `npm run build --workspace=re-flux-docs` passes.
