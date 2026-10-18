# Repository setup

## Requirements

- Node.js `>=22` is required. CI validates the supported range on Node.js 22 and 24.
- npm with workspace support.

## Install and run locally

From the repository root:

```bash
npm ci
npm run dev
```

The docs app lives in `apps/docs` and is managed as the `re-flux-docs` npm workspace.

## Validation commands

```bash
npm run typecheck
npm run typecheck:tests
npm test -- --runInBand
npm run check:workflow-sync
npm run check:tree-shaking
npm run check:package
npm run check:visual-lab
npm run check:playground-lifecycle
npm run build:lib
npm run build --workspace=re-flux-docs
```

## GitHub Pages

1. Open **Settings → Pages** in the repository.
2. Select **GitHub Actions** as the source.
3. The documentation build uses `npm run build --workspace=re-flux-docs` and uploads `apps/docs/dist`.
4. The Pages workflow waits for CI on the same `main` commit to succeed.

The public documentation URL is `https://iamcodex96.github.io/re-flux/`. Update the README and Vite base path if the repository or domain changes.

## Workflow copies

GitHub executes workflows from `.github/workflows/`. Matching copies are kept under `ci/workflows/` for discoverability. Keep each pair identical; `npm run check:workflow-sync` verifies this.

## Publishing

See [`PUBLISHING.md`](./PUBLISHING.md) for npm Trusted Publishing, release tags, and package-version requirements.
