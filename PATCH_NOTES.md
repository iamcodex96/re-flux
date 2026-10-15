# re;Flux animation API and CI/CD patch

## Animation API

- Adds explicit `{ from, to }` property definitions.
- Adds per-target property frame factories with `(target, index, total)` context.
- Keeps existing shorthand values, `values`, and explicit `keyframes` forms.
- Adds validation/tests for invalid property definitions and factory results.

## CI/CD

- Adds pull-request and `main` validation.
- Adds GitHub Pages deployment for the Vue documentation app at `apps/docs/dist`.
- Adds npm Trusted Publishing (OIDC) on `v*` tags.
- Adds the workflows in both `ci/workflows/` (requested organization) and `.github/workflows/` (required for GitHub Actions to discover and execute them).
- Adds a short README focused on project purpose, installation, a quick-start animation, and the docs link.

## Before merging

- Replace `YOUR_DOCS_URL` in `README.md`.
- Confirm that npm Trusted Publishing is configured for owner/repository `iamcodex96/re-flux`, workflow `publish-npm.yml`, and environment `npm`.
- Keep the corresponding workflow files in `ci/workflows/` and `.github/workflows/` in sync.
