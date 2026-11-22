# BENCH-009 — Headless real-browser benchmark runner and report-only CI job

| Category | Impact | Risk | Effort | Priority score | Phase | Depends on |
|---|---|---|---|---|---|---|
| Benchmarks | 3 | 3 | 4 | **12** | 3 | [BENCH-006](./BENCH-006-clean-json-baseline-compare.md), [BENCH-007](./BENCH-007-variance-and-gc-control.md) |

Priority = (Impact + Risk) × (6 − Effort). Back to the [roadmap](../roadmap.md).

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

- [ ] `node scripts/run-browser-benchmark.mjs --out /tmp/browser.json` produces a schema-v2 report containing results for DOM, SVG and Canvas scenarios and all three engines.
- [ ] A new workflow (or job) uploads the Node and browser JSON as artifacts and has `continue-on-error` or equivalent so a slow runner cannot fail CI.
- [ ] `npm run check:browser-benchmark` still passes (update the literal-string assertions it contains if the page changes; see DOCS-004).
- [ ] The README of `benchmarks/` documents the browser runner and its caveats.

## Shared gates

**Code gate** (see `roadmap/README.md`)
- [ ] `npm run typecheck` and `npm run typecheck:tests` pass.
- [ ] `npm test -- --runInBand` passes (record the test count; it must not decrease unless tests are intentionally replaced).
- [ ] `npm run check:tree-shaking`, `npm run check:package` and `npm run check:package:consumer` pass.
- [ ] No change to public `.d.ts` output unless intended; any intended change is recorded in `CHANGELOG.md` under Unreleased.

**Docs gate** (see `roadmap/README.md`)
- [ ] `npm run check:docs` passes (update the matching `scripts/check-*.mjs` contract in the same PR if a literal it asserts changes).
- [ ] `npm run build --workspace=re-flux-docs` passes.
