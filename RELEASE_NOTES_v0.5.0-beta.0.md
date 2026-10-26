# re;Flux 0.5.0-beta.0

**Public beta release for community feedback.**

re;Flux is a modular, reactive TypeScript animation library built on RxJS. This prerelease invites feedback on API clarity, real-world behavior, documentation, and integration ergonomics. The API may change before 1.0.0.

## Highlights

- Composable animations, timelines, values, motion streams, and frame coordination.
- DOM, SVG, Canvas, and Three.js adapter entry points designed for explicit imports and tree-shaking.
- Motion preferences and lifecycle behavior covering reduced motion, hidden-document pause/resume, and cleanup.
- Typed 2D vector utilities, autonomous steering behaviors, time-based steering integration, and flow-field creation/sampling.
- Interactive Playground and Visual Labs for animation, steering, flow fields, rendering adapters, and generative effects.
- Package-consumer, tree-shaking, browser-integration, and documentation contract checks in the release workflow.
- Beta-aware install commands in the documentation and GitHub issue templates for structured bug reports and feedback.

## Install the beta

```bash
npm install @re-code/flux@beta rxjs
```

RxJS 7.8 or compatible within the declared peer range is required. The package requires Node.js >=22 for the supported package/tooling environment.

## Feedback requested

Please report reproducible bugs, confusing APIs, missing examples, performance concerns, and adapter compatibility issues through [GitHub Issues](https://github.com/iamcodex96/re-flux/issues). Include the re;Flux version, relevant browser/runtime versions, and a minimal reproduction when possible. Do not include credentials, tokens, or private application data.

## Before publishing

Run `npm ci`, `npx playwright install chromium`, and `npm run check:all` against the exact commit that will be tagged. The immediately preceding source baseline passed the full release gate (31 Jest suites / 226 tests, 10 browser-integration cases, tree-shaking, package-consumer validation, documentation contracts, and production docs build); rerun the gate after these beta metadata, install-command, and feedback-template changes.
