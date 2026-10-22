# Releases and npm publishing

## Release contract

- The package version lives in the root `package.json`.
- Every release tag must exactly match that version, prefixed with `v` (for example, package version `0.2.0` uses tag `v0.2.0`).
- `package-lock.json` is committed. CI uses `npm ci`; it must never generate or rewrite the lockfile.
- Run `npm run check:all` successfully before creating a release tag. This includes type checks, Jest, real-browser integration, tree-shaking, package allowlist and consumer checks, documentation contracts, and the production documentation build.
- The tag-triggered publishing workflow installs Chromium and reruns `npm run check:all`; publication is blocked if any release contract fails.

## npm Trusted Publishing (OIDC)

The `publish-npm.yml` workflow publishes on version tags using npm Trusted Publishing. Configure a trusted publisher for the existing `@re-code/flux` package on npm with:

- **GitHub owner:** `iamcodex96`
- **Repository:** `re-flux`
- **Workflow file:** `publish-npm.yml`
- **GitHub environment:** `npm`

The workflow requests `id-token: write` and publishes with provenance. Do not add a long-lived npm token to GitHub Actions secrets when using Trusted Publishing. If npm's trusted publisher configuration has not been created, the publish job will fail rather than fall back to a token.

## Create a release

1. Update the root package version and changelog, then commit the changes.
2. Install dependencies and run the complete local release gate:

   ```bash
   npm ci
   npx playwright install chromium
   npm run check:all
   ```

3. Wait for CI on `main` to pass.
4. Push a tag that exactly matches the package version. For example, if the version is `X.Y.Z`:

   ```bash
   git tag vX.Y.Z
   git push origin vX.Y.Z
   ```

5. Confirm the `Publish to npm` workflow succeeds and verify the version with `npm view @re-code/flux@X.Y.Z version`.

Replace `X.Y.Z` with the exact version in `package.json`. Do not create the tag until the full check passes locally and CI is green.

## Workflow location

GitHub Actions workflows are maintained only in `.github/workflows/`. Edit the canonical workflow there; do not maintain duplicate copies elsewhere in the repository.
