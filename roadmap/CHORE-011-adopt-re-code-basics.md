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

- [ ] The decision (A, B or C) and its rationale are written down and linked from this file. If A, the remaining boxes are marked "n/a" and the item is closed.
- [ ] **(B or C)** `npm ls @re-code/basics` shows the pinned version; `package-lock.json` changes only add that package; `grep -nE '"(file|link):' package.json` prints nothing.
- [ ] **(C)** `grep -rn "@re-code/basics'" src` shows no root-package import (only `@re-code/basics/<domain>/<name>` subpaths).
- [ ] **(C)** Parity tests: `lerp` matches the previous implementation for ≥1000 random triples including `NaN`, `Infinity` and out-of-range progress; `isPlainRecord` replacement agrees on null-prototype objects, class instances, arrays, `Map`, `Date`, and `Object.create(proto)`; public `clamp(5, 10, 0)` still returns `5` and `clamp(2)` still returns `1` (existing `tests/utils` stay green).
- [ ] **(C)** Every replaced private `clamp` call site has a comment or test showing its bounds are ordered; call sites that cannot guarantee this are left unchanged.
- [ ] **(C)** `npm run check:tree-shaking` passes and a new assertion confirms the `steering` and `flow-field` entry bundles (esbuild, minified, `--external:rxjs`) contain at most the basics modules they import directly. Minified size of each entry before/after is recorded in the PR; no entry grows by more than the size of the imported functions.
- [ ] **(B)** The benchmark scripts keep printing identical JSON schemas; for the empty-input case, the call sites keep today's results (`0` / `null`) despite basics returning `NaN`. `npm run bench` still completes.
- [ ] **(C)** `npm run check:package` and `npm run check:package:consumer` pass with the dependency present, and the consumer check installs the packed tarball into a clean directory and imports `@re-code/flux` and `@re-code/flux/steering` successfully.
- [ ] **(C)** `peerDependencies` is still only `rxjs`; the docs install command (`apps/docs/src/utils/packageInstall.ts`) and `README.md` remain correct (`npm run check:docs-release-metadata` and `npm run check:docs` pass).
- [ ] `CHANGELOG.md` *Unreleased* records the decision (and, for C, the new runtime dependency under "Changed").

## Shared gates

**Code gate** (see `roadmap/README.md`)
- [ ] `npm run typecheck` and `npm run typecheck:tests` pass.
- [ ] `npm test -- --runInBand` passes (record the test count; it must not decrease unless tests are intentionally replaced).
- [ ] `npm run check:tree-shaking`, `npm run check:package` and `npm run check:package:consumer` pass.
- [ ] No change to public `.d.ts` output unless intended; any intended change is recorded in `CHANGELOG.md` under Unreleased.

**Docs gate** (see `roadmap/README.md`)
- [ ] `npm run check:docs` passes (update the matching `scripts/check-*.mjs` contract in the same PR if a literal it asserts changes).
- [ ] `npm run build --workspace=re-flux-docs` passes.
