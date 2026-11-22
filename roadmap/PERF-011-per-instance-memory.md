# PERF-011 — Measure, then trim per-instance allocation of Animation

| Category | Impact | Risk | Effort | Priority score | Phase | Depends on |
|---|---|---|---|---|---|---|
| Performance | 2 | 1 | 3 | **9** | 2 | [BENCH-007](./BENCH-007-variance-and-gc-control.md), [BENCH-008](./BENCH-008-hot-path-benchmarks.md) |

Priority = (Impact + Risk) × (6 − Effort). Back to the [roadmap](../roadmap.md).

## Problem

Each `Animation` allocates two `BehaviorSubject`s, two `readonlyBehavior` Observables, a `Completion` (with a Promise and a `.catch` handler) and a frozen options copy even if nobody observes them.

## Evidence

- `src/core/Animation.ts:15-26,51`; `src/core/Completion.ts:createPromise` creates a Promise eagerly in the constructor and attaches `void promise.catch(() => undefined)`.
- No existing benchmark reports heap per instance (see BENCH-008), so the cost is unquantified — this item is *measure-first*.

## Scope

- Use BENCH-008 `memory.bench` to get bytes/instance for `Animation`, `Tween`, `Keyframes`, `Timeline`.
- If material, lazily create the Completion promise on first `then`/`toPromise`/`play` and lazily create `progress$`/`state$` observable views.

## Non-goals

- Do nothing if the measured saving is small — close the item with the numbers.

## Risks

- Lazy promise creation changes when unhandled rejections can occur; `Completion` exists precisely to avoid unobserved rejection errors.

## Acceptance criteria

Every box must be checkable by running the named command or inspecting the named file.

- [x] The measured bytes/instance before and after are recorded in this file ("Measurements and targets" above and the table in Status).
- [x] If any code change is made: `tests/core/Completion.test.ts` and `Animation.contract.test.ts` pass unchanged, and no unhandled-rejection warning appears when `stop()` is called on an animation nobody awaited. Verified with `scripts/check-unhandled-rejections.mjs` (new, `npm run check:unhandled-rejections`, added to `check:all`), which runs against the built output because Jest's sandboxed `process` never receives the event; it contains a control that really is unhandled, and it fails when the `.catch` that marks the rejection as observed is removed.
- [x] `npm run bench` memory workload shows lower heap per instance than baseline by the pre-recorded target: `Animation` 1,714 → 665 B (−61%, target ≥30%), `Tween` −55%, `Keyframes` −45%, empty `Timeline` −49%, `Timeline` with 10 `Animation`s −57% (target ≥25% each); three runs before and after, stable to ±0.5 B.

## Measurements and targets (recorded before any code change, 2026-11-23)

BENCH-008 `memory` workload (retained heap per instance, forced GC, 20,000 instances, median of 10; stable to ±0.5 byte across three runs) at the start of this item, after REFACTOR-004: `BehaviorSubject` (reference) 120 B, `Animation` 1,714 B, `Tween<number>` 2,506 B, `Keyframes<number>` (3 frames) 3,035 B, empty `Timeline` 2,122 B, `Timeline` with 10 `Animation`s 20,116 B. (Before REFACTOR-004 the same workload gave 1,641 / 2,434 / 2,963 / 2,049 / 19,323 B.)

A scratch breakdown (`phase-2/perf-011/parts.mjs` in the shared notes folder: retained bytes of each ingredient built on its own, same method, minus nothing) shows where the 1,714 B of an `Animation` go:

| ingredient (per instance) | bytes | count in an `Animation` |
|---|---|---|
| `readonlyBehavior()` view (an `Observable` plus `Object.defineProperty(view, 'value', { get })`, i.e. an accessor property, its closure and a new hidden class) | about 368 | 2 (`progress$`, `state$`) |
| `Completion` (a `Promise`, its executor and two resolver closures, and the derived promise made by `.catch`) | about 472 | 1 |
| `BehaviorSubject` | about 120 | 2 |
| frozen options copy | about 72 | 1 |
| `PlaybackController` fields, `Animation` fields | about 80 + 110 | 1 each |

So the two views and the eagerly built promise are about 1,200 B of the 1,714 B; the subjects, options and fields are the necessary part.

Target (judged on the same workload, same method): **`Animation` at least 30% fewer bytes per instance (1,714 B → 1,200 B or less), and `Tween`, `Keyframes`, `Timeline` and the 10-child `Timeline` each at least 25% fewer**; no change in behaviour (`Completion` and `Animation` contract tests unchanged, no unhandled-rejection warning for an unawaited `stop()`); per-frame allocation and frame time unchanged (checked with the scavenge count of 400 frames of 5,000 playing animations and `animation-load`, neutral within noise).

Planned change (only because the measurement says it is material): (1) build the read-only view without `defineProperty`, the way `Subject.asObservable()` does (an `Observable` whose `source` is the subject) with `value` as a prototype getter; (2) create the `Completion` promise on first use (`promise`, `then`, `toPromise`, …) and remember the settlement until then. Lazy `progress$` / `state$` views were considered and dropped: after (1) a view costs about 50 B and making the public fields lazy would change the declarations.

## Shared gates

**Code gate** (see `roadmap/README.md`)
- [x] `npm run typecheck` and `npm run typecheck:tests` pass.
- [x] `npm test -- --runInBand` passes: 56 suites, 1534 tests (was 54 / 1518; the 16 new tests are characterization tests, green on the old implementation first).
- [x] `npm run check:tree-shaking`, `npm run check:package` and `npm run check:package:consumer` pass (also `check:docs`, `check:browser-integration`, `check:unhandled-rejections`).
- [x] No change to public `.d.ts` output: the only declaration diff is the private members and doc comment of the internal `Completion` class (not exported from the package).

**Performance gate** (this item has no section of its own; see `roadmap/README.md`)
- [x] Same machine and Node version, three interleaved invocations per side of the `memory` workload as shipped (median of 10 repeats, forced GC); retained-heap numbers are insensitive to machine load. `bench:compare` was not used.
- [x] The target was written into this file before any code change (see "Measurements and targets"); the before/after JSON is kept in the shared notes folder (`phase-2/perf-011/`; nothing was pushed, so there is no PR).
- [ ] No other workload in `npm run bench` regresses beyond the measured noise band. **Not fully verified:** per-frame allocation was checked (see Status) and frame time in `animation-load` is neutral to better but too noisy to claim (load average ≈ 80 on 8 cores); the other workloads were not re-run.

## Status

**Done 2026-11-23.** One commit on branch `claude/phase-2-7ff826`. The item was *measure-first*; the measurement said the saving is large, so both planned changes were made.

Result (retained heap per instance, `npm run bench` memory workload, median of 10, three runs per side):

| | before | after | change |
|---|---|---|---|
| `Animation` | 1,713.6 B | 665.5 B | −61% |
| `Tween<number>` | 2,506.4 B | 1,130.4 B | −55% |
| `Keyframes<number>` (3 frames) | 3,035.0 B | 1,658.7 B | −45% |
| `Timeline` (empty) | 2,121.9 B | 1,073.8 B | −49% |
| `Timeline` (10 `Animation`s) | 20,115.5 B | 8,587.3 B | −57% |
| `BehaviorSubject` (reference) | 120.2 B | 120.2 B | — |

(The numbers before this item already include REFACTOR-004's +72 B per instance; against the state before that refactor the `Animation` went from 1,641 to 666 B, −59%.)

What changed:

- `src/utils/readOnlyBehavior.ts`: the view is an `Observable` subclass whose `source` is the subject (what `Subject.asObservable()` builds) with `value` as a getter on the prototype. The old view called `Object.defineProperty(view, 'value', { get })` on every instance: an accessor property, a closure and a hidden class of its own, about 370 B per view and two views per `Animation`. Now about 50 B. Observable behaviour is the same (subscription, replay, completion and error propagation, `pipe`, `value` that throws on assignment and when the source errored, no mutation methods); what differs is that `value` is no longer an own enumerable property (`Object.keys(view)` no longer lists it; `'value' in view` and reads are unchanged). It also benefits `RetargetableMotion` and the value streams.
- `src/core/Completion.ts`: the promise, its resolver closures and the `.catch` marker are created the first time something asks for them (`promise`, `then`, `catch`, `finally`, `toPromise`, `await`), not with every cycle. Until then the cycle only records that it resolved or rejected (and the reason), so a consumer that asks late gets a promise settled exactly as one that asked early would have; asking twice gives the same promise; `restart()` and `ensurePending()` start a clean cycle. A rejection nobody asked about cannot be reported as unhandled because no promise exists for it, and a promise someone did create keeps its observed marker.
- Dropped from the plan: lazy `progress$` / `state$` views. After the first change a view costs about 50 B, and making the public fields lazy would have changed the declaration files.

Evidence for no behaviour change: `tests/core/Completion.settlement.test.ts` (11 tests: settle before and after asking, identity per cycle, first settlement wins, restart with and without an observed promise, `ensurePending`, stop / restart / play on unawaited animations and timelines, late `await` after `stop()` rejects with the stop error and a later `play()` completes a fresh cycle) and `tests/utils/readOnlyBehavior.view.test.ts` (5 tests) were written first and are green on the old implementation and on the new one; the existing `Completion`, `Animation` / `Timeline` contract, `composition` and 250-seed `Timeline` differential tests pass unchanged; `npm run check:unhandled-rejections` passes on the new code and fails when the observed marker is removed. Per-frame allocation is unchanged (400 frames of 5,000 playing animations, 1 MB semi-space, three alternated pairs: 545–552 young-generation collections before, 551–552 after, with one 580 outlier) and creating and starting the 5,000 animations needs fewer (26–31 → 20 collections). `animation-load` (1 MB semi-space, three interleaved pairs, load average ≈ 80): collections per run 53 → 51 at 1,000 animations and 266–274 → 263 at 5,000; frame times are neutral to better but too noisy to claim.
