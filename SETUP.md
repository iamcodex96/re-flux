# re;Flux CI/CD setup

This patch includes the requested workflow files in `ci/workflows/` and matching copies in `.github/workflows/`.

**Important:** GitHub Actions only discovers workflow files under `.github/workflows/`. Keep those operational copies in place; the `ci/workflows/` copies are included for the repository organization you requested. If a workflow is edited, keep the two copies in sync.

## Included automation

- `ci.yml`: validates types, tests, library/package boundaries, and the documentation build on pull requests and pushes to `main`.
- `deploy-docs.yml`: builds `apps/docs` and deploys it to GitHub Pages on pushes to `main` (or manual dispatch).
- `publish-npm.yml`: publishes `@re-code/flux` when a `v*` Git tag is pushed, using npm Trusted Publishing (OIDC), not a long-lived npm token.

## One-time GitHub configuration

1. In the repository, open **Settings → Pages** and choose **GitHub Actions** as the deployment source.
2. Confirm the root `package-lock.json` is committed and in sync with `package.json` and `apps/docs/package.json`.
3. `package.json` must contain the actual repository URL. This patch adds `https://github.com/iamcodex96/re-flux` based on the repository metadata in the provided archive.
4. In npm package settings for `@re-code/flux`, configure **Trusted Publishing** for GitHub Actions using repository `iamcodex96/re-flux`, workflow filename `publish-npm.yml`, and GitHub environment `npm`. The package already needs to exist on npm.
5. After changing the package version, commit it and push a matching tag. For example, version `1.2.3` must be tagged `v1.2.3`.

The current workflow uses Node 24 and npm 11.5.1+ for Trusted Publishing. Publishing runs only on tags, and `scripts/check-release-tag.mjs` checks the tag/version/repository match before publishing.

## README

Replace `YOUR_DOCS_URL` in `README.md` with the deployed documentation URL before publishing the updated README to npm. README changes do not update the npm page until a new package version is published.
