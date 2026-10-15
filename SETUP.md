# Repository setup

## GitHub Pages

1. Open **Settings → Pages** in the GitHub repository.
2. Set the source to **GitHub Actions**.
3. Confirm the public documentation URL is `https://iamcodex96.github.io/re-flux/` (or update `README.md` and this file if the repository or domain changes).

The deployment workflow starts only after the `CI` workflow for the same `main` commit succeeds. The docs build command is `npm run build --workspace=re-flux-docs`, and the artifact directory is `apps/docs/dist`.

## npm Trusted Publishing

Configure npm Trusted Publishing for `@re-code/flux` using GitHub owner `iamcodex96`, repository `re-flux`, workflow `publish-npm.yml`, and GitHub environment `npm`. No npm token secret should be configured for this flow.

## Local checks

```bash
npm ci
npm run sync:roadmap
npm run check:roadmap
npm run check:workflow-sync
npm run typecheck
npm run typecheck:tests
npm test -- --runInBand
npm run build:lib
npm run build --workspace=re-flux-docs
```

Keep `.github/workflows/` and `ci/workflows/` synchronized; the CI script checks the copies.
