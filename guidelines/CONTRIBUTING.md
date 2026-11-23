# Contributing to re;Flux

Thanks for helping improve re;Flux. Keep changes focused, typed, tested, and compatible with the published API unless a breaking change is intentional.

## Before you start

- Check existing issues and discuss the intended API contract before starting a large feature.
- For API changes, consider the headless core, adapter boundaries, tree-shaking, lifecycle cleanup, and TypeScript inference.
- Keep runtime dependencies minimal. RxJS is the core peer dependency; browser and rendering concerns belong in optional adapters.

## Development workflow

1. Follow the setup instructions in [`SETUP.md`](./SETUP.md).
2. Make the smallest cohesive change that solves the problem.
3. Add or update deterministic tests, including cleanup and failure cases where relevant.
4. Update public TSDoc and the docs website when public behavior changes.
5. Run the relevant checks before opening a pull request.

## Code conventions

- Keep strict TypeScript types; avoid `any` and unsafe casts unless a boundary genuinely requires them.
- Prefer cohesive modules over one-file-per-helper splitting. Keep implementation details internal and preserve public export paths when possible.
- Keep state ownership clear. Engine-owned streams should be exposed as read-only views.
- Treat subscriptions, animation frames, observers, event listeners, and temporary DOM changes as owned resources with explicit teardown.
- Keep source comments minimal. Use TSDoc for public API contracts and non-obvious types; avoid narrating straightforward implementation steps. Retain compiler or tooling directives when they affect behavior.
- Do not commit generated build output, local dependency directories, or temporary patch/review notes.

## Lint and format

[Biome](https://biomejs.dev) is the single lint and format tool (configuration: [`biome.json`](../biome.json)). It covers `src/`, `tests/`, `scripts/`, `benchmarks/` and `jest.config.cjs`; the docs app in `apps/docs` is not covered yet.

- `npm run lint` checks the minimal rule set: no unused variables or imports, `import type` for type-only imports, and no floating promises (including `PromiseLike` values such as `Animation` and `Timeline`).
- `npm run lint:fix` applies the safe fixes; `npm run format` rewrites files; `npm run format:check` verifies formatting without writing.
- Formatting is 2 spaces, single quotes, semicolons, trailing commas and a line width of 120. Do not hand-format around it, and do not mix a formatting-only change with a logic change (separate commits).
- Silence a rule only with a `// biome-ignore lint/<group>/<rule>: <reason>` comment that gives the reason.
- CI runs both `npm run lint` and `npm run format:check`; they are also part of `npm run check:all`.

## Tests and checks

Useful commands are listed in [`SETUP.md`](./SETUP.md). For core timing, gesture, physics, and stream behavior, prefer deterministic clocks and test cleanup as well as emitted values. For public exports, test package subpaths and tree-shaking. For DOM features, include edge cases such as missing targets, cancellation, reduced motion, and teardown.

## Documentation and demos

- The documentation website is the source of truth for user-facing API guides and examples.
- Keep `README.md` short; it is the package introduction, not a second documentation site.
- Keep demos deterministic where practical. A demo renderer should draw one frame from the current values and dimensions rather than starting its own animation loop. The owning view manages playback, visibility, reduced motion, resizing, and disposal.
- Add shared frontend components only when a pattern is reused. Keep one-off visualizations local to their view or visualization styles.

## Pull requests

Include the motivation, behavior changes, tests run, and any public API or compatibility implications. Keep unrelated cleanup in a separate change so reviewers can distinguish refactoring from behavior changes.
