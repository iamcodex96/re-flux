# re;Flux

**Reactive animations for TypeScript.**

re;Flux is a lightweight, modular animation library built with TypeScript and RxJS. Its headless core provides composable animations, timelines, and reactive motion primitives; rendering adapters connect them to the DOM, SVG, Canvas, and Three.js.

For DOM animations, call `animate(targets, options)` from `@re-code/flux/dom`; CSS properties belong inside the required `options.properties` map, while timing defaults sit alongside it.

## Installation

```bash
npm install @re-code/flux
```

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

## Why re;Flux?

- **Reactive:** compose animation behavior with RxJS.
- **Composable:** combine individual motions with timelines.
- **Modular:** import only the core or adapters you need.
- **Type-safe:** built for strict TypeScript projects.

## Documentation

**[Read the documentation](https://iamcodex96.github.io/re-flux/)** for the API reference, examples, and interactive playgrounds.

## Development

The package requires Node.js `>=22`; repository CI validates on Node.js 22 and 24. Development uses npm workspaces and a committed `package-lock.json` for reproducible installs.

```bash
npm ci
npm run typecheck
npm test -- --runInBand
npm run build
```

See the [contribution guidelines](./guidelines/CONTRIBUTING.md), [repository setup](./guidelines/SETUP.md), [frontend design system](./guidelines/DESIGN_SYSTEM.md), and [release guide](./guidelines/PUBLISHING.md) for maintainer details.

## License

MIT. See [LICENSE](./LICENSE).
