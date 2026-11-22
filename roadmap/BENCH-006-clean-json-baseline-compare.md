# BENCH-006 — Machine-readable bench output, committed baseline, compare script

| Category | Impact | Risk | Effort | Priority score | Phase | Depends on |
|---|---|---|---|---|---|---|
| Benchmarks | 4 | 3 | 2 | **28** | 0 | — |

Priority = (Impact + Risk) × (6 − Effort). Back to the [roadmap](../roadmap.md).

## Status

**Done 2026-11-22.** `benchmarks/benchmark-utils.mjs` gained `emitReport()`/`resolveOutPath()` (`--out <file>`, `--out=<file>` or `BENCH_OUT`); the four benchmark scripts and `run-all.bench.mjs` use it (`run-all` strips `BENCH_OUT` for its child processes). New `benchmarks/compare.mjs` (143 comparable rows from the baseline: median/p95/p99/worst frame times, seek times, duration-read rate, shared-scheduler speed-up; `--noise <percent>`, default ±10%) and `benchmarks/save.mjs`; scripts `bench:save` and `bench:compare`; `benchmarks/results/` is git-ignored. Verified: a file written with `npm run bench -- --out` parses directly; self-comparison of the baseline gives +0.00% everywhere; a report with a different Node version exits 2 unless `--allow-runtime-mismatch` is passed. Observation: two runs of identical code on this machine disagreed by more than the 10% default on tail metrics (80 rows "faster", 14 "slower" against the stored baseline), which is exactly the noise problem BENCH-007 addresses.

## Problem

`npm run bench` cannot be piped into a JSON consumer, there is no stored baseline, and nothing compares two runs, so every "did it get faster?" claim is manual.

## Evidence

- Redirecting `npm run bench` to a file produced a file starting with the npm banner (`> @re-code/flux@0.5.0-beta.0 bench`); `JSON.parse` failed until the banner was stripped (seen while reviewing this audit).
- `benchmarks/README.md` says "Capture output before and after a change" but no script or directory exists for that.
- `benchmarks/run-all.bench.mjs` prints one aggregate JSON document to stdout only; there is no `--out` option.

## Scope

- Add `--out <file>` (or `BENCH_OUT`) to `run-all.bench.mjs` and the individual scripts so JSON is written without relying on stdout.
- Add `benchmarks/compare.mjs <baseline.json> <candidate.json>` that prints per-workload median / p95 / p99 deltas and flags metrics whose change is inside the noise band reported by BENCH-007.
- Add `npm run bench:save` and `npm run bench:compare`.
- Document the workflow in `benchmarks/README.md`; keep `roadmap/baseline/` as the first recorded baseline.

## Non-goals

- No pass/fail timing threshold in CI (the README deliberately keeps benchmarks non-gating).

## Risks

- Baselines are machine-specific; the file name encodes platform, arch and Node version and the compare script must refuse (or loudly warn on) mismatched runtimes.

## Acceptance criteria

Every box must be checkable by running the named command or inspecting the named file.

- [x] `npm run bench -- --out /tmp/x.json` (or `BENCH_OUT=/tmp/x.json npm run bench`) writes a file that `node -e "JSON.parse(require('fs').readFileSync('/tmp/x.json','utf8'))"` parses with no preprocessing.
- [x] `npm run bench:compare -- roadmap/baseline/bench-2026-11-16-darwin-arm64-node24.15.0.json /tmp/x.json` exits 0 and prints a table with one row per workload × metric (median, p95, p99, worst).
- [x] The compare script exits non-zero (or prints a prominent warning, chosen and documented) when `runtime.node`, `platform` or `arch` differ between files.
- [x] Comparing a file with itself reports 0% change on every row.
- [x] `benchmarks/README.md` documents save → change → compare, and states that results are descriptive and never gate CI.
- [x] `npm run check:docs` still passes (the README is referenced by docs contracts).

## Shared gates

**Code gate** (see `roadmap/README.md`)
- [x] `npm run typecheck` and `npm run typecheck:tests` pass.
- [x] `npm test -- --runInBand` passes (record the test count; it must not decrease unless tests are intentionally replaced).
- [x] `npm run check:tree-shaking`, `npm run check:package` and `npm run check:package:consumer` pass.
- [x] No change to public `.d.ts` output unless intended; any intended change is recorded in `CHANGELOG.md` under Unreleased.
