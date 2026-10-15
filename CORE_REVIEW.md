# Core animation review

**Scope:** source review of `src/core`, `src/values`, `src/utils/easings.ts`, the main adapters, and their tests. This document records follow-up work; it does not claim the complete test suite was executed in this environment.

## Conclusion

The current architecture is good enough to continue advanced SVG work. `Animation`/`Timeline` drive typed values through a shared `FrameCoordinator`; `Tween<T>` and `Keyframes<T>` keep interpolation headless; lifecycle preferences are opt-in; rendering lives behind adapter subpaths. There is no need to rewrite the engine before implementing SVG path normalization.

The P1 core-contract hardening pass is implemented in source and covered by new deterministic tests. Run the full Jest and strict TypeScript suites with the repository's real dependencies before release; the next feature can then focus on SVG path normalization.

## Findings and priorities

### P1 — Strict timing validation in the headless core

**Status: implemented in the follow-up hardening pass; run the real Jest/typecheck suite locally before release.**

`Animation` now rejects non-finite/negative durations and delays, invalid repeat counts, and finite timing combinations that overflow total duration. `Timeline.add()` validates numeric offsets, child durations, and computed end times while retaining `repeat: Infinity`, infinite child durations, and relative offsets that underflow to the timeline start.

**Contract:** duration and delay are finite non-negative numbers; repeats are non-negative safe integers or `Infinity`. Numeric timeline positions must be finite and non-negative. Relative offsets that underflow the timeline start clamp to zero, while implicit append after an infinite segment is rejected.

### P1 — Correct state semantics for manual seeking

**Status: implemented in the follow-up hardening pass; run the real Jest/typecheck suite locally before release.**

`Animation.seek()` and `Timeline.seek()` now update values/callbacks without setting the state to `running` when no frame clock is active. Clock-driven playback remains `running`; manual scrubbing preserves `idle` or `paused`, and seeking to the end sets `completed`. Timeline pauses also propagate to active child state without adding child frame clocks.

**Contract:** manual seeking still applies updates/callbacks, but does not force `running` unless a clock is active. Seeking to the end completes; seeking backward from completion returns the transport state to `idle`. Timeline pause state is propagated to active children.

### P1 — Validate every keyframe segment

**Status: implemented in the follow-up hardening pass; run the real Jest/typecheck suite locally before release.**

`Keyframes` now resolves and validates an interpolator for every adjacent pair, so intermediate incompatible object/array shapes fail at construction unless a custom interpolator is supplied.

**Contract:** each adjacent segment gets its own resolved interpolator. The default interpolator rejects incompatible structures; a custom interpolator explicitly owns every segment and may bridge different shapes.

### P1 — Define whether a playing Timeline is editable

**Status: implemented in this refactor and covered by deterministic regression tests.**

Structural changes (`add`, `addLabel`, and `removeLabel`) are rejected after playback begins or the playhead is moved to a non-zero time. Call `stop()` before editing, which resets the playhead and unlocks the structure. Nested timelines lock recursively while the parent controls their playhead and unlock when the parent stops/resets.

**Contract:** no implicit live-editing semantics before 1.0. A later timeline editor API can add explicit live mutation if there's a concrete use case.

### P1 — Make the observable ownership contract clearer

**Status: implemented in this refactor and covered by utility tests.**

Engine-owned state uses private `BehaviorSubject`s and exposes read-only Observable views. Existing synchronous `.value` reads remain available on the exposed state views, while `.next()`, `.error()`, and `.complete()` are no longer exposed. This applies to Animation/Timeline progress and state, Tween/Keyframes values, and RetargetableMotion streams.

**Contract:** state mutation belongs to the engine. Consumer code may subscribe and read snapshots but cannot directly push values into engine-owned streams.

### P2 — Strict easing-name diagnostics

`resolveEasing()` deliberately falls back to linear for unknown strings. This is friendly for typo-tolerance but makes misspelled easing names difficult to notice.

**Recommendation:** preserve fallback behavior if compatibility requires it, but consider a strict validation mode or development warning. Add explicit tests/documentation for unknown names.

## SVG work that belongs outside the core

Path parsing, cubic/quadratic/arc command normalization, closed-contour alignment, contour pairing and SVG serialization belong in `src/adapters/svg.ts` or focused internal SVG modules. The core should keep receiving normalized progress and emitting typed values. This preserves tree-shaking and keeps DOM-specific parsing out of headless animation users' bundle.

## Suggested sequence

1. **Completed in this pass:** added deterministic tests for timing validation, manual-seek states, timeline offsets/child durations, and adjacent keyframe compatibility.
2. **Completed in this pass:** implemented shared finite/non-negative timing validation and repeat-count validation.
3. **Completed in this pass:** separated manual scrubbing from clock-driven running state and propagated timeline pause state to active children.
4. **Completed in this pass:** validates each adjacent keyframe segment and invokes the matching segment interpolator.
5. **Completed in this refactor:** locks Timeline structural mutation during active/non-zero playback, including nested timelines, and exposes engine-owned state through read-only views.
6. Implemented in the SVG adapter: supported path commands are converted to cubic segments, contours are subdivided and closed-contour alignment is attempted without adding SVG parsing to the core.
