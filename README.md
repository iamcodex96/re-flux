# re;Flux

**Reactive animations for TypeScript.**

re;Flux is a lightweight, modular animation library built with TypeScript and RxJS. It helps developers compose animations and timelines with a reactive, type-safe API.

## Installation

```bash
npm install @re-code/flux
```

## Quick start

```ts
import { animate } from '@re-code/flux/dom';

const entrance = animate('.card', {
  properties: {
    opacity: { from: 0, to: 1 },
    transform: { from: 'translateY(16px)', to: 'translateY(0px)' },
  },
  duration: 400,
  easing: 'easeOutCubic',
  stagger: (index) => index * 50,
});

entrance.play();
```

The DOM adapter also supports arrays/iterables of elements, per-property timing, keyframes, and per-target value factories.

## Documentation

Read the [re;Flux documentation](YOUR_DOCS_URL) for the API reference, examples, and interactive playgrounds. Replace `YOUR_DOCS_URL` with the deployed documentation URL before publishing this README.

## License

MIT — see [LICENSE](./LICENSE).
