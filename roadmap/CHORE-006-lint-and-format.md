# CHORE-006 — Add a linter/formatter and remove leftover whitespace-only lines

| Category | Impact | Risk | Effort | Priority score | Phase | Depends on |
|---|---|---|---|---|---|---|
| Tooling | 3 | 2 | 2 | **20** | 3 | — |

Priority = (Impact + Risk) × (6 − Effort). Back to the [roadmap](../roadmap.md).

## Status

**Done 2026-11-23** on branch `claude/phase-3-9822a6`, as two commits: a formatting-only commit (`style: CHORE-006 …`) and a tooling commit (`chore(tooling): CHORE-006 …`: lint rules, CI, docs, five `import type` fixes).

### ADR — Biome (not ESLint + Prettier)

- **Decision:** one tool, [Biome](https://biomejs.dev) 2.6.8, pinned exactly in `devDependencies`, config in `biome.json`. Formatter: 2 spaces, single quotes, semicolons, trailing commas, line width 120. Linter rules enabled (preset `none` plus these only): `correctness/noUnusedVariables`, `correctness/noUnusedImports`, `style/useImportType`, `nursery/noFloatingPromises`. Scope: `src/`, `tests/`, `scripts/`, `benchmarks/`, `jest.config.cjs`; `apps/docs` is excluded on purpose (DOCS-004 and the frontend redesign will rewrite it).
- **Why Biome:** one dependency (a native binary) replaces ESLint + typescript-eslint + Prettier and their ~100 transitive packages; format + lint of the whole repo takes about 0.2 s; one config file; the formatter and linter cannot disagree.
- **Line width 120:** the existing source has no consistent width (median file maximum is 123 columns, 90th percentile 158). Width 100 produced 8,516 added lines, 120 about 5,950; 120 is the closest to the existing style.
- **Known weakness:** `noFloatingPromises` is still in Biome's `nursery` group in 2.6.8 and uses Biome's own type inference, not `tsc`, so it is less complete than `@typescript-eslint/no-floating-promises`. A probe file confirmed it flags a bare `async` call, `Promise.resolve()` and `PromiseLike` values from `Animation`/`Timeline` (our thenables) and accepts `void`, `.catch(handler)` and `await`; the repository had zero findings. Re-evaluate (or switch the rule to `suspicious`) when Biome promotes it; if a miss is found in practice, add typescript-eslint for that single rule.
- **Rejected:** ESLint + Prettier (more setup and dependencies, formatter/linter integration, slower; its one advantage is the complete type-aware `no-floating-promises`).
- **Not enabled** (no stylistic bikeshedding): Biome's recommended set, import sorting/organizing (`assist` is off).

### Evidence

- Whitespace-only lines: `grep -rnE '^[ ]+$' src | wc -l` → 0 (was 57). No trailing whitespace remains in `src`, `tests`, `scripts`, `benchmarks`.
- Formatting commit changes no behaviour: `esbuild <entry> --bundle --minify --format=esm --external:rxjs --external:three` is byte-identical (SHA-1 compared) before and after for all 14 entry points (`index`, `core`, `values`, `physics`, `steering`, `flowField`, `operators`, `utils`, `types`, `adapters/{dom,svg,canvas,three}`, `effects/canvas`). `.d.ts` output is **not** byte-identical: three declaration files (`core.d.ts`, `index.d.ts`, `utils.d.ts`) differ only by a trailing comma at the end of multi-line `export { … } from` lists, because `tsc` preserves the source layout; no exported name or type changed.
- Gates after the tooling commit: `npm run lint`, `npm run format:check`, typecheck, typecheck:tests pass; `npm test -- --runInBand` 56 suites / 1,534 tests (unchanged); tree-shaking, package and consumer checks pass; `check:docs` and `check:browser-integration` (10 cases) passed after the formatting commit; the five `import type` fixes leave the minified bundles byte-identical.
- The first experiment (`biome format .` over everything, including JSON) was discarded; only `.ts`, `.mjs` and `.cjs` files in the scope above are formatted.

### Left as is

- `apps/docs` (Vue, SCSS) is neither linted nor formatted.
- CI: `npm run lint` and `npm run format:check` run on every matrix leg before the type checks. Not run on a real CI runner from here.
- The mechanical commit means `git blame` for most lines points at it; use `git blame --ignore-rev <sha>` (a `.git-blame-ignore-revs` file is added with that commit's hash).

## Problem

There is no lint or format configuration, and `src/` contains stray whitespace-only lines, so style and common-bug rules are enforced only by `tsc` and review.

## Evidence

- Repo root has no ESLint, Prettier, Biome or `.editorconfig` file and `package.json` has no `lint` script.
- `grep -rnE '^[ ]+$' src | wc -l` → **57** whitespace-only lines, e.g. `src/core/FrameCoordinator.ts:165,185`, `src/core/MotionLifecycleController.ts:83`; they sit between statements where a lint-directive comment would normally be, so they look like remnants of removed directives (a hypothesis — either way a formatter normalizes them).

## Scope

- Pick one tool (Biome or ESLint+Prettier); start with a minimal ruleset (no-floating-promises, no-unused, consistent-type-imports).
- One mechanical formatting commit separate from logic changes; add `lint` to CI.

## Non-goals

- No stylistic bikeshedding; keep existing code style where equivalent.

## Risks

- A big reformat conflicts with every open perf item — land it first, or last, but not in between.

## Acceptance criteria

Every box must be checkable by running the named command or inspecting the named file.

- [x] `npm run lint` exists, passes on `main`, and runs in `.github/workflows/ci.yml`.
- [x] `grep -rnE '^[ ]+$' src | wc -l` prints 0.
- [ ] (partially met — see note) The formatting-only commit changes no behaviour: `npx esbuild <entry> --bundle --minify --format=esm --external:rxjs` output is byte-identical before/after for each package entry point (`src/index.ts`, `core`, `values`, `physics`, `steering`, `flowField`, `operators`, `utils`, adapters), and the `.d.ts` diff is empty (**met for the bundles; the `.d.ts` diff is not empty**: trailing commas in three multi-line re-export lists, see Evidence). (Raw `tsc` JS output is not expected to be identical because it preserves source layout.)
- [x] `CONTRIBUTING.md` documents `npm run lint` and the formatter (`guidelines/CONTRIBUTING.md`, section *Lint and format*; also `guidelines/SETUP.md`).

## Shared gates

**Code gate** (see `roadmap/README.md`)
- [x] `npm run typecheck` and `npm run typecheck:tests` pass.
- [x] `npm test -- --runInBand` passes (record the test count; it must not decrease unless tests are intentionally replaced): 1,534 / 56 suites.
- [x] `npm run check:tree-shaking`, `npm run check:package` and `npm run check:package:consumer` pass.
- [x] No change to public `.d.ts` output unless intended: the only difference is the trailing comma in three re-export lists (declared in the commit message and in Evidence; no exported symbol or type changed, so no CHANGELOG entry beyond the tooling line).
