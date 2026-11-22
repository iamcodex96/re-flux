# CHORE-009 — Spike: TypeScript 5.7 → 7

| Category | Impact | Risk | Effort | Priority score | Phase | Depends on |
|---|---|---|---|---|---|---|
| Dependencies | 2 | 2 | 4 | **8** | 4 | [CHORE-007](./CHORE-007-library-toolchain-updates.md), [CHORE-006](./CHORE-006-lint-and-format.md) |

Priority = (Impact + Risk) × (6 − Effort). Back to the [roadmap](../roadmap.md).

## Problem

The toolchain is pinned to `~5.7.2`; a two-major jump affects `ts-jest`, `vue-tsc` and the emitted `.d.ts` files that consumers read.

## Evidence

- `npm outdated`: `typescript` 5.7.3 → 7.0.2 (both root and docs workspaces); `ts-jest` 29.x and `vue-tsc` 2.x declare their own TS peer ranges.
- `tsconfig.json` enables `exactOptionalPropertyTypes` and `noUncheckedIndexedAccess`, which are sensitive to checker changes.

## Scope

- Time-boxed branch: bump TS, record every error class, decide go/no-go and whether to go via 5.9/6.x first.

## Non-goals

- No code changes beyond what is required to compile.

## Risks

- Emitted declaration differences are consumer-visible.

## Acceptance criteria

Every box must be checkable by running the named command or inspecting the named file.

- [ ] A written go/no-go recommendation is added to this file listing each blocking dependency and error class.
- [ ] If go: `npm run typecheck`, `typecheck:tests`, `check:all` pass, and `diff -r` of `dist/**/*.d.ts` before/after shows only intended differences.
- [ ] If no-go: the blocking issues are linked and the item is re-dated.

## Shared gates

**Code gate** (see `roadmap/README.md`)
- [ ] `npm run typecheck` and `npm run typecheck:tests` pass.
- [ ] `npm test -- --runInBand` passes (record the test count; it must not decrease unless tests are intentionally replaced).
- [ ] `npm run check:tree-shaking`, `npm run check:package` and `npm run check:package:consumer` pass.
- [ ] No change to public `.d.ts` output unless intended; any intended change is recorded in `CHANGELOG.md` under Unreleased.
