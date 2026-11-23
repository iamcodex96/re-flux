# CHORE-011 — Decide and, if approved, adopt `@re-code/basics` for duplicated helpers

| Category | Impact | Risk | Effort | Priority score | Phase | Depends on |
|---|---|---|---|---|---|---|
| Dependencies / Refactor | 2 | 2 | 3 | **12** | 4 | [REFACTOR-003](./REFACTOR-003-unify-value-parsing.md), [UNIT-008](./UNIT-008-coverage-config-and-thresholds.md), [CHORE-007](./CHORE-007-library-toolchain-updates.md) |

Priority = (Impact + Risk) × (6 − Effort). Back to the [roadmap](../roadmap.md).

## Problem

re;Flux re-implements several tiny helpers that its sibling package `@re-code/basics` already provides (small, strict, zero-dependency, tree-shakable, per-function subpath exports). Adopting it would remove duplicates, but it would also turn the library's runtime surface (today: only the `rxjs` peer dependency) into "rxjs + basics". That is a packaging decision, so this item is **decision first, code second**.

## Evidence

- Local sibling package: `../re-basics` (`@re-code/basics` **0.1.0**, `sideEffects: false`, ESM + CJS, Node ≥18, "No production runtime dependencies"; also resolvable on npm — `npm view @re-code/basics version` → `0.1.0`). Per-function subpaths such as `@re-code/basics/number/lerp`, `…/number/clamp`, `…/type/isPlainObject` exist (`package.json` `exports`: `./number/*`, `./type/*`).
- `@re-code/basics` is **not referenced anywhere in this repository** today (no `package.json`, source, docs or lockfile hit).
- Real overlaps found:

| re;Flux code | `@re-code/basics` equivalent | Same behaviour? |
|---|---|---|
| `src/utils/math.ts:24` `lerp` (public, exported from `src/index.ts`) | `number/lerp` | **Identical** formula `start + (end - start) * amount` |
| `src/utils/math.ts:17` `clamp(value, min = 0, max = 1)` (public) | `number/clamp(value, minimum, maximum)` | **No**: flux accepts bounds in either order and has defaults; basics throws `RangeError` if `minimum > maximum` and has no defaults |
| Private clamp copies: `src/values/Keyframes.ts:229`, `src/operators/adaptiveTween.ts:217`, `src/operators/gestures.ts:518` (+ `clampVelocity` :514), `src/adapters/dom/draggable.ts:312`, `src/adapters/dom/scrollTrigger.ts:357` (`clamp01`) | `number/clamp` | Only if the bounds are always ordered (must be checked per call site) |
| `src/values/interpolate.ts:138` `isPlainRecord` | `type/isPlainObject` | **Same logic** (`Object.prototype` or `null` prototype) |
| `benchmarks/benchmark-utils.mjs:37` `median`; `apps/docs/src/views/BrowserBenchmarks.vue:236` `median` | `number/median` (and `number/mean`) | **No** for empty input: flux returns `0` / `null`, basics returns `NaN` |
| `src/values/interpolate.ts:133` `clampChannel`, `src/adapters/dom/cssInterpolation.ts:72` `clampCssChannel` | `number/clamp(v, 0, 255)` | Yes, but each also rounds differently around the call (see REFACTOR-003) |

- Not covered by basics (so no overlap): `wrap`, `snap`, `mapRange`, `distribute`, `interpolateRange`, vector math, easings, `stagger`.
- Constraints in this repo that any runtime dependency must respect: `package.json` `peerDependencies` is only `rxjs`; `scripts/check-tree-shaking.mjs` forbids cross-module leakage per entry point (e.g. the `steering` and `flow-field` entries must not pull `dist/core/` or `dist/values/`); `scripts/check-package-consumer.mjs` validates the installed package; the docs install command is derived in `apps/docs/src/utils/packageInstall.ts`.
- The overlap is small: roughly 10 call sites and fewer than 60 lines of duplicated code. The full inventory — including generic helpers that basics does *not* have yet — is in [`basics-candidates.md`](./basics-candidates.md); moving those is tracked in [CHORE-012](./CHORE-012-upstream-generic-helpers-to-basics.md).

## Status

**Done 2026-11-23** on branch `claude/chores-00a6db` (not merged, not pushed) — **decision B: dev-only use.** `@re-code/basics` is not a dependency of the published package; `dist/` is unchanged apart from one new internal declaration (`utils/optionNumbers.d.ts`, from the CHORE-012 B3 dedupe), `peerDependencies` is still only `rxjs`, and the package has no `dependencies`. Basics is used by the benchmark tooling and the docs app only.

### Decision record (ADR)

**Context.** The owner approved adopting `@re-code/basics` (0.2.0 is on npm, `latest`) provided measurement supports it. The expected win is removing duplicated helpers; the expected cost is turning the runtime surface from "rxjs peer" into "rxjs + basics".

**What was measured.** A full option-C prototype (kept out of the repository, script in the shared notes folder: `chores/adopt-prototype.py`) swapped every helper whose contract is identical or whose difference is harmless: `lerp`, `isPlainRecord`→`isPlainObject`, `wrap`→`wrapRange`, `mapRange`, `snap`, `random`→`randomBetween`, `formatNumber`→`formatDecimal(value, 5)`, the ordered-bounds clamp copies (`Keyframes`, `adaptiveTween`, `draggable`, `scrollTrigger`, the 0–255 channel clamp and the alpha clamp), `positive`/`nonNegative`→`positiveOr`/`nonNegativeOr`, `isIterable`, `splitGraphemes`. Imports were per-function subpaths only. It removes 72 lines and adds 32. Built next to an untouched copy of `HEAD` in two temporary worktrees outside the repository (esbuild 0.28.2, ESM, minified, `rxjs` external, Node 24.15.0):

| Entry | Before (min) | After, Basics external (min) | After, Basics bundled (min) | Δ bundled | gzip before → after bundled |
|---|---:|---:|---:|---:|---:|
| `.` | 67,963 | 67,686 | 68,417 | +454 | 19,689 → 19,889 (+200) |
| `./core` | 31,558 | 31,558 | 31,558 | +0 | 8,655 → 8,655 (+0) |
| `./values` | 26,008 | 26,023 | 26,226 | +218 | 7,996 → 8,088 (+92) |
| `./physics` | 11,136 | 11,131 | 11,142 | +6 | 3,333 → 3,338 (+5) |
| `./steering` | 5,231 | 5,231 | 5,231 | +0 | 1,736 → 1,736 (+0) |
| `./flow-field` | 2,584 | 2,584 | 2,584 | +0 | 1,011 → 1,011 (+0) |
| `./operators` | 25,254 | 25,256 | 25,197 | −57 | 7,994 → 8,020 (+26) |
| `./utils` | 7,625 | 7,332 | 8,039 | +414 | 3,007 → 3,113 (+106) |
| `./dom` | 71,884 | 71,881 | 72,145 | +261 | 21,821 → 21,918 (+97) |
| `./svg` | 11,990 | 12,065 | 12,146 | +156 | 4,669 → 4,734 (+65) |
| `./canvas` | 6,867 | 6,867 | 6,867 | +0 | 2,343 → 2,343 (+0) |
| `./three` | 794 | 794 | 794 | +0 | 479 → 479 (+0) |
| `./effects/canvas` | 1,473 | 1,473 | 1,473 | +0 | 729 → 729 (+0) |

`steering` and `flow-field` use none of these helpers, so they do not change; no entry shrinks once Basics is counted. re;Flux's own bytes shrink by at most 293 (`./utils`), which only helps an application that already ships the same Basics modules.

*Per-frame cost.* Alternating in-process A/B (same Node process, both builds loaded, 30 interleaved rounds of 60,000 operations, three invocations, load average about 24 on 8 cores): `Keyframes.seek` +0.2…+4%, `interpolate()` of strings/colours/objects −6%…+7.5% (median about +0.5%), the thin public wrappers `mapRange` +4…5% and `wrap + snap + lerp` +1.5…2% (an extra cross-module call that V8 does not inline). Engine paths are unchanged within noise; the thin wrappers are slightly slower. Four interleaved separate-process runs of the `interpolate`, `keyframes`, `css-interpolation`, `path-morph`, `adapters` and `animation-load` benchmarks were too noisy to read (pair-to-pair swings of ±50%, the first pair an outlier on most rows) and are not used for the decision; the JSON is in the shared notes folder (`chores/bench1-interleaved-json`).

*Install surface.* `@re-code/basics@0.2.0` unpacks to 1.45 MB in 1,375 files (all functions, CJS and ESM, source maps); a consumer who installs only `rxjs` today would receive it as a second package.

*Contracts that are not the same* (pinned by `tests/utils/basicsContract.test.ts`, which fails if a Basics release changes any of them): `clamp` throws on inverted bounds where re;Flux orders them; `snap` normalises `-0` to `0` where re;Flux keeps `-0`; `interpolateRange` returns `NaN` for a `NaN` input where re;Flux returns the last output, and Basics copies its arrays; `percentile` interpolates (R-7) where the benchmarks use nearest rank, so every reported p50/p95/p99 would change; `median`, `standardDeviation` and `coefficientOfVariation` return `NaN` on empty input (re;Flux reports `0`/`null`); error messages differ. `createDeferred` creates its promise eagerly, which would undo PERF-011's lazy `Completion` promise. `lerp`, `mapRange`, `wrapRange`, `randomBetween`, `formatDecimal(value, 5)` vs `formatNumber`, `isPlainObject` and the ordered `clamp` agree bit for bit (`Object.is`) on 2,400 random inputs including `NaN`, `±Infinity` and `-0`.

**Decision.** Option C is **rejected**: no measured benefit (no entry shrinks, per-frame cost neutral on engine paths and slightly worse on thin wrappers, 40 net lines), small costs (+150–450 bytes in the five entries that use the helpers, +1.45 MB install surface, a 0.x dependency's breaking-change cadence in a published package) and six contracts that are not drop-in. The size criterion of this item (growth no larger than the imported functions) would probably have passed; the reason is that the measurement shows nothing to gain, not that a criterion failed. **Option B is taken:** the published package stays dependency-free except for the `rxjs` peer; `@re-code/basics@~0.2.0` is a `devDependency` of the root (benchmark tooling, contract test) and a `dependency` of the private docs app, where its `median` replaces the local copy. `benchmarks/benchmark-utils.mjs` (`median`, `standardDeviation`, the coefficient of variation in `variability`) and `scripts/lib/browser-bench.mjs` (`median`) delegate to Basics and keep today's `0` / `null` results for empty input; a differential test against the previous implementation on 20,012 arrays (empty, single, ties, random) found 0 mismatches in `median`, `standardDeviation`, `variability`, `summarizeSamples` and the browser-bench `median`. `percentile` stays local (nearest rank; see CHORE-012). Re-examine option C if Aurora or the docs make Basics a dependency every consumer already has, or if a Basics release closes the contract gaps above.

**Upgrade policy.** `~0.2.0`: patch updates only. A 0.x minor bump is deliberate: read its changelog, run `tests/utils/basicsContract.test.ts` and the docs build.

### Evidence for the remaining criteria

`npm ls @re-code/basics` → `0.2.0` (root devDependency, deduped for `re-flux-docs`); the `package-lock.json` diff adds only `node_modules/@re-code/basics` and the two dependency entries; `grep -nE '"(file|link):' package.json apps/docs/package.json` prints nothing. `npm run bench` (run with `BENCH_REPEATS=2 BENCH_WARMUP_ROUNDS=1 BENCH_MICRO_ITERATIONS=2000` before and after) completes and prints the same JSON structure (116 leaf paths both sides; the one extra path after is the data-dependent GC kind `scavenge`). Gates on Node 24.15.0: `lint`, `format:check`, `typecheck`, `typecheck:tests`, `npm test -- --runInBand` 65 suites / **1,609 tests** (+2 suites, +16 tests: `basicsContract`, `optionNumbers`), `check:tree-shaking`, `check:package`, `check:package:consumer`, `check:browser-integration`, `check:unhandled-rejections`, `check:docs` and the docs build all pass.

A pre-existing problem found on the way (not changed here): `npm run lint` fails locally when `dist/` exists, because Biome's type-aware `noFloatingPromises` then resolves `requested.toPromise()` in `scripts/check-unhandled-rejections.mjs:75` through `dist/*.d.ts`; it passes on a clean checkout (and in `check:all`, which lints before building). Remove `dist/` or add `void` there (the script's intent is an unobserved promise).

## Scope

1. **Decision (ADR, in the PR description or `guidelines/`)** — choose one and record why:
   - **A. Do not adopt.** Close the item; document that re;Flux stays dependency-free except `rxjs`, and that the duplicated helpers are intentional.
   - **B. Dev-only use.** Add `@re-code/basics` to `devDependencies` and use `median`/`mean` in `benchmarks/` (and optionally the docs app). The published package is unchanged.
   - **C. Runtime dependency.** Add it to `dependencies` and import from per-function subpaths only (never the package root), replacing: `lerp` (delegate), `isPlainRecord`, the private clamp copies where bounds are provably ordered, and the 0–255 channel clamps. The public `clamp` stays a thin wrapper that orders its bounds and applies defaults before delegating, so its behaviour does not change.
2. If B or C: pin the version range deliberately for a 0.x package (`~0.1.0`) and document the upgrade policy.
3. Never use `file:`/`link:` specifiers for the sibling checkout in a committed `package.json`; local development may use `npm link`.

## Non-goals

- No change to the public API of re;Flux (`clamp`, `lerp`, `interpolate`, … keep their signatures and behaviour).
- No adoption of basics utilities that re;Flux does not currently need.
- No change to `@re-code/basics` itself (any issue found there is filed against that repository).

## Risks

- **Supply-chain and versioning:** a published package that depends on a 0.x package inherits its breaking-change cadence. Mitigation: tilde range, lockfile, upgrade policy.
- **Tree-shaking:** each import adds a module boundary; if `check-tree-shaking` or bundle size regress for the `steering` / `flow-field` entries, the change must be reverted for that entry.
- **Behavioural drift:** `clamp` and `median` differ on edge inputs (see table); a careless swap changes results.
- **Install surface:** consumers who today install only `rxjs` will now receive a second package; docs and the release notes must say so.

## Acceptance criteria

Every box must be checkable by running the named command or inspecting the named file.

- [x] The decision (**B**) and its rationale are written down in the Status section above. The (C)-only boxes are marked n/a.
- [x] **(B or C)** `npm ls @re-code/basics` shows the pinned version; `package-lock.json` changes only add that package; `grep -nE '"(file|link):' package.json` prints nothing.
- [ ] n/a (decision B) — **(C)** `grep -rn "@re-code/basics'" src` shows no root-package import (only `@re-code/basics/<domain>/<name>` subpaths).
- [ ] n/a (decision B) — **(C)** Parity tests (the contract/parity evidence exists anyway as `tests/utils/basicsContract.test.ts`; the clamp/`lerp` checks there pass): `lerp` matches the previous implementation for ≥1000 random triples including `NaN`, `Infinity` and out-of-range progress; `isPlainRecord` replacement agrees on null-prototype objects, class instances, arrays, `Map`, `Date`, and `Object.create(proto)`; public `clamp(5, 10, 0)` still returns `5` and `clamp(2)` still returns `1` (existing `tests/utils` stay green).
- [ ] n/a (decision B) — **(C)** Every replaced private `clamp` call site has a comment or test showing its bounds are ordered; call sites that cannot guarantee this are left unchanged.
- [ ] n/a (decision B; sizes recorded above for the rejected prototype) — **(C)** `npm run check:tree-shaking` passes and a new assertion confirms the `steering` and `flow-field` entry bundles (esbuild, minified, `--external:rxjs`) contain at most the basics modules they import directly. Minified size of each entry before/after is recorded in the PR; no entry grows by more than the size of the imported functions.
- [x] **(B)** The benchmark scripts keep printing identical JSON schemas; for the empty-input case, the call sites keep today's results (`0` / `null`) despite basics returning `NaN`. `npm run bench` still completes.
- [ ] n/a (decision B; both pass and the package has no dependency) — **(C)** `npm run check:package` and `npm run check:package:consumer` pass with the dependency present, and the consumer check installs the packed tarball into a clean directory and imports `@re-code/flux` and `@re-code/flux/steering` successfully.
- [x] **(C)** `peerDependencies` is still only `rxjs`; the docs install command (`apps/docs/src/utils/packageInstall.ts`) and `README.md` remain correct (`npm run check:docs-release-metadata` and `npm run check:docs` pass).
- [x] `CHANGELOG.md` *Unreleased* records the decision (and, for C, the new runtime dependency under "Changed").

## Shared gates

**Code gate** (see `roadmap/README.md`)
- [x] `npm run typecheck` and `npm run typecheck:tests` pass.
- [x] `npm test -- --runInBand` passes (1,609 tests; record the test count; it must not decrease unless tests are intentionally replaced).
- [x] `npm run check:tree-shaking`, `npm run check:package` and `npm run check:package:consumer` pass.
- [x] No change to public `.d.ts` output (one new internal declaration, `utils/optionNumbers.d.ts`) unless intended; any intended change is recorded in `CHANGELOG.md` under Unreleased.

**Docs gate** (see `roadmap/README.md`)
- [x] `npm run check:docs` passes (update the matching `scripts/check-*.mjs` contract in the same PR if a literal it asserts changes).
- [x] `npm run build --workspace=re-flux-docs` passes.
