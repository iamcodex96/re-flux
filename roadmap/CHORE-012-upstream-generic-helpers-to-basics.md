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

- [ ] Written approval to migrate utilities from re;Flux is recorded (link in this file), as required by `../re-basics/CONTRIBUTING.md`.
- [ ] For each utility actually moved, the basics repository contains: one module under its domain folder, TSDoc covering nullish/empty/error/mutation behaviour, Given/When/Then tests, and `npm run check:all` green in that repository (≥95% statements/branches/functions/lines for the module).
- [ ] No moved utility keeps a Lodash-colliding name (`wrap`, `random`, `pipe`): `grep -rnE "export function (wrap|random|pipe)\b" ../re-basics/src` prints nothing.
- [ ] **Before** swapping any re;Flux implementation, a characterization test exists in `tests/utils/` for each replaced function (including `NaN`, `±Infinity`, empty input, swapped bounds) and passes on `main`.
- [ ] After the swap, those tests pass unchanged, and `diff -r` of `dist/**/*.d.ts` before/after is empty (public `wrap`, `snap`, `mapRange`, `random`, `pipe`, `interpolateRange` keep their signatures).
- [ ] `benchmarks/benchmark-utils.mjs` and `apps/docs/src/views/BrowserBenchmarks.vue` contain no local `percentile`/`median` implementation (`grep -nE "function (percentile|median)" benchmarks apps/docs/src` prints nothing), and BENCH-007's coefficient-of-variation comes from the basics function.
- [ ] `grep -rnE "function (positive|nonNegative)\b" src` shows a single definition (B3 deduped), independent of whether basics is adopted.
- [ ] `grep -rnE '"(file|link):' package.json` prints nothing, and the pinned basics version in `package.json` is a published release containing every function consumed.
- [ ] `npm run check:tree-shaking`, `npm run check:package:consumer` and `npm run check:docs` pass; the `steering` and `flow-field` entry bundles do not grow beyond the size of the functions they import (record before/after).
- [ ] `CHANGELOG.md` *Unreleased* lists what moved and what stayed.

## Shared gates

**Code gate** (see `roadmap/README.md`)
- [ ] `npm run typecheck` and `npm run typecheck:tests` pass.
- [ ] `npm test -- --runInBand` passes (record the test count; it must not decrease unless tests are intentionally replaced).
- [ ] `npm run check:tree-shaking`, `npm run check:package` and `npm run check:package:consumer` pass.
- [ ] No change to public `.d.ts` output unless intended; any intended change is recorded in `CHANGELOG.md` under Unreleased.
