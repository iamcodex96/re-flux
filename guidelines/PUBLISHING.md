# Releases and npm publishing

## Release contract

- The package version lives in the root `package.json`.
- Every release tag must exactly match that version, prefixed with `v` (for example, package version `0.2.0` uses tag `v0.2.0`).
- `package-lock.json` is committed. CI uses `npm ci`; it must never generate or rewrite the lockfile.
- CI, workflow-copy synchronization, type checks, tests, tree-shaking, and package allowlist checks must pass before publication.

## npm Trusted Publishing (OIDC)

The `publish-npm.yml` workflow publishes on version tags using npm Trusted Publishing. Configure a trusted publisher for the existing `@re-code/flux` package on npm with:

- **GitHub owner:** `iamcodex96`
- **Repository:** `re-flux`
- **Workflow file:** `publish-npm.yml`
- **GitHub environment:** `npm`

The workflow requests `id-token: write` and publishes with provenance. Do not add a long-lived npm token to GitHub Actions secrets when using Trusted Publishing. If npm's trusted publisher configuration has not been created, the publish job will fail rather than fall back to a token.

## Create a release

1. Update the root package version and commit the changes.
2. Wait for CI on `main` to pass.
3. Push the matching tag:

   ```bash
   git tag v0.2.0
   git push origin v0.2.0
   ```

4. Confirm the `Publish to npm` workflow succeeds and verify the published version with `npm view @re-code/flux version`.

Use the actual package version from `package.json` when creating the tag.

## Workflow locations

GitHub runs workflows only from `.github/workflows/`. Identical source copies are also kept in `ci/workflows/` for repository organization. The `check:workflow-sync` script verifies that each pair remains byte-for-byte identical.
