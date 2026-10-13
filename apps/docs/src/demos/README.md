# Documentation demos

This folder contains runnable examples of what can be built with re;Flux. It is intentionally outside the published library source and is not part of the `@re-code/flux` package exports.

## Conventions

- Prefer one scene or rendering technique per file. `canvas/particles.ts`, `canvas/waves.ts`, `canvas/radial-spectrum.ts`, `canvas/wireframe-sphere.ts`, and `canvas/fireworks.ts` are independent examples.
- Demo renderers should be deterministic pure drawing functions when practical: receive the current phase/value and dimensions, draw one frame, and do not own an animation loop.
- The owning view is responsible for playback, reduced-motion behavior, visibility suspension, resizing, inputs and cleanup.
- Reuse public re;Flux primitives/adapters for scheduling, interpolation and resource disposal rather than creating an unrelated RAF loop in every scene.
- Only promote a helper into the library after it proves broadly reusable, has a stable contract, and belongs in the core, an adapter, or a clearly optional extension.
