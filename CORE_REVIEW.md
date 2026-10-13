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

### P2 — Define whether a playing Timeline is editable

`Timeline.add()` and label operations remain available after playback starts. Adding a segment can change total duration and normalized progress while the playhead is already active. Dynamic editing may eventually be useful, but the current behavior should be a deliberate contract rather than an accidental side effect.

**Recommendation:** initially either reject structural mutations after playback begins or define deterministic live-edit semantics and test them. A future sequence/editor API can support explicit editing if needed.

### P2 — Make the observable ownership contract clearer

`progress$`, `state$` and `Tween.value$` are exposed as `BehaviorSubject`s, so consumers can call `.next()` and mutate engine-owned state. This is convenient for snapshot reads (`.value`) but weakens invariants in a public library. Changing it now could be breaking.

**Recommendation:** before 1.0, consider exposing `Observable` views alongside read-only snapshot getters while keeping internal subjects private. If `.value` must remain public, document the compatibility/migration path.

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
5. Next: decide the pre-1.0 observable and live-Timeline mutation contracts.
6. Implemented in the SVG adapter: supported path commands are converted to cubic segments, contours are subdivided and closed-contour alignment is attempted without adding SVG parsing to the core.
