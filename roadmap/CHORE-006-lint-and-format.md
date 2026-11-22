# CHORE-006 — Add a linter/formatter and remove leftover whitespace-only lines

| Category | Impact | Risk | Effort | Priority score | Phase | Depends on |
|---|---|---|---|---|---|---|
| Tooling | 3 | 2 | 2 | **20** | 3 | — |

Priority = (Impact + Risk) × (6 − Effort). Back to the [roadmap](../roadmap.md).

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

- [ ] `npm run lint` exists, passes on `main`, and runs in `.github/workflows/ci.yml`.
- [ ] `grep -rnE '^[ ]+$' src | wc -l` prints 0.
- [ ] The formatting-only commit changes no behaviour: `npx esbuild <entry> --bundle --minify --format=esm --external:rxjs` output is byte-identical before/after for each package entry point (`src/index.ts`, `core`, `values`, `physics`, `steering`, `flowField`, `operators`, `utils`, adapters), and the `.d.ts` diff is empty. (Raw `tsc` JS output is not expected to be identical because it preserves source layout.)
- [ ] `CONTRIBUTING.md` documents `npm run lint` and the formatter.

## Shared gates

**Code gate** (see `roadmap/README.md`)
- [ ] `npm run typecheck` and `npm run typecheck:tests` pass.
- [ ] `npm test -- --runInBand` passes (record the test count; it must not decrease unless tests are intentionally replaced).
- [ ] `npm run check:tree-shaking`, `npm run check:package` and `npm run check:package:consumer` pass.
- [ ] No change to public `.d.ts` output unless intended; any intended change is recorded in `CHANGELOG.md` under Unreleased.
