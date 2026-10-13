# re;Flux
Frontend visualization conventions are documented in [`apps/docs/GRAPHING.md`](apps/docs/GRAPHING.md).

**Reactive animation primitives for the web.** `re;Flux` is a headless motion library built with strict TypeScript and RxJS. It treats time, motion, and interaction as composable streams instead of tying animation logic to a particular rendering framework.

- **Brand:** re;Flux
- **npm package:** [`@re-code/flux`](https://www.npmjs.com/package/@re-code/flux)
- **Organization:** `re-code`
- **Core:** TypeScript + RxJS 7.8
- **Documentation:** Vue 3 + Vuetify 4 + Vite
- **Status:** early development (`0.1.0`); the source includes `FrameCoordinator`, `Tween<T>`, retargetable spring motion, gesture operators, `retargetMotion()`, `smoothStream()`, cadence-aware `adaptiveTween()`, and optional DOM/SVG/Canvas/Three.js adapters.

> The semicolon is part of the visual brand inspired by anime titles such as *Steins;Gate*. npm package names must use lowercase URL-safe characters, so install the package as `@re-code/flux`, while the product is styled as `re;Flux` in the UI.

## Requirements

- Node.js 18 or newer (Node.js 22 recommended).
- npm 10 or a compatible workspace-aware npm release.
- RxJS 7.8 in consumer applications; it is a peer dependency of the published library.

## Local development

From the repository root:

```bash
npm install
npm run typecheck
npm run dev
```

`npm run dev` starts the Vue documentation app in `apps/docs`. The source archive may not include a generated `package-lock.json`; run `npm install` and commit the lockfile before relying on reproducible CI installs.

Run the library unit tests (the Vue documentation app is intentionally excluded):

```bash
npm test
npm run test:watch
npm run typecheck:tests
npm run test:coverage
```

The core suite uses Jest + ts-jest in ESM mode. A deterministic `requestAnimationFrame` controller drives frame timestamps, so tests do not rely on wall-clock delays or browser rendering. Tests cover lifecycle contracts, RAF sharing/cancellation, pause/resume, seek/replay, timeline offsets/nesting, frame phases, value interpolation, spring stability, inertia projection, momentum-preserving retargeting, pointer normalization, drag release/cancellation, and point-follow settling.

Build the library and documentation site:

```bash
npm run build
npm run preview
```

- The compiled library is emitted to `dist/`.
- The documentation app is emitted to `apps/docs/dist/`.
- Build only the library with `npm run build:lib`.
- `npm pack` and `npm publish` run the core tests and library build through `prepack`.

To publish the scoped package publicly for the first time, authenticate with npm and run:

```bash
npm publish --access public
```

The package metadata also sets `publishConfig.access` to `public`. Confirm that `@re-code/flux` is available to your npm organization before the first publish; availability and organization permissions cannot be inferred from this source tree.

The frontend imports library source through the `@lib` Vite alias, so local development does not require publishing the library to npm.

## Project structure and public boundaries

- `src/core/`, `src/values/`, `src/physics/`, `src/operators/` and `src/utils/` contain the engine and renderer-independent motion tools.
- `src/adapters/` contains optional rendering/integration adapters. `src/adapters/dom.ts` remains the stable entry point for `@re-code/flux/dom`, while its implementation is split into `src/adapters/dom/animation.ts`, `draggable.ts`, `text.ts`, `scroll.ts`, `scrollTrigger.ts`, `layout.ts` and `scope.ts`.
- `src/effects/canvas.ts` is a small optional extension, available only through `@re-code/flux/effects/canvas`; it is not re-exported from the package root.
- `apps/docs/` contains the Vue documentation, playgrounds and visual showcase. `apps/docs/src/demos/` contains showcase-specific scenes and is excluded from the published package. A demo is promoted into the library only when it represents a stable, broadly useful primitive.
- `tests/` covers the library and its optional Canvas extension. The docs site is type-checked as part of its own build, while its visual scenes stay outside the library bundle.

The package `exports` map is the public contract. Internal folder names may change without creating new public imports unless an entry is added to that map. Granular `@re-code/flux/core`, `/values`, `/physics`, `/operators`, and `/utils` entry points complement the root convenience import. Combine one of these with only the rendering adapter you need, for example `@re-code/flux/core` + `@re-code/flux/dom`. The `check:tree-shaking` script builds real consumer fixtures with esbuild and asserts that unrelated adapters and optional modules are omitted.

The pre-1.0 engine audit is tracked in [`CORE_REVIEW.md`](CORE_REVIEW.md), including the completed P1 timing/playhead/keyframe hardening and remaining P2 design decisions.

## Quick start

After installing the published package and its peer dependency:

```bash
npm install @re-code/flux rxjs
```

```ts
import { Animation, Timeline } from '@re-code/flux';

const fade = new Animation({
  duration: 700,
  easing: 'easeOutCubic',
  onUpdate: (_progress, easedProgress) => {
    document.querySelector<HTMLElement>('.box')?.style.setProperty('opacity', String(easedProgress));
  },
});

fade.play();
await fade;

const timeline = new Timeline();
timeline.add(new Animation({ duration: 300 }));
timeline.add(new Animation({ duration: 600 }), '-=100');
timeline.play();
await timeline;
```

The core exposes motion progress and state. The application or a rendering adapter is responsible for applying those values to DOM, SVG, Canvas, WebGL, or another rendering target. The docs site also includes a visual lab demonstrating SVG stroke reveals, path morphing and motion-path following, Canvas particle fields and waveforms, kinetic typography, FLIP layout transitions, and scroll-linked progress.

## Core API

### `Animation`

```ts
new Animation({
  duration,
  easing,
  delay,
  repeat,
  yoyo,
  onStart,
  onUpdate,
  onComplete,
  onPause,
  onResume,
  onStop,
});
```

- Fluent controls: `play()`, `pause()`, `stop()`, `restart()`, and `seek(ms)`.
- `seek(ms)` scrubs values and invokes crossed playhead callbacks without starting a frame clock; `state$` remains `idle`/`paused` when no playback clock is active, and becomes `completed` at the end.
- Reactive state: `progress$: BehaviorSubject<number>` and `state$: BehaviorSubject<AnimationState>`.
- `duration` must be finite and non-negative; `delay` must also be finite and non-negative. `repeat` is the number of additional repeats and must be a non-negative safe integer or `Infinity`. Finite timing combinations that overflow the total duration are rejected.
- Awaitable behavior: `await animation`, `.then()`, `.catch()`, `.finally()`, and `.toPromise()`.
- `stop()` resets the state and rejects the current pending cycle with `Error('Animation stopped before completion')`.

### Timeline editing

Timelines support labels, position-relative scheduling, callbacks, normalized seeking, playback rate and reverse playback:

```ts
import { Animation, Timeline } from '@re-code/flux';

const scene = new Timeline()
  .addLabel('intro')
  .add(new Animation({ duration: 500 }))
  .addLabel('details')
  .add(new Animation({ duration: 700 }), 'details+=120')
  .call(() => console.log('scene checkpoint'), 'details+=350')
  .timeScale(1.15);

scene.play();
// scene.seekProgress(0.4); scene.reverse();
```

`reverse()` plays toward the beginning using the same shared frame clock. `timeScale()` reads or sets a positive finite playback rate. Labels are plain positions; adding or removing a label never shifts existing segments. A callback added with `call()` is reset when the playhead seeks back before its position, so a later pass can invoke it again. Numeric offsets must be finite and non-negative; relative offsets that would move before the start are clamped to zero. Implicit appends after an infinitely long segment are rejected unless a finite explicit offset is supplied.

### Value utilities

The root entry point exports `clamp`, `lerp`, `mapRange`, `snap`, `wrap`, `random`, `interpolateRange`, `pipe`, and `distribute`, as well as `cubicBezier()` and `steps()` easing factories. Easing names also include sine, quint, circular, back, bounce and exponential families.

```ts
import { clamp, cubicBezier, distribute, mapRange } from '@re-code/flux';

const progressToScale = (progress: number) => mapRange(progress, 0, 100, 0.8, 1.15, true);
const staggerDelay = distribute({ from: [0, 360], ease: cubicBezier(0.16, 1, 0.3, 1) });
const scale = clamp(progressToScale(42), 0.8, 1.15);
```

### SVG and Canvas visuals

The `@re-code/flux/svg` entry point adds `bindSvgPathDrawing()` for stroke reveals, `bindSvgPathMorph()` for path morphing, `normalizeSvgPathPair()` for inspecting normalized path data, and `followSvgPath$()` for position/tangent samples along any `SVGGeometryElement`. Morphing supports SVG `M/L/H/V/C/S/Q/T/A/Z` commands in both absolute and relative forms. The adapter converts paths to cubic segments, subdivides them to compatible segment counts, and heuristically aligns closed contour direction/start points. Paired paths must have the same subpath count and matching open/closed state; the normalizer rejects incompatible topology or paths exceeding the configured segment cap. The `@re-code/flux/canvas` entry point exports `resizeCanvas()` to size the bitmap for a device pixel ratio while keeping drawing coordinates in CSS pixels.

The DOM adapter also provides `scrollProgress$(element)` as a cleaned-up Observable, `bindScrollTimeline()` for progress-based scrubbing, and `createScrollTrigger(element, options)` for start/end anchors, enter/leave callbacks, refresh after layout changes, and optional Timeline scrubbing. It also includes `flip(elements, mutate, options)` for FLIP-style layout transitions, `createScope(root)` for selector scoping and grouped resource cleanup, and `createResponsiveScope(root, query, setup)` for media-query-driven setup/revert. Always call `destroy()`/`dispose()`/`revert()` when a scene is no longer needed. More examples are available in [`apps/docs/VISUAL_LAB.md`](apps/docs/VISUAL_LAB.md).

### `Tween<T>`

`Tween<T>` animates a value stream without depending on the DOM. Built-in interpolation supports numbers, compatible numeric string templates (including transforms and SVG path data), hex/RGB(A) colors, arrays, and same-shape plain objects. Supply `interpolate(from, to, easedProgress)` for custom types or intentionally discrete values. Easing curves such as elastic may intentionally overshoot the 0..1 range.

```ts
import { Tween } from '@re-code/flux';

const opacity = new Tween({ from: 0, to: 1, duration: 250, easing: 'easeOutCubic' });
const subscription = opacity.value$.subscribe((value) => {
  // Apply the value in your renderer or adapter.
  console.log(value);
});
opacity.play();
await opacity;
subscription.unsubscribe();
```

A `Tween` exposes `value$`, `progress$`, `state$`, fluent playback controls, and the same thenable completion API as `Animation`. It implements `AnimatableItem`, so a `Timeline` can drive it using local time without starting a child frame loop.

### `Keyframes<T>`

Use `keyframes()` for a typed sequence of values with normalized offsets and per-segment easing. Missing offsets are distributed between neighboring explicit offsets. Every adjacent pair is validated independently; if any segment has incompatible value shapes, provide a custom interpolator. Numbers, compatible numeric strings/colors, arrays and plain objects interpolate by default; custom types can provide an interpolator. `Keyframes<T>` implements `AnimatableItem` and can be placed inside a `Timeline`.

```ts
import { keyframes } from '@re-code/flux';

const scale = keyframes({
  duration: 900,
  keyframes: [
    { value: 0.8, offset: 0 },
    { value: 1.15, offset: 0.35, easing: 'easeOutCubic' },
    { value: 1, offset: 1 },
  ],
});

scale.value$.subscribe((value) => console.log(value));
scale.play();
await scale;
```

### DOM selectors, element arrays, and stagger

The optional DOM entry point supports selector strings, a single element, arrays, and other iterable element collections. Every target and property is coordinated by a single `DOMAnimation` timeline; the core entry point remains headless.

```ts
import { animate } from '@re-code/flux/dom';

const entrance = animate('.card', {
  properties: {
    opacity: { values: [0, 1], duration: 220, easing: 'easeOutQuad' },
    transform: {
      keyframes: [
        { value: 'translateY(18px) scale(0.98)', offset: 0, easing: 'easeOutCubic' },
        { value: 'translateY(0px) scale(1)', offset: 1 },
      ],
      duration: 520,
      delay: 40,
    },
    backgroundColor: {
      values: ['rgb(55, 50, 100)', 'rgb(110, 100, 220)'],
      duration: 400,
      delay: 80,
    },
  },
  stagger: (index) => index * 70,
});

entrance.play();
await entrance;
entrance.dispose();
```

Each property accepts one of three forms:

- A scalar target, which animates from the element's computed style.
- An array of explicit, evenly spaced values (a one-item array uses the computed style as its start).
- An object with either `values` or explicit `keyframes`, plus optional `duration`, `delay`, `easing`, `repeat`, and `yoyo` overrides.

Global `duration`, `delay`, `easing`, `repeat`, and `yoyo` act as defaults. Every property must have a local duration or inherit a global duration. Property delay is added to global delay and target stagger. A keyframe's `offset` is normalized to 0–1 and its `easing` controls the segment that starts at that keyframe. Thus opacity can finish quickly while transform and color continue on their own schedules, with all properties sharing one timeline.

`animate()` resolves selectors once when called; it does not automatically track elements added later. Numeric CSS values use `px` by default except for unitless properties; use strings for other units. CSS values with matching numeric templates and units interpolate numerically. Incompatible templates (for example a computed `matrix(...)` to `translateX(...)`) switch discretely at the endpoint, so provide explicit matching transform strings for smooth interpolation. Call `dispose()` to cancel active playback when needed, unsubscribe property bindings, and restore original inline declarations.

### `RetargetableMotion` and spring physics

`RetargetableMotion` animates a numeric value using a damped spring. Calling `to(nextTarget)` while it is moving preserves its currently sampled value and velocity, so retargeting does not restart from the original value. The class exposes `sample$` (`value`, `velocity`, and shared-frame `timestamp`), as well as `value$`, `velocity$`, `target$`, and `state$`. Call `dispose()` when a long-lived motion is no longer needed.

```ts
import { RetargetableMotion, projectInertiaTarget } from '@re-code/flux';

const motion = new RetargetableMotion({ initialValue: 0, stiffness: 260, damping: 30 });
motion.value$.subscribe((value) => console.log(value));
motion.to(250);
motion.to(80); // retargets without resetting the sampled velocity
// Later: unsubscribe from value$ and call motion.dispose() when it is no longer used.

const projected = projectInertiaTarget(120, 640, 6, { min: 0, max: 300 });
```

`stepSpring()` is a pure integration function for deterministic simulations. It caps large frame gaps and divides integration into small substeps. `projectInertiaTarget()` projects a release position using velocity in units per second and optionally clamps the result to bounds. The pointer source and operators are also available:

```ts
import { map, share } from 'rxjs';
import { dragInertia, pointerGestures$, slideFollow } from '@re-code/flux';

const drag$ = pointerGestures$(handle).pipe(
  dragInertia({ friction: 5.5, minVelocity: 10 }),
  share(),
);

drag$.subscribe(renderHandle);
drag$.pipe(
  map(({ x, y }) => ({ x, y })),
  slideFollow({ stiffness: 220, damping: 28 }),
).subscribe(renderFollower);
```

`pointerGestures$()` normalizes primary-pointer down/move/up/cancel events in viewport CSS-pixel coordinates. Move and release events are observed on the owning window so dragging may continue outside the element. A lost pointer capture, window blur, or hidden document ends the active gesture with `cancel`; capture is released on every terminal path and on unsubscribe. `dragInertia()` emits `dragging`, `inertia`, and `rest` samples; velocities use units per second and `friction` is an exponential decay coefficient in inverse seconds. Use `bounds` for fixed limits or `getBounds: () => bounds` for dynamic bounds such as a resizable container; dynamic bounds are re-evaluated on pointer samples and inertia frames. Velocity is estimated from bounded displacement, filtered, capped, and zeroed when movement hits a hard edge. If rendering inside a container, map viewport coordinates into that container's local coordinate space before applying the operator. `slideFollow()` smooths a stream of target points with independent springs, preserving current position and velocity when targets change. All operators are headless with respect to rendering; they emit samples but never write to the DOM. Unsubscribe to remove pointer listeners and stop frame work.

### `FrameCoordinator`

`frameCoordinator.frames$` publishes shared `{ timestamp, delta, frame }` ticks. `scheduleRead()` runs one-shot read tasks before frame consumers, while `scheduleWrite()` runs queued writes after them. Both methods return an RxJS `Subscription` that can cancel queued work before it executes. The coordinator uses the shared RAF observable and stops the loop when no frame subscribers or queued tasks remain. `metrics$` and `metrics` expose total frames, last/average/maximum scheduler work per frame, active consumers, queued read/write tasks, and clock state. `getDiagnostics()` returns a snapshot with `isIdle`, and `assertIdle()` throws when frame subscribers or work remain; these are intended for observability and teardown tests. It aligns work with available browser frames but cannot guarantee a fixed FPS under browser throttling or heavy workloads.

```ts
import { frameCoordinator } from '@re-code/flux';

frameCoordinator.scheduleRead((frame) => {
  const measurement = element.getBoundingClientRect();
  frameCoordinator.scheduleWrite(() => {
    element.style.width = `${measurement.width}px`;
  });
});
```



### Motion preferences and lifecycle

`MotionPreferences` observes `prefers-reduced-motion` and `document.visibilityState` and exposes a read-only `state$` / `snapshot`. It does not impose a global policy: pass the instance to an animation played directly, or to the top-level `Timeline` that controls a composed scene. A timeline-level policy governs its children as a unit. The default `reducedMotion: 'finish'` jumps finite animations/timelines to their final state; unbounded repeats pause until reduced motion is no longer requested. Use `reducedMotion: 'ignore'` for an instance that should continue regardless. `pauseWhenHidden: true` opts that instance into pausing while the document is hidden and resuming when visible. Call `destroy()` when the owning application no longer needs the preferences object.

```ts
import { Animation, MotionPreferences } from '@re-code/flux';

const preferences = new MotionPreferences();
const entrance = new Animation({
  duration: 280,
  motion: { preferences, pauseWhenHidden: true },
});
entrance.play();

// Later, when this app-level preferences source is no longer used:
preferences.destroy();
```

The policy is local to each instance. This allows an accessibility-sensitive page transition to respect reduced motion while a separate data-visualization stream keeps its own timing policy.

### Benchmarks

`npm run bench` builds the library and compares one `FrameCoordinator` with many independent RAF observables under the same number of frame consumers. Tune the workload with `BENCH_CONSUMERS` and `BENCH_FRAMES`; benchmark timings depend on the host and should be compared on the same machine/runtime rather than treated as universal performance claims.

### Declarative retargeting with `retargetMotion()`

`retargetMotion()` turns a stream of numeric target values into a stream of spring samples. Each subscription owns its `RetargetableMotion` instance. New targets change the destination while preserving the latest value and velocity; when the target source completes, the output completes after the last movement settles. Unsubscribe to stop the shared-frame work immediately.

```ts
import { Subject, shareReplay } from 'rxjs';
import { retargetMotion } from '@re-code/flux';

const targets$ = new Subject<number>();
const motion$ = targets$.pipe(
  retargetMotion({ initialValue: 0, stiffness: 220, damping: 28 }),
  shareReplay({ bufferSize: 1, refCount: true }),
);

const subscription = motion$.subscribe(({ value, velocity }) => {
  console.log({ value, velocity });
});
targets$.next(120);
targets$.next(40); // Changes target without resetting physical state.
// Later: subscription.unsubscribe();
```

The operator is for numeric targets. `switchMap` alone does not preserve momentum; the operator keeps position and velocity in the motion state while changing the target. A completed target source waits for the active motion to settle.

### Real-time interpolation with `smoothStream()`

`smoothStream()` samples irregular timestamped values against the shared frame coordinator. It keeps a bounded, sorted sample buffer, interpolates between bracketing values, marks output stale after a configurable gap, and never extrapolates. Out-of-order packets are inserted only when they are not behind the displayed time cursor; packets arriving too late to affect a future frame are ignored. Duplicate timestamps replace the stored sample.

```ts
import { smoothStream } from '@re-code/flux';

const smoothed$ = serverSamples$.pipe(
  smoothStream({
    targetLatency: 100,
    staleAfter: 1_000,
    maxBufferSize: 120,
    interpolate: (from, to, progress) => from + (to - from) * progress,
  }),
);
```

Input timestamps must use the same monotonic time origin as RAF timestamps—typically `performance.now()` in the client. Convert remote timestamps to a client monotonic clock first. `targetLatency` trades a small display delay for the ability to interpolate between samples. The operator cannot recover missing data and deliberately does not predict values beyond the newest sample.


### `adaptiveTween()`

`adaptiveTween()` estimates the interval between increasing source timestamps with an exponential moving average and adapts the duration of the transition to each new target. Unlike `smoothStream()`, it does not buffer a historical timeline: it retargets from the last rendered value and changes the tween duration according to the observed source cadence. It does not preserve physical velocity (use `retargetMotion()` for spring momentum), extrapolate future data, or guarantee a frame rate.

```ts
import { adaptiveTween } from '@re-code/flux';

const motion$ = serverSamples$.pipe(
  adaptiveTween({
    minDuration: 20,
    maxDuration: 220,
    durationFactor: 1.5,
    cadenceSmoothing: 0.3,
    interpolate: (from, to, progress) => from + (to - from) * progress,
  }),
);

motion$.subscribe(({ value, estimatedCadence, targetDuration, stale }) => {
  render(value);
});
```

Defaults are a 20 ms minimum duration, 240 ms maximum duration, a 1.5 cadence multiplier, a 0.25 EMA weight, and a 33.333 ms initial cadence. The first accepted value establishes the baseline and is not animated from an implicit zero. Each output includes `estimatedCadence`, `targetDuration`, the source cadence interval, and `transitionStartTimestamp`. Input timestamps must use the same monotonic time origin as RAF timestamps. Duplicate or out-of-order timestamps are ignored. A source that completes after a tween is underway continues emitting frames until the final transition completes.

### Optional rendering adapters

The core entry point remains headless. Optional subpaths bind stream snapshots to the browser and restore original state when their returned subscription is unsubscribed:

```ts
import { map } from 'rxjs';
import { bindStyle } from '@re-code/flux/dom';
import { bindSvgAttributes } from '@re-code/flux/svg';
import { bindCanvas } from '@re-code/flux/canvas';
import { bindThreeObject } from '@re-code/flux/three';

const styleBinding = bindStyle(element, values$.pipe(
  map(({ x, opacity }) => ({ transform: `translateX(${x}px)`, opacity: String(opacity) })),
));
const svgBinding = bindSvgAttributes(circle, values$.pipe(
  map(({ x, opacity }) => ({ cx: x, opacity })),
));

// For Canvas 2D, drawing is coalesced in the shared frame coordinator's write phase.
const canvasBinding = bindCanvas(context, values$, (ctx, value) => drawValue(ctx, value));

// A structural Three.js adapter does not import Three.js; pass a compatible Object3D and snapshots.
const threeBinding = bindThreeObject(mesh, transforms$);

// On teardown:
styleBinding.unsubscribe();
svgBinding.unsubscribe();
canvasBinding.unsubscribe();
threeBinding.unsubscribe();
```

CSS style map keys must be CSS property names (for example `transform`, `opacity`, or `--custom-property`). Each emitted map is a snapshot: properties omitted from a later snapshot are restored to their original inline values. SVG adapter snapshots similarly restore/remove changed attributes. The Canvas adapter coalesces emissions to the latest value per frame, clears before drawing by default, and can clear on unsubscribe; canvas pixels are not snapshotted/restored. The Three.js adapter applies structural transform snapshots and restores touched axes when omitted or when unsubscribed, without adding a Three.js dependency.

### `Timeline`

- `add(item, offset?)` accepts an `Animation` or another `Timeline`.
- `duration` exposes the total duration. `segments` returns a read-only snapshot of entries (`item`, `startTime`, `endTime`, and `duration`).
- Controls: `play()`, `pause()`, `stop()`, `restart()`, and `seek(ms)`.
- Supports `progress$`, `state$`, lifecycle callbacks, awaitable behavior, and nested composition.

Supported offsets:

| Offset | Meaning |
| --- | --- |
| Omitted | Starts after the last added entry ends |
| `number` | Absolute start time in milliseconds |
| `'+=100'` | 100 ms after the previous entry ends |
| `'-=100'` | Overlaps the previous entry by 100 ms |
| `'<'` | Starts at the same time as the previous entry |

Start times are clamped to zero or greater. An empty `Timeline` has a duration of `0` and completes without dividing by zero. An item with `repeat: Infinity` makes the total duration infinite, so the timeline does not complete unless stopped.

### Composition helpers and reusable stagger

The root entry point exports `sequence()`, `parallel()`, `staggered()`, and `stagger()`. These helpers compose any `AnimatableItem` without introducing DOM dependencies:

```ts
import { Animation, sequence, parallel, staggered, stagger } from '@re-code/flux';

const items = [new Animation({ duration: 300 }), new Animation({ duration: 500 })];
sequence(items).play();                 // one after another
parallel(items).play();                 // same start time
staggered(items, 80, { from: 'center' }).play();

const delayFor = stagger(90, { from: 'center', easing: 'easeOutCubic' });
// delayFor(index, target, total) returns a delay in milliseconds.
```

A numeric `animate(..., { stagger: 80 })` applies an 80 ms interval between target indexes; the `stagger()` helper supports first, last, center, or a numeric origin, an initial delay, and an easing-distributed delay range.

### Easings and frame clock

`Easings` and `resolveEasing()` are exported. The library includes linear, Quad/Cubic/Quart in-out, Expo in/out, Elastic in/out, and Bounce out curves. An unknown easing name falls back to `linear`.

`animationFrame$` is a shared Observable source. It maintains one `requestAnimationFrame` chain while subscribers exist and cancels the pending frame when the last subscriber unsubscribes. Timelines seek their children using local time; they do not start independent child clocks.

## Product direction

The current source includes pointer gesture/physics operators with pointer capture, focus-loss cancellation, dynamic bounds, filtered velocity and axis locking; opt-in motion preferences/lifecycle policy; shared-frame work metrics and teardown diagnostics; typed `Tween<T>` and `Keyframes<T>`; composition helpers; stream interpolation; and DOM/SVG/Canvas/Three.js adapters. Browser integration and broad stress testing remain important validation steps beyond the unit-test and local benchmark coverage.

See [`ROADMAP.md`](ROADMAP.md) for API direction, design constraints, implementation phases, and acceptance criteria.

### Gesture hardening

`pointerGestures$(target, { capturePointer: true })` captures the active pointer when the target supports Pointer Events capture and releases it on up/cancel/lost capture/focus loss/unsubscribe. `dragInertia({ axis: 'x' | 'y' | 'both' })` optionally locks movement and velocity to one axis. Dynamic-bound failures are sent through the Observable error channel so they tear down frame work cleanly. Pointer capture can be disabled for custom event sources.

## Documentation frontend

The documentation app uses Vue 3, Vuetify 4, Vite, and `createWebHashHistory()`. Its design system is documented in [`apps/docs/DESIGN_SYSTEM.md`](apps/docs/DESIGN_SYSTEM.md), and frontend accessibility conventions are documented in [`apps/docs/ACCESSIBILITY.md`](apps/docs/ACCESSIBILITY.md).

- `#/animation`: duration, delay, repeat, yoyo, easing, seek, callbacks, and `await` playground.
- `#/timeline`: configurable entries, offsets, and a Gantt view.
- `#/easings`: sampled SVG curves and motion preview.
- `#/motion`: a tabbed playground for `Tween<T>` values, spring retargeting, frame coordination, and drag-inertia/spring-follow gestures.
- `#/api`: a keyframe editor and selector/array DOM animation playground with stagger controls. The drag example uses stage-local coordinates, preserves the pointer grab offset, and recalculates bounds after layout changes.
- `#/docs`: API reference with interactive examples.
- `#/roadmap`: implementation status for gesture physics, stream smoothing, interruption blending, frame coordination, and rendering adapters.

The `useObservable(source$, initialValue)` composable synchronizes an Observable with a Vue `ref` and disposes the subscription through `onScopeDispose`. Documentation sections live in `apps/docs/src/components/DocsComponents/`; UI copy and code examples are stored in `apps/docs/src/locales/en.json` and exposed through Pinia. Reusable UI patterns live in `apps/docs/src/components/`, while `LandingHeroVisual`, `LandingMotionShowcase`, and `LandingCapabilitiesShowcase` demonstrate the public animation API with visibility-aware playback and reduced-motion support. CSS in `apps/docs/src/styles/visualizations.css` is reserved for custom scene geometry.

## GitHub Pages

1. Push the repository to GitHub and use `main` as the default branch (or update the workflow branch filter).
2. Under **Settings → Pages → Build and deployment**, select **GitHub Actions** as the source.
3. The `.github/workflows/deploy-docs.yml` workflow installs the version-locked workspace dependencies, verifies the library, builds the docs, and publishes `apps/docs/dist/`. Commit the root `package-lock.json` so CI can use `npm ci` reproducibly.
4. The Vite base path is derived from `GITHUB_REPOSITORY` in Actions. Set `VITE_BASE_PATH=/` for a root domain or custom domain.

Hash-based routing means GitHub Pages does not need rewrite rules for refreshing an app route.

## Verification

- `npm run typecheck` checks the library source in strict TypeScript mode.
- `npm test` runs only library unit tests using Jest; no Vue/browser frontend tests are included.
- `npm run typecheck:tests` type-checks the test suite as well as the library source.
- `npm run bench` runs the shared-scheduler versus independent-RAF workload benchmark after compiling the library.
- `npm run check:tree-shaking` builds minimal consumer entries and verifies that unused adapters/operators are not pulled into unrelated bundles.
- `npm run check:package` builds the library and verifies the allowlisted file list produced by `npm pack --dry-run`.
- `npm run build` compiles the library and documentation; the frontend build also runs `vue-tsc` before Vite. `prepack` runs typechecking, unit tests, tree-shaking checks and package-file checks before publication.
- See [`PUBLISHING.md`](PUBLISHING.md) for the release checklist, lockfile policy and public API guarantees.

Do not treat the complete build as verified until these commands have run with the real installed dependencies.

## License

MIT. See [`LICENSE`](LICENSE).


## Optional Canvas extension and visual examples

The public root export intentionally contains animation primitives, not decorative presets. The optional `@re-code/flux/effects/canvas` subpath provides `drawFrequencyBars()` for caller-owned frequency or telemetry data. SVG path, DOM, Canvas and Three.js bindings remain available through their individual adapter subpaths.

The visual showcase also demonstrates particle constellations, wave fields, wireframe spheres, radial spectra and fireworks. Those compositions are kept in [`apps/docs/src/demos/canvas/visual-effects.ts`](apps/docs/src/demos/canvas/visual-effects.ts) and are not included in the published runtime API. They are examples of how consumers can combine re;Flux time streams and render adapters to build their own effects.

The DOM adapter (`@re-code/flux/dom`) provides `animateText()` for accessible grapheme/word reveals, `animateNumber()` for formatted metric transitions, and `bindScrollTimeline()` for scrubbing a `Timeline` from `scrollProgress$()`. Dispose animations and unsubscribe scroll bindings when a component or scene unmounts.


### Production-ready drag interactions

`draggable()` composes `pointerGestures$()` and `dragInertia()` into one lifecycle-managed DOM interaction. Bounds are measured in translation coordinates and may be computed dynamically for a resizable container. It also enables keyboard arrow-key movement, preserves unrelated CSS transforms, and restores the CSS properties it owns on disposal.

```ts
import { draggable } from '@re-code/flux/dom';

const drag = draggable(document.querySelector<HTMLElement>('.card')!, {
  axis: 'both',
  initialPosition: { x: 16, y: 20 },
  friction: 5.5,
  snapTo: 12, // smoothly snap to a 12px grid on release
  snapDuration: 280,
  getBounds: () => {
    const container = document.querySelector<HTMLElement>('.stage')!;
    const card = document.querySelector<HTMLElement>('.card')!;
    return {
      minX: 0,
      minY: 0,
      maxX: Math.max(0, container.clientWidth - card.offsetWidth),
      maxY: Math.max(0, container.clientHeight - card.offsetHeight),
    };
  },
});

// Register in a component-owned scope, or call drag.destroy() when the element unmounts.
```

The controller exposes its current `position`, `isDragging`, and an `errors$` stream. `dispose()` is an alias for `destroy()`, so the handle can be registered with `createScope(root, scope => scope.add(drag))` or created using `scope.draggable(element, options)`.



### Documentation-only Canvas scenes

The `/visuals` route includes deterministic procedural scenes such as fireworks, particles, wave fields, radial spectra and a wireframe sphere. Their implementation is deliberately kept in the docs app rather than exported from the npm package; the scene source is available in the repository for learning and adaptation.

### Data-driven Canvas frequency bars

Canvas effects do not own an `AudioContext`; pass in normalized values instead. This keeps audio permissions, playback and teardown under the application's control while reusing the same renderer for telemetry or generated data.

```ts
import { drawFrequencyBars } from '@re-code/flux/effects/canvas';
import { resizeCanvas } from '@re-code/flux/canvas';

const { context, width, height } = resizeCanvas(canvas);
const analyser = audioContext.createAnalyser();
const bytes = new Uint8Array(analyser.frequencyBinCount);

function renderSpectrum() {
  analyser.getByteFrequencyData(bytes);
  context.clearRect(0, 0, width, height);
  const normalizedBins = Array.from(bytes, value => value / 255);
  drawFrequencyBars(context, normalizedBins, { width, height }, {
    barCount: 72,
    symmetric: false,
  });
}
```

`drawFrequencyBars()` validates and averages source bins to reduce visual flicker. It performs no audio setup and owns no animation loop; schedule drawing through `bindCanvas()` or another application-owned stream.
