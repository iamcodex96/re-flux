# Visual lab examples

The `/visuals` page is intended to demonstrate that re;Flux animates more than position:

- **SVG stroke reveal**: `bindSvgPathDrawing(path, progress$)` interpolates `stroke-dashoffset` from path length to zero and restores the original dash attributes on unsubscribe.
- **SVG motion path**: `followSvgPath$(path, progress$)` emits an `{ x, y, angle, progress }` sample so the same path can drive SVG, CSS, Canvas or Three.js objects.
- **SVG path morph**: `normalizeSvgPathPair(from, to)` converts supported `M/L/H/V/C/S/Q/T/A/Z` paths (including relative commands) into matching absolute cubic segments. It subdivides segments to equalize per-contour command counts, aligns closed contour start points/direction and rejects mismatched subpath counts or open/closed topology. `bindSvgPathMorph(path, progress$, from, to)` applies the normalized interpolation and restores the original `d` attribute on unsubscribe.
- **Canvas particle field and waveforms**: `Tween<number>` produces a time/phase stream and `bindCanvas()` coalesces updates into the shared coordinator's write phase. `resizeCanvas()` accounts for device pixel ratio while draw callbacks use CSS-pixel coordinates.
- **Kinetic typography**: the DOM adapter staggers transforms and opacity per character.
- **FLIP layout transitions**: `flip(elements, mutate, options)` measures the pre/post layout, applies an inverse transform, and animates back to the new layout. Dispose the returned animation to restore inline transforms and transform origins.
- **Scroll-linked progress**: `scrollProgress$(element)` emits a value between zero and one as the element enters and leaves the viewport. Unsubscribing removes scroll/resize listeners.
- **Scroll triggers**: `createScrollTrigger(element, options)` parses target/root anchors such as `top 85%`, emits directional `onEnter`/`onLeave`/`onEnterBack`/`onLeaveBack` callbacks, and can scrub an optional `Timeline`. `refresh()` rebases geometry after app-driven layout changes and `destroy()` releases listeners, resize observation, progress subscriptions and scheduled frame work.

The demos use `MotionPreferences` with `pauseWhenHidden: true`; infinite loops suspend when reduced motion is requested. Applications can choose a different policy per animation rather than imposing it globally.


## Advanced effects added in the visual lab

- **SVG turbulence / displacement**: a normalized tween updates `feTurbulence.baseFrequency` and `feDisplacementMap.scale` through `bindSvgAttributes()`, creating a liquid-surface distortion while retaining the original filter attributes for teardown.
- **Canvas showcase scenes**: `drawParticleConstellation()`, `drawWaveField()`, `drawWireframeSphere()`, `drawRadialSpectrum()` and `drawFireworks()` are documentation-only drawing examples. They are intentionally kept outside the public npm runtime surface and demonstrate how `bindCanvas()` can drive pure render functions using CSS-pixel dimensions.
- **Counter transitions**: `animateNumber()` formats values such as metrics, scores and percentages on a timeline. It restores the original child nodes when disposed.
- **Text reveal**: `animateText()` can split by grapheme or word, preserves the original nodes, provides an accessible label while splitting and restores the original markup when disposed.
- **Scroll scrubbing**: `bindScrollTimeline()` maps `scrollProgress$()` to a timeline playhead and coalesces scroll events through the shared FrameCoordinator write phase. `createScrollTrigger()` adds explicit start/end boundary semantics and lifecycle callbacks. Unsubscribe the binding or destroy the trigger and dispose the timeline when the scene is removed.

The wireframe sphere is projected into Canvas 2D and does not require a WebGL context or Three.js installation. The radial spectrum is procedural, but its phase input can be replaced by a stream derived from audio or application data.


## New production interaction and data examples

- `draggable(element, options)` composes pointer capture, filtered velocity, dynamic bounds, eased snap-to-grid release, inertial motion and arrow-key movement; `destroy()` restores the CSS `translate`, `cursor`, `touch-action`, `user-select`, and temporary `tabindex` state.
- `AnimationScope.draggable()` lets components register draggable interactions alongside timelines and subscriptions so `scope.revert()` also releases their input listeners.
- `drawFrequencyBars(context, normalizedBins, size, options)` renders caller-owned data. The visual lab uses a synthetic spectrum so the example runs without microphone permissions; a real application can pass normalized `AnalyserNode` frequency bins.
- Canvas scenes use `ResizeObserver` where available to update backing dimensions when their container changes, with a window-resize fallback.

- **Fireworks:** deterministic Canvas burst/trail rendering driven by one phase value, suitable for seeking and shared-coordinator scheduling.


## Playback controls

The visual lab uses explicit replay controls for **one-shot** scenes that automatically run on mount or first entering the viewport:

- **SVG stroke reveal** auto-plays once and can be replayed without rebuilding its binding.
- **Counter transitions** start when the metrics enter the viewport and have a Replay control for subsequent runs. Clicking Replay before first visibility starts them immediately and suppresses a second observer-triggered start.
- **Kinetic typography** auto-plays once and can be restarted through the same `DOMAnimation` instance.
- **Continuous SVG and Canvas scenes** remain live loops; they do not show a redundant Replay button.
- **FLIP layout** and **drag** are user-triggered interactions, and **scroll-linked motion** follows the user's scroll position.

This distinction is intentional: controls should be available when a scene has a meaningful completed state to replay, rather than adding Play/Replay buttons to every continuously running visualization.

## SVG morphing contract

- Supported path commands: `M`, `L`, `H`, `V`, `C`, `S`, `Q`, `T`, `A`, and `Z`, in absolute and relative forms. Normalization serializes to absolute `M`/`C`/`Z` commands.
- Source and target must contain the same number of subpaths, and paired subpaths must both be open or both be closed. Subpaths are paired by their order in the path data.
- Closed contours are aligned against the source by choosing the target's lowest-cost segment rotation or reversed direction. This is a heuristic for better correspondence, not a semantic shape matcher.
- Curves are subdivided exactly with de Casteljau splitting until both sides have the same segment count. Paths exceeding the configured `maxSegmentsPerSubpath` (default `128`) are rejected rather than causing unbounded morph work.
- For complex shapes with many holes or reordered contours, callers should normalize subpath ordering before calling the library.
