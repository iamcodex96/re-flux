# CHORE-010 — Add the `default` condition to the root export

| Category | Impact | Risk | Effort | Priority score | Phase | Depends on |
|---|---|---|---|---|---|---|
| Packaging | 1 | 2 | 1 | **15** | 4 | — |

Priority = (Impact + Risk) × (6 − Effort). Back to the [roadmap](../roadmap.md).

## Status

**Done 2026-11-22.** `exports["."]` now has `"default": "./dist/index.js"`. `scripts/check-package-consumer.mjs` asserts that every export entry has a `default` equal to its `import` target and that `require.resolve("@re-code/flux")` resolves to `dist/index.js`; against the previous export map that resolution fails with `ERR_PACKAGE_PATH_NOT_EXPORTED` (red) and now passes (green). The check still passes for all 13 ESM subpaths and the TypeScript declarations. CHANGELOG *Unreleased* updated.

## Problem

The root `exports["."]` has `types` and `import` only, while every subpath also has `default`; consumers using `require` or some bundlers get an unhelpful resolution error.

## Evidence

- `package.json` `exports["."]` = `{ types, import }` (no `default`), whereas `./core`, `./values`, … each include `default`.
- `scripts/check-package-consumer.mjs` is the existing consumer-level guard to extend.

## Scope

- Add `"default": "./dist/index.js"` to the root export; extend the consumer check to resolve `@re-code/flux` from a Node ESM and a bundler (esbuild) fixture.

## Non-goals

- No CommonJS build.

## Risks

- None expected; ESM-only remains documented.

## Acceptance criteria

Every box must be checkable by running the named command or inspecting the named file.

- [x] `node scripts/check-package-consumer.mjs` passes and includes a root-import assertion.
- [x] `npm run check:package` passes (package file list unchanged).
- [x] CHANGELOG Unreleased mentions the change.

## Shared gates

**Code gate** (see `roadmap/README.md`)
- [x] `npm run typecheck` and `npm run typecheck:tests` pass.
- [x] `npm test -- --runInBand` passes (record the test count; it must not decrease unless tests are intentionally replaced).
- [x] `npm run check:tree-shaking`, `npm run check:package` and `npm run check:package:consumer` pass.
- [x] No change to public `.d.ts` output unless intended; any intended change is recorded in `CHANGELOG.md` under Unreleased.
