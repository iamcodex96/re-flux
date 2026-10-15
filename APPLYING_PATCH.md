# Applying this refactor patch

The patch archive contains changed and newly added files with paths relative to the repository root. Extract it over a working tree only after reviewing the diff.

**Base warning:** this patch was generated against the `re-flux(1).zip` supplied in the conversation. The repository's public GitHub `main` was observed to be ahead of that archive. Several changed files touch core and DOM internals, so do not blindly overwrite a newer `main`; compare the changed files and merge them deliberately.

`ci/workflows/` contains archival copies. GitHub Actions only discovers active workflow files in `.github/workflows/`.
