# Steering, test suite and docs app review — fix and cleanup list

Findings from the level-6 review (2026-11-28), lower-risk areas: `src/steering.ts` and `src/flowField.ts`, the quality of the test suite (`tests/**`, `jest.config.cjs`, `tsconfig.test.json`, coverage thresholds, `tests/helpers`) and the docs app (`apps/docs`: Vue components, router, stores, demos, benchmarks code, locales, SCSS) together with the repository checks that guard it (`scripts/check-steering-integrations.mjs`, `check-playground-lifecycle.mjs`, `check-playground-layout.mjs`, `check-renderer-cleanup.mjs`, `check-scss-tokens.mjs`, `check-locale-common.mjs`, `check-dark-theme-only.mjs`, `check-ui-framework.mjs`, `check-home-experience.mjs`, `check-visual-lab*.mjs`, `check-docs-release-metadata.mjs`). Back to the [roadmap](../roadmap.md). Related lists: [`core-engine-review-refactors.md`](./core-engine-review-refactors.md) (R), [`api-packaging-review-refactors.md`](./api-packaging-review-refactors.md) (P), [`values-physics-review-refactors.md`](./values-physics-review-refactors.md) (V), [`adapters-operators-review-refactors.md`](./adapters-operators-review-refactors.md) (A), [`ci-release-review-refactors.md`](./ci-release-review-refactors.md) (C).

## How to read this file

- This is a working backlog, not a set of roadmap items yet. When an entry is picked up, promote it to its own `roadmap/<ID>-<slug>.md` following [`README.md`](./README.md).
- The review was done by a read-only reviewer agent on a scratch copy of the repository (`scratchpad/l6/repo`); the repository itself was not modified. On that copy: `tsc --noEmit` and `tsc -p tsconfig.test.json` OK; `biome lint` OK (note: only 189 files, see L8); `npm run build --workspace=re-flux-docs` (vue-tsc + vite) OK with base `/` and with `VITE_BASE_PATH=/re-flux/`, and `check-built-route-fallback` passes in both cases; all 14 docs `check:*` scripts pass; Jest 65 suites / 1610 tests green three times (30.2 s with coverage, 45.8 s without while other work ran, 29.0 s with `--randomize --seed=12345`). No flaky tests and no order dependence were found, and with a global `expect.hasAssertions()` every one of the 1610 tests has at least one assertion. Coverage: 92.84 % statements / 84.95 % branches overall; 83.67 % branches excluding `src/core`, 90.2 % in `src/core`.
- Browser findings were measured in Chromium (Playwright, no network); mutation findings were produced by editing the scratch copy. Probes and run logs are in the session scratch folder (`scratchpad/l6/probe/`: `steer.ts`, `leaks.mjs`, `contrast.mjs`, `home.mjs`, `raf.ts`; `scratchpad/l6/run1.txt`–`run3.txt`; temporary, may be cleaned). **The findings were not independently re-run by the maintainer.**
- Finding numbers (`F1`…`F7`) and suggestion numbers (`S1`…`S19`) are the review's own. Nothing critical was found.
- Out of scope: `src/core`, `values`, `physics`, `adapters`, `operators` and CI (other lists).

Every entry is a *proposal*; none has been started.

## Backlog

| ID | Title | Fixes | Files | Priority |
|---|---|---|---|---|
| L1 | Consistent input validation in steering, plus API clean-up | F1, S1–S6 | `src/steering.ts`, `src/flowField.ts` | Medium |
| L2 | Home page contrast below WCAG AA | F2 | `apps/docs/src/styles/components/app.scss`, `abstracts/_tokens.scss`, `views/home/_base.scss` | Medium |
| L3 | Streams demo: honour reduced motion and start on demand | F3, S13 | `apps/docs/src/components/Playground/MotionPanels/StreamsPanel.vue`, `SteeringPanel.vue` | Medium |
| L4 | Router fallback (404) and mobile menu keyboard behaviour | F4, S19 | `apps/docs/src/router/index.ts`, `apps/docs/src/App.vue` | Medium |
| L5 | Replace string-matching lifecycle checks with a real browser detector | F5 | `scripts/check-*.mjs` for the docs app | Medium |
| L6 | p99 equals the maximum with fewer than 100 samples | F6 | `apps/docs/src/benchmarks/statistics.ts`, `measure.ts` | Medium |
| L7 | Type tests are not enforced by `npm test` | F7 | `tests/types/*`, `jest.config.cjs`, `package.json` | Medium |
| L8 | Test-suite quality: thresholds, fakes, lax assertions, missing cases, lint scope | S7–S11 | `jest.config.cjs`, `tests/**`, `biome.json` | Low |
| L9 | Docs app clean-up: SCSS, locales, dead code, dev config, duplicates | S12, S14–S18 | `apps/docs/**`, `scripts/lib/locale.mjs` | Low |

Suggested order before the next release: L1 → L2 → L3 → L4 → L7 → L5, as the review's verdict lists. L6, L8 and L9 can follow.

---

### L1 — Consistent validation in steering, plus API clean-up

**Problem.** `seek`, `arrive`, `flee`, `separate` and `combineSteering` do not validate the agent, the target or the forces, while `followFlowField` (`:120`) and `stepSteeringAgent` (`:80-81`) throw `RangeError` for the same inputs. The result is silent `NaN` in some functions and an exception in others.

**Evidence (F1).** `src/steering.ts:128-132, 135-147, 150-164, 170-199, 202-213`. `seek({x: NaN, …}, t)` returns `{x: NaN, y: NaN}`; the same with `combineSteering([{force: {x: NaN, y: 0}}])`, with a `NaN` neighbour in `separate` and with `vx: NaN`. A caller integrating on their own ends up with the whole swarm at `NaN` and no error. With `stepSteeringAgent` the error appears one step later and labelled "Steering force", which does not point at the cause. With finite ±1e308 inputs `seek`, `arrive` and `flee` also return `NaN`; that root cause is already in V9 / S11 (`vector2.ts`). Confirmed by probing (`probe/steer.ts`).

**Proposal.** Validate in every behaviour function with the same `RangeError` rule used by `followFlowField`, with an error message that names the argument. Fix the root cause for large finite values in `vector2.ts` (V9) first.

**Related suggestions (S1–S6), mostly API decisions:**
- **S1** (`steering.ts:122-124`, `flowField.ts:100`): with `edgeMode: 'zero'`, `followFlowField` brakes the agent to a stop (desired speed 0) instead of applying no force; an agent leaving the field stays there (after 10 s: `x ≈ 34.8`, `vx ≈ 4e-4`). A test pins this (`stepping.test.ts:62`). Decide and document: brake or let it slide.
- **S2** (`steering.ts:86` vs `:216`): `maxSpeed` defaults to 100 independently in each call, so `seek({maxSpeed: 500})` followed by `stepSteeringAgent(...)` without options limits to 100 silently. Document it or share one limits object.
- **S3** (`flowField.ts:97-98`): `Math.floor((x - ox) / cellSize)` is sensitive to floating point: with `cellSize 0.1`, `x = 0.3` lands in cell 2 instead of 3. Add an epsilon or document it.
- **S4** (`flowField.ts:108-110`): in `wrap` mode a huge coordinate (`x = 1e20`) throws every frame, whereas `clamp` tolerates it. Reduce with `%` before the `floor`.
- **S5** (`steering.ts:5-14`, `flowField.ts:1`): `/steering` and `/flow-field` expose `Vector2` in their signatures but do not re-export it, so the docs app imports it from `src/utils/vector2.js` (`demos/canvas/steeringSwarm.ts:12`). Re-export the type and use `@lib/utils` in the app. This touches the public surface: record it in `CHANGELOG.md` and re-check `check:package` (see P1).
- **S6** (`steering.ts`, all behaviour functions): allocations per call, computed and not measured: `seek` / `followFlowField` about 6 objects, `stepSteeringAgent` about 5, `separate` one per neighbour plus 2 per close neighbour. At swarm N = 180 that is more than 33,000 objects per frame. Consider an optional `out` parameter variant for hot loops; measure first (Performance gate).

**Tests first.** `NaN` in `seek` / `arrive` / `flee` / `separate` / `combineSteering` / agent velocity; `maxForce: 0`; `arrive` outside the radius; symmetric neighbours that cancel; an iterable input from a generator; `wrap` with negative coordinates. The uncovered lines (`steering.ts` 110, 156, 204, 219, 222; `flowField.ts` 49, 52, 59, 109) are all validation branches the review already exercised by probing; one one-line test each is enough.

### L2 — Home contrast below WCAG AA

**Problem.** On Home, `--rx-color-text-subtle` becomes `rgba(238,240,247,.46)` over `rgb(12,14,19)`, giving a contrast of 4.25:1, below AA (4.5:1).

**Evidence (F2).** `apps/docs/src/styles/components/app.scss:70-85` (`--rx-low-emphasis-opacity: 0.46`) with `abstracts/_tokens.scss:51`. Measured with `getComputedStyle` in Chromium: the inactive nav links (12 px, `app.scss:188-196`), the GitHub icon and `.home-eyebrow` (9.92 px, `home/_base.scss:19`) all give 4.25:1. On other routes the same token gives 7.67:1.

**Proposal.** Raise the opacity (or use a solid colour) so the small text reaches at least 4.5:1, and add a contrast assertion to a docs check (see L5), since `check-scss-tokens` does not look at contrast.

### L3 — Streams demo: reduced motion and on-demand start

**Problem.** The demo starts on its own on mount and keeps `requestAnimationFrame` running at 60 per second indefinitely, even with `prefers-reduced-motion: reduce` and with no new data. The root cause of a clock that never rests is already in A11 / S10; what is new is that the docs app triggers it with no interaction and without respecting the preference.

**Evidence (F3).** `apps/docs/src/components/Playground/MotionPanels/StreamsPanel.vue:116-118`. With `reducedMotion: 'reduce'`, `/playground/streams` is the only route still running at 60 rAF/s; `/visuals*` and `/docs/*` drop to 0. It also shifts `translateX` in the adapter. Confirmed in the browser.

**Proposal.** Start the stream on user action (or when the panel is in view), and under reduced motion do not animate continuously. S13 (same area): `SteeringPanel.vue:62-63, 122, 203, 92` calls `getComputedStyle` every frame (`canvasPalette` from `drawCurrentFrame`), and every `ResizeObserver` callback recreates the swarm (twice on mount); cache the palette and keep the agents on resize.

**Tests first.** A browser check that counts rAF per second on `/playground/streams` with `reducedMotion: 'reduce'` (see L5).

### L4 — Router fallback and mobile menu

- **F4 — no wildcard route** (`apps/docs/src/router/index.ts:6-177`). `#/docs/typo` or `#/does-not-exist` render an empty `<main>` (0 characters) and Vue Router warns `VUE_ROUTER_R0004`. There is no 404 page and no link back. Add `/:pathMatch(.*)*` with a small not-found view. Confirmed in the browser.
- **S19 — mobile menu** (`apps/docs/src/App.vue`). The menu does not close with Escape and does not return focus to the button. About 103 hex/rgb colour literals remain in `.vue` / `.ts` files (canvas demos, fallback values such as `#67e8f9` that duplicate tokens), which `check-scss-tokens` cannot see.

### L5 — Replace string-matching lifecycle checks

**Problem.** The docs "lifecycle" checks only look for the existence of certain strings. They do not verify that every acquired resource is released.

**Evidence (F5).** `scripts/check-steering-integrations.mjs:34-43`, `check-playground-lifecycle.mjs:20-34`, `check-renderer-cleanup.mjs`. Mutation A: removing only `document.removeEventListener('visibilitychange', …)` from `SteeringPanel.vue` leaves all three scripts passing, while the browser detector sees the leak (`document:visibilitychange 0→1`, `ResizeObserver 0→1`). Mutation C: removing the whole `onBeforeUnmount` fails only `check-steering-integrations`, and only because the string `resizeObserver?.disconnect()` is missing; the other two still pass. `'seek'` and `'separate'` (`:50-51`, `:64`) are satisfied by any word that contains them.

**Proposal.** Add a browser-based `check:docs-lifecycle`, based on the reviewer's probe (`probe/leaks.mjs`): instrument `requestAnimationFrame`, window/document/`MediaQueryList` listeners, intervals and observers, visit the 28 routes and return to a neutral one, and assert zero leftovers. The probe found no real leak today but did catch mutation A. Keep the static checks only for what they can really assert (no `PromiseLike` returns in handlers, and so on) and rename them to say so.

**Other weaknesses of the docs checks (all static `includes` / regex over source, none renders):**
- `check-playground-lifecycle`: despite the name, it only watches `PromiseLike` returns in `@click` / `onBeforeUnmount`, `scrollBehavior` and two styles.
- `check-playground-layout:32, 53`: requires exactly 12 modules and a literal `grid-template-columns`; it fails on reformatting and does not check the real layout.
- `check-scss-tokens:50, 99`: only looks in `styles/`, skips custom properties (`--*`) and `_tokens.scss` itself, so it misses the duplicated tokens and the duplicated block in `app.scss` (L9), and it does not check contrast.
- `check-locale-common`: forbids repeated literals but does not detect orphan keys (L9).
- `check-dark-theme-only` and `check-ui-framework`: regression guards for a finished migration; they add little today but do not give false confidence.
- That `check-home-experience` and `check-playground-layout` find the string `prefers-reduced-motion` does not guarantee it is honoured; the streams demo (L3) proves it.
- No Vue component or browser lifecycle test exists for `apps/docs`; `tests/docs` only covers `benchmarks/*` (with a well-made `FakeBenchmarkEnvironment`).

### L6 — p99 equals the maximum with fewer than 100 samples

**Problem.** With nearest-rank, p99 over fewer than 100 intervals is exactly the maximum.

**Evidence (F6).** `apps/docs/src/benchmarks/statistics.ts:16-18` and `measure.ts:236-238`. At 1000–1500 ms and 60 Hz there are about 60–90 intervals; one 120 ms GC pause gives `p99 = 120 = maxMs`, and `medianFrameP99Ms` then compares "worst frame" between engines. Verified with basics' `percentile`: n = 60 and n = 90 give p99 equal to the maximum; n = 100 gives 16.7.

**Proposal.** Either require at least 100 intervals for a p99 (otherwise report it as unavailable or label it "max"), lengthen the window, or switch to an interpolating percentile for small n. Note that CHORE-012 deliberately adopted the nearest-rank percentile from Basics 0.2.1; changing the method is a maintainer decision, whereas gating the reported p99 on sample size is not.

### L7 — Type tests are not enforced by `npm test`

**Problem.** Jest (ts-jest with ESM) does not enforce type errors in `tests/types`.

**Evidence (F7).** `tests/types/easing.types.test.ts` and `jest.config.cjs`. Changing `const known: number = "not-a-number"` in scratch still gave `1 passed` in Jest; only `npm run typecheck:tests` reports TS2322. Anyone who runs `npm test` believes the types are covered. There is a single type test (easing) and none for steering or flow-field.

**Proposal.** Make type tests fail under `npm test` (for example run `tsc -p tsconfig.test.json` as part of `test`, or configure ts-jest diagnostics for that folder), or at least document that `npm run typecheck:tests` is the gate. Add type tests for `steering` and `flow-field`, and for the public types raised in the other lists (P1, P4). CI already runs both.

### L8 — Test-suite quality

- **S7** (`tests/steering/stepping.test.ts:31-32`, `tests/operators/retargetMotion.test.ts:47`): `toBeCloseTo` with the default precision (±0.005) and with precision 0 (±0.5). The exponential identity is exact, so use precision 10. The damping test does not check the position. (`easings.test.ts:58-59` is already recorded in the V list.)
- **S8:** missing steering and flow-field cases are listed under L1.
- **S9** (`tests/helpers/RafController.ts:34-38`): it differs from the browser in two confirmed ways. (a) A callback cancelled by another callback in the same frame still runs; per the HTML spec it should not. (b) If a callback throws, the rest of the frame is lost silently (`pendingCount` is 0 and a later callback "D" never runs). Whether this affects a test today is plausible, not confirmed.
- **S10** (`jest.config.cjs:20-38`): thresholds are stale: the global minimum excluding core is 78 % branches and measures 83.67; `src/core` has 82 and measures 90.2. Six to eight points can be lost unnoticed, and the baseline comment dates from 11–22. `collectCoverageFrom` excludes `apps/docs/src/benchmarks/**` although `tests/docs/*` exercises it. There are no per-file minimums. CI runs `test:coverage`; `check:all` locally does not.
- **S11** (`biome.json:9`): Biome excludes `apps/docs`, so `noFloatingPromises`, `noUnusedImports` and the rest never run on the app's `.vue` / `.ts`; `check-playground-lifecycle` tries to compensate with a regex.
- **Not verified:** whether the `frameCoordinator` singleton's state persists between tests within one file. Install/uninstall pairs exist in every file that touches globals, and Jest isolates globals per file. `fakeDom` is minimal on purpose and documents it.

**Coverage worth closing** (10 lowest branch coverage in `src`; most already appear in other lists):

| File | Branches | Note |
|---|---|---|
| `src/adapters/canvas.ts` | 62.5 % (25/40) | Lines 50-51 and 98-114: `bindCanvas` guards and most of `resizeCanvas` validation (default DPR, invalid dimensions, no 2D context). Public API: **important**, and not covered by another list. |
| `src/values/AnimatedValue.ts` | 66.7 % (2/3) | Line 115, `?? false` of the probe; not critical. |
| `src/adapters/dom/scroll.ts` | 69.7 % (23/33) | Already in the A list. |
| `src/adapters/dom/scrollTrigger.ts` | 70.8 % (109/154) | Already in the A list. |
| `src/adapters/dom/draggable.ts` | 70.8 % (126/178) | Already in the A list. |
| `src/physics/RetargetableMotion.ts` | 72.9 % (35/48) | Lines 67-71 (retarget to the current target at rest) and 148-156 (synchronous clock error): the path V2 touches, **critical**. |
| `src/core/composition.ts` | 75 % (3/4) | Line 26, a default parameter; not critical. |
| `src/utils/math.ts` | 76.3 % (61/80) | Validation in `interpolateRange` / `distribute`; related to V9. |
| `src/adapters/dom/layout.ts` | 76.5 % (39/51) | Already in the A list. |
| `src/adapters/svg/pathMorph.ts` | 78.5 % (153/195) | Already in the A list. |

For comparison `src/steering.ts` is at 88 % and `src/flowField.ts` at 86.6 %.

### L9 — Docs app clean-up

- **S12** (`composables/useObservable.ts:5-10`): correct (it unsubscribes in `onScopeDispose`) but unused: dead code. If kept it needs an `error` handler, and outside a scope the subscription stays alive.
- **S14** (`styles/components/app.scss:87-105` and `:107-125`): the "Re-declare semantic aliases" block is duplicated entirely.
- **S15** (`styles/abstracts/_tokens.scss:4-257` vs `:298-325`, `:249` vs `:281`, `:283-295`, `:92-93`, `:170`): light-mode leftovers: the `--rx-theme-*` palette is defined twice with the same values and `--rx-brand-*-rgb` repeats them; `--rx-shadow-focus` has two different values; 12 uses of legacy aliases (`--bg`, `--panel`, …) remain; `canvas-indigo` (#161331) and `canvas-indigo-alt` (#171331) are nearly equal; px values are mixed with rem (`--rx-space-5-5: 22px`).
- **S16** (`locales/en.json`): about 259 of 2017 leaves do not appear by name in any `.vue` / `.ts` (an approximate bound, since dynamic access is minimal). Sampled and verified unused: `docs.ui.onThisPage`, `openPlaygrounds`, `lifecycleLogger`, `noScripts`. No keys are missing: vue-tsc guarantees it because the JSON is typed.
- **S17** (`stores/app.ts:9-44` vs `scripts/lib/locale.mjs`): the `@ref:` resolver is duplicated, with a risk that the two copies diverge.
- **S18** (`apps/docs/vite.config.ts`): Vite's dev dependency scan fails with "could not be resolved: @re-code/flux…" because it picks up the `import`s in code snippets inside template literals, then skips pre-bundling. Pin `optimizeDeps.entries` or `include`. The production build is unaffected.

---

## Open decisions (need a maintainer call)

- **S1 — edge behaviour of `followFlowField` with `edgeMode: 'zero'`:** brake to a stop, or apply no force (a test currently pins braking).
- **S2 — shared limits** between behaviour functions and `stepSteeringAgent` (default `maxSpeed` 100 in each call).
- **L6 — p99 method** for the in-browser benchmark with few samples (CHORE-012 chose nearest-rank on purpose).
- **S5 — re-exporting `Vector2`** from `/steering` and `/flow-field` widens the public surface.
- **L7 — how to enforce type tests:** in `npm test`, or documented as `typecheck:tests` only.

## What is already fine (do not change)

- Steering and flow-field do not mutate their inputs. Fields are fully frozen (object, vectors and a copied origin) and the returned sample is a copy, so mutating it does not alter the field.
- Zero-vector normalization is guarded, and `stepSteeringAgent` has overflow guards (line 110 was reached with 1.7e308). `maxDeltaSeconds`, exponential damping (equivalent to dividing the step), `wrap` with negative coordinates (cell 3,3), `clamp` with ±1e308 and the error messages all work well.
- The demo swarm is deterministic (no `Math.random`) and order-independent because it starts from a snapshot.
- `check-steering-integrations` at least guarantees that the Playground, Visual Labs and the typography use the public API rather than private copies of `limitVector`.
- Test suite: no real time, no `Math.random`, no `.only` / `.skip`; every test asserts something; stable in three runs, one of them in random order; about 30 s.
- Docs app: no leaks on any of the 28 routes (measured in the browser); reduced motion honoured everywhere except the streams demo; no `v-html` or `innerHTML`; skip link and focus moved to `main` on route change; a canvas with `role="img"` and keyboard control; the hash router and the fallback `404.html` work under `/re-flux/`. `percentile` / `median` are properly delegated to Basics, calibration discards outliers, benchmark cleanup is covered, and the UI shows "—" when there are no runs.
- An anomaly in the reviewer's Home probe (the `popstate` / `pagehide` listeners going from 1 to 0) is not a bug: hash navigation, `goBack` and the links work after visiting Home.

## Shared gates

Entries that change `src/` (L1) must pass the **Code gate** in [`README.md`](./README.md), including `check:package` and a `CHANGELOG.md` note if the public surface changes (S5). Entries that touch `apps/docs` (L2–L4, L6, L9) must also pass the **Docs gate** (`npm run check:docs`, `npm run build --workspace=re-flux-docs`) and update the literal strings the matching `check-*` scripts assert, in the same change. Changes to measurement code (L6) should report results descriptively per the Performance gate.
