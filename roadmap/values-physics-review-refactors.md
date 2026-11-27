# Values and physics review — refactor and fix list

Findings from the level-3 code review (2026-11-28): numerical correctness of `src/values/` (`interpolate.ts`, `Keyframes.ts`, `Tween.ts`, `AnimatedValue.ts`, `compiledInterpolators.ts`), `src/utils/` (`valueTemplate.ts`, `math.ts`, `easings.ts`, `stagger.ts`, `vector2.ts`, `optionNumbers.ts`, `timing.ts`) and `src/physics/` (`spring.ts`, `RetargetableMotion.ts`). Back to the [roadmap](../roadmap.md). Related lists: [`core-engine-review-refactors.md`](./core-engine-review-refactors.md) (level 1), [`api-packaging-review-refactors.md`](./api-packaging-review-refactors.md) (level 2).

## How to read this file

- This is a working backlog, not a set of roadmap items yet. When an entry is picked up, promote it to its own `roadmap/<ID>-<slug>.md` following [`README.md`](./README.md) (scoring, acceptance criteria, gates).
- The review was done by a read-only reviewer agent against a build of `src/` compiled in scratch (the repository's `dist/` is stale and was not used). Scenario scripts: `s1.mjs` … `s9.mjs` in the session scratch folder (temporary, may be cleaned). `tsc --noEmit` and `biome lint` on the scope were clean; `npm test` on `tests/values`, `tests/physics` and `tests/utils` passed (22 suites, 858 tests). Running bare `npx jest` without `--experimental-vm-modules` makes `tests/utils/basicsContract.test.ts` fail on ESM; that is an environment issue, not a bug. **The findings below were not independently re-run by the maintainer.** Re-reproduce each one in a failing test before changing code (working rule 2 in the README).
- Finding numbers (`F1`…`F9`) and suggestion numbers (`S1`…`S11`) are the review's own and are used for traceability.
- The reviewed physics is one-dimensional. The 2D helpers (`slideFollow`, `dragInertia`) live elsewhere and were not covered.
- Out of scope: the core engine, public API and packaging (other lists), adapters, operators, steering, `apps/docs` and CI.

Every entry is a *proposal*; none has been started.

## Backlog

| ID | Title | Fixes | Files | Priority |
|---|---|---|---|---|
| V1 | Make the spring integrator stable at any frame rate | F1, S1 | `src/physics/spring.ts` | High |
| V2 | Guard `RetargetableMotion` against non-finite results | F2 | `src/physics/RetargetableMotion.ts` | High |
| V3 | Make `RetargetableMotion` safe against re-entrant `to()` / `stop()` at rest | F3 | `src/physics/RetargetableMotion.ts` | High |
| V4 | Exact endpoints: `interpolate(a, b, 1) === b` and easings at 0 and 1 | F4, F5, S2 | `src/values/interpolate.ts`, `src/utils/easings.ts` | High |
| V5 | Identical non-numeric strings must interpolate | F6 | `src/values/interpolate.ts` | Medium |
| V6 | Per-call spring options must fall back to the configured value | F7, S3, S5 | `src/physics/RetargetableMotion.ts`, `src/physics/spring.ts` | Medium |
| V7 | `restDelta: 0` / `restSpeed: 0` must be able to settle | F8 | `src/physics/spring.ts` | Medium |
| V8 | Hex colours inside compound values | F9 | `src/utils/valueTemplate.ts` | Medium |
| V9 | Robustness fixes in `math`, `vector2`, `stagger` and precision | S8, S9, S11, S7 | `src/utils/math.ts`, `vector2.ts`, `stagger.ts`, `valueTemplate.ts` | Low |

Suggested order: write the stability sweep and the characterization tests (see below) → V2 → V1 → V3 → V7 → V6 → V4 → V5 → V8 → V9. V2 first because it makes the failure of V1 visible and bounded (a motion that stops with a clear outcome instead of throwing every frame); then V1 removes the cause. V1, V2, V3, V6 and V7 all touch `RetargetableMotion.ts` / `spring.ts`; do them one commit at a time.

---

### V1 — Stable spring integration at any frame rate

**Problem.** The semi-implicit Euler step is stable only if `h·c/m < 2` and `h²·k/m < 4 − 2·h·c/m`, with `h` up to `maxSubstepMs` = 8.33 ms. The comment says the substepping "keeps integration stable", but `h` is not adapted to `k`, `c` or `m`, so stability depends on the display refresh rate: a 16.67 ms frame gives 3 substeps of 5.56 ms, while 1000/60 and 1000/120 give 8.33 ms substeps.

**Evidence (F1).** `src/physics/spring.ts:15-16, 36-46`, against the scratch build:
- `{mass: 0.1}` with default stiffness and damping diverges at 30, 60, 120 and 144 Hz.
- `{damping: 250}` (an overdamped spring, which should be the safest) is fine at 144 Hz and diverges at 60 and 120 Hz.
- `{stiffness: 1e5}` diverges.
- On a reasonable grid (mass 0.1–2, stiffness 100–2000, damping 10–200) 67 of 200 configurations diverge at 120 Hz.
- Trajectory error against the analytical solution is about 4.4 units over 100 at 30/60/120 Hz and 2.2 at 240 Hz, i.e. frame-rate dependent (S1).

**Proposal.** Use the closed-form solution for a constant target (underdamped, critically damped and overdamped cases), which is exact and independent of `dt`. If an integrator is kept, cap `h` at `min(maxSubstepMs, ~m/c, ~1/ω)` and derive the substep count from it. Keep the exact-at-rest finish (`value = target`, `velocity = 0`) that currently works while the integrator is stable.

**Tests first.** A stability sweep over mass, stiffness, damping and `dt` (1000/60, 1000/120, 16, 64, 144 Hz) asserting a finite, convergent result; a comparison against the analytical solution for the three damping regimes; a frame-rate-independence test (the same spring sampled at different `dt` agrees within tolerance).

**Risk.** Trajectories change slightly for configurations that are stable today (they move closer to the analytical curve). Record in `CHANGELOG.md`; if a closed form is adopted, check the cost per frame with the existing hot-path benchmarks (informational, not a gate).

### V2 — Non-finite guard in `RetargetableMotion`

**Problem.** The step result is not checked for finiteness. When the spring diverges, `value$` publishes huge values and then `NaN`; afterwards `stepSpring` throws `RangeError` inside `next` on every frame. RxJS reports it as unhandled, so the `error:` handler at `:147` never runs.

**Evidence (F2).** `src/physics/RetargetableMotion.ts:132-145`: `new RetargetableMotion({mass: .5, stiffness: 500, damping: 200}).to(100)` at 60 Hz: `value$` reaches about 1e111 by frame ~1084, then `NaN`. 1915 `uncaughtException`s, state stays `running`, and the frame subscription is never released (`pending = 1`).

**Proposal.** After each step, if the position or velocity is not finite, stop the clock, surface a defined outcome (settle to the target, or move to an error state and call the error path) and release the frame subscription. Decide the outcome (see "Open decisions"). Wrap the `next` body so a throw cannot leave the clock running.

**Tests first.** Drive a deliberately unstable spring (use the parameters above, or a mocked `stepSpring` that returns `NaN`) and assert the motion ends, the clock is idle (`assertIdle()`-style check) and no unhandled error escapes.

### V3 — Re-entrant `to()` / `stop()` at the rest frame

**Problem.** In the frame that detects rest, `publish` (`:138`) and `onUpdate` (`:139`) run before `result.settled` is checked (`:141`). A `to()` or `stop()` made by user code at that moment is overwritten by `stopClock()` + `completed` + `onComplete`.

**Evidence (F3).** `src/physics/RetargetableMotion.ts:138-145`:
- `value$.subscribe(v => v === 100 && m.to(200))` (or the same inside `onUpdate`): the value stays 100, `target$` becomes 200, the state ends `completed`, no frame is pending; the retarget is lost.
- `stop()` inside `onUpdate` on that frame: the state ends `completed` and `onComplete` fires after the stop.

**Proposal.** Same idea as R1 in the level-1 list: a generation counter bumped by `to()` and `stop()`; after publishing, if it changed, return without completing. Alternatively check `settled` before invoking user callbacks and complete after they return only if nothing re-targeted.

**Tests first.** Re-entrant `to()` / `stop()` from `value$` and from `onUpdate` on the settling frame.

**Risk.** Behaviour change for callers relying on the current completion. CHANGELOG entry.

### V4 — Exact endpoints

**Problem.** The lerp `a + (b − a)·t` does not return exactly `b` at `t = 1`, and some easings are not exactly 0 and 1 at the extremes. A `Tween` can complete at `99.99999999999999` instead of `100`. `Keyframes` publishes the last frame exactly (`Keyframes.ts:81-84`), so the two classes are inconsistent.

**Evidence (F4, F5).**
- `src/values/interpolate.ts:72, 118` (used by `Tween.ts:25`): `interpolate(22.83557135708587, -46.109879156092724, 1)` gives `-46.10987915609273`; it fails for 8.85 % of 100,000 random pairs; `interpolate(1e16, 1, 1)` gives `0`.
- `src/utils/easings.ts:4, 29-36`: `easeInSine(1)` = 0.9999999999999999, `easeInBack(1)` = 0.9999999999999998, `easeOutBack(0)` = 2.2e-16. Consequences: `Tween` 0→100 with `easeInSine` completes at `99.99999999999999`, with `easeInBack` at `99.99999999999997`; a yoyo with `easeOutBack` ends at `2.2e-14`; an interior `Keyframes` boundary with an `easeInSine` segment gives `99.99999999999999`.
- The tests hide this: `tests/utils/easings.test.ts:58-59` uses `toBeCloseTo(…, 9)`.

**Proposal (S2).** Use `t === 1 ? b : a + (b − a)·t` (or `a·(1 − t) + b·t`) and pin `t = 0` and `t = 1` explicitly in the sine and back families. Tighten the endpoint tests to `toBe`. Check the compiled interpolators (`compiledInterpolators.ts`) and the compiled CSS path return the same exact endpoints, since PERF-002/003 rely on their equivalence with the one-shot path.

**Tests first.** `Tween` with every easing: final `value$ === to` and initial `=== from`; random-pair property test for `interpolate(a, b, 1) === b`.

**Risk.** Tiny output changes in the last ulp, only at the endpoints; no behaviour change elsewhere.

### V5 — Identical non-numeric strings

**Problem.** The string branch returns `false` before reaching the `Object.is` comparison, so two identical strings with no numbers are rejected, while identical booleans pass.

**Evidence (F6).** `src/values/interpolate.ts:40-44` vs `:57`: `interpolate('auto', 'auto', .5)` throws `TypeError`; `new Tween({from: {display: 'block', opacity: 0}, to: {display: 'block', opacity: 1}})` throws; `{f: true, o: 0}` → `{f: true, o: 0.5}` works.

**Proposal.** Accept identical strings (return the value) before the numeric-token check, consistent with how identical booleans behave. Decide whether non-identical, non-numeric strings should stay an error (they probably should; see REFACTOR-003's rules).

**Tests first.** Identical numberless strings at top level, inside objects and inside arrays.

### V6 — Per-call spring options must fall back correctly

**Problem.** Calling `to()` with an `undefined` or invalid option resets it to the library default, not to the value configured in the constructor or the active one. `RetargetableMotion` also keeps a copy of the normalizer logic.

**Evidence (F7, S3, S5).** `src/physics/RetargetableMotion.ts:59, 185-199`:
- `new RetargetableMotion({stiffness: 50}).to(100, {stiffness: undefined})` leaves `activeOptions.stiffness` at 260; `{stiffness: -1}` also gives 260.
- It duplicates `normalizeSpringOptions` (`spring.ts:76`) and `optionNumbers`, although the CHANGELOG ("Changed") says the normalizers were unified; `this.options` (`:24`, `:35`) only seeds `activeOptions`; `stepSpring` re-normalizes the options every frame (one object per frame).
- Options passed to `to()` persist for later retargets (S5): decide whether that is intended.

**Proposal.** Fall back per field to the current constructor/active value, reuse the shared normalizer, normalize once per `to()` instead of per frame. Document (or change) whether per-call options persist.

**Tests first.** `to()` with `undefined`, invalid and valid options; a retarget after a call with options.

### V7 — Settling with `restDelta: 0` / `restSpeed: 0`

**Problem.** With `restDelta: 0` and `restSpeed: 0` (valid per `optionNumbers`, which accepts 0) the spring never reaches rest: the position stays 1 ulp from the target through floating-point absorption and the frame loop never stops.

**Evidence (F8).** `src/physics/spring.ts:88-90`: with `to(1000)`, after 20,000 frames the state is still `running`, `x − target = 3.4e-13` and `v = 2.9e-12`, constant.

**Proposal.** Either reject zero for these two options, or treat "no change between steps" (position and velocity equal to the previous step) as rest. Pick one and document it. If V1 adopts the closed form, an exact solution may reach the target by construction and make this moot; re-check afterwards.

**Tests first.** `{restDelta: 0, restSpeed: 0}` must finish within a bounded number of frames, or the options must throw.

### V8 — Hex colours inside compound values

**Problem.** A hex colour inside a compound value is tokenized as numbers and produces invalid CSS. This is a known gap left by REFACTOR-003, not new.

**Evidence (F9).** `src/utils/valueTemplate.ts:11/27`: `interpolate('0 0 2px #1e3a5f', '0 0 4px #2e3a5f', .5)` gives `'0 0 3px #1500a5f'`.

**Proposal.** Tokenize hex colours as colour tokens before the numeric scan, or fail loudly for compound values that contain a hex (a throw is preferable to silently invalid CSS). Check the compiled and one-shot paths agree.

**Tests first.** A test that currently pins the known behaviour (the review found none) and then the corrected one; cover 3, 4, 6 and 8 digit hex.

### V9 — Robustness and precision

- **S8 — `interpolateRange`** (`math.ts:92-108`): a `NaN` input returns the last output (10) instead of `NaN`; `NaN` is accepted in the input range; the `|| 1` at `:94` and `:100` invents a slope for zero-width end segments (`[0,0,10]` → `[0,100,200]` at −1 gives −100).
- **S9 — floating-point artefacts:** `snap(0.3, 0.1)` = 0.30000000000000004 (`math.ts:48`); `stagger` with `'center'` and `n = 4` gives 49.99999999999999 (`stagger.ts:63`).
- **S11 — `vector2.ts:33-48`:** `normalizeVector` and `limitVector` return `NaN` for infinite components.
- **S7 — `valueTemplate.ts:92-95`:** absolute rounding to 5 decimals erases small values: `scale(0.000001)` → `scale(0.000009)` gives `scale(0)` over the whole range. The precision is documented; consider relative rounding.

---

## Open decisions (need a maintainer call, not a refactor yet)

- **V2 outcome:** when the spring diverges, should the motion settle to the target, error out through the `error` path, or clamp? Also whether to validate parameters up front (reject `mass <= 0` and similar) as well as at runtime.
- **S4 — `skipFirstFrame`** (`RetargetableMotion.ts:123-129`): it adds one frame of latency when retargeting from `completed` (confirmed: the first frame does not move). Intentional?
- **S5 — persistence of per-call options** in `to()` (see V6).
- **S6 — alpha premultiplication** (`valueTemplate.ts:147-174`): `rgba(255,0,0,0)` → `rgba(0,0,255,1)` at 0.5 gives `rgba(128,0,128,.5)`, whereas CSS Color 4 gives `rgba(0,0,255,.5)`. Match the spec or keep the current simple model and document it.
- **S10 — hard stops in `Keyframes`** (`Keyframes.ts:173, 208-212`): duplicate offsets are rejected, so there are no CSS-style hard stops; the `span <= 0` branch (`:91`) is dead code. Decide: support them or remove the dead branch.

## Test gaps to close before refactoring

- **Physics** has only 9 tests. Missing: stability sweeps over mass, stiffness, damping and `dt` (1000/60, 1000/120, 16, 64); the underdamped, critically damped and overdamped cases against the analytical solution.
- **`RetargetableMotion`:** divergence and non-finite results; re-entrant `to()` / `stop()` from `onUpdate` or `value$` on the settling frame; `undefined` or invalid options in `to()`; `restDelta: 0`.
- **Endpoint exactness:** final `value$ === to` for `Tween` with non-linear easings and with random pairs; `tests/utils/easings.test.ts:58-59` should assert `toBe` at 0 and 1.
- **`interpolate`:** identical numberless strings inside objects and arrays.
- **`interpolateRange`:** `NaN` input and degenerate end segments.
- **Hex inside compound values:** known, but no test pins it.

## What is already fine (do not refactor)

- `parseColor`: hex 3/4/6/8 digits, `rgb` / `rgba` with commas, spaces, slash alpha and percentages; channel and alpha clamping; back/elastic overshoot stays bounded in colours.
- The numeric tokenizer handles signs and exponents; `-0` is normalized.
- Compiled paths are equivalent to the one-shot path (property-based tests from PERF-002). Compilers are held in a `WeakMap` with no leaks and no cross-instance cache, which is an explicit non-goal.
- `Keyframes`: offset normalization, order validation, single frame, the cursor with the 48-segment threshold (golden tests) and `duration: 0`.
- `cubicBezier`: maximum error under 6.4e-6 over a sweep of 3,000 random curves × 200 points, including degenerate zero-slope cases; monotonic.
- `steps` follows CSS (jump-start / jump-end); easing-name resolution follows API-001.
- `stagger` and `distribute` validate indices and totals; the `optionNumbers` fallbacks are correct.
- Exact finish at rest (`value = target`, `velocity = 0`) is correct as long as the integrator is stable.

## Shared gates

Every entry that changes `src/` must pass the **Code gate** in [`README.md`](./README.md): `npm run typecheck`, `npm run typecheck:tests`, `npm test -- --runInBand`, `npm run check:tree-shaking`, `npm run check:package`, `npm run check:package:consumer`, plus a `dist/**/*.d.ts` diff recorded in `CHANGELOG.md` if public output changes. Entries that change a hot path (V1, V4, V6) should also run `npm run bench:interpolate` / the relevant `bench:*` command and report the result descriptively, per the Performance gate; benchmarks here are never a pass/fail threshold.
