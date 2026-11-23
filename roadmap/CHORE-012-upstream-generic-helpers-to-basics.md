# CHORE-012 — Upstream generic helpers into `@re-code/basics`, then consume them

| Category | Impact | Risk | Effort | Priority score | Phase | Depends on |
|---|---|---|---|---|---|---|
| Dependencies / Refactor | 2 | 1 | 3 | **9** | 4 | [CHORE-011](./CHORE-011-adopt-re-code-basics.md), [REFACTOR-003](./REFACTOR-003-unify-value-parsing.md), [BENCH-007](./BENCH-007-variance-and-gc-control.md) |

Priority = (Impact + Risk) × (6 − Effort). Back to the [roadmap](../roadmap.md). The candidate list lives in [`basics-candidates.md`](./basics-candidates.md).

## Problem

re;Flux contains generic, animation-free helpers (`wrap`, `mapRange`, `snap`, `random`, `percentile`, grapheme splitting, an iterable type guard, left-to-right composition, …) that do not belong to an animation engine and are not in `@re-code/basics`. Leaving them here means duplicated statistics code in the benchmarks and docs app, and a public API surface (`wrap`, `random`, `pipe`, …) that the engine has to maintain.

## Evidence

- Strong candidates A1–A9 and medium candidates B1–B4 in [`basics-candidates.md`](./basics-candidates.md), each with file and line.
- Duplicate statistics helpers: `percentile` in `benchmarks/benchmark-utils.mjs:47` and `apps/docs/src/views/BrowserBenchmarks.vue:246`; `median` in both files; BENCH-007 needs a standard deviation / coefficient of variation that does not exist anywhere yet.
- Identical copies: `positive`/`nonNegative` in `src/physics/spring.ts:91,95` and `src/operators/gestures.ts:522,526`.
- `@re-code/basics` rules (`../re-basics/CONTRIBUTING.md`): public contract agreed before implementation; one utility per module; TSDoc; Given/When/Then tests; ≥95% coverage; Lodash-contract naming; **"Do not … perform migrations from `re;Flux` without explicit approval."**
- Naming collisions with Lodash if copied verbatim: `wrap` (function wrapper), `random` (different signature), `pipe` vs `flow`.

## Status

**Partly done 2026-11-23** on branch `claude/chores-00a6db` (not merged, not pushed). Steps 1–3 (contracts, implementation, release) were done in the `re-basics` repository by other sessions: `@re-code/basics@0.2.0` is published on npm (`latest`) and contains `wrapRange`, `mapRange`, `inverseLerp`, `interpolateRange`, `snap`, `randomBetween`, `percentile`, `standardDeviation`, `coefficientOfVariation`, `formatDecimal`, `isIterable`, `splitGraphemes`, `positiveOr`, `nonNegativeOr`, `finiteOr`, `createDeferred`, `flow` (verified in the installed package, including the per-function subpaths; `positiveOr`, `nonNegativeOr`, `finiteOr` are reachable as `@re-code/basics/number/<name>` through the `./number/*` wildcard, and `createDeferred` as `@re-code/basics/function/createDeferred`). This session did **not** touch that repository.

**What was consumed in re;Flux** (dev-only, CHORE-011 decision B): `median`, `standardDeviation` and the coefficient of variation behind BENCH-007's `variability()` in `benchmarks/benchmark-utils.mjs`, `median` in `scripts/lib/browser-bench.mjs` and `apps/docs/src/benchmarks/statistics.ts`, each with the old `0` / `null` empty-input results kept at the call site and checked against the previous implementation on 20,012 arrays (0 mismatches). **What was done locally regardless of the Basics decision:** B3 — `positive` / `nonNegative` now live once in `src/utils/optionNumbers.ts` (internal) and `src/physics/spring.ts` and `src/operators/gestures.ts` import them; unit-tested in `tests/utils/optionNumbers.test.ts`.

**What was not consumed, and why.** The swaps of `wrap`→`wrapRange`, `snap`, `mapRange`, `random`→`randomBetween`, `lerp`, `formatNumber`→`formatDecimal`, `isPlainRecord`, `isIterable`, `splitGraphemes` and the clamp copies in the published package are skipped **because of the CHORE-011 decision** (no runtime dependency; measurements and rationale there), not because Basics lacks them. Separately, some contracts are not drop-in even if the decision is reopened (all pinned by `tests/utils/basicsContract.test.ts`):

- `percentile`: the benchmarks (`benchmarks/benchmark-utils.mjs`, `apps/docs/src/benchmarks/statistics.ts`) use **nearest rank**; Basics 0.2.0 implements R-7 interpolation. Swapping would shift every reported p50/p95/p99 and break comparability with saved baselines. **Missing from Basics: a nearest-rank percentile** (or an option for it). Left local, not improvised.
- `interpolateRange`: Basics returns `NaN` for a `NaN` input and copies its arrays; re;Flux returns the last output and keeps references.
- `snap`: Basics normalises `-0` to `0`; re;Flux keeps `-0`.
- `clamp`: Basics throws on inverted bounds; the public re;Flux `clamp` orders them.
- `createDeferred`: creates its promise eagerly; `Completion` creates it lazily on first read (PERF-011 depends on that), so it cannot be a thin wrapper.
- Error messages differ for `wrap`, `snap`, `random`.

## Scope

1. **Approval and contracts first.** Record explicit approval to migrate from re;Flux (basics' own rule), then write a one-paragraph contract per utility (inputs, `NaN`/empty/nullish behaviour, errors, mutation) in the basics repository.
2. **Implement in basics (separate repository, separate PRs):** order = A5, A6 (statistics, needed by BENCH-007), A1–A4, A7, A8, A9; B-items only if their conditions in `basics-candidates.md` are met.
3. **Release** a basics version containing them.
4. **Consume in re;Flux** (only if CHORE-011 chose option B or C): replace local copies with subpath imports; for public re;Flux exports (`wrap`, `snap`, `mapRange`, `random`, `pipe`, `interpolateRange`) keep the exported names and signatures as thin wrappers over the basics functions, so there is **no breaking change**.
5. Do the local dedupes that need no cross-package decision regardless of the outcome: B3 (`positive`/`nonNegative`) into one internal module.

## Non-goals

- No new `vector` domain in basics (recommendation in `basics-candidates.md` section D: do not move).
- No move of easings, stagger, timeline composition, adapters, operators or RxJS helpers.
- No change to the public API of re;Flux.

## Risks

- **Contract drift:** behaviour of a helper changes during the move (empty input, `NaN`, thrown error types). Mitigation: characterization tests in re;Flux are written before the swap and must stay green unchanged.
- **Release coupling:** re;Flux cannot consume a function until basics publishes it; a `file:`/`link:` specifier must never be committed.
- **Scope creep in basics:** it curates "everyday" utilities; animation-flavoured helpers (`mapRange`, `snap`) may be declined — then they simply stay in re;Flux.

## Acceptance criteria

Every box must be checkable by running the named command or inspecting the named file.

- [x] Written approval to migrate utilities from re;Flux is recorded: the owner's approval to adopt `@re-code/basics` in re;Flux was relayed in the task brief of this session (2026-11-23); there is no separate document to link.
- [ ] *Not verified here (separate repository, not touched by this session; the published 0.2.0 package contains the modules).* For each utility actually moved, the basics repository contains: one module under its domain folder, TSDoc covering nullish/empty/error/mutation behaviour, Given/When/Then tests, and `npm run check:all` green in that repository (≥95% statements/branches/functions/lines for the module).
- [x] No moved utility keeps a Lodash-colliding name (`wrap`, `random`, `pipe`): `grep -rnE "export function (wrap|random|pipe)\b" ../re-basics/src` prints nothing.
- [ ] n/a: no re;Flux implementation was swapped (CHORE-011 decision B). The characterization/parity test `tests/utils/basicsContract.test.ts` (including `NaN`, `±Infinity`, `-0`, inverted bounds) exists for `lerp`, `mapRange`, `wrap`, `snap`, `random`, `clamp`, `formatNumber`, `interpolateRange` and the statistics. **Before** swapping any re;Flux implementation, a characterization test exists in `tests/utils/` for each replaced function (including `NaN`, `±Infinity`, empty input, swapped bounds) and passes on `main`.
- [ ] n/a (no swap). `diff -r` of `dist/**/*.d.ts` before/after is empty except for the new internal `utils/optionNumbers.d.ts`. After the swap, those tests pass unchanged, and `diff -r` of `dist/**/*.d.ts` before/after is empty (public `wrap`, `snap`, `mapRange`, `random`, `pipe`, `interpolateRange` keep their signatures).
- [ ] **Partly.** `median` and BENCH-007's standard deviation / coefficient of variation come from Basics, but `grep -nE "function (percentile|median)" benchmarks apps/docs/src` still prints four lines: the `median` wrappers (they keep the `0` / `null` empty-input results) and the two nearest-rank `percentile` copies, which cannot move until Basics has a nearest-rank percentile (see Status). `BrowserBenchmarks.vue` itself has no statistics code since DOCS-004. The original wording, for reference: `benchmarks/benchmark-utils.mjs` and `apps/docs/src/views/BrowserBenchmarks.vue` contain no local `percentile`/`median` implementation (`grep -nE "function (percentile|median)" benchmarks apps/docs/src` prints nothing), and BENCH-007's coefficient-of-variation comes from the basics function.
- [x] `grep -rnE "function (positive|nonNegative)\b" src` shows a single definition (B3 deduped), independent of whether basics is adopted.
- [x] `grep -rnE '"(file|link):' package.json` prints nothing, and the pinned basics version in `package.json` is a published release containing every function consumed.
- [x] `npm run check:tree-shaking`, `npm run check:package:consumer` and `npm run check:docs` pass; the `steering` and `flow-field` entry bundles do not grow beyond the size of the functions they import (record before/after). *They import none: 5,231 and 2,584 bytes minified before and after.*
- [x] `CHANGELOG.md` *Unreleased* lists what moved and what stayed.

## Shared gates

**Code gate** (see `roadmap/README.md`)
- [x] `npm run typecheck` and `npm run typecheck:tests` pass.
- [x] `npm test -- --runInBand` passes (1,609 tests; record the test count; it must not decrease unless tests are intentionally replaced).
- [x] `npm run check:tree-shaking`, `npm run check:package` and `npm run check:package:consumer` pass.
- [x] No change to public `.d.ts` output unless intended; any intended change is recorded in `CHANGELOG.md` under Unreleased.
