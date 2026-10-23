# Releases and npm publishing

## Release contract

- The package version lives in the root `package.json`.
- Every release tag must exactly match the root package version, prefixed with `v` (for example, package version `0.2.0` uses tag `v0.2.0`, while `0.5.0-beta.0` uses `v0.5.0-beta.0`).
- Prerelease versions publish with an npm dist-tag matching the first prerelease identifier (`0.5.0-beta.0` → `beta`); stable versions publish with `latest`. Do not use an unqualified `latest` tag for beta releases.
- `package-lock.json` is committed. CI uses `npm ci`; it must never generate or rewrite the lockfile.
- Run `npm run check:all` successfully before creating a release tag. This includes type checks, Jest, real-browser integration, tree-shaking, package allowlist and consumer checks, documentation contracts, and the production documentation build.
- The tag-triggered publishing workflow installs Chromium and reruns `npm run check:all`; publication is blocked if any release contract fails.

## npm Trusted Publishing (OIDC)

The `publish-npm.yml` workflow publishes on version tags using npm Trusted Publishing. Configure a trusted publisher for the existing `@re-code/flux` package on npm with:

- **GitHub owner:** `iamcodex96`
- **Repository:** `re-flux`
- **Workflow file:** `publish-npm.yml`
- **GitHub environment:** `npm`

The workflow requests `id-token: write` and publishes with provenance. It reads the release version from the root `package.json`: prereleases such as `0.5.0-beta.0` publish with `--tag beta`, while stable versions publish with `--tag latest`. Do not add a long-lived npm token to GitHub Actions secrets when using Trusted Publishing. If npm's trusted publisher configuration has not been created, the publish job will fail rather than fall back to a token.

## Create a release

1. Update the root package version and changelog, then commit the changes.
2. Install dependencies and run the complete local release gate:

   ```bash
   npm ci
   npx playwright install chromium
   npm run check:all
   ```

3. Wait for CI on `main` to pass.
4. Push a tag that exactly matches the package version. For a stable version:

   ```bash
   git tag vX.Y.Z
   git push origin vX.Y.Z
   ```

   For a beta prerelease, use the full prerelease version instead, for example `v0.5.0-beta.0`. Do not publish the beta using a stable version number.

5. Confirm the `Publish to npm` workflow succeeds. Verify the published version and dist-tags:

   ```bash
   npm view @re-code/flux dist-tags
   npm view @re-code/flux@beta version
   npm install @re-code/flux@beta rxjs
   ```

   For a stable release, verify `npm view @re-code/flux@X.Y.Z version` and confirm `latest` points at the intended stable version. Replace `X.Y.Z` with the exact version in `package.json`. Do not create the tag until the full check passes locally and CI is green.

## Workflow location

GitHub Actions workflows are maintained only in `.github/workflows/`. Edit the canonical workflow there; do not maintain duplicate copies elsewhere in the repository.
