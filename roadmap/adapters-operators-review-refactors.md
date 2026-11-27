# Adapters and operators review — refactor and fix list

Findings from the level-4 code review (2026-11-28), on `8d4f6fc` with a clean tree: `src/adapters/dom/` (`draggable.ts`, `scrollTrigger.ts`, `animation.ts`, `scope.ts`, `layout.ts`, `styleBinding.ts`, `cssInterpolation.ts`, `propertyOptions.ts`, `text.ts`, `scroll.ts`, `targets.ts`), `src/adapters/svg.ts` and `svg/pathMorph.ts`, `src/adapters/canvas.ts`, `three.ts`, `src/effects/canvas.ts`, `src/operators/` (`gestures.ts`, `smoothStream.ts`, `adaptiveTween.ts`, `retargetMotion.ts`) and the 2D motion helpers (`slideFollow`, `dragInertia`). Back to the [roadmap](../roadmap.md). Related lists: [`core-engine-review-refactors.md`](./core-engine-review-refactors.md) (R1–R7), [`api-packaging-review-refactors.md`](./api-packaging-review-refactors.md) (P1–P8), [`values-physics-review-refactors.md`](./values-physics-review-refactors.md) (V1–V9).

## How to read this file

- This is a working backlog, not a set of roadmap items yet. When an entry is picked up, promote it to its own `roadmap/<ID>-<slug>.md` following [`README.md`](./README.md) (scoring, acceptance criteria, gates).
- The review was done by a read-only reviewer agent on a copy of the repository compiled in scratch (`scratchpad/l4/repo` → `scratchpad/l4/dist`). Gates on that copy: `tsc --noEmit` OK; `biome lint src/adapters src/operators src/effects` OK (23 files); `jest tests/adapters tests/operators tests/effects` 18 suites / 272 tests green; `check-browser-integration.mjs` 14/14 green. Scope coverage 90.7 % statements / 81 % branches; lowest are `scrollTrigger.ts` (81/71), `draggable.ts` (82/71) and `scroll.ts` (82/70).
- Reproduction scripts are in the session scratch folder (`scratchpad/l4/scen/`: `s1-gestures.mjs`, `s1b-nokey.mjs`, `s2-scrolltrigger.mjs`, `s3-scope-svg-ssr.mjs`, `s3b-pathcost.mjs`, `s3c-ssr.mjs`, `s4-browser.mjs`, `s4b-nocapture.mjs`). They are temporary and may be cleaned; the browser ones ran in headless Chromium with no network. **The findings were not independently re-run by the maintainer.** Re-reproduce each one in a failing test before changing code (working rule 2 in the README).
- Finding numbers (`F1`…`F12`) and suggestion numbers (`S1`…`S12`) are the review's own and are used for traceability. Severity A = high, M = medium. Nothing critical for security or data loss was found.
- Out of scope: the other levels' files, steering/flow-field internals, `apps/docs` and CI.

Every entry is a *proposal*; none has been started.

## Backlog

| ID | Title | Fixes | Files | Priority |
|---|---|---|---|---|
| A1 | Release inertia only from a fresh velocity sample | F1, S6 | `src/operators/gestures.ts` | High |
| A2 | `scrollTrigger`: validate the range once, never destroy at runtime | F2 | `src/adapters/dom/scrollTrigger.ts` | High |
| A3 | `scrollTrigger`: keep the scroll direction when updates coalesce | F3 | `src/adapters/dom/scrollTrigger.ts` | High |
| A4 | `draggable` must not swallow clicks of interactive children | F4, S4, S5 | `src/operators/gestures.ts`, `src/adapters/dom/draggable.ts` | High |
| A5 | `flip()` with non-translation transforms | F5, S9 | `src/adapters/dom/layout.ts` | Medium |
| A6 | `animateText()`: rich text, ARIA and word wrapping | F6, F7, F8 | `src/adapters/dom/text.ts` | Medium |
| A7 | `AnimationScope` lifecycle: unbounded growth and throwing `setup` | F9, F10 | `src/adapters/dom/scope.ts` | Medium |
| A8 | SSR failure mode of `bindScrollTimeline` | F11, S7 | `src/adapters/dom/scroll.ts` | Medium |
| A9 | `pathMorph`: commands after `Z` without `M` | F12, S2 | `src/adapters/svg/pathMorph.ts` | Medium |
| A10 | `draggable` / `scrollTrigger` hardening | S1, S3, S11, S12 | `src/adapters/dom/draggable.ts`, `scrollTrigger.ts` | Low |
| A11 | Non-finite progress and idle clocks | S8, S10 | `pathMorph.ts`, `three.ts`, `smoothStream.ts`, `adaptiveTween.ts` | Low |

Suggested order: characterization tests (see below) → A1 → A4 → A2 → A3 → A5 → A6 → A7 → A8 → A9 → A10 → A11. A2 and A3 touch the same `update` path in `scrollTrigger.ts` and A1 and A4 the same `gestures.ts`; one commit each.

---

### A1 — Release inertia only from a fresh velocity sample

**Problem.** On release the time since the last `move` is not checked. The `maxVelocitySampleMs` expiry is applied only inside `move`, so a held-still finger keeps its filtered velocity.

**Evidence (F1).** `src/operators/gestures.ts:275-285` (compare `241-266`): drag 100 px in 80 ms, hold still for 1 s (no `pointermove` arrives), release → phase `inertia`, `vx = 1105`, the element slides to `x = 282.9`. Through `draggable()` it is the same (1.5 s pause → 282.9). Script: `s1-gestures.mjs` (cases A and E).

**Proposal.** In `up`, if `timestamp - lastPointerTimestamp > maxVelocitySampleMs`, set the velocity to zero (or decay it). S6: the velocity EMA is applied per event, not per unit time (`gestures.ts:248-255`), so smoothing depends on the sampling rate (60, 120 or 1000 Hz); weight it by `elapsedMs`. A test pins zero velocity for duplicate timestamps, which is correct; note that Firefox `resistFingerprinting` makes timestamps coarse and would cancel inertia.

**Tests first.** Release after a pause; release after a normal fling (unchanged); different sampling rates give the same smoothed velocity.

### A2 — `scrollTrigger`: validate the range once

**Problem.** `ensureValidRange` also runs at runtime. A transient zero-size range calls `destroy()` and throws an uncaught error in a microtask; the trigger stays dead although `measure()` (`:331`) already handles a zero range.

**Evidence (F2).** `src/adapters/dom/scrollTrigger.ts:218-226` and `342-348`: with `start: 'top center', end: 'bottom center'`, the target goes to height 0 (`display: none` in a breakpoint, a collapsed accordion) and the `ResizeObserver` fires. `progress$` completes, all listeners are removed, the RO disconnects, "start must occur before end" is thrown uncaught, and when the element comes back the progress stays 0. Affects any anchor pair whose range depends only on the target height; the default anchors (`top bottom` / `bottom top`) survive. Script: `s2-scrolltrigger.mjs` (cases 1 and 1b).

**Proposal.** Validate at construction only; at runtime treat an empty or inverted range as "no range" (progress 0 or 1 by position) without destroying.

**Tests first.** Zero-height target after construction, then restored; the uncovered lines 222-226 and the `autoRefresh` RO path (141-143).

### A3 — `scrollTrigger`: keep the scroll direction when updates coalesce

**Problem.** Coalescing drops a scroll update when a resize or RO update is already pending (`fromScrollEvent = false`), losing the direction and with it the transitions.

**Evidence (F3).** `src/adapters/dom/scrollTrigger.ts:213`, `232-235`, `242`: a `resize` (for example the mobile URL bar) and, in the same frame, a scroll that crosses `start`: no `onEnter` or `onToggle` fires, yet `isActive = true`; scrolling back fires `onLeaveBack` without a prior enter. The scroll-only control gives `['enter', 'toggle:true']`. Script: `s2-scrolltrigger.mjs` (cases 2 and 2b).

**Proposal.** OR the `fromScrollEvent` flag into the coalesced update instead of discarding it.

**Tests first.** Resize + scroll crossing `start` in one frame; the symmetric case for `end`.

### A4 — `draggable` must not swallow clicks of interactive children

**Problem.** Pointer capture on `pointerdown` (enabled by default in `draggable.ts:183`) redirects `pointerup` to the container, so the `click` never reaches an inner `<button>` or link.

**Evidence (F4).** `src/operators/gestures.ts:49`: `draggable(div)` with a `<button>` inside: clicking the button registers `click` only on the container (target = the drag element). With `capturePointer: false` the button receives the click, which proves the cause. Scripts: `s4-browser.mjs` (P1), control `s4b-nocapture.mjs`.

**Proposal.** Capture only after a movement threshold, or ignore gestures that start on interactive descendants (or add a handle/ignore option). Related hardening: S4 listen for `pointermove/up/cancel` on `window` in the capture phase so an ancestor's `stopPropagation` cannot leave the drag alive until `blur` (`gestures.ts:61-77`); S5 prevent `dragstart` so an inner `<img>` or `<a>` does not trigger native DnD and a `pointercancel` (`gestures.ts:39-47`).

**Tests first.** Add to `check-browser-integration` (the fake DOM cannot show this): click on a child button inside a draggable; `stopPropagation` on an ancestor; an `<img>` child.

**Risk.** Changing when capture starts is a behaviour change (events delivered to children); record in `CHANGELOG.md`.

### A5 — `flip()` with non-translation transforms

**Problem.** `flip()` bakes the computed matrix and forces `transform-origin: 0px 0px`, which also remains when it finishes. For rotate/scale with the default centre origin the element jumps and stays offset until `dispose()`.

**Evidence (F5).** `src/adapters/dom/layout.ts:78-89`: `.rot { transform: rotate(30deg) }` with `flip(el, () => {})`: the rect goes from `[294, 18]` to `[275, 40]` at start and end, and returns to `[294, 18]` only after `dispose()`. `tests/adapters/dom-layout.test.ts:77-87` pins the formula with a translation matrix only. Script: `s4-browser.mjs` (P2). S9: a `flip()` started while another is in flight bakes the in-flight inline `transform` into `baseTransform` (plausible), and if the user's `stagger` function throws (`:92`) the children already created are not released.

**Proposal.** Keep the computed origin and compose the transforms respecting it (or use the individual `translate` / `scale` properties); restore the origin on completion; release children when `stagger` throws; document or enforce `dispose` of the previous flip.

**Tests first.** `rotate` and `scale` with non-zero `transform-origin` in the browser integration test.

### A6 — `animateText()`: rich text, ARIA and word wrapping

Three confirmed defects in `src/adapters/dom/text.ts`, all of them visible only in a real browser (the fake DOM hides them).

- **F6 — rich text is flattened (`:33-59`; the doc at `:16-18` promises rich-text support).** During the animation, and after completion until `dispose`, `<a>` and `<br>` disappear, and the `<br>` merges words. `<p>Read <a>the docs</a><br>now</p>` with `splitBy: 'words'` leaves no link or `<br>` and `aria-label="Read the docsnow"`, so "docs" and "now" render stuck together. The link returns on `dispose()`.
- **F7 — the accessible name is lost (`:50`, `:59`).** `aria-hidden` on the spans plus `aria-label` on the parent; ARIA forbids naming `paragraph` and `generic`, so the text disappears from the accessibility tree. Playwright/Chromium `ariaSnapshot()` of the split `<p>` is `"- paragraph"` with no text; after `dispose` the text returns. Confirmed for the ARIA structure; the effect on real screen readers is plausible. Fix: a visually hidden element holding the original text instead of `aria-label`.
- **F8 — graphemes break mid-word (`:43-55`).** In graphemes mode there is no word wrapper, and every grapheme is an `inline-block` span, so the browser wraps inside words: in a 120 px box `internationalization…` is split at `i|o`, `l|y`, `i|b`.

Script: `s4-browser.mjs` (P3, P4).

**Proposal.** Preserve non-text nodes (clone or skip `<a>`/`<br>`/inline elements, or restrict to text nodes with a documented limit), replace `aria-label` with a visually hidden copy of the text, wrap graphemes in word-level `inline-block`/`white-space: nowrap` containers.

**Tests first.** Browser integration cases for rich text, the accessibility tree and word wrapping. The splitting uses only `textContent` / `createTextNode` (no XSS vector); keep it that way.

### A7 — `AnimationScope` lifecycle

- **F9 — unbounded growth (`scope.ts:16, 24, 31, 39, 46`).** The scope never removes released or completed resources from its `Set`, so a long-lived scope retains `DOMAnimation`s, bindings and elements. After 1000 `scope.animate(...).dispose()` calls, `resources.size` is 1000. Script: `s3-scope-svg-ssr.mjs` (case 4). Fix: remove a resource from the set when it is disposed or completes.
- **F10 — throwing `setup` leaks a listener (`scope.ts:127-129`).** `createResponsiveScope` adds the `change` listener before `synchronize()`. If `setup` throws, the function throws without returning a controller and the listener stays; every later media-query change reruns `setup`. With `matches: true` and a throwing `setup` one `change` listener remains and there is no way to dispose. Script: case 5 of the same file. Fix: add the listener after the first successful synchronization, or remove it in a `catch`.

**Tests first.** Set growth after many dispose cycles; a throwing `setup`.

### A8 — SSR failure mode of `bindScrollTimeline`

**Problem.** Without `window`, `bindScrollTimeline` does not throw synchronously: it returns a closed `Subscription` and rethrows the error inside the `error` callback, which ends as an uncaught asynchronous exception that takes Node down. `createScrollTrigger` and `flip` throw synchronously.

**Evidence (F11).** `src/adapters/dom/scroll.ts:19-21`, `93-96`: in Node without `window`: `threwSync = false`, then `uncaught: scrollProgress$ requires a browser environment.` Script: `s3c-ssr.mjs`.

**Proposal.** Throw synchronously like its siblings, or emit the error to the caller-provided error path without rethrowing asynchronously. S7: `scrollProgress$` reads layout synchronously on every scroll event (only the write is coalesced in `bindScrollTimeline`; outside the PERF-010 scope), uses the global `window` / `document` even when `root` is another window, and measures vertically only.

**Tests first.** An SSR test per scroll entry point asserting a synchronous throw.

### A9 — `pathMorph`: commands after `Z` without `M`

**Problem.** Commands that follow `Z` without a new `M` are appended to the already closed subpath; per the SVG spec they start a new implicit subpath. The equivalent path with an explicit `M` is rejected for having a different subpath count.

**Evidence (F12).** `src/adapters/svg/pathMorph.ts:336-345`: `M0 0 L10 0 L10 10 Z L20 20` normalizes to one subpath with the segment to (20, 20) and the `Z` at the end, which is a different geometry. Script: `s3-scope-svg-ssr.mjs` (cases 8 and 8b).

**Proposal.** Start an implicit subpath at the current point after `Z`. S2: `splitLongestSegment` is O(n²·16) (`pathMorph.ts:488-505`, `532-547`): with `maxSegmentsPerSubpath: 2048` and a 3-segment `from` it takes 836 ms, with four 1001-segment subpaths 768 ms; at the default (128) it takes 8 ms. Use a heap or cache segment lengths, or lower the maximum. Script: `s3b-pathcost.mjs`.

**Tests first.** Commands after `Z` without `M`; a pathological case with a time cap.

### A10 — `draggable` / `scrollTrigger` hardening

- **S1 (`draggable.ts:242-289`).** An arrow key during drag or inertia is lost because the next `dragInertia` frame overwrites the position (117.4 → 127.4 after the key → 134.3, the same as with no key). Ignore keys while dragging or in inertia, or stop the inertia first. Scripts: `s1-gestures.mjs` (D) vs `s1b-nokey.mjs`.
- **S3 (`scrollTrigger.ts:242-264`).** If a callback calls `destroy()`, `apply()` continues: it seeks the timeline and calls `onUpdate` after destroy (seen by reading the code). Check `destroyed` after each callback.
- **S11 (`draggable.ts:107`).** It adds `tabindex=0` to a generic element without `role` or `aria-roledescription`.
- **S12 (`draggable.ts:352`).** The `translate` regex does not accept exponent notation (`1e-05px`).

### A11 — Non-finite progress and idle clocks

- **S8.** A `NaN` or non-finite progress throws inside the subscribe `next` (`pathMorph.ts:648, 665`, `three.ts:65`), ending as an unhandled RxJS async error; `bindSvgPathDrawing` (`svg.ts:136`) normalizes such values to 0. Unify the rule.
- **S10.** The clock in `smoothStream.ts:118-148` and `adaptiveTween.ts:91-109` emits every frame while subscribed, even at rest, keeping `requestAnimationFrame` alive (battery). Consider an idle mode.

---

## Open decisions (need a maintainer call, not a refactor yet)

- **Concurrent animations on the same property** (`styleBinding.ts:108-111`). With an original `opacity` of `""`: create A, take it to 0.5, create B, dispose A, then B: `opacity` stays `"0.5"`, because the original is captured on the first emission, which PERF-006 kept on purpose (not a regression). Decide an overwrite/kill policy or a per-element registry of originals. Script: `s3-scope-svg-ssr.mjs` (case 10).
- **Layout changes without scroll** (`scrollTrigger.ts:240-264`). They change `isActive` without calling `onToggle` / `onEnter`, and an `onLeave` later arrives with no prior enter. This follows the contract at line 60 ("refresh emits no enter/leave") but leaves callback pairs unbalanced and is inconsistent with the constructor, which does emit `onEnter` / `onToggle`. Script: `s2-scrolltrigger.mjs` (case 3).
- **Reduced motion for 2D inertia.** `dragInertia`, `slideFollow` and `draggable` inertia do not consult `MotionPreferences` because they use `frameCoordinator.frames$` directly; the `draggable` snap does go through `Tween`. Decide whether inertia should honour it.

## Overlaps with the other lists (do not duplicate)

- `slideFollow` stability and `restDelta: 0` → V1 / V7.
- `retargetMotion` → V2 / V3 / V6.
- Callback ordering of `DOMAnimation` → R1 / R2.
- `bindCanvas` released inside its own draw → R6.
- Writing on every emission → PERF-006; drawing on the next frame → PERF-008; cost of `followSvgPath$` and `animateNumber` → PERF-010, already decided.

## Test gaps to close before refactoring

- **`gestures`:** release after a pause (A1); `pointerup` with `stopPropagation`; interactive children inside the target (A4).
- **`scrollTrigger`:** zero range at runtime (lines 222-226) and the `autoRefresh` RO path (141-143); resize and scroll in the same frame (A3); `destroy` inside a callback; an element root.
- **`draggable`** (82 % coverage): the snap error path (222-236), `getBounds` errors from the keyboard (271-277), the key during inertia.
- **`flip`:** `rotate` / `scale` with a non-zero `transform-origin` (A5); `dom-layout.test.ts:77-87` uses a translation matrix only.
- **`animateText`:** the fake DOM cannot show rich-text flattening, ARIA semantics or word breaking (A6); add `check-browser-integration` cases.
- **`scope`:** set growth (A7); a throwing `setup` in `createResponsiveScope`.
- **`pathMorph`:** commands after `Z` without `M`; pathological cases with a time cap.
- **Context:** `check-renderer-cleanup`, `check-playground-lifecycle` and `check-steering-integrations` are static text checks (leftover p5, docs-app patterns, steering contracts). They verify nothing about adapter lifecycle at runtime.

## What is already fine (do not refactor)

- **Listeners and observers are balanced** (counted in `s1-gestures.mjs` and `s2-scrolltrigger.mjs`). `draggable` and `pointerGestures$` create 8 listeners during a drag and leave 0 after `destroy` mid-drag, with capture released, styles and `tabindex` restored and 0 pending `requestAnimationFrame`; `destroy` is idempotent. `scrollTrigger` leaves 0 listeners, the RO disconnected and 0 rAF.
- **2D inertia uses analytic exponential integration**, stable at any `dt`, with `maxDeltaMs` and bounds zeroing the velocity of the colliding axis.
- **The PERF items are met in code:** PERF-004 (`compileNumericTemplateJoined`, `pathMorph.ts:646`), PERF-006 (reused arrays in `styleBinding`), PERF-008 (`openWriteChannel`, `canvas.ts:49`), PERF-003 (`compiledCssInterpolator`, `animation.ts:148`), PERF-010 (batched reads, `layout.ts:70` and `animation.ts:171`).
- **Text splitting uses only `textContent` / `createTextNode`** (no XSS vector) and `Intl.Segmenter` for graphemes.
- **`bindCanvas` does save/restore in `finally`**, and draw errors do not break the loop.
- **dom, svg, canvas, three, effects and operators import in plain Node** (SSR-safe at module time).
- **The path parser is well hardened:** compact arcs, exponents, length and subpath caps.

## Shared gates

Every entry that changes `src/` must pass the **Code gate** in [`README.md`](./README.md): `npm run typecheck`, `npm run typecheck:tests`, `npm test -- --runInBand`, `npm run check:tree-shaking`, `npm run check:package`, `npm run check:package:consumer`, plus a `dist/**/*.d.ts` diff recorded in `CHANGELOG.md` if public output changes. Anything touching adapters should also pass `npm run check:browser-integration` and, where docs literals change, the Docs gate (`npm run check:docs`). Entries that change per-frame work (A1, A9, A11) should report the relevant `bench:*` (for example `bench:adapters`, `bench:path-morph`) descriptively, per the Performance gate; benchmarks are never a pass/fail threshold.
