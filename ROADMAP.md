# re;Flux roadmap

This roadmap tracks the evolution of the `0.1.0` foundation. The shared frame coordinator, `Tween<T>`, typed `Keyframes<T>`, selector/array-based DOM animation, spring integration, retargetable motion, gesture operators, `retargetMotion()`, `smoothStream()`, and optional DOM/SVG/Canvas/Three.js adapters exist in source. Deterministic Jest tests cover these areas; run the suite against real installed dependencies before treating this working tree as release-verified. New opt-in motion-preference handling, gesture lifecycle hardening, and scheduler metrics/benchmarking are now implemented in source. Remaining roadmap work includes multi-touch arbitration, real-browser integration, real-time stream stress testing, and richer rendering-adapter examples.

## Foundation progress: phases 1–2

- **Deterministic core test suite added:** Jest + ts-jest covers `Animation`, `Timeline`, `Completion`, the RAF Observable, and `Tween<T>`. The test clock simulates RAF timestamps and does not require the Vue frontend or a browser.
- **`FrameCoordinator` implemented in source:** exposes shared `{ timestamp, delta, frame }` ticks plus read and write queues around the frame update phase. The loop stops when there are no subscribers or pending tasks.
- **`Tween<T>` implemented in source:** emits `value$`, reuses Animation timing/lifecycle semantics, and can be composed inside a Timeline. Numeric interpolation is built in; custom types provide an interpolator.
- **Verification note:** run Jest and the strict typecheck locally after pulling these additions; this environment may not have the npm registry available.

## Product principles

1. **Headless core:** core packages emit values and timestamps; they do not mutate DOM, Canvas, or WebGL state.
2. **RxJS-native composition:** features should be composable as Observables and operators, cancellable through subscriptions, and testable with virtual or injected clocks.
3. **One frame coordinator:** centralize frame-aligned sampling and writes rather than starting one RAF loop per motion source.
4. **Explicit physics:** units, timestamps, velocity, and cancellation semantics must be documented instead of hidden in mutable global state.
5. **Honest scheduling guarantees:** frame-aligned work can reduce redundant work and follow the browser's refresh cycle, but it cannot guarantee 60/120 FPS when the browser, device, or tab is throttled.


## Authoring API: typed keyframes and DOM targeting

**Status:** Implemented in source; strict typecheck and deterministic test files added.

`Keyframes<T>` and the `keyframes()` factory animate a sequence of typed values using normalized `offset` values and optional per-segment easing. Omitted offsets are distributed between explicit offsets; custom types require an interpolator. Keyframes are ordinary `AnimatableItem`s, so they compose in `Timeline` without another frame loop.

The optional `@re-code/flux/dom` entry point adds `animate(targets, options)`, where `targets` can be a selector string, one element, or any iterable of elements. Property definitions accept a scalar target (computed style to target), an array of explicit/evenly spaced values, or a property configuration with `values` or explicit `keyframes`. Each property can override `duration`, `delay`, `easing`, `repeat`, and `yoyo`; global options act as defaults, and every property must resolve a duration. Property delay is additive with global delay and target stagger. All target/property sequences share a single `DOMAnimation` timeline. `dispose()` cancels active playback when needed, unsubscribes property bindings, and restores original inline style declarations.

The CSS interpolator supports matching numeric templates and units (including common transform functions and `rgb()` colors); values with incompatible templates switch discretely at the endpoint. Callers should provide explicit matching string frames for properties such as `transform`. Selectors are resolved once at creation time and do not observe later DOM mutations. The core hardening pass now rejects invalid duration/delay/repeat/offset values, preserves non-running state semantics for manual seeks, and validates every adjacent keyframe pair.

### Acceptance criteria

- Implemented: numeric and custom typed keyframes, explicit/implicit offsets, per-segment easing, and `Timeline` composition.
- Implemented: selector strings, individual targets, iterable target lists, global timing defaults, per-property values/keyframes and timing overrides, per-segment easing, delay, repeat/yoyo, and stagger.
- Tests cover interpolation, offsets, selectors, arrays, stagger, CSS unit templates, style restoration, and option validation; run them with real dependencies before release.
- Core entry point remains headless; DOM selection is opt-in through `@re-code/flux/dom`.

## 1. First-class gesture physics operators

**Status:** Gesture lifecycle hardening implemented (`pointerGestures$`, `dragInertia`, `slideFollow`); multi-touch arbitration remains open

### Problem

Drag and swipe inertia often require pointer listeners, delta-time calculations, velocity estimation, pointer capture, cancellation, and cleanup to be coordinated manually.

### Proposed direction

Separate DOM event acquisition from pure physics operators. A small optional DOM source normalizes `pointerdown`, `pointermove`, `pointerup`, `pointercancel`, and pointer timestamps into a typed gesture stream. Operators then transform those samples into position and velocity without manipulating the DOM.

API:

```ts
import { map, share } from 'rxjs';
import { pointerGestures$, dragInertia, slideFollow } from '@re-code/flux';

const drag$ = pointerGestures$(element).pipe(
  dragInertia({ friction: 5.5, minVelocity: 8 }),
  share(),
);

const follower$ = drag$.pipe(
  map(({ x, y }) => ({ x, y })),
  slideFollow({ stiffness: 220, damping: 28 }),
);
```

`pointerGestures$()` handles primary-pointer down/move/up/cancel events, pointer-capture loss, window blur, and hidden-document cancellation. Pointer capture is released for all terminal paths and teardown. `dragInertia()` emits position and filtered velocity samples; its velocity units are incoming coordinate units per second and friction is an exponential decay coefficient in inverse seconds. Static `bounds` and dynamic `getBounds()` limits are resolved during pointer samples and inertia frames; velocity is measured from bounded displacement and is stopped at edges. `slideFollow()` transforms a stream of `Point2D` targets into spring-smoothed samples. The operators do not mutate the DOM and cancel listeners/frame work when unsubscribed. Multi-touch arbitration, touch-action integration guidance, and a dedicated velocity-injection seam remain candidates for later hardening.

### Acceptance criteria

- Drag starts only for the active pointer and supports pointer cancellation.
- Implemented/tested: no listeners remain after terminal events or unsubscription; focus loss and lost capture emit `cancel`.
- Physics uses elapsed time, not a fixed per-frame coefficient, so behavior is comparable at 60 Hz and 120 Hz.
- Implemented/tested: pointer coordinates/timestamps can be injected in tests; coverage includes zero/duplicate timestamps, stale timestamps, large deltas, dynamic bounds, and velocity reset at an edge.
- Operators emit samples and do not write to the DOM.

## 2. Real-time stream smoothing

**Status:** `smoothStream()` and `adaptiveTween()` implemented

### Problem

Telemetry from WebSockets, Server-Sent Events, GPS, or financial feeds can arrive with jitter. Rendering the newest network value immediately makes the visual output jump between irregular updates.

### Current implementation

`smoothStream()` implements a bounded timestamped interpolation buffer, configurable display latency, staleness metadata, duplicate replacement, and finite-source draining. Out-of-order samples are sorted only while they are not behind the displayed time cursor; later arrivals behind that cursor are ignored. It deliberately does not extrapolate. `adaptiveTween()` estimates cadence with an exponential moving average and adapts each transition duration within configured bounds. Unlike `smoothStream()`, it does not maintain a historical display buffer; it retargets from the last rendered value. It does not preserve physical velocity, predict future samples, or promise a fixed frame rate.

API sketch:

```ts
const position$ = serverSamples$.pipe(
  smoothStream({
    targetLatency: 100,
    maxBufferSize: 120,
    staleAfter: 1_000,
    interpolate: (from, to, progress) => from + (to - from) * progress,
  }),
);
```

The current sample shape is `SmoothedStreamSample<T>` and the interpolation function is required so the operator can support non-numeric values. Input timestamps must use the same monotonic time origin as RAF timestamps (normally `performance.now()`). The displayed cursor is `frame.timestamp - targetLatency`; samples arriving behind that cursor are ignored. Extrapolation/prediction is not implemented and should remain opt-in in any future API because predicting unknown future data can be misleading.

### Acceptance criteria

- Implemented: output follows the shared frame clock while source updates are irregular.
- Implemented: bounded memory, configurable display latency, explicit finite-source draining, and stale metadata.
- Implemented: duplicate timestamps replace a sample; out-of-order samples are sorted unless they are behind the displayed time cursor.
- Tests cover interpolation, duplicate/out-of-order timestamps, stale output, invalid timestamps, and finite/empty sources; add fuzz/property tests for long jittery runs.
- The API promises smoother frame-aligned output, not lossless data delivery or guaranteed 60/120 FPS.

## 3. Declarative interruption and momentum-preserving retargeting

**Status:** `RetargetableMotion` and `retargetMotion()` implemented

### Problem

Changing a target mid-animation often snaps to a new start value or requires callers to build cancellation and cleanup logic themselves.

### Current implementation

`RetargetableMotion` now provides a headless value/velocity/timestamp sample and a spring target that can change without resetting the sampled state. The `retargetMotion()` operator now owns one physical motion per subscription, accepts numeric target values, and waits for the last target to settle after the source completes. It cleans up the physical instance and frame subscription on unsubscription. The motion state carries value and velocity explicitly; cancellation alone is not what provides continuity.

Current operator API:

```ts
import { retargetMotion } from '@re-code/flux';

const motion$ = targets$.pipe(
  retargetMotion({ initialValue: 0, stiffness: 260, damping: 30 }),
);
```

`retargetMotion()` is available from the core entry point. A bare `switchMap` cancels work but does not by itself preserve momentum; velocity remains part of the explicit physical state and is sampled against timestamps.

### Acceptance criteria

- A retarget starts from the latest emitted position and velocity, without resetting to the original start value.
- Cancellation disposes scheduled work from the previous target.
- Repeated target changes do not create subscription or RAF leaks.
- Spring integration is stable for large elapsed-time gaps and behaves consistently under variable frame cadence.
- Reduced motion can disable momentum or choose a non-physical transition.

## 4. Frame coordinator and rAF scheduler

**Status:** Implemented (`FrameCoordinator`); integration tests should run before release

### Problem

Separate animations may schedule redundant work or interleave layout reads and writes, causing avoidable rendering overhead.

### Current design and constraints

Use RxJS's existing `animationFrameScheduler` where its scheduling semantics fit, and build a narrowly scoped `FrameCoordinator` only for library-specific needs: one shared frame timestamp, coalesced tasks, and explicit read/write phases. Do not add a competing API also named `animationFrameScheduler`.

API sketch:

```ts
frameCoordinator.scheduleRead(() => measureLayout());
frameCoordinator.scheduleWrite(() => applyStyles());
```

The design should make it easy to batch writes and avoid read-after-write layout thrashing. It should not claim to control browser refresh rate or guarantee that arbitrary Observable work is automatically batched.

### Acceptance criteria

- At most one coordinator-owned RAF callback is pending at once while queued work exists.
- All callbacks in a frame receive the same timestamp.
- Read callbacks run before write callbacks; writes queued during a write phase are handled according to a documented policy.
- Implemented/tested: unsubscribing a task removes queued work and cancels the pending RAF when no work remains.
- Implemented: `metrics$`, `metrics`, `getDiagnostics()` and `assertIdle()` expose frame work and detect pending coordinator work.
- Tests cover re-entrant scheduling, thrown callbacks, cancellation, hidden tabs, and fallback environments.

## 5. Headless rendering adapters

**Status:** DOM/SVG/Canvas/Three.js adapters implemented

### Problem

An animation engine coupled to CSS properties is difficult to reuse with Canvas, SVG, Three.js, or framework-specific state stores.

### Current implementation and future direction

The DOM and SVG subpath adapters now consume stream snapshots and restore original target state on teardown. Keep the core output serializable and framework-independent. Canvas and structural Three.js adapters are available as optional subpaths. Vue, React, Angular, Canvas, and Three.js must not become peer dependencies of the core package.

Implemented package entry points:

```ts
import { Animation } from '@re-code/flux';
import { bindStyle } from '@re-code/flux/dom';
import { bindSvgAttributes } from '@re-code/flux/svg';
import { bindCanvas } from '@re-code/flux/canvas';
import { bindThreeObject } from '@re-code/flux/three';
```

The DOM and SVG adapters consume complete property/attribute snapshots and return RxJS subscriptions. The Canvas adapter coalesces draws in the shared write phase. The structural Three.js adapter updates transforms without importing Three.js. Both are opt-in subpaths and add no rendering dependency to the core.

### Acceptance criteria

- Implemented: core entry point remains headless; DOM/SVG are separate subpath exports.
- Implemented: adapters own subscriptions and restore original inline styles/attributes on unsubscribe.
- Tests cover restoration and omitted/removed properties/attributes; add integration tests with a real DOM implementation when one is an intentional test dependency.
- Implemented: Canvas drawing coalesces source emissions and can clear the bitmap on teardown.
- Implemented: the structural Three.js adapter restores touched transform axes and has no Three.js runtime dependency.
- Build exports remain tree-shakeable, and browser adapter modules are not imported from the core entry point.


## 6. Motion preferences and lifecycle

**Status:** Implemented as opt-in per-instance policy (`MotionPreferences`, `Animation.motion`, `Timeline.motion`)

`MotionPreferences` observes `prefers-reduced-motion` and document visibility. An `Animation` or `Timeline` opts in by receiving a `motion` object; unrelated animations and raw streams remain untouched. Finite motion defaults to its final state when reduced motion is requested, unbounded repeats are suspended until the preference clears, and `pauseWhenHidden` pauses/resumes only the instance that requested it.

Acceptance criteria:

- Implemented/tested: browser preference and visibility changes are observable, and `destroy()` removes global listeners.
- Implemented/tested: finite Animation and Timeline playback respects reduced motion, while an animation without a motion policy continues independently.
- Implemented/tested: opt-in playback pauses when the document is hidden and resumes without applying the hidden-tab gap to elapsed animation time.
- Implemented/tested: infinite repeats pause rather than pretending they have a final state.

## 7. Scheduler observability and performance

**Status:** Runtime metrics, leak diagnostics, and a deterministic RAF workload benchmark implemented

`FrameCoordinator.metrics$` reports total frames, last/average/maximum scheduler work, active frame subscribers, queued tasks, and clock state. `getDiagnostics()`/`assertIdle()` support teardown verification. `npm run bench` compares one shared coordinator against independent RAF observables for the same consumer count; results are environment-specific and are not a universal FPS guarantee.

Acceptance criteria:

- Implemented/tested: frame-work duration and subscriber/task counts are exposed without starting the RAF loop merely by observing metrics.
- Implemented/tested: leak assertions fail while work is attached and pass after subscriptions are removed.
- Implemented: configurable local benchmark workload compares shared-scheduler and independent RAF modes.
- Remaining: collect browser traces and add multi-minute stress/fuzz runs before treating performance as release-verified.

## Suggested implementation sequence

1. **Stabilize contracts:** deterministic Jest tests are now present, with a simulated RAF clock. Run them against real dependencies and fill any discovered gaps before release.
2. **Frame + headless foundation:** `FrameCoordinator`, `Tween<T>`, `MotionSample`, and disposal contracts are present; the DOM/SVG adapters establish the first renderer sinks.
3. **Gesture physics hardening:** expand `dragInertia()` and `slideFollow()` coverage for pointer-capture edge cases, touch-action examples, injected velocity seams, and multi-touch arbitration.
4. **Declarative retargeting:** `retargetMotion()` is implemented and covered by tests; continue testing multiple subscribers, rapid retargeting and stream errors.
5. **Stream smoothing:** `smoothStream()` implements fixed-latency interpolation; `adaptiveTween()` adapts the duration of transitions to observed cadence. Add stress/property tests before release.
6. **Adapters:** DOM/SVG/Canvas/structural Three.js adapters are implemented; add integration examples and verify teardown contracts before release.
7. **Authoring API:** `Keyframes<T>`, `keyframes()`, selector/array targeting, per-property keyframes/timing, and stagger are implemented; continue refining unit-aware CSS interpolation and error messages.
8. **Documentation and benchmarks:** API docs, edge-case tests, scheduler metrics, and a local RAF benchmark are present; still validate in a real browser and expand long-run profiling.

## Release gates

- Strict TypeScript succeeds against real RxJS types.
- Unit tests use deterministic clocks and cover cancellation, re-subscription, nested composition, and scheduler edge cases.
- No feature claims a guaranteed FPS or promises to recover network data that was never received.
- Public API sketches are promoted to stable exports only after semantics and tests are reviewed.
- The core remains headless; rendering adapters stay opt-in.


## Authoring API ergonomics

**Status: composition helpers and property-level authoring implemented; type-specific interpolators remain planned**

- `sequence(items)` composes `AnimatableItem`s in insertion order.
- `parallel(items)` starts every item at time zero.
- `staggered(items, each, options)` composes items with origin-aware offsets.
- `stagger(each, options)` returns a reusable delay function with `first`, `last`, `center`, or numeric origin and optional easing.
- `Keyframes<T>` supports normalized offsets and segment easing; DOM properties can supply independent keyframes, durations, delays, repeats, and yoyo behavior.
- `animate()` accepts selectors, individual Elements, or iterables of Elements through the opt-in `@re-code/flux/dom` entry point.
- `pointerGestures$()` supports optional pointer capture; `dragInertia()` can lock the motion axis to `x`, `y`, or `both`.

Next authoring work should focus on typed interpolators for structured objects, arrays, colors and common vector shapes, plus stronger pointer-cancel and multi-touch contracts. Do not couple these helpers to DOM; DOM-specific target selection remains in the `@re-code/flux/dom` subpath.

## Landing and examples

The home page now includes a live motion showcase driven by the public `animate()`/`stagger()` APIs plus a second capabilities grid covering stagger, per-property timing, spring retargeting, and live `smoothStream()` interpolation. Both showcases pause when off-screen or when the browser tab is hidden and respect `prefers-reduced-motion`. The visual demos are intentionally separate from the configurable playgrounds.


## Visual authoring and data-driven animation

- [x] Reusable Canvas effects: particle constellation, procedural wave field, projected wireframe sphere, radial spectrum.
- [x] SVG filter animation through reactive turbulence and displacement attributes.
- [x] Accessible text reveal and formatted numeric count-up helpers with deterministic teardown.
- [x] Scroll-scrubbed timeline binding coalesced through the shared scheduler.
- [x] SVG path normalization for supported command families, cubic subdivision, multiple subpaths and closed-contour alignment; unsupported topology fails explicitly.
- [x] A first-class scroll trigger system with start/end anchor expressions, directional enter/leave callbacks, refresh support, optional timeline scrubbing, ResizeObserver-driven refresh, and deterministic teardown.
- [ ] More expressive render effects: SVG gradient-stop choreography, Canvas trails/flow fields, and WebGL-specific examples.


## Recent visual engine follow-up

- [x] Add high-level `draggable()` over gesture physics, with dynamic translation bounds, keyboard movement, teardown/restoration and an `errors$` diagnostic stream.
- [x] Add `AnimationScope.draggable()` so gesture listeners share the same ownership and `revert()` contract as animations.
- [x] Add `drawFrequencyBars()` as an optional `@re-code/flux/effects/canvas` extension that accepts normalized Web Audio bins without owning audio permissions or an animation loop; keep decorative Canvas scenes in the docs app.
- [x] Upgrade the visual lab with an interactive bounded drag scene and a distinct frequency-bar visualization.
- [x] Prefer `ResizeObserver` for visual-lab Canvas resizing, with a window-resize fallback.
- [x] Add optional snap-to-grid release that eases toward the target rather than quantizing every drag sample.
- [ ] Add a browser integration suite for native pointer capture, touch scrolling and resize-driven drag bounds.

- [x] Deterministic Canvas fireworks with configurable burst count, trails and fade, driven by a seekable phase stream.
