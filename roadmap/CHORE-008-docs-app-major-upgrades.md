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

## Status

**In progress 2026-11-23** on branch `claude/chores-00a6db` (not merged, not pushed), one commit per step. Verification used for every step, on Node 24.15.0 with a quiet machine (load average below 10): `npm run build --workspace=re-flux-docs` (vue-tsc, Vite build and `check-built-route-fallback`), `npm run check:all` (which contains `check:docs`, `check:browser-integration`, `check:package` and the consumer check), and a headless-Chromium smoke test of the built app that opens 19 routes and fails on any console error, Vue warning, page error or failed request (script in the shared notes folder, `chores/docs-smoke.mjs`). Baseline before any step: docs build 6.8 s wall, `vite build` 2.6 s, 448 modules, 83 files in `apps/docs/dist`, JavaScript 833,663 B in 69 files, CSS 642,336 B, 5,136 KiB total, 0 build warnings, smoke test clean.

### Plan (order, each step its own commit)

1. Patch and minor: `vue` 3.5.43 → 3.5.46, `vue-router` 4.6.4 → 4.6.5, `sass` 1.89.2 → 1.108.2.
2. `vite` 6.4.4 → 8.x together with `@vitejs/plugin-vue` 5.2.4 → 6.x (plugin-vue 6 declares `vite ^5 || ^6 || ^7 || ^8`; Vite 8 needs Node `^20.19 || >=22.12`, which `engines` already satisfies, and lists `esbuild ^0.27 || ^0.28` as an optional peer, matched by the root's 0.28.2 from CHORE-007).
3. `vue-router` 4.6.5 → 5.x (peers: `vue ^3.5.34`, optional `vite ^7.3 || ^8`, optional `pinia ^3.0.4 || ^4.0.2`, so after Vite and before or with Pinia).
4. `pinia` 3.0.4 → 4.x (peers `vue ^3.5.11`, `typescript >=5.6`, `@vue/devtools-api ^8.2.1`).
5. `vue-tsc` 2.2.12 → 3.x (peer `typescript >=5.0.0`; independent of the others, last because it only touches the type-check).

Only the docs workspace changes; `src/` is not touched, and the published package contents are checked by `check:package` in every `check:all` run.

### Steps done

| Step | Versions | Result |
|---|---|---|
| 1 | `vue` 3.5.46, `vue-router` 4.6.5, `sass` 1.108.2 (`apps/docs/package.json` ranges raised to the new floors) | docs build 0 warnings; CSS byte-identical in size (642,336 B), JavaScript +2,543 B (836,206 B); smoke test clean (19 routes); `check:all` passes (44 s). |
| 2 | `vite` 8.3.8 (Rolldown-based) with `@vitejs/plugin-vue` 6.0.11 (`apps/docs/package.json`: `^8.3.8`, `^6.0.11`) | No config or source change needed: `vite.config.ts` (aliases, `define`, the GitHub Pages 404 plugin) works as is. Build 6.6 s wall (`vite build` 1.5 s against 2.6 s), 449 modules, 82 files (one fewer), JavaScript 812,099 B (−21.6 KB, −2.6%), CSS 640,549 B (−1.8 KB), 0 warnings; smoke test clean (19 routes); `check:all` passes (45 s), including `check-built-route-fallback`. The root `esbuild` 0.28.2 from CHORE-007 satisfies Vite 8's optional `esbuild ^0.27 || ^0.28` peer. `vite` dev server starts (v8.3.8, 0.35 s) and serves `main.ts` and the SFCs; its start-up dependency scan reports `@re-code/flux/*` as unresolved (code samples inside template literals), which is **identical on Vite 6.4.4**, so it is not a regression. `npm audit` (dev tree) went from 22 to 21 reported vulnerabilities. |

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
