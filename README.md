# re;Flux

**Reactive animations for TypeScript.**

re;Flux is a lightweight, modular animation library built with TypeScript and RxJS. Its headless core provides composable animations, timelines, reactive values, spring motion, and frame coordination. Optional adapters connect motion to the DOM, SVG, Canvas 2D, and Three.js; separate steering and flow-field modules support autonomous-agent simulations.

## Installation

```bash
npm install @re-code/flux rxjs
```

RxJS is a peer dependency. Install it in your application if it is not already available at a compatible version (`^7.8.0`).

## Quick start

```ts
import { animate } from '@re-code/flux/dom';

const entrance = animate('.card', {
  duration: 400,
  properties: {
    opacity: { from: 0, to: 1 },
    transform: {
      from: 'translateY(16px)',
      to: 'translateY(0px)',
    },
  },
  stagger: (index) => index * 50,
});

entrance.play();
```

## Documentation

The [documentation site](https://iamcodex96.github.io/re-flux/) contains the API reference, detailed guides, and interactive Playground and Visual Lab examples. Use the explicit package subpaths to import only the modules you need, including `@re-code/flux/steering`, `@re-code/flux/flow-field`, and the rendering adapters.

## Development

The package requires Node.js `>=22`; CI validates Node.js 22 and 24. Development uses npm workspaces and the committed lockfile for reproducible installs.

```bash
npm ci
npm run typecheck
npm test -- --runInBand
npm run build
```

See the [contribution guidelines](./guidelines/CONTRIBUTING.md), [repository setup](./guidelines/SETUP.md), [frontend design system](./guidelines/DESIGN_SYSTEM.md), and [release guide](./guidelines/PUBLISHING.md) for maintainer details.

## License

MIT. See [LICENSE](./LICENSE).
