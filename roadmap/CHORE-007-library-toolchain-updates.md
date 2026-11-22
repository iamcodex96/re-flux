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

## Scope

- Bump ts-jest and playwright; bump esbuild one step at a time if the bundling scripts still pass; keep `@types/node` on 22.

## Non-goals

- No TypeScript major (CHORE-009).

## Risks

- esbuild 0.x minor versions can change output formatting that `check-tree-shaking` depends on.

## Acceptance criteria

Every box must be checkable by running the named command or inspecting the named file.

- [ ] `npm outdated` no longer lists ts-jest or playwright; esbuild bump (if taken) is justified in the PR.
- [ ] `npm run check:all` passes locally on Node 22 and 24.
- [ ] `package-lock.json` diff contains only the intended packages.

## Shared gates

**Code gate** (see `roadmap/README.md`)
- [ ] `npm run typecheck` and `npm run typecheck:tests` pass.
- [ ] `npm test -- --runInBand` passes (record the test count; it must not decrease unless tests are intentionally replaced).
- [ ] `npm run check:tree-shaking`, `npm run check:package` and `npm run check:package:consumer` pass.
- [ ] No change to public `.d.ts` output unless intended; any intended change is recorded in `CHANGELOG.md` under Unreleased.
