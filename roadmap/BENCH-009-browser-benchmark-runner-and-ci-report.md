# BENCH-009 — Headless real-browser benchmark runner and report-only CI job

| Category | Impact | Risk | Effort | Priority score | Phase | Depends on |
|---|---|---|---|---|---|---|
| Benchmarks | 3 | 3 | 4 | **12** | 3 | [BENCH-006](./BENCH-006-clean-json-baseline-compare.md), [BENCH-007](./BENCH-007-variance-and-gc-control.md) |

Priority = (Impact + Risk) × (6 − Effort). Back to the [roadmap](../roadmap.md).

## Status

**Done 2026-11-23** on branch `claude/phase-3-9822a6` (one commit; the workflow has not run on GitHub, see below).

What was built:

- `scripts/run-browser-benchmark.mjs` (`npm run bench:browser -- --out <file>`) builds the docs app with Vite into a temporary directory (base `/`), serves it from a loopback server and drives the **unmodified** Benchmark Lab page in headless Chromium through its own controls (scenario, renderer, target count, duration, *Run comparison*, *Export JSON*). `BrowserBenchmarks.vue` and `scripts/check-browser-benchmark.mjs` are untouched. Shared plumbing (static server, Chromium launcher, self-hosted libraries, CDP counters) lives in `scripts/lib/browser-bench.mjs`.
- Output is one suite file `{ benchmark, schemaVersion: 2, kind: 'suite', runner, reports: [{ id, report }] }` where every `report` is exactly the page's own `schemaVersion: 2` export. The wrapper exists because one page export covers one scenario/renderer; `runner` (git revision, Chromium version and flags, Node/platform, machine load at start and end, library sources) is the only addition.
- **Self-hosted comparison libraries.** `gsap@3.15.0` and `animejs@4.5.0` are exact `devDependencies`; the runner bundles them with esbuild and answers the page's `https://esm.sh/...` imports through Playwright request routing (other `esm.sh` requests are refused, and the run fails if a library was not requested or the installed version differs from the version the page pins). `--cdn` loads the live CDN copies. This is an npm download of two packages (GSAP is distributed under GreenSock's "Standard License", not an OSI licence; it is only a dev dependency used by this runner and is not published or bundled into the package).
- **Browser:** the Chromium already cached for Playwright 1.64.1 (`chromium-1248`, Chrome 156.0.8078.4) was used; **nothing was downloaded** for it. CI installs it with `npx playwright install --with-deps chromium`.
- `.github/workflows/benchmarks.yml`: `workflow_dispatch` and a weekly `schedule` only (never push or PR), job-level and step-level `continue-on-error: true`, runs `npm run bench -- --out` and the browser runner, and uploads `benchmark-reports/` (Node JSON, browser JSON, runner details) with `if: always()`. The runner never compares against a threshold. The YAML parses (checked with Ruby's YAML), but **the workflow has not been run on GitHub**, so the Linux run, Chromium install and artifact upload are unverified.
- `benchmarks/README.md` documents the runner, the output, the headless-pacing caveat and the quoting decision.
- The runner also has a second suite, `--suite adapters`, used by PERF-010 (Chrome style-recalculation and layout counters around `flip()`, `animate()`, `animateNumber()` and `followSvgPath$`, driven by `tests/browser/layout-probe.ts`). It is not part of this item's acceptance criteria.

### Decision: comparison-library numbers are not quoted in the docs

**Not in the README or the documentation website.** The GSAP and Anime.js columns exist so the Lab can run a like-for-like workload on a visitor's own machine and so a re;Flux regression can be read against a reference moving under the same conditions. A figure printed in our docs would come from one machine with headless frame pacing, a single synthetic workload we wrote and a noise level we cannot bound, set next to someone else's product. Artifacts are for maintainers. A published comparison would need a quiet-machine headed run, the complete JSON linked beside it, the exact versions and a description of the workload, and should be its own decision. Recorded in `benchmarks/README.md`.

### Evidence

- A default run (`--scenarios dom,svg,canvas`, 500 targets, 1.5 s, load average 9–17 on 8 cores, so indicative only) produced 118 KB of JSON with three `shared-renderer` reports (dom, svg, canvas), each with results for re;Flux, GSAP and Anime.js, 10 measured runs per engine and `cleanupPassed: true` for all nine. Median renderer p95 (ms): DOM 0.4 / 0.4 / 0.4, SVG 1.05 / 0.85 / 0.9, Canvas 0.6 / 0.65 / 0.55 (re;Flux / GSAP / Anime.js). Frame p95 was 16.7 ms for every engine and scenario: headless Chromium locks `requestAnimationFrame` to a 59.88 Hz virtual cadence (`estimatedRafCadenceHz`), so frame-pacing metrics do not discriminate in headless mode — which is why the caveat is in the README and in the runner's `frameTimingNote`.
- A smoke run on 100 targets / 1 s showed the same structure and confirmed that both comparison libraries were served from the local bundles (`served.size === 2` assertion).
- Not verified: a quiet-machine run, a headed run, a Linux/CI run, the `--cdn` path, the `engine-only` and `per-target-dom` scenarios through the runner (the code path is the same, selected by `--scenarios`).

## Problem

Node benchmarks cannot see layout, style recalc, SVG paint or canvas raster cost, which is where DOM/SVG/Canvas adapter time actually goes. The in-docs Benchmark Lab exists but results are only produced by hand in a visitor's browser and are never recorded.

## Evidence

- `apps/docs/src/views/BrowserBenchmarks.vue` (1218 lines) already compares re;Flux with GSAP 3.15.0 and anime.js 4.5.0 loaded from esm.sh, with a JSON export (`scripts/check-browser-benchmark.mjs`), but nothing in the repo stores a result.
- Playwright 1.64.1 is already a devDependency and `scripts/check-browser-integration.mjs` already drives Chromium.
- Benchmarks are not run in `.github/workflows/ci.yml` at all, so regressions in the adapters are only noticed by chance.
- The Benchmark Lab loads GSAP/anime.js from a CDN at runtime, so results depend on network availability and on those CDN versions.

## Scope

- `scripts/run-browser-benchmark.mjs` using Playwright to run the Benchmark Lab scenarios headlessly and save JSON (same schema as the page export, `schemaVersion: 2`).
- Prefer a self-hosted/pinned copy of the comparison libraries for the CI run to remove CDN variance.
- A manually-triggered or scheduled GitHub Actions workflow that uploads bench JSON as an artifact; it must not fail CI on timing.
- Decide and document whether comparison-library numbers may be quoted in docs (they currently are not).

## Non-goals

- No performance claims about other libraries are added to README or docs by this item.

## Risks

- Hosted CI runners are noisy; the job is report-only. Headless Chromium frame pacing differs from a real display — label results accordingly.

## Acceptance criteria

Every box must be checkable by running the named command or inspecting the named file.

- [x] `node scripts/run-browser-benchmark.mjs --out /tmp/browser.json` produces a schema-v2 report containing results for DOM, SVG and Canvas scenarios and all three engines (a suite file wrapping three page exports, each `schemaVersion: 2`; see Status).
- [x] (written and YAML-validated; not run on GitHub) A new workflow (or job) uploads the Node and browser JSON as artifacts and has `continue-on-error` or equivalent so a slow runner cannot fail CI.
- [x] `npm run check:browser-benchmark` still passes (update the literal-string assertions it contains if the page changes; see DOCS-004).
- [x] The README of `benchmarks/` documents the browser runner and its caveats.

## Shared gates

**Code gate** (see `roadmap/README.md`)
- [x] `npm run typecheck` and `npm run typecheck:tests` pass.
- [x] `npm test -- --runInBand` passes (record the test count; it must not decrease unless tests are intentionally replaced): 57 suites / 1,540 tests (1,534 before Phase 3; the six new ones belong to PERF-010).
- [x] `npm run check:tree-shaking`, `npm run check:package` and `npm run check:package:consumer` pass.
- [x] No change to public `.d.ts` output unless intended; any intended change is recorded in `CHANGELOG.md` under Unreleased.

**Docs gate** (see `roadmap/README.md`)
- [x] `npm run check:docs` passes (update the matching `scripts/check-*.mjs` contract in the same PR if a literal it asserts changes).
- [x] `npm run build --workspace=re-flux-docs` passes (it was already failing on `main` with two `Cannot find name 'process'` errors from `src/utils/easings.ts` (API-001); fixed in a separate commit with `apps/docs/src/node-process.d.ts`).
