# re;Flux

**Reactive animations for TypeScript.**

re;Flux is a lightweight, modular animation library built with TypeScript and RxJS. Its headless core provides composable animations, timelines, and reactive motion primitives; rendering adapters connect them to the DOM, SVG, Canvas, and Three.js.

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

The published package declares Node.js `>=18`; repository CI validates on Node.js 22 and 24. Development uses npm workspaces and a committed `package-lock.json` for reproducible installs.

```bash
npm ci
npm run typecheck
npm test -- --runInBand
npm run build
```

See [SETUP.md](./SETUP.md) and [PUBLISHING.md](./PUBLISHING.md) for repository automation and releases.

## License

MIT. See [LICENSE](./LICENSE).
