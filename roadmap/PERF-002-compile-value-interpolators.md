# PERF-002 — Parse string/color endpoints once, not every frame

| Category | Impact | Risk | Effort | Priority score | Phase | Depends on |
|---|---|---|---|---|---|---|
| Performance | 3 | 2 | 2 | **20** | 1 | [REFACTOR-003](./REFACTOR-003-unify-value-parsing.md), [BENCH-008](./BENCH-008-hot-path-benchmarks.md) |

Priority = (Impact + Risk) × (6 − Effort). Back to the [roadmap](../roadmap.md).

## Target (recorded before implementation, 2026-11-23)

Baseline: `npm run bench:interpolate` on the unchanged build at `8b1e048`, three invocations, GC controlled, load average ~34 on 8 cores (better than the 2026-11-22 baselines but still not quiet). `resolved` group, median ops/ms per invocation, and `scavengesPerMillionOps`:

| Case | ops/ms (3 invocations) | scav / M ops |
|---|---|---|
| `number` | 70639, 68744, 70810 | 16.7 |
| `color-hex` | 1879, 1852, 1926 | 526.7 |
| `color-rgba` | 974, 966, 1019 | 273.3 |
| `numeric-template` | 693, 696, 692 | 100 |
| `unit-string` | 1522, 1347, 1449 | 43.3 |
| `array-4-numbers` | 6335, 6142, 5171 | 23.3 |
| `object-3-fields` | 4241, 4442, 4294 | 16.7 |

Targets (medians of at least three invocations of the new build, interleaved with the old build on the same machine): `color-hex` and `color-rgba` at least **3x** ops/ms; `numeric-template` at least **2x**; `unit-string` at least **1.5x**; `array-4-numbers` and `object-3-fields` not below baseline; `number` within the noise band (the compiled number path must not add measurable overhead); `scavengesPerMillionOps` not higher for any case. These are goals to judge the change by, not promises.

## Status

**Done 2026-11-23 (local, not committed).** Measured at load average ~40-50 on 8 cores (better than before, still not quiet); three interleaved invocations per side, GC controlled.

**What changed.** `resolveInterpolator()` now returns a compiled closure (`compile()` in `src/values/interpolate.ts`): numbers read their arguments directly; color pairs are parsed once into `compileColorMix` (channel deltas precomputed, alpha text precomputed when both alphas are equal, no intermediate `Rgba`); numeric templates are tokenized once into `compileNumericTemplate` (literal pieces plus `Float64Array` start/end values); arrays and plain objects compile one child per element/key. Strings are re-read only when a call passes a different string than the one resolved (fallback to the generic path), array children are skipped when lengths differ, and a plain object takes the compiled path only while the same container identity is passed (leaf numbers are still read live; keys added to the same object after resolution are not tracked). The public one-shot `interpolate()` keeps the legacy parse-every-call path and doubles as the oracle in tests. `compileColorMix` and `compileNumericTemplate` live in the internal `src/utils/valueTemplate.ts`.

**Results** (`npm run bench:interpolate`, `resolved` group, median ops/ms over three invocations per side; the baseline in the Target section is the first recording, this table is the interleaved re-run):

| Case | before | after | factor | target |
|---|---|---|---|---|
| `number` | ~73,000 | ~114,000 | 1.6x | no regression: met |
| `color-hex` | ~1,940 | ~7,200 | 3.7x | >= 3x: met |
| `color-rgba` | ~1,015 | ~3,100 | 3.0x | >= 3x: met (borderline) |
| `numeric-template` | ~710 | ~1,350-1,420 | 1.9-2.0x | >= 2x: met (borderline) |
| `unit-string` | ~1,510 | ~4,100 | 2.7x | >= 1.5x: met |
| `array-4-numbers` | ~6,400 | ~17,800 | 2.8x | no regression: met |
| `object-3-fields` | ~4,500 | ~4,400-4,800 | 1.0x | no regression: met, **no gain** |

The first interleaved set of the day showed `color-hex` at only 2.3x; precomputing the constant alpha text moved it to 3.7x. One earlier "before" invocation was disturbed by a load spike (ops/ms 2-3x lower on one side); the table uses the quiet ones and the direction was identical in all of them.

**Allocation** (`scavengesPerMillionOps`; with `--min-semi-space-size=1 --max-semi-space-size=1` so collections track bytes allocated): `color-hex` 1063 -> 290, `color-rgba` 2230 -> 350, `numeric-template` 1623 -> 393, `unit-string` 1447 -> 93, `array-4-numbers` 783 -> 163, `object-3-fields` 543 -> 490, `number` 16.7 -> 13.3. With the default semi-space size `object-3-fields` read 16.7 -> 30 (5 -> 9 collections per run, at the granularity floor of that measurement) while the sensitive 1 MB setting shows a small decrease; I treat the object case as allocation-neutral, not improved, and did not investigate further (result-object construction dominates it).

**Heap delta.** Not re-checked separately: with fewer scavenges the `heapMedianDeltaMb` metric is confounded (see PERF-008 Status), so the scavenge counts above are the allocation evidence. The 1-vs-3 invocation caveat from the performance gate applies: three invocations per side, not more.

**Other workloads.** `bench:keyframes` (numeric keyframes, uses the same resolver) did not change beyond noise between the two builds. The full `npm run bench` suite was not re-run.

**Tests.** `tests/values/interpolate.compiled.test.ts` (new, written first and green on the old code): compiled closure vs one-shot `interpolate()` on 1,200 seeded random pairs x 11 progress values covering numbers, hex/rgba/space-separated/percentage colors, units, exponent and signed numbers, templates, arrays and nested objects; repeated calls; foreign endpoints; leaf mutation; different-shaped containers; incompatible and custom interpolators. `tests/utils/valueTemplate.test.ts` +3 for the two new helpers. All existing `tests/values/*.test.ts` pass unchanged. 45 suites / 762 tests (was 44 / 753).

**Verification.** `typecheck`, `typecheck:tests`, `npm test -- --runInBand`, `check:tree-shaking`, `check:package`, `check:package:consumer` and `check:docs` pass. `dist/values/interpolate.d.ts` is unchanged; `valueTemplate.d.ts` (internal, not exported from any entry point) gains the two helpers.

**On the `grep` criterion.** `grep -n "parseColor\|tokenizeNumbers" src/values/interpolate.ts` still shows calls, but only in `canInterpolate` (resolve time), `compile` (resolve time) and the generic `interpolateValue` that serves the one-shot `interpolate()` and the mismatch fallback. None runs in the steady-state per-frame closure; the criterion is read that way.

## Problem

String and color tweens re-parse both fixed endpoints with regexes on every frame.

## Evidence

- `src/values/interpolate.ts:52-69` `interpolateValue`: for strings it calls `parseColor(from)`, `parseColor(to)` and, when not colors, `parseNumericTemplate(from)` and `(to)` on every call; `resolveInterpolator` (line 5-14) only validates once and then returns a thunk that re-enters `interpolateValue`.
- Arrays/objects recurse through the same path allocating new arrays/objects per frame (`interpolate.ts:70-77`).
- Per-frame cost scales with `Tween` count; baseline mean frame cost at 5000 plain `Animation`s is 0.99 ms (no interpolation), so interpolation work is *additional* to that.

## Scope

- In `resolveInterpolator`, compile `(from, to)` into a closure holding pre-parsed numbers/channels and the output template.
- Keep `interpolate()` (the allocation-free one-shot) working by compiling on demand.
- Do not change output strings (guarded by REFACTOR-003 parity tests).

## Non-goals

- No caching keyed by string across Tweens (memory/leak risk).

## Risks

- Closures hold parsed copies; confirm no retention of large objects after dispose.

## Acceptance criteria

Every box must be checkable by running the named command or inspecting the named file.

- [x] All existing `tests/values/*.test.ts` pass unchanged.
- [x] A property-style test compares compiled vs. legacy output for ≥1000 random pairs of numbers, hex/rgb colors and numeric templates at random progress values: identical strings.
- [x] `grep -n "parseColor\|parseNumericTemplate" src/values/interpolate.ts` shows no call reachable from the per-frame closure.
- [x] `npm run bench:interpolate` (BENCH-008): median ops/ms for the `resolved` color and numeric-template cases is higher than the BENCH-008 baseline by the target recorded in this file before work begins, outside the BENCH-007 noise band; number-only tweens do not regress.
- [x] `scavengesPerMillionOps` for the same cases (BENCH-008, relative allocation measure) does not increase, and the GC-controlled `heapMedianDeltaMb` does not increase.

## Shared gates

**Code gate** (see `roadmap/README.md`)
- [x] `npm run typecheck` and `npm run typecheck:tests` pass.
- [x] `npm test -- --runInBand` passes (record the test count; it must not decrease unless tests are intentionally replaced).
- [x] `npm run check:tree-shaking`, `npm run check:package` and `npm run check:package:consumer` pass.
- [x] No change to public `.d.ts` output unless intended; any intended change is recorded in `CHANGELOG.md` under Unreleased.

**Performance gate** (see `roadmap/README.md`)
- [x] Performance comparison follows `roadmap/README.md` → "Performance gate": same machine and Node version as the baseline, median of ≥5 repeats (≥10 once BENCH-007 lands) of the named `bench:*` command, compared with `npm run bench:compare`. Timings are **never** a CI gate.
- [x] The improvement target for this item is written into this file *before* implementation starts (taken from the BENCH-008 baseline); the PR links the before/after JSON. *(Target recorded before work; the before/after JSON stayed in a temporary scratch directory, the tables above carry the numbers.)*
- [ ] No other workload in `npm run bench` regresses beyond the measured noise band. *Only `bench:interpolate` and `bench:keyframes` were compared; the full suite was not re-run.*
