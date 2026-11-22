# UNIT-008 — Fix coverage scope and add regression thresholds

| Category | Impact | Risk | Effort | Priority score | Phase | Depends on |
|---|---|---|---|---|---|---|
| Tests | 2 | 3 | 1 | **25** | 0 | — |

Priority = (Impact + Risk) × (6 − Effort). Back to the [roadmap](../roadmap.md).

## Status

**Done locally 2026-11-22**, one criterion pending the first CI run (left unticked). `jest.config.cjs` now collects `src/flowField.ts` (90.2% statements) and no longer lists the types-only `src/types.ts`. Measured baseline after UNIT-009/UNIT-010: global 90.23% statements, 81.24% branches, 94.45% functions, 93.73% lines; `src/core` 92.45 / 84.61 / 91.47 / 95.66. Floors set below that: global 88 / 78 / 92 / 91, `./src/core/` 90 / 82 / 88 / 93. Removing `tests/core/Timeline.test.ts` and `tests/core/Timeline.contract.test.ts` drops `src/core` to 75% statements and fails `npm run test:coverage` on the `./src/core/` floor (verified, files restored). `.github/workflows/ci.yml` runs coverage on the Node 24 leg and uploads `coverage/lcov.info`.

## Problem

Coverage omits a source file with tests and sets no minimum, so coverage can silently erode.

## Evidence

- `jest.config.cjs` `collectCoverageFrom` lists `src/steering.ts` but not `src/flowField.ts`, although `tests/flowField/flowField.test.ts` exists; `flowField` is absent from the coverage table.
- `collectCoverageFrom` includes `src/types.ts`, which is types-only.
- No `coverageThreshold` is configured. Current totals (this audit's run, 31 suites, 226 tests): statements 84.78%, branches 75.82%, functions 84.04%, lines 89.6%.
- CI (`.github/workflows/ci.yml`) never runs `--coverage`.

## Scope

- Add `src/flowField.ts`, `src/index.ts` exclusions as appropriate; set `coverageThreshold.global` slightly below the new measured totals and per-directory floors for `src/core/**`.
- Run coverage in CI on one matrix leg and upload `lcov`.

## Non-goals

- Thresholds are floors to prevent erosion, not targets to chase.

## Risks

- Thresholds that are too tight will flake; set them below measured values.

## Acceptance criteria

Every box must be checkable by running the named command or inspecting the named file.

- [x] `npm run test:coverage` lists `flowField.ts` and exits 0.
- [x] Deleting `tests/core/Timeline.test.ts` and `tests/core/Timeline.contract.test.ts` locally makes `npm run test:coverage` fail on the `src/core/**` floor (state the floor in the PR).
- [ ] CI runs coverage on Node 24 and uploads the report as an artifact. *(Workflow updated; confirm on the first CI run after this is pushed.)*
- [x] The new thresholds and their measured baseline are written into this file (see Status).

## Shared gates

**Code gate** (see `roadmap/README.md`)
- [x] `npm run typecheck` and `npm run typecheck:tests` pass.
- [x] `npm test -- --runInBand` passes (record the test count; it must not decrease unless tests are intentionally replaced).
- [x] `npm run check:tree-shaking`, `npm run check:package` and `npm run check:package:consumer` pass.
- [x] No change to public `.d.ts` output unless intended; any intended change is recorded in `CHANGELOG.md` under Unreleased.
