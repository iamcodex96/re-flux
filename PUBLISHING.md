# CI, publishing and maintenance

## GitHub Actions

The workflow in `.github/workflows/ci.yml` is the quality gate for pull requests and pushes to `main`. It runs library/test type checks, Jest, Visual Lab and Playground lifecycle checks, tree-shaking/package audits, and the complete library + Vue docs build. The separate `.github/workflows/deploy-docs.yml` deploys GitHub Pages from `main`. Matching workflow copies are also kept under `ci/workflows/` for repository organization; GitHub Actions executes only files under `.github/workflows/`.

Before enabling CI, commit the root workspace `package-lock.json`. The workflow deliberately uses `npm ci` and never creates or updates a lockfile on the runner. When manifests change, update it locally with `npm install`, review the diff, and commit it with the manifest changes.

In the repository settings, set **Settings → Pages → Build and deployment → Source → GitHub Actions**. The docs workflow builds with the repository subpath as Vite's base URL and deploys `apps/docs/dist`.

## npm releases

`.github/workflows/publish-npm.yml` runs only when a `v*` tag is pushed. It verifies that the tag exactly matches the `version` in `package.json`, checks that package repository metadata matches the current GitHub repository, installs dependencies from the committed lockfile, and runs `npm publish`. npm's `prepack` script runs the library type checks, tests, build, tree-shaking check and package-content audit before the tarball is created.

### Required repository metadata

Set `package.json`'s `repository` field to the actual GitHub repository URL before publishing. Use the exact owner and repository name from the GitHub remote, for example:

```json
"repository": {
  "type": "git",
  "url": "git+https://github.com/OWNER/REPOSITORY.git"
}
```

Do not keep `OWNER/REPOSITORY` literally; the `check:release` script verifies that the field matches the `GITHUB_REPOSITORY` value for the release workflow.

### Configure npm Trusted Publishing

The release workflow uses npm Trusted Publishing (OIDC), avoiding a long-lived write token in GitHub Actions. Configure it once the package exists on npm:

1. Open the `@re-code/flux` package settings on npmjs.com and find **Trusted publishing**.
2. Add **GitHub Actions** as the publisher.
3. Use the exact GitHub owner and repository, workflow filename `publish-npm.yml`, and GitHub Environment name `npm`.
4. Allow direct `npm publish` for this publisher. The workflow grants `id-token: write` only to the publishing job and uses a GitHub-hosted runner with a supported npm CLI.
5. Optionally protect the GitHub `npm` environment with required reviewers. If configured in npm, the environment name must remain exactly `npm`.

Trusted publishing can only be configured from the npm package's settings, so a package's *first-ever* version must be bootstrapped once using a maintainer-authenticated publish. After that version exists, configure Trusted Publishing and let the tag workflow handle subsequent releases. Do not create the Trusted Publisher configuration until you are ready to complete its first successful publish; npm documents that new configurations must complete a successful publish within two days.

To release a new version:

1. Update `version` in `package.json` and the root lockfile if npm updates it.
2. Run the local checks and wait for the `main` CI workflow to pass.
3. Commit the version change and create a matching tag, e.g. `git tag v0.1.1`.
4. Push the tag with `git push origin v0.1.1`.
5. Confirm the `Publish @re-code/flux to npm` workflow succeeds and inspect the package/provenance on npmjs.com.

Never reuse an already published version. The tag must exactly match the package version.

## Local release checks

Run the following before tagging a release:

```bash
npm run typecheck
npm run typecheck:tests
npm test -- --runInBand
npm run check:visual-lab
npm run check:playground-lifecycle
npm run check:tree-shaking
npm run check:package
npm run build
npm pack --dry-run
```

`check:release` is run inside GitHub Actions for a tag because it depends on GitHub's `GITHUB_REF_TYPE`, `GITHUB_REF_NAME`, and `GITHUB_REPOSITORY` variables.

## Package and tree-shaking contract

- Publish only compiled `dist/` output, public type declarations, README, license and this document; the docs app, demos, tests and benchmarks stay out of the package.
- Keep `sideEffects: false` only while importing library modules has no observable import-time side effects.
- Keep ESM entry points and the `exports` map aligned. Core modules must not import DOM, SVG, Canvas or Three.js adapters.
- Optional renderers must not introduce runtime dependencies into unrelated entry points.
- Benchmark meaningful runtime changes before optimizing; do not use bundle-size improvements as a substitute for runtime correctness tests.
