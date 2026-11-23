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

## Status

**Spike done 2026-11-23 — recommendation: NO-GO for TypeScript 7 today, GO for TypeScript 5.9.3 as a zero-change stepping stone (owner's decision to take it); no code or dependency change landed from this item.** Everything was run in a throwaway worktree outside the repository (Node 24.15.0, darwin arm64, 8 cores, load average 6–10 — a quiet machine, timings are the median of three runs); the repository's `typescript` stays `~5.7.2`. TypeScript 7.0.2 is on npm (`latest`, native port: `typescript@7` has no `main`, exposes only `./lib/version.cjs` and `./unstable/*`), 6.0.3 is `6.0.x`, 5.9.3 is the last 5.x.

### Results

| | 5.7.3 (today) | 5.9.3 | 6.0.3 | 7.0.2 |
|---|---|---|---|---|
| `npm run typecheck` (`tsc --noEmit`) | 1.2 s | 1.2 s, no errors | 1.1 s; **2 errors** (TS2591, see below) | 0.33 s; same 2 errors |
| `npm run typecheck:tests` | 2.0 s | 2.0 s, none | 1.9 s, none | 0.45 s, none |
| `npm run build:lib` | 1.2 s | 1.6 s | 1.2 s | 0.26 s |
| `dist/**/*.d.ts` and `dist/**/*.js` vs 5.7.3 | — | **byte-identical** (63 + 63 files) | byte-identical (after the `types` fix) | byte-identical (after the `types` fix) |
| `npm test -- --runInBand` (ts-jest, 65 suites / 1,609 tests) | 33.3 s | 27.1 s, all pass | 22.8 s, all pass | **cannot run** with `typescript@7` (see below); passes (1,609) only when ts-jest loads a TS 6 JavaScript API |
| docs `vue-tsc --noEmit -p tsconfig.app.json` | 4.4 s (vue-tsc 2.2.12) | 4.1 s (vue-tsc 2.2.12 and 3.3.14) | **fails**: TS5101 `baseUrl` deprecated (both vue-tsc 2.2.12 and 3.3.14) | **fails**: vue-tsc 3.3.14 throws `ERR_PACKAGE_PATH_NOT_EXPORTED: './lib/tsc'` |

The native compiler is 3.5–4.5× faster for the library's own typecheck and build, and its emitted JavaScript and declarations are identical to 5.7.3's: no consumer-visible `.d.ts` change. `exactOptionalPropertyTypes` and `noUncheckedIndexedAccess` produced no new diagnostics on any version.

### Error classes

1. **TS2591 `Cannot find name 'process'`** (`src/utils/easings.ts:115`, TypeScript 6 and 7): from TS 6 on, `types` defaults to `[]` instead of "every `@types/*` package", so the root `tsconfig.json` no longer sees `@types/node`. Adding `"types": ["node"]` fixes it (also valid on 5.x; `tsconfig.test.json` already has it). This is the only code/config change `tsc` needs.
2. **TS5101 `Option 'baseUrl' is deprecated`** (TypeScript 6, docs only): `apps/docs/tsconfig.app.json` uses `baseUrl` with `paths`; TS 6 wants `"ignoreDeprecations": "6.0"` or dropping `baseUrl` (TS 7 removes it).

### Blocking dependencies for TypeScript 7

- **`ts-jest` 29.4.15**: peer range `typescript >=4.3 <7`; with `typescript@7` installed it throws `The TypeScript compiler "typescript" (version 7.0.2) does not expose the JavaScript compiler API required by ts-jest. To use TypeScript 7 for project type-checking, install it as "@typescript/native" and alias "@typescript/typescript6" as "typescript" for ts-jest.` `@typescript/native` is **not on the npm registry** (404); `@typescript/typescript6@6.0.2` is. The aliased layout (`typescript` → `npm:@typescript/typescript6@6.0.2`, TS 7 installed under another name such as `typescript-native`) ran the whole suite green (65 suites, 1,609 tests, 29.9 s), but tests then compile and type-check with the TS 6 API, not TS 7, and the `tsc` bin-name collision in that layout was not resolved here, so it is a workaround, not a supported setup.
- **`vue-tsc` 3.3.14** (latest; peer `typescript >=5.0.0`): needs the JavaScript API and fails on TS 7 as above, so the docs typecheck cannot move to 7. A split (TS 7 for the library, 5.9/6 for the docs workspace) would need two TypeScript versions in one lockfile.
- Not tested because they do not exist here: no `typescript-eslint`, no `api-extractor`; Biome does not use the TypeScript compiler.

### Recommendation and conditions to re-open

No-go for 7 until `ts-jest` supports it (peer range includes 7 and the supported way to run tests) **and** `vue-tsc` runs on it. Re-dated: re-check on **2026-12-23** or when `npm view ts-jest peerDependencies.typescript` stops saying `<7`. In the meantime TypeScript 5.9.3 is a zero-change bump (all gates identical, tests pass, declarations byte-identical) if the owner wants one; going to 6.0.x additionally needs the two config changes above. The same spike script runs in minutes: install the version, `tsc --noEmit`, `tsc -p tsconfig.test.json`, `npm run build:lib`, diff `dist/` against a 5.7.3 build.

## Scope

- Time-boxed branch: bump TS, record every error class, decide go/no-go and whether to go via 5.9/6.x first.

## Non-goals

- No code changes beyond what is required to compile.

## Risks

- Emitted declaration differences are consumer-visible.

## Acceptance criteria

Every box must be checkable by running the named command or inspecting the named file.

- [x] A written go/no-go recommendation is added to this file listing each blocking dependency and error class.
- [ ] n/a (no-go for 7). If go: `npm run typecheck`, `typecheck:tests`, `check:all` pass, and `diff -r` of `dist/**/*.d.ts` before/after shows only intended differences.
- [x] If no-go: the blocking issues are listed with their exact messages and peer ranges (there are no issue-tracker links: the blockers are package peer ranges and a thrown error, not tracked issues) and the item is re-dated (2026-12-23).

## Shared gates

**Code gate** (see `roadmap/README.md`)
- [x] `npm run typecheck` and `npm run typecheck:tests` pass (unchanged: nothing landed; also verified on 5.9.3, 6.0.3 and 7.0.2 in the throwaway worktree, see above).
- [x] `npm test -- --runInBand` passes (1,609 tests on the unchanged repository; record the test count; it must not decrease unless tests are intentionally replaced).
- [x] `npm run check:tree-shaking`, `npm run check:package` and `npm run check:package:consumer` pass (nothing landed; the emitted `dist/` is byte-identical on every version tried).
- [x] No change to public `.d.ts` output (byte-identical on every version tried) unless intended; any intended change is recorded in `CHANGELOG.md` under Unreleased.
