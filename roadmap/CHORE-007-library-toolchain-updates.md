# CHORE-007 — Update library dev-toolchain patch/minor versions

| Category | Impact | Risk | Effort | Priority score | Phase | Depends on |
|---|---|---|---|---|---|---|
| Dependencies | 2 | 2 | 2 | **16** | 4 | [UNIT-008](./UNIT-008-coverage-config-and-thresholds.md) |

Priority = (Impact + Risk) × (6 − Effort). Back to the [roadmap](../roadmap.md).

## Problem

Dev tools lag; most are low-risk patch/minor bumps.

## Evidence

- `npm outdated` (2026-11-16): `ts-jest` 29.4.14 → 29.4.15, `playwright` 1.64.1 → 1.65.1 (pinned exact), `esbuild` 0.24.2 → 0.28.2 (used by `check-browser-integration` and tree-shaking), `@types/node` 22.20.5 (latest 26.x; stay on 22 to match `engines`).
- `npm audit --omit=dev` → 0 vulnerabilities (runtime surface is only the `rxjs` peer dependency).

## Status

**Done 2026-11-23** (Node 22 half unverified) on branch `claude/chores-00a6db` (not merged, not pushed). Dev-only change; the published package is untouched (`dist/**/*.d.ts` not regenerated differently because `src/` did not change; `npm audit --omit=dev` still reports 0 vulnerabilities).

| Package | Before | After | Note |
|---|---|---|---|
| `ts-jest` | 29.4.14 | **29.4.15** (`^29.4.15`) | Suite unchanged. |
| `esbuild` | 0.24.2 | **0.28.2** (`^0.28.2`) | Taken in one jump instead of four single steps because every consumer (`check-tree-shaking`, `check-browser-integration`, `check-package-consumer`, the benchmark scripts) passed unchanged; no output-format dependency broke. The docs workspace keeps its own nested `esbuild@0.25.12` via Vite 6. |
| `playwright` | 1.64.1 | **1.65.1** (exact pin kept) | Taken after the owner approved the Chromium download: `npx playwright install chromium` fetched Chromium 159 (build 1255, 100.8 MiB headless shell plus Chromium) from Playwright's CDN. `check:browser-integration`, `check:browser-benchmark` and the docs checks pass on it; the old 1248 builds are still in `~/Library/Caches/ms-playwright`. |
| `@types/node` | 22.20.5 | unchanged | Stays on 22 to match `engines`. |

Evidence (Node 24.15.0, load average 50–65 on 8 cores, so timing was not measured): `lint`, `format:check`, `typecheck`, `typecheck:tests` pass; `npm test -- --runInBand` 63 suites / **1593 tests** (same as before); `check:tree-shaking`, `check:package`, `check:package:consumer`, `check:browser-integration`, `check:unhandled-rejections`, `check:docs` and the docs build pass. The `package-lock.json` diff contains only `esbuild` (and its platform binaries, including the new `@esbuild/openharmony-arm64`) and `ts-jest`.

## Scope

- Bump ts-jest and playwright; bump esbuild one step at a time if the bundling scripts still pass; keep `@types/node` on 22.

## Non-goals

- No TypeScript major (CHORE-009).

## Risks

- esbuild 0.x minor versions can change output formatting that `check-tree-shaking` depends on.

## Acceptance criteria

Every box must be checkable by running the named command or inspecting the named file.

- [x] `npm outdated` no longer lists ts-jest or playwright; esbuild bump (if taken) is justified in the PR.
- [ ] `npm run check:all` passes locally on Node 22 and 24. *Node 24.15.0: every `check:all` step passed individually. Node 22 is not installed on this machine, so that half is unverified.*
- [x] `package-lock.json` diff contains only the intended packages.

## Shared gates

**Code gate** (see `roadmap/README.md`)
- [x] `npm run typecheck` and `npm run typecheck:tests` pass.
- [x] `npm test -- --runInBand` passes (1593 tests; record the test count; it must not decrease unless tests are intentionally replaced).
- [x] `npm run check:tree-shaking`, `npm run check:package` and `npm run check:package:consumer` pass.
- [x] No change to public `.d.ts` output (`src/` untouched) unless intended; any intended change is recorded in `CHANGELOG.md` under Unreleased.
