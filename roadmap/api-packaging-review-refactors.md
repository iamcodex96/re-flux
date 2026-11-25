# Public API and packaging review — refactor and fix list

Findings from the level-2 code review (2026-11-25): the `exports` map and `files` in `package.json`, the public surface (`src/index.ts` and the subpath entry points), the `tsconfig*.json` build configuration, the package verification scripts (`scripts/check-package-*.mjs`, `check-tree-shaking.mjs`, `check-release-tag.mjs`, `check-api-reference.mjs`, `check-docs-release-metadata.mjs`) and the published contents. Back to the [roadmap](../roadmap.md). The level-1 list is [`core-engine-review-refactors.md`](./core-engine-review-refactors.md).

## How to read this file

- This is a working backlog, not a set of roadmap items yet. When an entry is picked up, promote it to its own `roadmap/<ID>-<slug>.md` following [`README.md`](./README.md) (scoring, acceptance criteria, gates).
- The review was done by a read-only reviewer agent. It built a clean copy of the repository in scratch, ran `tsc --noEmit`, `tsc -p tsconfig.test.json`, `biome lint`, `check-tree-shaking`, `check-package-files` (129 files) and `check-package-consumer` (13 subpaths), all green, and reproduced the findings below against that copy. **The findings were not independently re-run by the maintainer.** Re-reproduce each one before changing code.
- The repository's `dist/` is stale (27 Oct, before REFACTOR-004: no `PlaybackController`, `AnimatedValue`, `settle`, `optionNumbers` or `compiledInterpolators`). It was not rebuilt. `package.json` scripts that validate `dist/` must be run through `npm run` (which builds first), not as bare `node scripts/…`.
- Finding numbers (`F1`…`F4`) and suggestion numbers (`S1`…`S8`) are the review's own and are used for traceability.
- Out of scope for this list: the core engine (see the level-1 file), adapters, operators, values/physics internals, steering, `apps/docs` and the rest of CI.

Every entry is a *proposal*; none has been started.

## Backlog

| ID | Title | Fixes | Files | Priority |
|---|---|---|---|---|
| P1 | Export `ReadonlyBehaviorObservable` from every entry point that exposes it | F1 | `src/utils/readOnlyBehavior.ts`, `src/index.ts`, `src/core.ts`, `src/values.ts`, `src/physics.ts` | High |
| P2 | Fix the release path: new version, existence check, no hard-coded version in checks | F4, S6, S7 | `package.json`, `CHANGELOG.md`, `scripts/check-release-tag.mjs`, `scripts/check-docs-release-metadata.mjs`, `.github/workflows/publish-npm.yml` | High |
| P3 | Make `isProduction()` work in bundled browser builds (or correct the docs) | F2 | `src/utils/easings.ts`, `roadmap/API-001-easing-name-safety.md`, `CHANGELOG.md` | Medium |
| P4 | Correct the `@internal` tags on public contracts | F3 | `src/types/animation.ts`, `src/values/AnimatedValue.ts`, `src/core/Animation.ts` | Medium |
| P5 | Keep DOM types out of the headless type graph | S1 | `src/core/MotionPreferences.ts`, `src/types.ts` and its importers | Medium |
| P6 | Clean the build output before compiling | S2 | `package.json` (`build:lib`) | Medium |
| P7 | Packaging metadata and docs | S3, S4, S5, S8 | `package.json`, `README.md` | Low |
| P8 | Close the gaps in the package verification scripts | see "Verification script gaps" | `scripts/check-*.mjs` | Medium |

Suggested order: P1 → P2 → P4 → P3 → P6 → P5 → P7 → P8. P1 is a few lines and unblocks consumers that emit declarations; P2 gates the next release. P8 should land alongside the item whose gap it closes (for example, the `.d.ts` emission test with P1, the headless `lib` test with P5).

---

### P1 — Export `ReadonlyBehaviorObservable`

**Problem.** `ReadonlyBehaviorObservable<T>` is the type of `progress$`, `state$`, `value$`, `sample$` and similar members on public classes (`Animation`, `Timeline`, `Tween`, `Keyframes`, `RetargetableMotion`), but no entry point exports it, and the `exports` map blocks a deep import of `dist/utils/readOnlyBehavior.js`.

**Evidence (F1).**
- Defined at `src/utils/readOnlyBehavior.ts:7`; used at `src/core/Animation.ts:14-15`, `src/core/Timeline.ts:38-39`, `src/physics/RetargetableMotion.ts:18-22` and `src/values/AnimatedValue.ts:14`.
- The reviewer's script over the compiler API found no other publicly reachable type that is not exported (apart from `AnimatedValue`, see P4).
- Consumer scenario: a library wrapping re;Flux writes `export function progressOf(a: Animation) { return a.progress$; }` and builds with `declaration: true`. It fails with **TS2742** ("cannot be named without a reference to …/dist/utils/readOnlyBehavior.js"). Reproduced with `nodenext` and with `bundler`, and for `Tween.value$` and `RetargetableMotion.sample$`.
- Not a regression: it already behaves this way in `0.5.0-beta.0`.

**Proposal.** `export type { ReadonlyBehaviorObservable }` from `src/index.ts`, `src/core.ts`, `src/values.ts` and `src/physics.ts`. Check the API reference catalogue (`apps/docs`, `check-api-reference.mjs`) after adding the symbol, since it lists root exports.

**Tests first.** Add a consumer fixture that emits declarations (see P8) and fails today with TS2742.

**Risk.** Additive type export; no runtime change. Record in `CHANGELOG.md`.

### P2 — Fix the release path

**Problem.** `package.json` is at `0.5.0-beta.0`, which is already published (`npm view`: `beta` → `0.5.0-beta.0`, 2026-10-26), while *Unreleased* carries observable changes (frozen `segments` now throws `TypeError` on mutation, `EasingOption` changed, `.d.ts` shape changed). `check-release-tag.mjs` only compares the tag with the version.

**Evidence (F4, S6, S7).**
- Tagging `v0.5.0-beta.0` without a bump runs the whole `check:all` and fails only at `npm publish` (`.github/workflows/publish-npm.yml:52`).
- `scripts/check-docs-release-metadata.mjs:74` and `:177` hard-code `0.5.0-beta.0`, so bumping the version also requires editing them.
- The `DIST_TAG` computation for `-beta.N` / `-rc.N` in the workflow (`:44-50`) is correct.

**Proposal.**
1. Decide the next version (the *Unreleased* changes argue for at least `0.5.0-beta.1`) and move the CHANGELOG section accordingly.
2. Build the regexes in `check-docs-release-metadata.mjs` from `packageJson.version`.
3. Make `check-release-tag.mjs` also fail when the version is already on the registry, when the CHANGELOG has no section for it, or when the prerelease identifier and dist-tag disagree.
4. Optionally add an early step in `publish-npm.yml` that runs `npm view @re-code/flux@$VERSION version` and fails fast.

**Risk.** The registry check needs network access; keep it as a workflow step rather than in the offline local `check:all`, or make it skippable.

### P3 — `isProduction()` in bundled browser builds

**Problem.** `isProduction()` is `typeof process !== 'undefined' && process.env?.NODE_ENV === 'production'`. Bundlers substitute `process.env.NODE_ENV`, but `typeof process` stays `'undefined'` in the browser, so the guard is false.

**Evidence (F2).** `src/utils/easings.ts:114-116`. With esbuild and a production `define`, the output is `return typeof process !== "undefined" && true;`. A Vite/esbuild production app that passes an unknown easing name (for example from configuration) logs a `console.warn` in production. `roadmap/API-001-easing-name-safety.md:13` and `CHANGELOG.md:36` say it does not. Webpack's behaviour depends on how DefinePlugin treats `typeof process` (plausible, not reproduced). Impact: console noise only.

**Proposal.** Pick one:
- Guard on `process.env.NODE_ENV` directly in a form bundlers can replace (`typeof process !== 'undefined'` removed, access wrapped so it stays safe in a raw browser), or
- Correct API-001 and the CHANGELOG to say the warning is silenced only when `process` exists (Node and bundlers that polyfill it).

**Tests first.** A bundle-level check (esbuild with a production `define`) that asserts the warning branch is removed, if the first option is chosen.

### P4 — Correct `@internal` tags on public contracts

**Problem.** Public contracts carry `@internal` tags on members that consumers must implement or inherit. Today this is harmless because `stripInternal` is off; turning it on is a one-line config change that would break the package.

**Evidence (F3).**
- `src/types/animation.ts:49-56`: `AnimatableItem` is documented as the minimal API an item must implement, yet `seekLocal` and `pauseFromParent` are tagged `@internal`. `resetInternal` is not tagged on the interface or on `Animation`, but is on `AnimatedValue`.
- `AnimatedValue`, the base class of the public `Tween` and `Keyframes`, is tagged `@internal` at class level.
- Compiling in scratch with `--stripInternal`: `AnimatableItem` shrinks to `{ duration; resetInternal() }`, `AnimatedValue.d.ts` becomes `export {}`, so `Tween extends AnimatedValue` points at nothing, and a custom `Timeline` item compiles without `seekLocal` but fails at runtime.

**Proposal.** Decide which members of `AnimatableItem` are part of the public contract. Remove `@internal` from those (and from `AnimatedValue` or document why it must stay out of the declarations), tag consistently across the interface, `Animation`, `Timeline` and `AnimatedValue`, and add a regression check that compiles with `stripInternal` (P8).

**Risk.** Removing the tag widens the documented API surface; that is a maintainer decision, not a mechanical edit.

### P5 — Keep DOM types out of the headless type graph

**Problem.** The `./types.js` barrel pulls `types/animation` → `MotionPreferences`, which references `Window`, `Document` and `MediaQueryList`. A headless consumer (Node or worker) with `lib: ["es2022"]` and `skipLibCheck: false` gets three TS2304 errors when importing `/physics`, `/utils`, `/values`, `/core`, `/operators` or the root. `/steering`, `/flow-field` and `/three` compile cleanly.

**Evidence (S1).** `src/core/MotionPreferences.ts:18-22`, `src/types.ts:3`, and the barrel imports in `src/physics.ts:11`, `src/utils.ts:8`, `src/values.ts:13`, `src/operators.ts:23`. The existing consumer fixture uses `lib: DOM` (`check-package-consumer.mjs:133`), so it cannot see this.

**Proposal.** Either import from the domain modules (`./types/physics.js`, …) instead of the barrel in those entry points, or type the DOM access in `MotionPreferences` structurally so no ambient DOM types are needed. If neither is acceptable, document that `lib: dom` is required.

**Tests first.** Add a headless fixture (`lib: ["es2022"]`, `skipLibCheck: false`) to `check-package-consumer.mjs` (P8).

### P6 — Clean the build output before compiling

**Problem.** `build:lib` (`package.json:87`) runs `tsc` without cleaning `outDir`. A renamed or deleted module leaves an orphan file in `dist/`; a local `npm publish` would ship it through `prepack`, and `check-package-files` accepts any `dist/*`. CI is unaffected because its checkout is clean.

**Evidence (S2).** The stale `dist/` in the working tree is an example of the same class of problem.

**Proposal.** Remove `dist` (for example `rimraf dist` or `node -e` with `fs.rmSync`) at the start of `build:lib`, keeping the script dependency-free if possible.

### P7 — Packaging metadata and docs

- **S3.** No `typesVersions`; with `moduleResolution: node`/`node10` every subpath fails with TS2307. Coherent with ESM-only; document in the README that `bundler`, `node16` or `nodenext` is required.
- **S4.** Add `"./package.json": "./package.json"` to `exports`; `require('@re-code/flux/package.json')` currently throws `ERR_PACKAGE_PATH_NOT_EXPORTED` and some tooling reads it.
- **S5.** Include `CHANGELOG.md` in `files` (this is a beta with behaviour changes). Update the expected list in `check-package-files.mjs` (see P8).
- **S8.** The README does not say the package is ESM-only; only the CHANGELOG does. `require()` works on Node ≥ 22.12 but not 22.0–22.11, while `engines` declares `>=22`. Say so in the README, or raise the lower bound.

### P8 — Close the gaps in the package verification scripts

See the next section. Each gap should be closed in the same change as the item it protects.

---

## Verification script gaps (what the checks do not detect today)

- **`check-tree-shaking.mjs:9-86`**
  - Covers 8 of the 13 subpaths; missing `values`, `physics`, `operators`, `utils` and `effects/canvas`.
  - Relies on `sideEffects: false`, which esbuild honours, so it cannot detect the declaration becoming false. Without the flag (`ignoreAnnotations`), importing `{ seek }` from the root grows from 891 B / 2 modules to 31 KB / 23 modules; the flag carries the whole result.
  - No pass that asserts no module with real side effects (global listeners, module-level `window`) exists.
  - Only tests `platform: 'browser'`.
- **`check-package-files.mjs:12-42`**
  - The expected list is fixed and not derived from `exports`, so a new subpath is not checked.
  - Does not validate `main` / `types`.
  - Accepts any `dist/*`, including orphans.
  - Run as a bare `node scripts/…` it validates whatever `dist/` exists, even a stale one.
- **`check-package-consumer.mjs`**
  - Packs the existing `dist/` with `--ignore-scripts`, so a bare run validates a stale build.
  - The type fixture uses `lib: DOM` (`:133`), hiding P5, and does not test declaration emission, hiding P1.
  - Only `NodeNext`; no `bundler`.
  - For `default` it only checks `require.resolve`, not `require()`.
  - Strength worth keeping: it imports all 13 subpaths in Node without a DOM, so it would catch module-level `window` access.
- **`check-api-reference.mjs:25-29`**
  - Parses only `src/index.ts` with a regex: does not see `export *`, takes the name before `as`, and does not verify `importPath`.
  - About 70 exports that exist only in `dom` / `svg` / `canvas` / `three` / `effects` are not compared with anything.
  - Currently fine: the reviewer imported the real `importPath` of all 58 catalogue entries and every one resolves.
- **`check-release-tag.mjs`** — does not check that the version is unpublished, that the CHANGELOG has a section for it, or that the prerelease identifier matches the dist-tag (P2).
- **`check-trusted-publishing-runtime.mjs`** — correct for its purpose (Node ≥ 22.14, npm ≥ 11.5.1); not about published content.
- **No check diffs the public `.d.ts` against the previous release.** The README gate leaves it manual. The reviewer did it by hand against `519b8eb` (the release commit): the public signature changes are `EasingOption` / `EasingName` and `Tween` / `Keyframes extends AnimatedValue`, both recorded in the CHANGELOG. No unrecorded API change was found. A scripted `.d.ts` snapshot diff would make this repeatable.

## What is already fine (do not refactor)

- All 13 `exports` entries resolve to files the build emits (including `./flow-field` → `dist/flowField.js`), each with its `.d.ts`; `types` comes first; `default` equals `import` (CHORE-010).
- No duplicate or conflicting exports: the root (120 symbols) is exactly the union of `core`, `values`, `physics`, `steering`, `flow-field`, `operators` and `utils`, with no name clashes.
- Adapters are not leaked into the root; internals (`PlaybackController`, `openWriteChannel`, `SETTLE_PROBE`, `bindStyleProperty`, `compiledCssInterpolator`) appear in no entry point.
- `sideEffects: false` is true: the only work at import time is `new FrameCoordinator()` (field initialisation only), the lazy `animationFrame$`, `Object.freeze`, regexes and `defineProperty` on the module's own class prototype. `MotionPreferences` is not instantiated on import.
- The only runtime dependency is the `rxjs` peer; `@re-code/basics` is dev-only (CHORE-011).
- `files` yields a clean tarball: 129 files, 102 KB, only `dist`, `README`, `LICENSE` and `package.json`.
- `LICENSE` (MIT) is present; `README` and `RELEASE_NOTES` agree with `0.5.0-beta.0` and `@beta`.
- `publish-npm.yml` publishes with `--provenance` under the right `beta` dist-tag without moving `latest`.
- API-001 holds at the type level (`(string & {})`) and at resolution time (construction), apart from P3.

## Shared gates

Every entry that changes `src/` must pass the **Code gate** in [`README.md`](./README.md): `npm run typecheck`, `npm run typecheck:tests`, `npm test -- --runInBand`, `npm run check:tree-shaking`, `npm run check:package`, `npm run check:package:consumer`, plus a `dist/**/*.d.ts` diff recorded in `CHANGELOG.md` when public output changes (P1, P4, P5 do). Entries that touch docs literals (P1 via the API reference, P2 via release metadata) must also pass the **Docs gate** (`npm run check:docs`, `npm run build --workspace=re-flux-docs`).
