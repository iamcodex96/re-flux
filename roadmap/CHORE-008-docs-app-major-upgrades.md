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

**Done 2026-11-23** on branch `claude/chores-00a6db` (not merged, not pushed), one commit per step. Verification used for every step, on Node 24.15.0 with a quiet machine (load average below 10): `npm run build --workspace=re-flux-docs` (vue-tsc, Vite build and `check-built-route-fallback`), `npm run check:all` (which contains `check:docs`, `check:browser-integration`, `check:package` and the consumer check), and a headless-Chromium smoke test of the built app that opens 19 routes and fails on any console error, Vue warning, page error or failed request (script in the shared notes folder, `chores/docs-smoke.mjs`). Baseline before any step: docs build 6.8 s wall, `vite build` 2.6 s, 448 modules, 83 files in `apps/docs/dist`, JavaScript 833,663 B in 69 files, CSS 642,336 B, 5,136 KiB total, 0 build warnings, smoke test clean.

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
| 3 | `vue-router` 5.5.1 (`^5.5.1`) | No source change: the hash-history router, lazy routes, `redirect`, `alias`, nested children and `meta` all work unchanged. It pulls in 25 new transitive packages (`unplugin`, `@vue-macros/common`, `@vue/devtools-kit`, …) for the file-based-routing support that this app does not use; `pinia` 3.0.4 satisfies its optional `pinia ^3.0.4 || ^4.0.2` peer. Build 5.8 s wall, 442 modules, 84 files, JavaScript 812,061 B (−38 B), CSS unchanged, 0 warnings; smoke test clean on 26 routes (the earlier 19 plus the legacy redirects `/bench`, `/animation`, `/timeline`, `/easings`, `/motion`, `/api`, and an unmatched route); `check:all` passes (49 s) including `check-route-delivery` and `check-built-route-fallback`. |
| 4 | `pinia` 4.1.0 (`^4.1.0`; brings `@vue/devtools-api` 8.2.1 and the devtools packages) | No source change (`defineStore` with a state and a getter in `stores/app.ts`, `createPinia()` in `main.ts`); its `typescript >=5.6` peer is met by 5.7. Build 5.4 s wall, 442 modules, JavaScript 812,103 B (+42 B), CSS unchanged, 0 warnings; smoke test clean on 26 routes (every view renders its copy through the store getter); `check:all` passes (51 s). |
| 5 | `vue-tsc` 3.3.14 (`^3.3.14`; brings `@volar/*` 2.4.30) | No source or `tsconfig` change; it type-checks the docs app with the repository's TypeScript 5.7.3 exactly as 2.2.12 did (3.8–4.2 s per run, against about 4.4 s). Build output byte-for-byte equivalent in size to step 4 (JavaScript 812,103 B, CSS 640,549 B), 0 warnings; smoke test clean on 26 routes; `check:all` passes (51 s, 65 suites / 1,609 tests). Also in this commit: `immutable` 5.1.5 → 5.2.1 in the lockfile only (a transitive dependency of `sass`): since `vue-router` 5 lists `vite` as an optional peer, `npm audit --omit=dev` started to report a high-severity advisory for `immutable ≤ 5.1.7` (Hash-collision DoS in `Immutable.Map/Set`, which Sass's build-time use does not exercise); after the bump it reports 0 vulnerabilities again. |

### Result

Every docs-workspace dependency named in the item is now on its latest major (`npm outdated` lists none of them): `vue` 3.5.46, `vue-router` 5.5.1, `pinia` 4.1.0, `vite` 8.3.8, `@vitejs/plugin-vue` 6.0.11, `vue-tsc` 3.3.14, `sass` 1.108.2. No source file under `apps/docs/src` or `src/` changed, and no `scripts/check-*.mjs` contract needed an update. Net effect on the built docs app, from the baseline: 83 → 84 files, JavaScript 833,663 → 812,103 B (−2.6%), CSS 642,336 → 640,549 B, `vite build` 2.6 s → 1.2 s (quiet machine, indicative), 0 warnings before and after. `typescript` stays 5.7.3 in the docs workspace (CHORE-009: `vue-tsc` 3 does not run on TypeScript 7).

## Scope

- One PR per major (vite+plugin-vue together, router, pinia, vue-tsc); patch/minor (`vue`, `sass`) first.

## Non-goals

- No library (`src/`) changes.

## Risks

- `check-built-route-fallback` (GitHub Pages hash-router fallback) and `check-route-delivery` are sensitive to router/Vite changes.

## Acceptance criteria

Every box must be checkable by running the named command or inspecting the named file.

- [x] After each PR: `npm run build --workspace=re-flux-docs`, `npm run check:docs` and `npm run check:all` pass. (Each of the five steps: build, then `check:all`, which contains `check:docs`; all passed on Node 24.15.0. Node 22 is not installed here.)
- [x] Deployed-route behaviour verified: `node scripts/check-built-route-fallback.mjs` passes (it runs at the end of every docs build, so after every step), plus the headless-Chromium smoke test of 19–26 routes.
- [x] No change to the published package contents (`npm run check:package` passes inside every `check:all`; `src/` untouched).

## Shared gates

**Docs gate** (see `roadmap/README.md`)
- [x] `npm run check:docs` passes (update the matching `scripts/check-*.mjs` contract in the same PR if a literal it asserts changes).
- [x] `npm run build --workspace=re-flux-docs` passes.
