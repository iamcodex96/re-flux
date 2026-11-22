# Roadmap acceptance criteria — how to read this folder

Each file `roadmap/<ID>-<slug>.md` describes one roadmap item from [`../roadmap.md`](../roadmap.md): the problem, the evidence found in the audit, scope and non-goals, risks, and **acceptance criteria written as checkboxes**. An item is done only when every checkbox is ticked and every command named in it has been run.

## ID scheme

IDs continue the repository's existing commit-ticket convention. Numbers start above the highest ID already used in `git log` for that prefix: `BENCH-006+` (existing up to 005), `PERF-002+`, `REFACTOR-003+`, `DOCS-004+`, `UNIT-008+` (tests; existing `UNIT-001…007`) and `CHORE-006+` (tooling, dependencies, packaging; existing `CHORE-001…005`). `API` is the only new prefix, used for the single public-API item. The earlier `AUDIT-001` commits covered release-candidate boilerplate and docs; none of the items here duplicates them.

## Scoring

`Priority = (Impact + Risk) × (6 − Effort)`, each 1–5 (Effort inverted: lower effort ⇒ higher priority). The score orders work *inside a phase*; phases and the `Depends on` column decide the real sequence. Scores are judgement calls made from the evidence in each file, not measurements.

## Shared gates

Items reference these gates instead of repeating them.

### Code gate

Applies to every item that changes `src/`, `scripts/`, `benchmarks/` or tests.

- [ ] `npm run typecheck` and `npm run typecheck:tests` pass.
- [ ] `npm test -- --runInBand` passes. The test count does not decrease unless tests are intentionally replaced (say so in the PR).
- [ ] `npm run check:tree-shaking`, `npm run check:package` and `npm run check:package:consumer` pass.
- [ ] Public `.d.ts` output is unchanged unless the change is intentional, in which case it is recorded in `CHANGELOG.md` under *Unreleased* (diff `dist/**/*.d.ts` before and after `npm run build:lib`).

The full local equivalent is `npm run check:all`; it also covers browser integration and docs contracts and should be green before merging anything that touches adapters.

### Performance gate

Applies to items labelled `perf`. Benchmarks in this repository are **descriptive, never a CI pass/fail threshold** (`benchmarks/README.md`).

- [ ] Same machine, same Node.js version, same workload settings and similar background load as the baseline being compared against. Baselines (local and git-ignored; Node 24.15.0, darwin arm64): `baseline/bench-2026-11-22-darwin-arm64-node24.15.0-run1.json`, `-run2.json`, `-run3.json` (three default invocations of the full suite including the BENCH-008 workloads) and `-gc.json` (`BENCH_GC=1`; compare GC-controlled runs only with it). The earlier `baseline/bench-2026-11-16-…json` covers the four original workloads only. Between-invocation drift on this machine is large, so compare against all three default runs, not just one.
- [ ] Compare the **median of 10 repeats** (the default since BENCH-007) of the named `bench:*` command, using `npm run bench:compare` (BENCH-006), on at least three separate invocations per side (see `benchmarks/README.md` → "Reading results honestly"). Compare distributions (median, p95, p99, worst), not a single sample.
- [ ] **Measure on a quiet machine.** `uptime` must show a load average well below half the core count; the report's `harness.system.busy` must be `false` (`bench:compare` warns otherwise). The local, git-ignored baselines were recorded under heavy load and must be re-recorded first (`baseline/README.md`).
- [ ] **Judge on stable metrics.** On the loaded development machine used for the 2026-11-22 baselines, per-row noise bands for p95/p99/worst-frame metrics came out at roughly ±90–370%, so those tail metrics cannot demonstrate an improvement there. Base the acceptance decision on means and elapsed time, `medianOpsPerMs`, `scavengesPerMillionOps` and `medianBytesPerInstance`, measured across at least three invocations; treat tail metrics as indicative unless they were measured on a quieter machine.
- [ ] The improvement target is written into the item file **before** implementation starts, derived from the BENCH-008 baseline. Numbers in this roadmap are never promises.
- [ ] A change is "an improvement" only if it exceeds the noise band reported by BENCH-007. No other workload regresses beyond that band.
- [ ] The PR links the before and after JSON reports.

### Docs gate

- [ ] `npm run check:docs` passes. Several `scripts/check-*.mjs` contracts assert literal strings in docs sources (see DOCS-004); update the matching script in the same PR whenever a literal it asserts changes.
- [ ] `npm run build --workspace=re-flux-docs` passes.

## Working rules

1. Never combine a formatting-only change with a logic change (see CHORE-006).
2. Write characterization tests on `main` **before** refactoring behaviour that is under-tested (UNIT-008, UNIT-009 and UNIT-010 gate most refactors).
3. If an item's evidence is found to be wrong when work starts, update the item file first and say so in the PR.
4. Items marked *measure-first* (PERF-010, PERF-011) may legitimately end as "no change needed" with the measurements attached.
