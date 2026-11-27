# CI, release and tooling review — fix and hardening list

Findings from the level-5 review (2026-11-28), security and robustness focus: `.github/workflows/` (`ci.yml`, `deploy-docs.yml`, `publish-npm.yml`, `benchmarks.yml`), the scripts those workflows call (`scripts/check-release-tag.mjs`, `check-trusted-publishing-runtime.mjs`, `check-built-route-fallback.mjs`, `check-route-delivery.mjs`, `run-browser-benchmark.mjs`, `check-browser-benchmark.mjs`, `scripts/lib/*`, in their CI role only) and `scripts/build-atlas.py` (committed in `1d1e262`, unrelated to CI). Back to the [roadmap](../roadmap.md). Related lists: [`core-engine-review-refactors.md`](./core-engine-review-refactors.md) (R), [`api-packaging-review-refactors.md`](./api-packaging-review-refactors.md) (P), [`values-physics-review-refactors.md`](./values-physics-review-refactors.md) (V), [`adapters-operators-review-refactors.md`](./adapters-operators-review-refactors.md) (A).

## How to read this file

- This is a working backlog, not a set of roadmap items yet. When an entry is picked up, promote it to its own `roadmap/<ID>-<slug>.md` following [`README.md`](./README.md).
- The review was done by a read-only reviewer agent. It had no access to GitHub: workflow findings are reasoned from the YAML and the scripts, and the YAML structure was checked with Ruby. `build-atlas.py` was executed only against new output directories inside the session scratch folder (`scratchpad/l5/`: `run1`, `run2`, `t1`, `t2`, `t3target`, `t5`, `victim`; temporary, may be cleaned). **The findings were not independently re-run by the maintainer.** No `actionlint` or `zizmor` is installed locally or in CI.
- Confidence: *confirmed* means evident in the YAML or code, or reproduced. *Plausible* means it depends on GitHub repository settings that are not visible in the repo; those are listed under "Assumptions to verify in GitHub".
- Finding numbers (`F1`…`F5`) and suggestion numbers (`S1`…`S18`) are the review's own.
- Out of scope: `src/` and `apps/docs` (other levels) and the packaging checks (level 2: P2 and P8 already cover an unpublished-version check and the gaps in `check-release-tag.mjs`).

Every entry is a *proposal*; none has been started. Workflow changes cannot be tested locally; plan to verify them on a fork or a throwaway branch.

## Backlog

| ID | Title | Fixes | Files | Priority |
|---|---|---|---|---|
| C1 | Stop `deploy-docs` from deploying a fork's code | F1, S9, S18 | `.github/workflows/deploy-docs.yml` | High |
| C2 | Split `publish-npm` into a no-token validation job and a minimal publish job | F2, S3, S8 | `.github/workflows/publish-npm.yml` | High |
| C3 | Publish only tags that point at a CI-validated commit on `main` | F3, S4, S5 | `.github/workflows/publish-npm.yml`, `guidelines/PUBLISHING.md` | High |
| C4 | `build-atlas.py`: delete only atlas files, and do it atomically | F4, F5, S13, S14 | `scripts/build-atlas.py` | High |
| C5 | Harden all workflows (pinning, credentials, timeouts, cache) | S1, S6, S7, S8 | `.github/workflows/*.yml` | Medium |
| C6 | Make CI cover everything `check:all` covers | S2, S10 | `.github/workflows/ci.yml` | Medium |
| C7 | `build-atlas.py`: secret scan, docs and dead code | S15, S16, S17 | `scripts/build-atlas.py` | Low |
| C8 | Benchmark runner and docs-vs-workflow drift | S11, S12, S18 | `.github/workflows/benchmarks.yml`, `scripts/run-browser-benchmark.mjs`, `guidelines/SETUP.md` | Low |

Suggested order: C1 → C4 → C2 → C3 → C5 → C6 → C7 → C8. C1 and C4 are small and independent. C2 and C3 both rewrite `publish-npm.yml`; do them together or in two reviewed commits. Do C3 before the next real release.

---

### C1 — `deploy-docs` can deploy a fork's code

**Problem.** `deploy-docs.yml` runs on `workflow_run` of CI, and CI also runs on `pull_request` from forks. The workflow filters on `branches: [main]` and the job `if:` checks `workflow_run.head_branch == 'main'`. For a fork PR, `head_branch` is the fork's branch name, which the attacker chooses. The job then checks out `workflow_run.head_sha` and runs `npm ci` and the docs build with `pages: write` and `id-token: write`.

**Evidence (F1).** `.github/workflows/deploy-docs.yml:4-7, 21, 30`, permissions at `:10-13`. Scenario: an external contributor opens a PR from their fork's `main` branch, with a `postinstall` script in `package.json` or a modified docs page. If CI passes (fork approval disabled, or a maintainer approves the run believing it is only CI), the deploy fires: their code runs and their build is published to the project's GitHub Pages site. Impact: defacement or phishing on the official docs (for example a fake install snippet), and it cancels legitimate deploys through the shared `github-pages` concurrency group. It does not reach npm: the OIDC token carries `deploy-docs.yml` as the workflow ref and the npm trusted publisher is bound to `publish-npm.yml` plus the `npm` environment. Possible low-impact side effect: poisoning the `main`-scoped npm cache (`setup-node cache: npm`), although `npm ci` verifies integrity against the lockfile. Confirmed in the YAML; exploitability depends on the fork-approval setting.

**Proposal.** Add to the job `if:` both `github.event.workflow_run.event == 'push'` and `github.event.workflow_run.head_repository.full_name == github.repository`. This works regardless of environment protection rules (an environment branch policy alone is not enough). While there (S9): `cancel-in-progress: true` can cut a Pages deploy in half (GitHub's template uses `false`), and re-running an old passing CI run redeploys an old `head_sha` on top of the current one; consider `false` plus a check that `head_sha` is still the tip of `main`. (S18) `SETUP.md:42` says Pages waits for CI, but `workflow_dispatch` (`deploy-docs.yml:8, 21, 30`) deploys `github.sha` without checking CI; adjust the text or add the check.

**Tests.** None possible locally. Validate on a fork: a PR from a branch named `main` must not trigger the deploy job.

### C2 — Split `publish-npm` into validation and publish

**Problem.** One job holds `id-token: write` for the whole run: `npm ci` (install scripts of esbuild, `@parcel/watcher`, `unrs-resolver`, `fsevents`), `npx playwright install --with-deps` (CDN download plus `apt` with sudo), all of `check:all` (Jest, Chromium, Vite plugins) and `npm publish`. `ACTIONS_ID_TOKEN_REQUEST_*` is available to every step.

**Evidence (F2).** `.github/workflows/publish-npm.yml:16-52`, permissions at `:19-21`, steps at `:34`, `:36`, `:40`. If a dev or transitive dependency is compromised, its install or test script can request an OIDC token valid for this workflow and environment (what the trusted publisher accepts) and publish a malicious `@re-code/flux` with legitimate provenance. Confirmed (structure).

**Proposal.** Job 1, `validate`: no `id-token`; run the checks, `npm pack`, upload the `.tgz` as an artifact. Job 2, `publish`: `needs: validate`, `environment: npm`, `id-token: write`; download the tarball and run `npm publish <tgz> --provenance --ignore-scripts`, with no cache and no `npm ci`. S3: run `check:release` (only Node builtins, `:37-38`) before `npm ci` (`:33`), next to the runtime check, so it fails fast before third-party code runs. S8: remove `cache: npm` from the release and deploy jobs, because tag runs read the default branch's cache scope (low risk).

**Risk.** The published artifact is now the validated tarball, so check that the provenance attestation still names the right workflow and ref, and that `check:package:consumer` (which packs `dist/`) validates the same bytes that get published.

### C3 — Publish only tags on a validated `main` commit

**Problem.** Any `v*.*.*` tag publishes. Nothing checks that the commit is on `main` or that CI passed; there is no `needs` and no ancestry check. `guidelines/PUBLISHING.md:36` ("Wait for CI on main") is a manual step.

**Evidence (F3).** `.github/workflows/publish-npm.yml:3-6`. Someone with write access pushes `v0.6.0` on a commit from an unreviewed branch, with the version already bumped; code that has not passed review or `main`'s CI is published to npm. Plausible: it depends on the `npm` environment protections and tag rulesets.

**Proposal.** Add a step `git merge-base --is-ancestor "$GITHUB_SHA" origin/main` (with `fetch-depth: 0`), require reviewers on the `npm` environment, and add a tag ruleset for `v*`. S4: the concurrency group is per tag (`npm-publish-${{ github.ref }}`), so two tags pushed together (a beta and a stable) publish in parallel and race on dist-tags; use a fixed group (`npm-publish`). S5: `DIST_TAG` edge cases (`:45-47`): `1.0.0-0` gives `0`, which npm rejects as a semver range, failing at the very end after all of `check:all`; `x.y.z-latest.1` would give `latest`; `1.0.0+build-5` gives `5`. Validate `^[a-z][a-z0-9-]*$` and reject `latest` for a prerelease (complements P2 in the packaging list).

### C4 — `build-atlas.py`: delete only atlas files, atomically

**Problem.** The only guard before deleting is that `_reflux-atlas.md` exists in the output directory. If it does, the script removes the whole contents (`rmtree` / `unlink`) with no trash and no check that what it deletes looks like an atlas.

**Evidence (F4, F5, S13, S14).**
- **F4** `scripts/build-atlas.py:1041-1053`. Reproduced (`t2`): a directory containing `_reflux-atlas.md`, `.obsidian/app.json`, `Personal/diary.md` and `photo.png` ended with exit 0 and only the new atlas; `.obsidian`, `Personal` and `photo.png` were gone. Realistic: the user passes `$VAULT/Projects/Re-Flux/` (where the docstring's `rsync` already left `_reflux-atlas.md`) or the vault root, and loses their own notes and Obsidian configuration. `$HOME` and `/` are rejected (line 1034, as ancestors of the repo); a vault is not.
- **F5** `:1050-1051`. `p.is_dir()` follows symlinks, so `rmtree` on a symlink to a directory raises `OSError` after other entries were already deleted. Reproduced (`t5`): `aaa.txt` and `_reflux-atlas.md` were removed, `zlink` and `zzz.txt` stayed, and an uncaught traceback left the output half-deleted. The symlink target (`victim/`) was untouched because `rmtree` refuses symlinks. Fix: check `is_symlink()` first and `unlink()`.
- **S13** `:1032-1037`. The safety check compares paths as strings. Confirmed: `os.path.samefile(".../RE-FLUX", ".../re-flux")` returns True on this case-insensitive disk, so `.../RE-FLUX/x` passes the check and `mkdir(parents=True)` would create the atlas inside the repo. Compare by inode (`samefile` on the output and each of its parents).
- **S14** `:1134` against `:613, :617, :1147, :218`. The output is deleted first, and only afterwards can slug collisions, a missing `doc_kind` rule for a `.md` in a new directory (for example `.github/*.md`) or the strict UTF-8 decode of `ls-files` fail. The previous atlas is then lost.

**Proposal.** Delete only an allowlist of atlas paths (`modules/`, `docs/`, `tags/`, `_reflux-*.md` and the like), or generate into a temporary directory and swap at the end (this also fixes S14). Handle symlinks with `unlink()`. Compare paths by inode.

**Tests first.** The script has no tests. Add a small test (Python `unittest`, standard library only, matching the script's constraint) for: foreign files in the output directory, a symlink entry, a differently-cased path to the repo, and a generation failure that must leave the previous atlas intact. Determinism is already confirmed (two runs, identical `diff -r`).

### C5 — Harden all workflows

- **S1 — pin actions by SHA.** Pin every `uses:` to a 40-character SHA with the tag in a comment, first in the jobs that hold `id-token` or `pages: write` (`publish-npm.yml:24, 26`; `deploy-docs.yml:28, 32, 41, 43, 48`). The `checkout`, `setup-node` and `upload-artifact` v4, `configure-pages` v5 and `deploy-pages` v4 actions use the Node 20 runtime, which is deprecated; move to the current major versions (plausible).
- **S6 — `persist-credentials: false`** on every `actions/checkout`. In `deploy-docs.yml:28` the persisted token carries `pages: write` and is readable by the `npm ci` and build scripts.
- **S7 — `timeout-minutes`** on `ci.yml:15`, `deploy-docs.yml:20` and `publish-npm.yml:16`; today they get the 360-minute default (only `benchmarks.yml:25` sets one).
- **S8** and **S3** are listed under C2.

### C6 — CI covers everything `check:all` covers

- **S2.** `check:all` runs `check-unhandled-rejections.mjs` (`package.json:117`) and CI does not, so a PR can be green on `main` and fail only at publish. Add it to CI.
- **S10.** `ci.yml:11-13`: on `push` to `main`, `cancel-in-progress` cancels the previous commit's CI, so not every `main` commit is validated. Restrict the cancellation to `pull_request`.
- No tests exist for the `DIST_TAG` derivation or `check-release-tag.mjs` beyond what P2 and P8 note.

### C7 — `build-atlas.py`: secret scan, docs, dead code

- **S15** (`:1116-1123, 1205-1208`). `scan_secrets` is informational: it does not change the exit code (`:1208`), it prints the matching line (a real secret would reach the terminal or logs) and it scans after writing. The real run gave 32 hits, all false positives (`Tokenize`, `token`). It lacks patterns for `npm_`, `github_pat_`, `gh[osu]_`, `xox[abprs]-` and JWT `eyJ`. Mask the values, tighten the patterns and fail on strong hits.
- **S16** (`:15`, docstring). `rsync --delete --include='*.md'` deletes the user's own `.md` notes in `$VAULT/Projects/Re-Flux/` that are not in the atlas. Warn, or recommend `--dry-run` and an exclusive subfolder.
- **S17** (`:221-223, 661`). `git_subjects` runs `git log` but `doc_status` does not use `commit_subjects`: dead code.
- Note: the script reads the working tree, not `HEAD`: it includes uncommitted changes and excludes untracked files (for example a new roadmap file not yet added to git).

### C8 — Benchmark runner and docs-vs-workflow drift

- **S11** (`benchmarks.yml:8-10`). Declare the input as `type: choice` with the allowed values. It already travels through `env` and is validated in `run-browser-benchmark.mjs:160`, so this is cosmetic.
- **S12** (`scripts/run-browser-benchmark.mjs:313-314`). If one scenario fails, the whole suite is lost (no partial result is written). For a report-only job, write what completed.
- **S18** is listed under C1.

---

## Assumptions to verify in GitHub

These settings are not visible in the repository; several decide whether C1 and C3 are exploitable today.

- `npm` environment: required reviewers, and a deployment policy limited to `v*` tags created through a ruleset.
- `github-pages` environment: branch policy. It does not replace the C1 fix; the `if:` must be corrected.
- Tag ruleset for `v*`: who may create or move tags.
- Settings → Actions: approval of fork runs (first-time or all external contributors), read-only default `GITHUB_TOKEN` permissions, restricted allowed actions and a requirement to pin by SHA.
- Branch protection on `main` with CI as a required check.
- npm trusted publisher: `publish-npm.yml` + the `npm` environment, "disallow tokens" enabled, and no `NPM_TOKEN` stored as a secret.
- That the repository is public, which makes fork PRs possible.

## Validation gaps

- No `actionlint` or `zizmor` locally or in CI; consider adding one as a lint step.
- The `benchmarks.yml`, publish and `workflow_run` paths have never run on GitHub (BENCH-009 acknowledges this for benchmarks).
- `build-atlas.py` has no tests (see C4). Not tested: a symlink to the repo root as output; by the code, `resolve()` follows it and line 1034 rejects it.

## What is already fine (do not change)

- No script injection: no `run:` interpolates `${{ github.event.* }}`, `head_ref` or inputs. The benchmark input reaches the script through `env:` (`benchmarks.yml:55-57`) and `parseArguments` validates it against a closed list.
- CI uses `pull_request`, not `pull_request_target`; `contents: read` at workflow level; `id-token` appears only in publish (job level) and deploy.
- `npm ci` in every workflow, a Node 22/24 matrix, and `check-trusted-publishing-runtime` before install.
- Publish uses `--provenance` and OIDC with no `NPM_TOKEN`, and re-runs the full `check:all`. The publish concurrency group does not cancel running executions.
- `deploy-docs` checks out the `head_sha` that passed CI, and `workflow_dispatch` is limited to `main`.
- `benchmarks.yml` is report-only: a 45-minute timeout, `continue-on-error`, 90-day retention, and it writes nothing to the repository. No workflow commits or pushes to gh-pages.
- Scripts: `execFileSync` / `spawnSync` with no shell; `serveDirectory` blocks path traversal (`browser-bench.mjs:55`); comparison libraries are served locally and requests to other CDNs are blocked.
- `build-atlas.py`: `subprocess` with an argument list and no `shell=True`; `git ls-files -z`; note names go through `slugify` (no traversal) with slug-collision and hub-name collision detection; `write()` refuses to overwrite; it rejects `$HOME`, `/` and the repo, including through symlinks (via `resolve()`); output is deterministic.
- The documentation matches the workflows in the essentials: tag equals version, `beta` dist-tag, `check:all` at publish, Chromium in the Node 24 job.

## Shared gates

Changes to `scripts/` that run in CI must pass the **Code gate** in [`README.md`](./README.md) where they touch `src/` or tests, and `npm run check:all` locally. Workflow YAML cannot be run locally: add `actionlint` (or equivalent) as part of C5, and verify C1–C3 on a fork or throwaway branch before relying on them.
