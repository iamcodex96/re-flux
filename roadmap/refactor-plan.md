# Refactor plan — ordered from most to least severe

Execution plan that sequences the six review backlogs. Back to the [roadmap](../roadmap.md). The IDs below are defined in:

- **R** — [`core-engine-review-refactors.md`](./core-engine-review-refactors.md) (level 1)
- **P** — [`api-packaging-review-refactors.md`](./api-packaging-review-refactors.md) (level 2)
- **V** — [`values-physics-review-refactors.md`](./values-physics-review-refactors.md) (level 3)
- **A** — [`adapters-operators-review-refactors.md`](./adapters-operators-review-refactors.md) (level 4)
- **C** — [`ci-release-review-refactors.md`](./ci-release-review-refactors.md) (level 5)
- **L** — [`steering-tests-docs-review-refactors.md`](./steering-tests-docs-review-refactors.md) (level 6)

Order of severity: data loss and security first, then correctness failures (divergence, hangs, lost state), then what end users see, then release and public API, then hardening and clean-up. This is a proposal: no item has been started, and the findings were reproduced by reviewer agents on scratch copies but not re-run by a maintainer. Promote an item to its own `roadmap/<ID>-<slug>.md` (see [`README.md`](./README.md)) before starting it.

## Phase 0 — Prepare the ground

1. **Rebuild the baseline.** `dist/` is stale (before REFACTOR-004). Build, run `npm run check:all`, and confirm everything is green before touching anything.
2. **Reproduce before fixing.** Turn each finding into a failing test first. If one does not reproduce, drop it from its list.
3. **Settle the open decisions that block later phases:**
   - V2: what the spring does when it diverges (settle, error out or clamp).
   - A4: when pointer capture starts.
   - P4: which members are public contract and which are `@internal`.
   - R4: whether `reverse()` on an infinite duration throws or is a no-op.
   - Verify the GitHub settings that condition C1 and C3 (environments, tag rulesets, fork-run approval, branch protection; see "Assumptions to verify in GitHub" in the CI list).

## Phase 1 — Data loss and security (small, independent)

| Order | ID | What | Why first |
|---|---|---|---|
| 1 | C4 | `build-atlas.py` deletes only atlas paths, atomically, comparing paths by inode | The only reproduced data loss: it deleted `.obsidian` and personal notes |
| 2 | C1 | `deploy-docs.yml` `if:` requires `push` and the same repository | A fork could deploy its code to the official Pages site |
| 3 | C2 | Split `publish-npm.yml`: validate without `id-token`, publish the tarball with `--ignore-scripts` | A compromised dependency could publish with legitimate provenance |
| 4 | C3 | Publish only tags whose commit is on `main` with green CI; fixed concurrency group | Any `v*` tag publishes today |

C2 and C3 rewrite the same file: do them together or as two consecutive commits. Workflows cannot be tested locally; verify them on a fork or a throwaway branch.

## Phase 2 — Physics that diverges or hangs

| Order | ID | What |
|---|---|---|
| 5 | V2 | Check the step result is finite and release the clock. Before V1, to bound the damage |
| 6 | V1 | Integrator stable at any refresh rate, ideally the closed-form solution |
| 7 | V3 | Re-entrant `to()` / `stop()` on the rest frame |
| 8 | V7 | `restDelta: 0` and `restSpeed: 0` must be able to settle |
| 9 | V6 | Per-call options fall back to the configured value |

All of these touch `RetargetableMotion.ts` or `spring.ts`: one commit per item, with the stability sweep tests first.

## Phase 3 — Core engine correctness

| Order | ID | What |
|---|---|---|
| 10 | R3 | Record which end the timeline completed at |
| 11 | R2 | Resolve the promise before `onComplete`; `onStop` last |
| 12 | R1 | Epoch counter for re-entrancy (regression of PERF-009) |
| 13 | R4 | Direction: `stop()` resets it, reduced motion honours it, infinite durations |

R1, R2 and R3 all touch `updateAt` in `Timeline.ts`. Do R3 and R2 before R1, one commit each. R1 and R2 change observable behaviour: add a `CHANGELOG.md` entry.

## Phase 4 — Failures end users see (adapters)

| Order | ID | What |
|---|---|---|
| 14 | A1 | Release with an expired velocity: no phantom inertia |
| 15 | A4 | `draggable` must not swallow clicks of interactive children |
| 16 | A2 | `scrollTrigger` validates the range only at construction |
| 17 | A3 | `scrollTrigger` keeps the scroll direction when updates coalesce |
| 18 | V4 | Exact endpoints: `interpolate` at t = 1 and sine/back easings at 0 and 1 |
| 19 | A5 | `flip()` with non-translation transforms |
| 20 | A6 | `animateText()`: rich text, ARIA and word wrapping |
| 21 | A7, A8 | `AnimationScope` lifecycle and the SSR failure of `bindScrollTimeline` |
| 22 | A9, V5, V8 | `pathMorph` after `Z`, identical strings, hex colours in compound values |

A1 and A4 share `gestures.ts`; A2 and A3 share `scrollTrigger.ts`. A4 changes when events reach children: `CHANGELOG.md`.

## Phase 5 — Release and public API (before the next tag)

| Order | ID | What |
|---|---|---|
| 23 | P1 | Export `ReadonlyBehaviorObservable`. A few additive lines that unblock consumers that emit `.d.ts` (could safely go much earlier) |
| 24 | P2 | Bump the version, check it is not already on the registry, remove the hard-coded version from the checks. Must be done before tagging anything |
| 25 | P4 | Correct the `@internal` tags on public contracts |
| 26 | P3 | `isProduction()` in bundled browser builds, or correct the documentation |
| 27 | P6, P5 | Clean `dist/` before compiling; keep DOM types out of the headless type graph |

## Phase 6 — Docs app and test quality

| Order | ID | What |
|---|---|---|
| 28 | L2, L3, L4 | AA contrast on Home, streams demo honouring reduced motion, 404 route |
| 29 | L1 | Consistent validation in steering (depends on V9 for very large values) |
| 30 | L7 | Make type tests fail under `npm test` |
| 31 | L5 | Browser lifecycle detector instead of literal-string checks |
| 32 | L6 | p99 with fewer than 100 samples |

## Phase 7 — Hardening and clean-up (no urgency)

- **Re-entrancy and lifecycle:** R5, R6, R7, A10, A11, V9.
- **CI:** C5 (actions pinned by SHA, `persist-credentials`, `timeout-minutes`, cache), C6 (CI covers all of `check:all`), C7, C8.
- **Packaging:** P7 and P8 (close the gaps in the verification scripts, alongside the item each one protects).
- **Docs and tests:** L8 and L9.

## Rules for executing the plan

- **One commit per item**, characterization test first, and never combine a formatting change with a logic change (README working rule 1).
- **Every item passes the Code gate:** `typecheck`, `typecheck:tests`, `npm test -- --runInBand`, `check:tree-shaking`, `check:package`, `check:package:consumer`. Adapter items add `check:browser-integration`; docs-app items add `check:docs` and the docs build.
- **Behaviour changes** (R1, R2, V1, V3, A4, P1, P4) get a `CHANGELOG.md` entry.
- **Performance-sensitive items** (V1, V4, A9, A11) are measured with the matching `bench:*` command, descriptively and with no threshold (Performance gate).
- **Each item is promoted** to its own `roadmap/<ID>-<slug>.md` with acceptance criteria before work starts.

## Possible parallelism

Four work streams share no files and could run in separate sessions or worktrees:

- **CI / tooling stream:** Phase 1 (C1–C4), then C5–C8.
- **Physics stream:** Phase 2 (V1–V3, V6, V7).
- **Core engine stream:** Phase 3 (R1–R4).
- **Adapters stream:** Phase 4 (A1–A9).

The release/API stream (Phase 5) and the docs-app stream (Phase 6) can follow or run alongside, except L1, which waits for V9.

Files that several items touch, to avoid merge conflicts: `Timeline.ts` (R1–R4, R7), `RetargetableMotion.ts` and `spring.ts` (V1–V3, V6, V7), `scrollTrigger.ts` (A2, A3, A10), `gestures.ts` (A1, A4), `publish-npm.yml` (C2, C3, C5) and `build-atlas.py` (C4, C7).
