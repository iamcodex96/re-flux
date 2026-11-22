# Recorded benchmark baselines

**Git-ignored:** every `*.json` in this folder is a local, machine-specific baseline and is deliberately not committed (`.gitignore`). The 2026-11-16 file was committed once (in `a21e640`) and has been untracked since; it stays on disk. They live on the machine that recorded them; recreate them with `npm run bench:save -- --out roadmap/baseline/<name>.json`.

| File | Workloads | Notes |
|---|---|---|
| `bench-2026-11-16-darwin-arm64-node24.15.0.json` | original four (frame coordinator, timeline, animation load, adapters) | 5 repeats, no GC or load tracking |
| `bench-2026-11-22-darwin-arm64-node24.15.0-run1.json`, `-run2.json`, `-run3.json` | all ten workloads | three default invocations, 10 repeats |
| `bench-2026-11-22-darwin-arm64-node24.15.0-gc.json` | all ten workloads | `BENCH_GC=1`; compare only with other GC-controlled reports |

## Read this before using them

**All of these were recorded on a heavily loaded development machine.** Several agent sessions and builds were running at the same time; a load check made right afterwards showed a 1-minute load average above 100 on 8 logical cores, with a `rustc` build at about 200% CPU and another `node` process at about 117%. Consequences:

- Absolute timings, run-to-run drift (for example a 4.8 ms vs 16 ms `frameCoordinator` median in consecutive runs), the very wide tail noise bands (±90–370%) and the within-process coefficients of variation all describe *a loaded machine*, not the library. A quiet machine will show much less noise.
- Deterministic results are unaffected: retained bytes per instance (`memory` workload, CV below 0.4%), checksums, callback and draw counts, and the *relative* ordering of cases within one run (for example more completed timeline segments being slower to seek).
- These files carry no machine-load record (it did not exist yet); later reports include `harness.system`, and `bench:compare` warns when either side was recorded on a busy machine.

**Before accepting a PERF item, re-record the baselines on a quiet machine** (no other builds, editors or agent sessions; `uptime` should show a load average well below half the core count) and replace these files. Treat the numbers here as indicative only.
