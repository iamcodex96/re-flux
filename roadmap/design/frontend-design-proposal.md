# re;Flux docs frontend — design proposal

| | |
|---|---|
| Scope | `apps/docs` (Home, Visual Lab, Playground, Docs, Benchmark Lab) |
| Status | Proposal, **revision 2**. **Design only:** no source, test or config file was changed in this repository or in the sibling repositories, which were read only. |
| Date / commit | 2026-11-23. re;Flux `main` @ `c24f194`. Sibling repositories read on disk: `re-aurora` @ `bd596b5` plus uncommitted work (`au-dialog`); `re-basics` @ `a16cd2c`. |
| Evidence | Code read in `apps/docs/src/**`, `src/**`, `../re-aurora/**` and `../re-basics/**`. Bundle figures were measured with gzip on artefacts already on disk; nothing was rebuilt or run, because a performance session was active on the machine. re;Flux docs `dist` (2026-11-22): entry `index-*.js` **98.9 KB gzip** (307 KB raw), entry `index-*.css` **81.2 KB gzip** (538 KB raw), `Home-*.js` 10.4 KB, `Home-*.css` 8.4 KB. Aurora figures come from `../re-aurora/dist` (§3A.6 v). |
| ID prefix | `DESIGN-` is a new prefix, introduced the same way `API` was (see `roadmap/README.md`). Items live inline in this file (§5). Revision 2 adds `DESIGN-A01…A10` for the Aurora/Basics integration. Requests to the Aurora repository are named `AURORA-*` (§3A.4). They are **requests to the Aurora owner**, not work for this repository. |

## Revision 2 — what changed and why

**Why:** a new owner requirement. The docs frontend is built with the sibling libraries **`@re-code/aurora`** and **`@re-code/basics`**:
- Every atomic or molecular UI component comes from Aurora.
- Utility functions (`get`, `map` and similar) come from Basics.
- The home-grown `UiPrimitives` set is retired wherever Aurora covers it.
- Organisms and page compositions stay in the docs app, built from Aurora parts.

**What changed in this document:**
1. **New §3A, "Aurora and Basics adoption".** It contains:
   - the component mapping (34 `Ui*` primitives plus 15 recurring hand-rolled patterns), with a status per row;
   - the MDI → Lucide icon mapping (70 icons);
   - eleven `AURORA-*` requests;
   - the interim shim strategy;
   - the integration design: Vue + Web Components, delivery, the duplicate-Flux hazard, theming, bundle and contract scripts;
   - the Basics replacement table.
2. **`ENG-ICONS` is redefined.** Icons now migrate to Lucide through `au-icon`, which replaces the rev 1 "inline SVG icons" plan. The `@mdi/font` stylesheet (418 KB raw) and its four font files (3.6 MB on disk, 403 KB woff2 download) go away.
3. **§4.2 is rewritten.** The rev 1 molecules (`PlaybackControls`, `QualityChip`, `CopyButton`, `PageMotionSwitch` and the generic parts of others) are now either compositions of `au-*` parts or `AURORA-*` requests. Only docs-specific organisms remain as components.
4. **§5 is re-sequenced.** There are new prerequisites: `DESIGN-A01…A08` (delivery, Flux dedupe, Vue integration, theme mapping, icons, primitive retirement, Basics, shims). There are new showcase items `DESIGN-A09…A10`. Items that wait on Aurora are marked blocked or shim-backed.
5. **New concepts C10–C12.** These make the three-product combination visible.
6. **§6 open questions are rewritten.** There are now 8.

**Facts verified in the sibling repositories**, some of which correct the brief:

| # | Finding | Evidence |
|---|---|---|
| a | `au-dialog` exists but is **uncommitted work in progress**. Its README says "Status: in progress (box 1 of Step 4)", and Step 4 of the Aurora rollout is unchecked. | `re-aurora/src/components/overlays/au-dialog/README.md:5`; `git status` shows it untracked |
| b | Aurora's Flux bridge (`loadFlux`, `createFluxAnimation`, `createMotionPreferences`) is **internal**. No package export exposes it, and **no component uses it yet**. | `re-aurora/src/integrations/flux/*`; no `integrations` entry in `package.json` exports; no import from components |
| c | Aurora's dark theme lives **inside `styles.css`** under `[data-aurora-theme=dark]`. There is no `themes/dark.css`. `styles.css` also contains a `prefers-color-scheme: dark` default for `:root:not([data-aurora-theme])`. | `re-aurora/dist/styles.css` |
| d | `utilities.css` is **36.1 KB gzip** (331.6 KB raw). Importing it whole would cost almost half of today's entry CSS. | gzip of `re-aurora/dist/utilities.css` |
| e | `au-icon`'s runtime chunk (20.0 KB gzip) **appears to** carry the whole Lucide names list. This is inferred from about 1,580 slug-like strings found in the chunk, not confirmed from source. The first icon also lazily loads a **27.2 KB gzip** dynamic import map. Each icon then costs about 0.3 KB. Consumer builds will emit about **2,000** icon chunk files. | `re-aurora/dist/components/p-iGhtXJsT.js`, `p--J-bytcY.js`; 2,006 `p-*.js` files |
| f | `au-button` forwards only `aria-label`. It has **no `aria-pressed` / `aria-expanded` / `aria-controls` / `aria-current` passthrough and no link (`href`) mode**. | `re-aurora/src/components/actions/au-button/au-button.tsx:25-46,98-99` |
| g | Aurora's `docs/ARCHITECTURE.md` says "No Vue/React/Angular wrappers" and "No mandatory Basics or Flux dependency", **yet `package.json` lists `@re-code/flux` (pinned `0.5.0-beta.0`), `@re-code/basics` and `rxjs` as hard `dependencies`**. Its lockfile resolves Flux from the npm registry. | `re-aurora/package.json`, `package-lock.json:1921-1924`, `docs/ARCHITECTURE.md:144-145` |
| h | Aurora's own roadmap says "No npm publish … is part of the current work". Phase 6 (release readiness) is unchecked. | `re-aurora/docs/ROADMAP.md` (end), Phase 6 |
| i | Basics **is published** (`0.1.0` on npm, `sideEffects: false`). It has `isPlainObject`, `countBy`, `roundTo`, `sum`, `median` (returns `NaN` on empty input), `debounce`, `mapValues`, `keyBy`, `truncate`, `kebabCase` and `sanitize/{html/escapeHtml, text/stripControlCharacters, url/sanitizeUrl}`. It has **no `sort` and no `percentile`**. | `re-basics/src/**`, `package.json` exports |
| j | No Aurora build ships an SSR/hydrate output. The output targets are `dist` and `dist-custom-elements` with `auto-define-custom-elements`. | `re-aurora/stencil.config.ts:12-23` |

**Correction kept from rev 1:** `scrollTrigger` and `draggable` live in `src/adapters/dom/scrollTrigger.ts` and `src/adapters/dom/draggable.ts`, not in `src/operators/`.

**Prerequisite engineering items.** The engineering audit mentions these, but they are **not filed** in `roadmap.md`. They are referenced here by placeholder names and should get real IDs (probably `CHORE-`/`DOCS-`) when filed:

| Placeholder | Meaning |
|---|---|
| `ENG-ICONS` (unfiled) | **Rev 2:** delivered by `DESIGN-A05`. Migrate MDI to Lucide through `au-icon` (mapping in §3A.3). Remove `@mdi/font` (imported in `main.ts`) and the unused Material Symbols stylesheet link in `index.html` together with its orphan CSS class in `base/_typography.scss`. |
| `ENG-FONTS` (unfiled) | Self-host subsetted Inter and JetBrains Mono woff2, preload one weight each, and drop the Google Fonts links. **Rev 2:** Aurora declares Lato and Montserrat stacks but bundles no font files. The docs theme overrides `--aurora-font-family-*` to Inter and JetBrains Mono, so Lato and Montserrat are never requested (§3A.6 iv). |
| `ENG-LOCALE` (unfiled) | Split `en.json` (219 KB raw, imported eagerly by `stores/app.ts`) per route. |
| `ENG-META` (unfiled) | Per-route `<title>` and description. |
| `ENG-HISTORY` (unfiled) | History-mode routing plus prerendered docs pages. **Rev 2:** this now interacts with Aurora's lack of SSR output (§3A.6 i). |

**Proposed engine items.** These are capabilities the concepts would like but the engine does **not** have today. They are listed in §5.4 as `ENGINE-A…D` and would be filed as `API-00x`, because they touch public API. No concept depends on them for its first version.

---

## 1. Design diagnosis

Twelve observations, each tied to a file. **S** marks a structural problem (information architecture, architecture or accessibility contract). **P** marks a polish problem (visual or interaction detail).

### Structural

**S1. The site does not prove the engine where it matters most.**
- `LandingTelemetryStage.vue` is labelled "telemetry", but it is illustrative. Its six nodes pulse on hard-coded `animate()` loops (`:30-48`), and its readouts are static locale strings (`nodes06`, `observableMotionOutput`).
- The real data exists: `frameCoordinator.metrics$` exposes `lastFrameWorkMs`, `activeFrameSubscribers` and pending read/write tasks, and `DocsRuntimeTelemetry.vue` already consumes it. The Home page just does not use it.
- Two demos bypass the shared clock with raw `requestAnimationFrame` loops: `Playground/MotionPanels/SteeringPanel.vue:123,130,187` and `VisualLab/kineticTypographyMotion.ts:222,228`. Their work is invisible to `metrics$`, which contradicts the library's main claim: one shared, measurable clock.
- `VisualLabFeaturedStage.vue:491-504` computes its own `smoothedFps` from `performance.now()` instead of reading `AnimationFrameTick.delta`.

**S2. In-page anchors depend on the hash.** The hero scroll cue is `<a href="#home-story">` (`Home.vue:304`). Under `createWebHashHistory`, the router very likely parses that hash as the route `/home-story` rather than scrolling (**verify in a browser**). It also breaks constraint 7. Docs sections carry `id="api-surface"` and similar ids that cannot be deep-linked today. Every in-page jump should be a scripted `scrollIntoView` on an element ref that respects reduced motion. Shareable deep links should wait for `ENG-HISTORY`.

**S3. Motion gating is copy-pasted, and the copies disagree.**
- Five components each wire up IntersectionObserver, `matchMedia('(prefers-reduced-motion)')` and `visibilitychange` themselves: `Home.vue`, `LandingTelemetryStage.vue`, `LandingCodeMotion.vue`, `LandingLabPreview.vue` and `VisualLabFeaturedStage.vue`.
- Their thresholds differ: rootMargin `120px` vs `140px`, threshold `0.05` / `0.08` / `0.1`.
- Some use `MotionPreferences`, others read `matchMedia` directly.
- `MotionPreferencesSource` is an interface (`src/core/MotionPreferences.ts:11`), so one composed source could serve every scene. That source would combine OS preference, page visibility, element visibility and a user override.

**S4. Infinite hero motion has no pause control (WCAG 2.2.2, level A).**
- The hero fluid shader is a `repeat: Infinity` tween (`VisualLabShaderPreview.vue:320-322`) that plays next to content with no pause button. Only the OS reduced-motion setting stops it.
- The same applies to the telemetry stage, the Home lab previews (a 9.4 s infinite canvas tween and a 3.2 s infinite morph) and the featured Visual Lab stage.
- SC 2.2.2 requires a pause, stop or hide mechanism for auto-playing motion that lasts more than 5 s.

**S5. The first impression is static.** Every Home motion component is gated on `hasScrolled` (`Home.vue:29,66-70,294,395,409,426`). The above-the-fold telemetry stage and its nodes therefore stand still until the visitor scrolls, so a motion library's landing page opens on a still frame. The gate is a recorded decision: `scripts/check-home-experience.mjs:46` asserts it, and it makes sense as a CPU and LCP guard. A visibility-plus-idle gate and a quality governor do the same job without hiding the product (§6 Q5).

**S6. The Home page tells the same story three times.**
- The `value → spring → frame coordination → render` pipeline appears in the telemetry stage pipeline (`LandingTelemetryStage.vue:145-153`), again in the story kernel (`value$ → frame$`, `Home.vue:340`), and again in the four principle cards (`stream / frames / adapters / lifecycle`).
- The page has eight blocks: hero, telemetry, story intro, story runway, lab rail, code workbench, principles and closing. Most of them use an eyebrow, an h2 and a bordered panel, so nothing stands out.
- The story runway's sticky stage shows chips and a slider. Its scroll progress drives only a progress bar (`Home.vue:160`), not the scene.

**S7. In the Playground, the workbench sits below the fold on every module.** `PlaygroundLayout.vue` renders, in order:
1. A hero with a giant module title.
2. An "Active module 01 / 12" card that repeats the title's information.
3. The full "Modules Index": 12 links in 4 groups.
4. Only then the `<RouterView>` workbench.

Switching modules re-renders the same index above the content, so the thing a visitor came to use is always a scroll away.

**S8. Docs findability is weak.**
- There is no global search.
- The API reference search (`DocsApiReference.vue:21-22`) is a substring `includes` over entries that live inside the locale JSON. That design puts API data into the entry bundle, and it makes ranking impossible: an exact name does not beat a description match.
- There is no keyboard shortcut and no result-count announcement. Only the copy feedback is announced, at `:51`.

**S9. Motion and colour tokens are disconnected from the engine.**
- `_tokens.scss:223-231` defines seven durations between 140 and 350 ms, several only 20 ms apart. It also defines two cubic-beziers that match no engine `Easings` entry.
- Spring parameters drift: the Home story uses stiffness 240 / damping 28 (`Home.vue:208`), the runtime telemetry uses 220 / 26 / mass 1.1, and `DEFAULT_SPRING_OPTIONS` is 260 / 30.
- Colours are hard-coded outside SCSS, where `check:scss-tokens` cannot see them:
  - `#8f72ff`, `#a78bfa` and `#14c8dd` in SVG gradients (`LandingTelemetryStage.vue:119-126`, `LandingCodeMotion.vue:495-496`, `LandingLabPreview.vue:232-233`).
  - Canvas palettes `#67e8f9`, `#c4b5fd` and `#eef3ff` (`LandingLabPreview.vue:94-96`, `VisualLabFeaturedStage.vue:59-61,293`).
  - `UiIcon` maps `purple` to `#a78bfa` (`UiPrimitives.ts:229`).
- Every canvas scene re-implements token reading (`VisualLabFeaturedStage.vue:75-95`).

### Polish

**P1. Some small text fails contrast, and the label sizes are too small.**
- `--rx-brand-text-subtle` is the text colour at alpha 0.46 on `#0c0e13`. That composites to roughly `rgb(115,117,121)`, about **4.2:1** by computed estimate, which is below the 4.5:1 that small text needs.
- `--rx-font-size-micro: 0.48rem` (7.7 px) and `--rx-font-size-code-label: 0.55rem` (8.8 px) are used for uppercase monospace labels. Small, tracked, uppercase mono is the hardest text to read on the site.
- Set a floor of 0.6875 rem (11 px) for any label that carries information.

**P2. Icon and glyph systems are mixed.**
- MDI webfont icons sit next to Unicode glyphs used as icons: `✳ ↗ ⌘ ▱ ›` in `Home.vue:338,389,400,423`.
- An unused Material Symbols stylesheet is still linked.
- `↗` marks internal `RouterLink`s ("Inspect ↗", "Explore ↗"). That arrow conventionally means "opens elsewhere", so it signals an external link where there is none.
- `ENG-ICONS` fixes the weight problem. The design should fix the semantics: `→` for internal links and `↗` only for external ones.

**P3. Monospace "label voice" is overused.** Nearly every block opens with a dot, an uppercase mono eyebrow and a counter ("01 / 04", "STAGE NODE", "LIVE KERNEL", "NODES 06"). The technical-editorial voice is a real strength, but used everywhere it reads as decoration and competes with the few labels that report live data. **Rule:** mono uppercase is reserved for live engine data and real identifiers, and section eyebrows become sentence-case Inter.

### Rev 2: how the Aurora and Basics move changes these findings

| Finding | Effect of adopting Aurora and Basics |
|---|---|
| S1 (engine not proven; raw RAF loops in `SteeringPanel.vue`, `kineticTypographyMotion.ts`) | **Unchanged and more important.** Aurora's future Flux-driven motion must share the docs' single `FrameCoordinator`, or the telemetry and governor become blind (duplicate-Flux hazard, §3A.6 iii). |
| S2 (`href="#home-story"` hash-anchor bug, probable) | Unchanged. It is a router issue, not a component issue. |
| S3 (copy-pasted motion gating) | Unchanged for scenes. Aurora's components never animate through Flux today, so the docs-side `useMotionGate` remains the single policy (DESIGN-003). |
| S4 (no pause for infinite motion, WCAG 2.2.2) | Unchanged. Aurora's `styles.css` reduced-motion rules only cover Aurora's own CSS transitions. |
| S5–S7 (static first impression, Home repetition, Playground IA) | Unchanged. These are organisms and stay in the docs app. |
| S8 (findability) | The command palette is built on `au-dialog` and `au-input type="search"`. Aurora defers combobox ("Not now"), so the palette's listbox stays docs-owned (§3A.4 note). |
| S9 (motion and colour tokens disconnected) | **Partly absorbed.** Semantic colours, radii, font families and durations move to Aurora's `--aurora-*` properties, which a docs theme file sets from the `--rx-*` channel triples (§3A.6 iv). Engine-twin easings and spring presets stay docs-owned. Aurora's `MOTION_EASINGS` has only `standard` and `emphasized`, neither of which is an engine easing. |
| P1 (contrast token `--rx-brand-text-subtle` ≈ 4.2:1) | Unchanged in substance. The fix moves into the theme mapping: `--aurora-color-text-muted` must reach ≥ 4.5:1, and axe now also checks Aurora shadow content. |
| P2 (mixed icon systems, unused Material Symbols stylesheet) | **Resolved by DESIGN-A05.** MDI is replaced by Lucide through `au-icon`, and the unused Material Symbols link and its orphan class are removed in the same item. The Unicode-glyph-as-icon and `↗`-for-internal-links rules still apply. |
| P3 (mono label overuse) | Unchanged. It is a typographic rule in the docs theme. |
| Accessibility floor | **Partly covered by Aurora.** `styles.css` ships reduced-motion and forced-colors foundations, and Aurora components carry tested focus, keyboard and form semantics. The docs still own landmarks, headings, live regions for scenes, pause controls and canvas names. |

---

## 2. Design direction

### 2.1 Statement

> **The site is the engine's instrument panel.** Every moving pixel is driven by a public re;Flux primitive, can be inspected, and degrades by measurement rather than guesswork. Motion explains state; it never decorates reading.

### 2.2 Principles

1. **Proof over decoration.** If something moves, a visitor can find out what moves it. Each live scene carries an "Inspect" affordance that names the driving primitive (`RetargetableMotion`, `Timeline`, `followFlowField`…) and links to its docs. Decorative-only loops are removed or replaced by engine-driven ones.
2. **Static first.** Every scene has a *designed* still frame, the poster. The poster is what prerendered HTML ships, what reduced motion shows, and what the lowest quality tier shows. It is a composition in its own right, not a placeholder.
3. **Measured, not assumed.** Scene quality follows measured frame cadence: `AnimationFrameTick.delta` from `frameCoordinator.frames$` plus `metrics.lastFrameWorkMs`. The site shows the visitor the current tier and why it was chosen ("Quality 2/3 · 14.1 ms frames").
4. **Calm until touched.** Ambient motion is low in amplitude, and only **one** ambient scene may run per viewport. Amplitude and energy rise only in response to the visitor's pointer, scroll or keys.
5. **The visitor holds the switch.** A site-wide *Pause motion* control sits in the header. It is implemented as a `MotionPreferencesSource`, so it demonstrates that API. It overrides every scene, persists, and defaults to the OS preference.

### 2.3 Motion language

Durations collapse from seven tokens to four. Every CSS easing token has a named engine twin, and one TS module, `apps/docs/src/motion/tokens.ts`, exports both forms so CSS and engine code cannot drift apart.

| Token | Value | Engine twin | Use |
|---|---|---|---|
| `--rx-motion-instant` | 100 ms | — | press feedback, toggles, focus (focus rings themselves are never animated) |
| `--rx-motion-quick` | 160 ms | — | hover, small reveals, chip state |
| `--rx-motion-standard` | 240 ms | — | enter/exit of panels, popovers, palette results |
| `--rx-motion-deliberate` | 420 ms | — | layout (`flip()`), route transitions |
| `--rx-ease-standard` | `cubic-bezier(0.33, 1, 0.68, 1)` | `Easings.easeOutCubic` | default UI motion |
| `--rx-ease-enter` | `cubic-bezier(0.22, 1, 0.36, 1)` | `Easings.easeOutQuint` | things arriving |
| `--rx-ease-exit` | `cubic-bezier(0.32, 0, 0.67, 0)` | `Easings.easeInCubic` | things leaving (always shorter than the enter) |
| `--rx-ease-move` | `cubic-bezier(0.65, 0, 0.35, 1)` | `Easings.easeInOutCubic` | on-screen to on-screen moves |

**Spring presets** are exported from `motion/tokens.ts` as `SpringOptions`. ζ is the damping ratio, ζ = c / (2√(k·m)), with m = 1.

| Preset | stiffness / damping | ζ | Use |
|---|---|---|---|
| `snappy` | 420 / 34 | 0.83 | controls, thumbs, chips that follow input |
| `standard` | `DEFAULT_SPRING_OPTIONS` (260 / 30) | 0.93 | default retargeting (replaces the 240/28 and 220/26 variants) |
| `gentle` | 170 / 26 | 1.00 | scroll-linked kernels, cards, camera rigs |
| `playful` | 180 / 12 | 0.45 | **demos only**, to show overshoot; never UI chrome |

**How motion communicates state**

| State | Motion signal | Non-motion equivalent (always present) |
|---|---|---|
| Retargeted | spring continues with preserved velocity | numeric "target" readout updates |
| Completed / settled | short settle, no loop | state label "Settled" |
| Paused (user, off-screen or hidden tab) | freezes on the current frame | label "Paused · off-screen" plus button state |
| Reduced motion | jumps to the final state (`reducedMotion: 'finish'`) | poster frame plus label "Reduced motion" |
| Quality tier changed | none; the change itself is the signal | `QualityChip` text plus throttled polite announcement |
| Loading a heavy scene | poster stays; a 2 px progress hairline appears | `aria-busy="true"` on the stage |
| Error / unsupported | none | inline message (`role="status"`) and the poster |

**Intentionally not animated**
- Body text and headings after first paint. No per-letter reveals on reading content. `animateText` is only for display type in the hero.
- Code blocks, tables and API rows. Filter changes use `flip()` only on card grids, never on tables.
- Benchmark numbers. Tweening a measurement implies precision it does not have.
- Scroll position. There is no scroll-jacking: scroll maps *progress* and never overrides the scroll.
- Docs reading rails. No parallax and no ambient backgrounds behind article text.
- Error and validation messages. They appear instantly.

---

## 3. Concepts

The concepts are ranked by **(Impact × Showcase) / Effort**, where Impact and Showcase are scored 1–5 and Effort S=1, M=2, L=3.

| Rank | Concept | Impact | Showcase | Effort | Score | Lands as |
|---|---|---|---|---|---|---|
| 1 | C1 Quality governor — "quality scales with measured frame time" | 4 | 5 | S | 20.0 | DESIGN-005 |
| 2 | C2 Live telemetry: a real hero stage plus a global Telemetry Dock | 5 | 5 | M | 12.5 | DESIGN-001, DESIGN-006 |
| 3 | C3 The page is the timeline (story rebuilt on one scroll-bound `Timeline`) | 5 | 4 | M | 10.0 | DESIGN-008 |
| 4 | C4 Scrubbable code: the snippet *is* the control | 4 | 5 | M | 10.0 | DESIGN-009 |
| 5 | C5 Motion Design Lab (bezier handles, spring ζ-pad, CSS `linear()` export) | 4 | 5 | M | 10.0 | DESIGN-010 |
| 6 | C6 Hero render ladder with a three.js top tier driven by `bindThreeObject` | 5 | 5 | L | 8.3 | DESIGN-011, DESIGN-012 |
| 7 | C7 Frame X-ray (read / consumer / write waterfall) | 4 | 5 | L* | 6.7 | DESIGN-015 (*needs ENGINE-A) |
| 8 | C8 Command palette with FLIP-animated results | 4 | 3 | M | 6.0 | DESIGN-013 |
| 9 | C9 Route and layout transitions (View Transitions plus brand-mark morph) | 3 | 3 | M | 4.5 | DESIGN-014 |
| — | **Rev 2:** C10 Aurora components moved by Flux | 4 | 5 | M | 10.0 | DESIGN-A09 (blocked on `au-dialog` release) |
| — | **Rev 2:** C11 "Three products, one interaction" integration lab | 3 | 5 | M | 7.5 | DESIGN-A10 |
| — | **Rev 2:** C12 Scoped Aurora theme preview (not a shell theme switcher) | 2 | 4 | S | 8.0 | DESIGN-A10 |

Discarded from the brief's list:
- **A light theme.** The owner removed it deliberately, and `scripts/check-dark-theme-only.mjs` enforces that. See §6 Q3, and C12 for the scoped alternative.
- **A full live code editor with TS transpilation.** C4 delivers most of the value with no eval and no editor weight. See C4.

---

### C1. Quality governor — "Quality scales with measured frame time"

**Storyboard**
1. A visitor on a mid-range phone opens Home. The hero starts at the tier the device heuristics suggest: Tier 2 on that phone, the flow field.
2. After 45 slow frames, the governor drops to Tier 1. The `QualityChip` in the stage corner changes from `Quality 2/3` to `Quality 1/3 · 24 ms frames`, and a polite live region announces "Scene quality reduced to keep motion smooth" (at most once per 10 s).
3. Tapping the chip opens a small menu: `Auto (measured)` · `High` · `Medium` · `Low` · `Static`, plus a one-line explanation and a link to "How this works" in the Performance docs.
4. On a desktop the visitor can force `Low` and watch the frame-time sparkline in the dock fall. The site is demonstrating its own adaptivity.

**Engine capabilities exercised**
- `frameCoordinator.metrics$`, using its emission cadence for frame time and `lastFrameWorkMs` for engine work.
- The clock's own idle behaviour: an idle page produces no samples.
- RxJS operators for EWMA and hysteresis.
- `MotionPreferencesSource` for pause on hidden.
- It sets an example for the `adaptiveTween` mindset: cadence-aware behaviour.

**Algorithm (docs-side `createQualityGovernor()`, about 1.5 KB gzip)**

In this algorithm, "`delta`" means the interval between consecutive `metrics$` emissions. It is equivalent to `AnimationFrameTick.delta`, but it is observed without starting the clock (see Caveats).

- **Calibrate.** Take the median `delta` of the first 30 frames while visible. This estimates the refresh interval `I`, using the same method the Benchmark Lab already explains in its copy.
- **Downgrade** one tier when EWMA(`delta`) > 1.3·I, or EWMA(`lastFrameWorkMs`) > 0.5·I, for 45 consecutive frames.
- **Upgrade** one tier when EWMA(`delta`) < 1.1·I and work < 0.25·I for 240 frames. Allow at most one upgrade per 5 s. After two down/up oscillations, lock the lower tier for the session.
- **Ignore** frames while the tab is hidden and the first 10 frames after it becomes visible again. Visibility changes produce huge deltas that are not real slowness.
- **Initial tier:**
  - Tier 0 if `prefers-reduced-motion` is set or the user override is Static.
  - Otherwise capped by `navigator.connection?.saveData`, `hardwareConcurrency < 4`, `deviceMemory < 4` (Chromium only; treat as unknown elsewhere), and coarse pointer plus a narrow viewport.

**Caveats**

*Instrumentation must never keep the clock awake.* Any subscriber to `frames$` starts the shared RAF clock (`ensureClock()` in the `frames$` subscribe path). If the governor or the telemetry views subscribed to `frames$`, the clock could never go idle. Rules:
1. The governor and every telemetry view observe **only `metrics$`**.
   - Subscribing to `metrics$` does not start the clock (`FrameCoordinator.ts:66-75`).
   - `metrics$` emits once per frame that actually runs (`:252`).
2. Cadence is the interval between consecutive `metrics$` emissions (timestamped with `performance.now()` on receipt), cross-checked with `totalFrames`.
3. No emissions means the clock is idle. The governor *holds* its tier and samples nothing.
4. Scenes that need `delta` for physics already subscribe to `frames$` through their animations, and only while running.

*Measurement scope.*
- `lastFrameWorkMs` is only measured while `metrics$` has an observer. Observing turns timing on app-wide, at the cost of two `performance.now()` calls per frame. That is acceptable, but it must be documented.
- Work ms covers only work run *inside* coordinator phases. It does not cover raster or GPU time. That is why the emission interval (cadence) is the primary signal and work is secondary.
- Scenes must render inside coordinator phases, or the governor cannot see them (see C6).

| Aspect | Plan |
|---|---|
| New dependency | None. |
| Accessibility | The chip is a `<button aria-haspopup="menu">` and its label includes the tier. Tier changes are announced politely and throttled. Quality is never conveyed by colour alone. |
| Reduced motion | Forces Tier 0 (poster). The governor stops sampling, so it adds no work. |
| Mobile / low power | It is the low-power plan. Device pixel ratio caps per tier: T3 = min(dpr, 2), T2 = 1.5, T1 = 1. |
| Budget | ≤ 1.5 KB gzip, in a shared lazy chunk (`motion/`), never in the entry. Overhead ≤ 0.05 ms per frame. |
| Effort / risks | S. **Risk:** oscillation; mitigated by asymmetric hysteresis and the session lock. **Risk:** devtools throttling and background tabs skewing calibration; mitigated by recalibrating after visibility returns. |

---

### C2. Live telemetry: a real hero stage plus a global Telemetry Dock

**Storyboard**
1. **Hero.** The existing telemetry stage stays in place and keeps its visual language, but every number becomes real:
   - The stage reads `metrics$` only, so it adds **no** frame subscriber of its own and does not keep the clock alive (see C1, Caveats).
   - When nothing else animates, it honestly shows `clock idle · 0 subscribers`, which is a feature: the engine sleeps.
   - When the hero scene runs: `subscribers 3`, `read 0 · write 1`, `work 0.21 ms`, `frame 16.6 ms`.
   - The dashed curves become a **sparkline of real frame deltas**: an SVG path updated through `bindSvgAttributes` at 4 Hz.
   - The pipeline chips light up in the order the engine actually runs a frame: read → consumers → write.
   - Motion starts when the stage is visible, not after the first scroll.
2. **Anywhere on the site**, a small "◉ engine" button in the header opens the **Telemetry Dock**, a Popover-API panel docked bottom-right. It shows:
   - Clock: running or idle, frame number, a delta sparkline.
   - Queues: pending reads and writes.
   - Sources: the live motion sources on this page, each with a name, primitive, state and tier.
   - Quality: the governor tier and the reason for it.
3. When the visitor scrolls the featured Visual Lab stage off-screen, they can watch its source flip to `paused · off-screen` and the clock go `idle`. This shows the engine's idle teardown, which no marketing copy can.

```
┌ Telemetry ──────────────────────────── ✕ ┐
│ CLOCK   ● running   frame 18 204         │
│ Δ  ▁▂▁▁▃▁▁▁▂▁▁▁▁▆▁▁▁   16.7 ms (I=16.6)  │
│ WORK  0.21 ms   max 1.9 ms               │
│ QUEUES  read 0   write 1   subs 4        │
│ ─ Sources on this page ───────────────── │
│ ▸ Hero flow field  followFlowField  T2 ● │
│ ▸ Story timeline   Timeline 41%      ● │
│ ▸ Code workbench   RetargetableMotion ‖ │
│ QUALITY  Auto → 2/3  (Δ EWMA 18.9 ms)    │
└──────────────────────────────────────────┘
```

**Engine capabilities exercised:** `frameCoordinator.metrics$` and `getDiagnostics()` (`isIdle`), deliberately **not** `frames$`, plus `bindSvgAttributes`, `MotionPreferences`, and the state streams of `Tween`/`Timeline`/`RetargetableMotion` (`state$`).

**Engine gap:** a per-phase split (read / consumer / write ms) does **not** exist in `FrameCoordinatorMetrics`. The dock shows totals only until ENGINE-A lands (see C7).

**Docs-side registry:** `useMotionSource({ name, primitive, state$, tier$ })` registers a scene in a page-level `Set` and is disposed automatically on unmount. It is plain Vue, not an engine API.

| Aspect | Plan |
|---|---|
| New dependency | None (Popover API; where unsupported, the dock falls back to a non-modal `<dialog>`). |
| Accessibility | The toggle is a `<button aria-expanded aria-controls>`. The dock is a labelled region with an `h2`. Esc closes it and returns focus to the toggle. Values sit in a `<dl>` and are **not** live regions (they would chatter). Only source state changes are announced, politely and throttled. Sparklines carry a text summary ("median 16.7 ms, max 19.1 ms"). |
| Reduced motion | The sparkline updates at 1 Hz, as a static redraw. |
| Mobile | The dock becomes a bottom sheet at ≤ `$breakpoint-sm` with one column. |
| Adapts via metrics | The dock *is* the metrics view. Its sparkline redraw rate follows the governor tier: 4 Hz at T2–T3, 1 Hz at T0–T1. |
| Budget | Hero changes ≤ +2 KB gzip in the Home chunk. Dock ≤ 8 KB gzip, loaded on first open. The header toggle is **new** entry code: a plain button with a dynamic `import()`, no rxjs, ≤ 0.3 KB gzip. |
| Effort / risks | M. **Risk:** observing `metrics$` permanently adds timing cost; observe only while the dock or hero stage is visible. **Risk:** the `check-home-experience.mjs` contract asserts `<LandingTelemetryStage`; keep the component name. |

---

### C3. The page is the timeline

**Storyboard:** the story runway becomes one `Timeline` with four chapters, and the scroll position *is* its playhead.

```
┌──────── sticky stage (≥ 800 px) ───────────┐  ┌ chapter text ┐
│  [poster ← seek(t)]                        │  │ 01 Compose   │
│   ○ value ─spring─► ○ frame ─► ▣ render    │  │ …            │
│                                            │  │ 02 Think     │
│  ▕█████████████░░░░░░░░░░░░░░░░░▏ 41 %     │  │ reactively   │
│   Compose · Think · Feel · Beyond          │  │ …            │
└────────────────────────────────────────────┘  └──────────────┘
         ▲ ChapterRail: buttons + <progress>, not a slider
```

| Chapter | Timeline segment | What the stage does |
|---|---|---|
| 01 *Compose motion* | `Timeline().add(enter).add(settle, '-=260')` | Real segments appear as bars, and the playhead tracks scroll. |
| 02 *Think reactively* | `Keyframes` on a stream graph | Values flow through the graph as numbers, and the code panel's `value$` readout changes with them. |
| 03 *Feel the physics* | A `RetargetableMotion` spring that is *not* scroll-bound | The visitor's slider retargets the spring mid-flight. The contrast between "scrubbed" and "simulated" is the lesson. |
| 04 *Beyond interfaces* | `followSvgPath$` plus `bindCanvas` | One progress value drives an SVG path, a canvas sprite and (Tier 3) a 3D object together. |

**Engine capabilities exercised:**
- `createScrollTrigger(runway, { timeline, start: 'top top', end: 'bottom bottom' })`; `ScrollTriggerOptions.timeline` exists in `src/adapters/dom/scrollTrigger.ts:41`.
- `bindScrollTimeline` as an alternative, plus `Timeline`, `Keyframes`, `stagger`, `followSvgPath$`, `bindSvgPathMorph` and `bindCanvas`.

**Navigation:**
- The `ChapterRail` is a `<nav>` with an `<ol>` of buttons, and the active chapter has `aria-current="step"`.
- Activating a chapter calls `element.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth' })` on an element ref. There are no hash fragments, so it works under both hash and history routing.
- Progress is a native `<progress>` labelled "Story progress".

| Aspect | Plan |
|---|---|
| New dependency | None. |
| Accessibility | Chapter text is ordinary headings and paragraphs in reading order. The stage is supplementary (`role="img"` with a per-chapter `aria-label` that describes the *end state*). No information exists only in motion: each chapter's text carries the claim, and the stage illustrates it. |
| Reduced motion / Tier 0 | No pinning. Each chapter renders an inline poster: the timeline is seeked to that chapter's end and frozen. Chapter 03's spring still responds, but with `reducedMotion: 'finish'`, so it jumps to the target. |
| Mobile (< 800 px) | No sticky stage. Each chapter gets a compact inline stage that plays its own segment once when 50 % visible. The current code already disables the scroll trigger below 800 px (`Home.vue:206`). |
| Adapts via metrics | The governor tier sets stage richness. T3/T2: full stage with canvas chapter 04. T1: SVG only, no canvas sprite. T0: posters, no pinning. Scrubbing itself is not continuous work: frames run only while scroll changes progress. |
| Budget | Home chunk ≤ +4 KB gzip. Scroll handling stays on the coordinator's read phase, which `scrollTrigger` already uses. Target: no long task > 50 ms while scrolling, in a Chromium performance trace. |
| Effort / risks | M. **Risk:** sticky plus a long runway at 200 % zoom, which the current runway also faces; test at 200 % and 320 px. **Risk:** `check-home-experience.mjs` literals; update them in the same PR (or after DOCS-004). |

---

### C4. Scrubbable code: the snippet *is* the control

**Storyboard**
1. In the Code workbench and in every Playground module, numbers in the generated code are live. In `stiffness: 240`, the `240` shows a dotted underline. Dragging it horizontally (or pressing ↑ / ↓ while it is focused) changes the value, and the preview **retargets mid-flight through `RetargetableMotion`**, so the visitor feels velocity preservation.
2. Easing names in the code (`'easeInOutCubic'`) are a small listbox of the real `Easings` keys.
3. "Copy" copies the snippet *with the current values*.
4. A "Reset" chip appears once any value has changed.

```
const motion = new RetargetableMotion({
  initialValue: 0,
  stiffness: ‹240›,   ← drag ⟷ or ↑↓ (Shift ×10)
  damping:   ‹28›,
});
motion.to(‹1›);       ← click toggles 0 ↔ 1, preview retargets
```

**Engine capabilities exercised:** `RetargetableMotion.to(target, options)` with per-call options, `pointerGestures$` (horizontal drag with velocity), `resolveEasing`, `Easings`, `Timeline`, `Tween`, and `stagger` (module dependent).

**Syntax highlighting.** Use a hand-rolled TS/bash/JSON tokenizer, about 2 KB gzip, that covers the snippet subset the site generates: keywords, strings, numbers, comments, identifiers and punctuation. Token colours come from `--rx-syntax-*` tokens (§4.1).
- *Why not Shiki:* the runtime with grammars and themes is on the order of hundreds of KB, and it is overkill for generated snippets.
- *Why not Prism or highlight.js:* about 6–20 KB gzip for TS, with themes to restyle. Their benefit over a 2 KB tokenizer for known, generated input is marginal.
- If long docs code ever needs full TS grammar fidelity, highlight **at build time** in a Vite plugin. That costs nothing at runtime and is a separate decision.

**Why not a full editor:** CodeMirror 6 with TS support is roughly 100+ KB gzip, and running user TS would need a transpiler (sucrase is about 50 KB gzip, esbuild-wasm is MBs) plus a sandboxed `iframe` with CSP. That cost is real and should be a separate, later item, if ever. The scrubbable version runs **no user code**, so there is nothing to sandbox.

| Aspect | Plan |
|---|---|
| New dependency | None. |
| Accessibility | Each scrubbable number is `role="spinbutton"` with `aria-valuenow/min/max`, an `aria-label` from the parameter name, and Arrow/PageUp/PageDown/Home/End keys. The rendered `<pre>` is still selectable text. Value changes update a polite live region summary ("stiffness 260"), throttled to 250 ms. |
| Reduced motion | Values still change, and the preview jumps to the end state (`reducedMotion: 'finish'`). |
| Mobile | Drag on numbers is disabled on coarse pointers, because horizontal drag fights scroll. Tapping a number opens a small native `<input type=number>` popover instead. |
| Adapts via metrics | Not continuous: it runs only while a value changes. At governor T0–T1, scrub updates are coalesced to one retarget per frame instead of one per pointer event. |
| Budget | ≤ 5 KB gzip (tokenizer plus scrub logic) in a shared Playground chunk. |
| Effort / risks | M. **Risk:** code-string templating drifting from the real behaviour. Generate the snippet *from* the same options object that drives the preview, with a single source of truth. |

---

### C5. Motion Design Lab (replaces and extends Playground → Easings)

**Storyboard:** a two-tab lab.

**Curve tab**
- A bezier editor with two draggable handles, using `draggable()` with `keyboardStep` and `getBounds`, so it is keyboard-operable by construction.
- Presets are the engine's named `Easings`.
- Three previews run the curve at once: DOM translate, an SVG path draw (`bindSvgPathDrawing`) and a canvas dot, so the visitor sees that one easing feeds every adapter.

**Spring tab**
- A **ζ-pad**: a 2D plane with stiffness on x and damping on y, where the underdamped, critical and overdamped regions are drawn as contour bands and labelled in text.
- Dragging the puck retargets a live spring. Clicking the preview "plucks" the mass, retargeting it with velocity.
- The plot shows the real `stepSpring` sample curve.

**Export** (every export has a copy button):
- `cubicBezier(x1, y1, x2, y2)` or the spring options object.
- A **CSS `linear()` easing** generated by sampling the spring (or curve) at the engine's own step. This is a genuinely useful tool that ties the engine to native CSS.

```
┌ Curve | Spring ──────────────────────────────────────────┐
│  ζ-pad                          │  preview  ●──────○      │
│  damping ▲  overdamped          │  plot     ╭─╮_          │
│          │      ·  ← puck       │           ╯  ╰──────    │
│          │ critical ─ ─ ─       │  export   linear(0, 0.12│
│          │ underdamped          │           , 0.48 …)  ⧉  │
│          └──────────► stiffness │  [x] respect reduced    │
│  stiffness [260] damping [30]   │      motion in preview  │
└─────────────────────────────────┴─────────────────────────┘
```

**Engine capabilities exercised:** `cubicBezier`, `Easings`, `resolveEasing`, `stepSpring`, `DEFAULT_SPRING_OPTIONS`, `RetargetableMotion`, `draggable`, `bindSvgPathDrawing`, `bindCanvas`, `projectInertiaTarget` (the puck throw). It also reuses the existing `EasingCurve.vue`.

| Aspect | Plan |
|---|---|
| New dependency | None. |
| Accessibility | There is no 2D ARIA slider pattern, so the **accessible interface is two labelled native range inputs** (stiffness, damping) plus a ζ readout in text ("ζ 0.93 · slightly underdamped"). The pad is a pointer enhancement whose puck is a `draggable()` element (`tabindex=0`, arrow keys), and it stays in sync with the inputs. Region bands have text labels, not colour alone. |
| Reduced motion | Previews show the start and end poses plus the full plotted curve (static). |
| Mobile | The pad stacks above the previews. The puck target is ≥ 44 px. |
| Adapts via metrics | Three simultaneous previews at T2–T3. At T1 only the DOM preview runs, and the canvas and SVG previews show their end pose. At T0, static. |
| Budget | Route chunk ≤ 10 KB gzip. |
| Effort / risks | M. **Risk:** the `linear()` export must be exact. Unit-test it: sample n points with `stepSpring`, then assert the output string and its parse. |

---

### C6. Hero render ladder, topped by a three.js scene driven by `bindThreeObject`

**Storyboard (Tier 3, capable desktop)**
1. The hero shows the static poster first (prerender-safe). After `requestIdleCallback`, if the device is capable, a three.js scene fades in: the **re;Flux kernel**, a lattice of a few hundred small instanced rods arranged as a sphere-like flow, with a central object group.
2. On load, a `Timeline` assembles the lattice: `stagger` from centre, `easeOutQuint`.
3. The pointer retargets a `gentle` spring that tilts the camera rig through **`bindThreeObject(cameraRig, transforms$)`**. Scroll progress (`scrollProgress$`) pushes the kernel's scale and rotation through a second `bindThreeObject` binding.
4. A thin overlay draws the real stream graph: `pointer$ → retargetMotion() → bindThreeObject(rig)` with live values. That makes it the hero's live "streams overlay", and it is real data.
5. The renderer **renders only when a bound stream emits.** Each emission sets a dirty flag and requests a `frameCoordinator.scheduleWrite` render, once per frame. An idle hero therefore costs 0 ms, and the Telemetry Dock shows the clock going idle.

**The ladder** (chosen by the governor, C1):

| Tier | Renderer | Content | DPR |
|---|---|---|---|
| 3 | three.js (WebGL2) | instanced kernel, camera rig springs | ≤ 2 |
| 2 | Canvas 2D | **flow-field** particles: `createFlowField` + `followFlowField` + `stepSteeringAgent`, perturbed by pointer and scroll velocity; 1 200 → 300 agents by tier | ≤ 1.5 |
| 1 | SVG | the kernel mark plus one spring-driven element (`bindSvgAttributes`); no continuous loop | 1 |
| 0 | static | designed poster (inline SVG), the same composition as the prerendered HTML | — |

The current hand-rolled hero fluid shader (`VisualLabShaderPreview.vue`, `shader-fluid`) moves back to the Visual Lab Shaders page. That page is about shaders. The hero should be about the engine.

**Engine capabilities exercised:**
- `bindThreeObject` (`src/adapters/three.ts`), which ships today and is never demonstrated.
- `RetargetableMotion`, `retargetMotion`, `Timeline`, `stagger`, `scrollProgress$`, `pointerGestures$`.
- `frameCoordinator.scheduleWrite` for rendering, the steering and flow-field modules, `bindCanvas`, `resizeCanvas({ pixelRatio })` and `MotionPreferences`.

**Engine notes**
- `bindThreeObject` only binds `position/rotation/scale` of one object. An `InstancedMesh` needs per-instance matrices, so instance updates are written docs-side in the same write task.
- A `bindThreeInstances` helper is a *candidate* engine item. File it only if DESIGN-012 proves the pattern is general.
- The renderer must render inside a coordinator phase. If it ran on its own RAF, the governor and the dock would be blind to it.

**New dependency: `three`**

| | |
|---|---|
| Version range | `^0.17x` (pin to the current minor at implementation time). |
| License | MIT. |
| gzip cost | **Estimate 120–160 KB gzip** for `WebGLRenderer` + `PerspectiveCamera` + `InstancedMesh` + `BufferGeometry` + one basic or standard material, imported by name. three.js tree-shakes only partly. **Ceiling: 170 KB gzip** for its own chunk, measured after build. |
| Lazy boundary | `import('three')` inside `HeroSceneThree.ts`, behind four gates: (a) the hero is in the viewport (IntersectionObserver); (b) idle callback; (c) governor initial tier = 3, which requires no reduced motion, no Save-Data and WebGL2 available (probed on an offscreen canvas); (d) the user override is not Low/Static. |
| Why not hand-rolled | The goal is to show the adapter that **targets three.js objects**. Hand-rolling a scene graph, camera and instancing would duplicate three and prove nothing about `bindThreeObject`. Lighter libraries whose objects expose `position/rotation/scale` with `x/y/z` (OGL, for example) might satisfy `ThreeObjectLike`. That is **unverified**, and it is §6 Q6. |

**Rollout (risk control):**
1. Ship the three.js scene first as a new Visual Lab page, `/visuals/three` ("Three adapter"), which has no Home weight.
2. Promote it to the Home hero only after the budget and Web Vitals criteria in DESIGN-012 pass.

| Aspect | Plan |
|---|---|
| Accessibility | The `<canvas>` is `aria-hidden`. The hero's meaning lives in the h1 and copy. The scene container is a `MotionStage` with an accessible name ("Interactive re;Flux kernel, decorative") and **a visible Pause button**, which satisfies WCAG 2.2.2. Pointer interaction is optional. Keyboard users get arrow keys on the focused stage, the same pattern `VisualLabFeaturedStage.vue:406-426` already uses. Forced colors: the poster is shown with system colours. |
| Reduced motion | Tier 0 poster. `three` is never downloaded. |
| Mobile / low power | Mobile starts at Tier 2 or below, and Tier 3 is never chosen on coarse pointer plus a narrow viewport. No WebGL2 → Tier 2. Canvas unavailable → Tier 1. |
| Adapts via metrics | The ladder *is* the adaptation. The governor moves between tiers; within Tier 3, the instance count (600 → 300) and DPR follow the tier's sub-steps. Because rendering happens in a coordinator write task, its CPU cost appears in `lastFrameWorkMs` and its GPU cost in frame cadence. |
| Performance budget | No change to LCP: the LCP element stays the h1 text, and the scene only loads after idle. Engine work ≤ 2 ms per frame at Tier 3 on desktop; Tier 2 ≤ 4 ms on a mid-range phone; downgrade otherwise. The scene loads only when visible and is disposed (geometry, material, renderer, `forceContextLoss`) when the route is left. |
| Effort / risks | L. **Risk:** three's weight; mitigated by the ceiling, the gates and Lab-first rollout. **Risk:** WebGL context limits; mitigated by keeping one context per page and disposing on leave. **Risk:** `check-home-experience.mjs` asserts the idle-loaded shader pattern (`scheduleHeroShader`, `v-if="!heroShaderRequested"`); those assertions must be rewritten for the ladder (or retired via DOCS-004). |

---

### C7. Frame X-ray

**Storyboard**
- On Playground → Frames and Docs → Performance, a waterfall shows the last 120 frames as stacked bars: **read | consumers | write**, with the queue depth beneath.
- A "stress" control adds 0–2 000 animations (reusing the Benchmark Lab workloads). The visitor watches consumer time grow linearly while the clock stays a single RAF ("Peak RAF callbacks: 1").
- Hovering or focusing a bar shows that frame's numbers in a `<dl>`.

**Engine gap: ENGINE-A.** `FrameCoordinatorMetrics` exposes only total work (`lastFrameWorkMs`) and queue counts. It needs an **opt-in** per-phase split, such as `lastReadMs / lastConsumerMs / lastWriteMs`, measured only while `metrics$` is observed. That keeps the hot path free (see PERF-007's semantics constraints). Until it lands, C7 can show totals and queue depth, which is honest but less striking.

| Aspect | Plan |
|---|---|
| New dependency | None. |
| Accessibility | The chart is an SVG with a `<table>` alternative (visually hidden, toggled by "Show as table"). Bars are focusable through a roving tabindex. Colour plus pattern encodes each phase. |
| Reduced motion | Updates at 1 Hz, with no bar transitions. |
| Adapts via metrics | It renders metrics. The stress control's ceiling drops at lower governor tiers, so the X-ray never makes the page unusable. |
| Budget | ≤ 6 KB gzip in the Frames module chunk. |
| Effort / risks | M once ENGINE-A exists, L with it included. **Risk:** the measurement itself perturbs timing; show "measurement on" and its overhead in the copy. |

---

### C8. Command palette (Ctrl/Cmd + K)

**Storyboard**
1. Pressing Ctrl/Cmd+K, `/`, or the header search button opens a native `<dialog>` palette.
2. Typing filters routes, docs sections, API entries and **actions**: "Pause all motion", "Open telemetry", "Copy install command", "Force quality: Low".
3. Results reorder with `flip()` (in-page and synchronous, which suits `flip()`), and new rows enter with a 20 ms `stagger`.
4. Enter navigates. Selecting an API entry lands on the API reference with that entry filtered and focused.

**Engine capabilities exercised:** `flip()` (`src/adapters/dom/layout.ts`), `stagger`, `animate()` and `MotionPreferences` (FLIP is skipped under reduced motion).

**Search approach**
- Hand-roll a scorer of about 1 KB: exact name beats prefix, prefix beats token, token beats substring, with a category boost.
- The index has fewer than 600 entries and is generated at build time from route metadata and the API entries, as a JSON chunk loaded on first open.
- *Considered:* MiniSearch (MIT, about 7 KB gzip), worth it only if full-text article search is wanted. That decision waits for `ENG-LOCALE` (stated default at the end of §6).

| Aspect | Plan |
|---|---|
| Accessibility | The WAI-ARIA combobox pattern: input `role="combobox"` with `aria-expanded`, `aria-controls` and `aria-activedescendant`; a `role="listbox"` of `role="option"`. A results-count live region ("12 results"). The dialog's native focus containment and Esc to close, with focus returned to the trigger. The shortcut is announced in the trigger's `aria-keyshortcuts`. The `/` shortcut is ignored while typing in inputs. |
| Reduced motion | No FLIP and no stagger. |
| Mobile | A full-screen sheet opened by the header search button. No shortcut hint. |
| Adapts via metrics | Not continuous. Below T2, FLIP is replaced by instant reorder and the stagger is dropped. |
| Budget | UI ≤ 6 KB gzip (lazy, on first open). Index ≤ 15 KB gzip (lazy). The entry gets only the trigger button plus a keydown listener (≤ 0.3 KB). |
| Dependencies | `ENG-META` (route titles to index); `ENG-LOCALE` (the index must not pull the whole locale). |
| Effort / risks | M. **Risk:** a shortcut conflict with the browser or assistive technology. Never bind a bare letter except `/`, and offer a way to disable it in the palette footer. |

---

### C9. Route and layout transitions

**Storyboard**
- **Route changes.** Where the View Transitions API is available, the page cross-fades (240 ms, `--rx-ease-standard`) and the header's brand mark morphs into the section glyph through `bindSvgPathMorph` (a 420 ms tween): Lab → flask, Playground → play, Docs → book, Benchmarks → bars. Without View Transitions, the route swaps instantly. Only the brand mark morph runs.
- **In-page layout changes** use `flip()`: Visual Lab filter grid, Playground module switch (compact switcher, DESIGN-007) and API category filter cards (not the table).

**Why View Transitions rather than `flip()` for routes.** `flip()` measures "Last" synchronously right after `mutate()` (`layout.ts:39-41`), but route components are async chunks, so "Last" is not in the DOM yet. Native view transitions handle the async swap.

**Engine gap: ENGINE-D.** A split API (`const capture = flipCapture(targets); …await…; capture.play()`) would make cross-route shared-element FLIP possible with the engine itself. It is a nice-to-have, not a prerequisite.

| Aspect | Plan |
|---|---|
| Accessibility | Focus management stays as it is today: `App.vue` focuses `#main-content` on route change. |
| Reduced motion | No transition and no morph. |
| Adapts via metrics | Below T2, the view transition is skipped and only the 160 ms brand morph runs. At T0, nothing runs. |
| Budget | ≤ 3 KB gzip (lazy after first navigation). |
| Effort / risks | M. **Risk:** View Transitions plus a sticky header flicker; give the header its own `view-transition-name`. |

---

### C10. Aurora components moved by Flux ("Aurora × Flux choreography")

**Storyboard**
1. **Dialog enter.** Opening the command palette (`au-dialog`) plays a short Flux `Timeline`: the panel scales from 0.96 to 1, the backdrop fades, and result rows enter with a 20 ms `stagger`.
2. **Dialog exit.** Closing reverses it. The docs listen for Aurora's cancelable **`au-before-close`** event, call `preventDefault()`, run the exit timeline, then set `open = false` from code. Setting the property dispatches nothing, so there is no loop.
3. **Card press.** Pressing an experiment card (`au-card` plus a docs `RouterLink`) compresses it with a `snappy` spring and releases it with the pointer's velocity (`pointerGestures$` → `RetargetableMotion`).
4. **Tabs indicator.** Once `au-tabs` exists (AURORA-NAV-001), its active indicator follows the selected tab with a `standard` spring.
5. **Everything is inspectable.** The Telemetry Dock lists "au-dialog choreography · Timeline". This proves Aurora's motion runs on the same clock as everything else.

**How it is wired, without reaching into shadow DOM**
- Flux animates **CSS custom properties on the host** (`animate()` supports `--*` properties, `src/adapters/dom/cssInterpolation.ts:155,160`).
- The docs theme maps those properties onto Aurora's documented parts, for example:

  ```css
  au-dialog::part(dialog) { scale: var(--rx-enter-scale, 1); opacity: var(--rx-enter-opacity, 1); }
  ```
- This uses only public contracts: parts, custom properties and `au-before-close`.

**Why not Aurora's internal Flux bridge:** it is not exported (finding b). Using it would mean deep-importing internals. A public motion contract is requested as AURORA-FLX-001 (§3A.4).

**Engine capabilities exercised:** `Timeline`, `animate()` on custom properties, `stagger`, `RetargetableMotion`, `pointerGestures$` and `MotionPreferences` (`reducedMotion: 'finish'`), all on the single coordinator ensured by DESIGN-A02.

| Aspect | Plan |
|---|---|
| Accessibility | Focus management stays Aurora's: native `dialog`, inert background, return focus. The exit animation never delays focus return by more than 240 ms. Pressing Esc twice skips the remaining animation. |
| Reduced motion | No choreography. `au-before-close` is not intercepted. |
| Adapts via metrics | Below T2, the stagger and press springs are dropped and only opacity animates. |
| Budget | ≤ 2 KB gzip on top of the palette chunk. |
| Effort / risks | M. **Risk:** Aurora may add its own CSS transitions to `au-dialog` later and double-animate. Mitigation: AURORA-FLX-001 asks for a documented "motion off" custom property. Until then, set `transition: none` on the parts in the docs theme. **Risk:** intercepting `au-before-close` must not break light-dismiss; covered by the A09 criteria. |

---

### C11. "Three products, one interaction": an integration lab page (`/visuals/stack`)

**Storyboard**
1. A single panel is split into three labelled layers.
2. **Aurora** provides the controls: `au-select` (easing), `au-input type="number"` (duration), `au-switch` (yoyo), `au-radio-group` (target adapter: DOM / SVG / Canvas) and `au-button` (play).
3. **Basics** shapes the data on its way to the engine: `roundTo` for displayed numbers, `debounce` on the duration input, `keyBy` for the adapter registry and `get` for nested preset paths. Each call is labelled in a live "data path" list.
4. **Flux** animates the result in the chosen adapter.
5. A "Show the wiring" toggle overlays which product handled each step: *Aurora emitted `change` → Basics `debounce(…, 150)` → Flux `Tween.retarget` → `bindSvgAttributes`*.
6. The generated code panel (`CodeBlock`, C4) shows the exact three-package import list.

| Aspect | Plan |
|---|---|
| Engine capabilities | `Tween`, `resolveEasing`/`Easings`, `bindStyle`/`bindSvgAttributes`/`bindCanvas` |
| Accessibility | Aurora controls bring their native semantics. The data-path list is an `<ol>` that updates politely and is throttled. |
| Reduced motion / mobile | Reduced motion shows the end state. On mobile the layers stack and the wiring overlay becomes a list. |
| Budget | Route chunk ≤ 12 KB gzip, plus the Aurora form components (§3A.6 v). |
| Effort | M. |

---

### C12. Scoped Aurora theme preview (and the theme-switcher question)

**The shell stays dark.** The owner's dark-only decision is enforced by `scripts/check-dark-theme-only.mjs`, which inspects `App.vue`, `index.html`, `_tokens.scss`, the locale and `DESIGN_SYSTEM.md`. A **site-wide** theme switcher would override that decision, so it is §6 Q3, with the recommendation **no**.

**What this concept does instead.** Inside the integration lab (C11) only, a "Theme" `au-radio-group` (Default · Dark · Glass · Minimal, plus Glass's dark color-scheme) sets `data-aurora-theme` on the **preview container**, never on `<html>`. The whole Aurora-built panel re-themes live through `--aurora-*` properties.

**Cross-fade.** A Flux `Tween` interpolates the container's resolved `--aurora-color-*` values from the old theme to the new one over 420 ms:
1. Read the computed values of both themes from two hidden probe elements.
2. Write them to inline custom properties through `bindStyle` during the tween.
3. Remove the inline overrides at the end.

This demonstrates colour interpolation in Flux and runtime theming in Aurora at once.

| Aspect | Plan |
|---|---|
| Accessibility | The theme choice is a radio group with visible labels. Each theme's contrast is axe-checked inside the container. Glass honours its reduced-transparency fallback. |
| Reduced motion | The switch is instant, with no cross-fade. |
| Budget | `themes/glass.css` (0.5 KB gzip) and `themes/minimal.css` (0.3 KB gzip) load only on this route. |
| Effort | S on top of C11. **Risk:** `check-dark-theme-only.mjs` stays green only if no theme attribute or toggle reaches `App.vue`, `index.html` or `_tokens.scss`. A10's criteria assert that. |

---

## 3A. Aurora and Basics adoption

### 3A.1 Ground rules

1. **Atoms and molecules come from Aurora** (`au-*`). Organisms and page compositions stay in `apps/docs` and are built from `au-*` parts. Examples: hero scenes, telemetry stage, story, playground workbenches, API reference, Benchmark Lab, command palette.
2. **Native HTML is not a home-grown molecule.** Aurora's own catalogue rules favour composition: "A visual wrapper around one native element … should generally remain outside the public catalogue". Aurora deferred `au-progress` in favour of native `<progress>` and lists data tables as "Not now". Where the right answer is `<details>`, `<table>`, `<progress>`, `<hr>`, `<nav>`/`<ul>` or a landmark, the row is marked **NATIVE**. It is styled only with `--aurora-*` and `--rx-*` tokens, and it needs no Aurora item.
3. **No new docs-owned molecule duplicates Aurora's roadmap.** Where Aurora lacks a needed molecule, the docs use a **shim** (§3A.5). A shim has the API of the requested `au-*` contract and is deleted when Aurora ships the component.
4. **Utility functions come from Basics**, imported per function through domain subpaths. Platform built-ins on plain arrays (`Array.prototype.map/filter/find`) are not hand-rolled utilities and remain allowed (§6 Q7). Animation math in demo code uses the **engine's own** `clamp`/`lerp`, because those demos teach the Flux API (§3A.7).

### 3A.2 Component mapping

Status legend:
- **EXISTS**: the Aurora component covers it today.
- **EXISTS-WITH-GAP**: the component exists, but something stated is missing.
- **MISSING**: needs an upstream `AURORA-*` request.
- **NATIVE**: native HTML is the right answer, and no Aurora component is warranted.

#### a) `Ui*` primitives (34 exports in `components/ui/UiPrimitives.ts`; usage counts are `<Ui…` tags in `apps/docs/src`)

| `Ui*` today | Uses | Replacement | Status | Gap / note |
|---|---|---|---|---|
| `UiButton` | 61 | `au-button` (`variant` primary/secondary/outline/ghost/danger, `size`, `loading`, `disabled`, `type`) | EXISTS-WITH-GAP | No `aria-pressed`/`aria-expanded`/`aria-controls`/`aria-current` passthrough and no link mode (`href`). It cannot express toggle buttons, disclosure triggers or link CTAs. The `color` prop has no equivalent: map it to variants. **AURORA-ACT-001** |
| `UiIcon` | 58 | `au-icon` + `ICONS.outline.*` | EXISTS-WITH-GAP | MDI → Lucide (§3A.3). No brand icons, so `github` becomes `custom:github` through `registerIcons`. No spring glyph, so `custom:spring`. About 47 KB gzip first-use cost (finding e). **AURORA-ICON-001** |
| `UiCol` | 47 | Aurora grid utilities (`row`, `col-md-6`, …) generated selectively from `pkg:@re-code/aurora/scss` | EXISTS-WITH-GAP | Whole `utilities.css` is 36.1 KB gzip, so generate only grid, flex and spacing (§3A.6 v). Aurora's breakpoints (576/768/992/1200/1400) differ from `abstracts/_breakpoints.scss`; reconcile in A06. |
| `UiRow` | 19 | same | EXISTS-WITH-GAP | same |
| `UiChip` | 33 | `au-badge` (soft/solid/outline × neutral/primary/info/success/warning/danger) | EXISTS | All 33 uses are non-interactive labels (no `@click` or `:to` on any `UiChip`). |
| `UiCard` | 30 | `au-card` (surface/outlined/elevated/glass, `padding`) | EXISTS | Map `tonal` → `surface`, `outlined` → `outlined`, `flat` → `surface` plus `padding="none"`. |
| `UiCardText` | 27 | `au-card` default slot | EXISTS | — |
| `UiCardTitle` | 19 | `au-card` `slot="header"` plus a real `<h2>`/`<h3>` | EXISTS | `au-card` deliberately imposes no heading role. The docs choose the level. |
| `UiCardSubtitle` | 1 | header slot `<p>` | EXISTS | — |
| `UiCardActions` | 2 | `au-card` `slot="footer"` | EXISTS | — |
| `UiSheet` | 7 | `au-card variant="surface"` | EXISTS | — |
| `UiAvatar` | 24 | `au-badge` (step numbers such as `05`, `06` in `DocsTimelineSections.vue:16,26,39`) | EXISTS | They are numbered markers, not avatars, so no `au-avatar` is needed. |
| `UiAlert` | 12 | `au-alert` (info/success/warning/danger, optional dismiss, `role` status/alert) | EXISTS | — |
| `UiSelect` | 4 | `au-select` with light-DOM `<option>`s | EXISTS | No `items` prop; render options as children. |
| `UiTextField` | 3 | `au-input` (`type="number"` in `TweenPanel.vue:67-69`) | EXISTS | Bind `value` and listen to `input` (no `v-model`; §3A.6 i). |
| `UiSwitch` | 2 | `au-switch` | EXISTS | Aurora: a switch is a form value, not an immediate action. The header "Pause motion" is an action, so it uses a pressed button (ACT-001). |
| `UiLabel` | 1 | `au-label` | EXISTS | — |
| `UiContainer` | 2 | `au-container` (`size`, `gutter`, `margin`) | EXISTS | No landmark imposed. Keep `<main>` in `App.vue`. |
| `UiButtonToggle` | 1 | segmented single-select | MISSING | **AURORA-FRM-001** (a segmented appearance for `au-radio-group`) |
| `UiSlider` | 1 | `au-slider` | MISSING | There are also 6 raw `<input type="range">`: `DocsSpringSimulator.vue:244,249,254`, `Home.vue:349`, `VisualLabOverview.vue:425` and `LabeledSlider.vue`. Until **AURORA-FRM-002** lands, they stay native ranges styled with tokens. |
| `UiAppBar` | 0 (exported; header hand-rolled in `App.vue`) | site header | MISSING | See pattern rows below. **AURORA-NAV-002** (evaluation) |
| `UiApp`, `UiMain`, `UiFooter` | 0 | `<div>`, `<main>`, `<footer>` | NATIVE | Landmarks stay in `App.vue`. |
| `UiDivider` | 25 | `<hr>` (or a border utility) | NATIVE | Aurora lists divider only as an illustrative layout example, with no plan. |
| `UiProgressLinear` | 3 | native `<progress>` | NATIVE | Aurora explicitly deferred `au-progress` in favour of native `<progress>`. |
| `UiExpansionPanels` / `UiExpansionPanel` / `UiExpansionPanelText` | 5 / 5 / 5 | `<details>`/`<summary>` (already the implementation) | NATIVE | An accordion with exclusive open would need a component. The docs do not need it. |
| `UiTable` | 5 | `<table>` plus docs table styles | NATIVE | Aurora lists data tables as "Not now". |
| `UiList`, `UiListItem`, `UiListItemTitle`, `UiListSubheader` | 3 / 3 / 2 / 0 | `<ul>`/`<li>`; `<nav>` plus links for the Visual Lab category list (`VisualShowcase.vue:51`) | NATIVE | — |

**Coverage of the 34 primitives:**

| Status | Count | Primitives |
|---|---|---|
| EXISTS | 14 | Card ×5 (`UiCard`, `UiCardText`, `UiCardTitle`, `UiCardSubtitle`, `UiCardActions`), `UiSheet`, `UiChip`, `UiAvatar`, `UiAlert`, `UiSelect`, `UiTextField`, `UiSwitch`, `UiLabel`, `UiContainer` |
| EXISTS-WITH-GAP | 4 | `UiButton`, `UiIcon`, `UiRow`, `UiCol` |
| MISSING | 3 | `UiButtonToggle`, `UiSlider`, `UiAppBar` |
| NATIVE | 13 | — |

Weighted by tag usage (410 `<Ui…>` tags):

| Status | Tags | Share |
|---|---|---|
| EXISTS | 167 | 41 % |
| EXISTS-WITH-GAP | 185 | 45 % (dominated by `UiButton` 61, `UiIcon` 58, `UiCol` 47 and `UiRow` 19) |
| MISSING | 2 | < 1 % |
| NATIVE | 56 | 14 % |

Recurring patterns (table b, 15 rows): 3 EXISTS, 4 EXISTS-WITH-GAP, 6 MISSING, 2 NATIVE.

#### b) Recurring hand-rolled patterns (not `Ui*`)

| Pattern (file:line) | Replacement | Status | Note |
|---|---|---|---|
| Site header / navbar (`App.vue:52-87`) | Composition: `<header>` + `<nav>` + `RouterLink`s + `au-button` (menu toggle) + `au-icon` | EXISTS-WITH-GAP | The menu toggle needs `aria-expanded`/`aria-controls` (**ACT-001**). An `au-navbar` is requested only for **evaluation** (**NAV-002**); it may fail Aurora's admission criteria as a composition. |
| Mobile menu disclosure (`App.vue:77-85`) | `au-button` with `aria-expanded` | EXISTS-WITH-GAP | **ACT-001** |
| Docs sidebar navigation (`Docs.vue` sidebar) | `<nav>` + grouped `RouterLink` lists, styled | NATIVE | `aria-current="page"` stays on native links. |
| Breadcrumb (`Docs.vue:100-104`) | `<nav aria-label>` + `<ol>` | NATIVE | **NAV-002** evaluation may add `au-breadcrumb`; native is fine meanwhile. |
| Install snippet "tabs", pnpm/npm/yarn/bun (`DocsGettingStarted.vue:48-49`, today `role="group"` + `aria-pressed`) | `au-tabs` | MISSING | **AURORA-NAV-001**, planned as Aurora Step 5. Shim meanwhile (§3A.5). |
| Scene explorer tablist (`VisualLabSceneExplorer.vue:89-111`, hand-rolled `role="tablist"`) | `au-tabs` | MISSING | **NAV-001** |
| Code workbench mode switch (`LandingCodeMotion.vue:447-457`, `aria-pressed` buttons) | `au-tabs` (it switches the panel) | MISSING | **NAV-001** |
| API category filters (`DocsApiReference.vue:52-54`, `aria-pressed`) | `au-button` with `aria-pressed` | EXISTS-WITH-GAP | **ACT-001** |
| Gesture axis toggle (`GesturesPanel.vue:264`) | segmented `au-radio-group` | MISSING | **FRM-001** |
| Playback controls (`LandingCodeMotion.vue:463-467`) | 3 × `au-button` (`aria-label`) + `au-icon` | EXISTS | The play/pause toggle label switches, so no `aria-pressed` is needed. |
| Copy buttons with timed feedback (`DocsApiReference.vue:31`, `DocsGettingStarted.vue:22`, `DocsSpringSimulator.vue:173`, `DocsArchitecturePipeline.vue:41`, `VisualLabOverview.vue:287,309`, `VisualShadersPanel.vue:61`, `VisualLabSceneExplorer.vue:66`, `Home.vue:169`, `LandingCodeMotion.vue:370`) | `au-button` + `au-icon` + docs composable `useCopyFeedback()` + a `role="status"` region | EXISTS | Not a component, so no Aurora item. Transient "Copied" could later use **AURORA-OVL-002** `au-toast`. |
| Icon-button tooltips (`title=` on controls, e.g. `LandingCodeMotion.vue:464-466`) | `au-tooltip` | MISSING | **AURORA-OVL-001**, planned as Aurora Step 4. |
| Telemetry Dock, Quality menu (C1, C2) | `au-popover` | MISSING | **OVL-001**. Shim meanwhile. |
| Command palette (C8) | `au-dialog` + `au-input type="search"` + a docs-owned listbox | EXISTS-WITH-GAP | `au-dialog` is unreleased (finding a). A combobox is "Not now" in Aurora, so the listbox stays an organism-internal part. |
| API reference search field (`DocsApiReference.vue:50`) | `au-input type="search"` | EXISTS | — |

### 3A.3 Icons: MDI → Lucide (70 icons, all verified in Aurora's Lucide map)

- **How to write a mapping in code:** the `ICONS.outline` key is the camelCase of the Lucide slug. For example, `circle-play` becomes `ICONS.outline.circlePlay`.
- **Verification:** each slug below was checked against the import map in `re-aurora/dist/components/p--J-bytcY.js`. Only `github` and `spring` are absent.
- **Locale data:** MDI names also appear as data in `locales/en.json`. A05 migrates those values too.

| MDI | Lucide | MDI | Lucide |
|---|---|---|---|
| access-point-network | radio-tower | function-variant | square-function |
| arrow-down | arrow-down | gesture-tap | pointer |
| arrow-down-bold-box-outline | square-arrow-down | github | **custom:github** (registerIcons; GitHub mark per GitHub's logo guidelines) |
| arrow-down-right | arrow-down-right | hexagon-outline | hexagon |
| arrow-left | arrow-left | information-outline | info |
| arrow-right | arrow-right | laptop | laptop |
| arrow-right-bold | arrow-big-right | lightning-bolt | zap |
| arrow-up-right | arrow-up-right | loading | loader-circle (prefer `au-button loading`) |
| asterisk | asterisk | magnify | search |
| atom-variant | atom | menu | menu |
| book-open-page-variant-outline | book-open | motion-play-outline | square-play |
| broom | brush-cleaning | numeric | hash |
| canvas | frame | open-in-new | external-link |
| chart-bell-curve | chart-spline | pause | pause |
| chart-bell-curve-cumulative | trending-up | play | play |
| chart-box-outline | chart-column-big | play-circle-outline | circle-play |
| chart-line-variant | chart-line | refresh | refresh-cw |
| chart-timeline-variant | activity | repeat | repeat |
| chart-timeline-variant-shimmer | chart-area | replay | rotate-ccw |
| check | check | restart | rotate-cw |
| check-circle-outline | circle-check | restore | history |
| chevron-down | chevron-down | shape-outline | shapes |
| chevron-right | chevron-right | shimmer | sparkles |
| circle | circle (`fill="currentColor"`) | source-branch | git-branch |
| circle-outline | circle | spring | **custom:spring** (docs-drawn coil, 24 × 24, stroke 2; fallback `activity`) |
| close | x (Aurora alias `close`) | stop | square |
| code-braces | braces | swap-horizontal | arrow-left-right |
| console | terminal | target | target |
| console-line | square-terminal | timeline-clock-outline | clock |
| content-copy | copy | timeline-text-outline | chart-gantt |
| delete-sweep-outline | trash-2 | triangle-outline | triangle |
| download-outline | download | tune | sliders-horizontal |
| flask-outline | flask-conical | tune-variant | sliders-vertical |
| — | — | vector-curve | spline |
| — | — | vector-link | link |
| — | — | vector-polyline | waypoints |
| — | — | waveform | audio-waveform |

Result: **68 icons map to official Lucide slugs and 2 need `custom:` registration.**

**What gets removed:**
- `@mdi/font`: its 418 KB raw (about 54 KB gzip) stylesheet in the entry CSS, and its four font files (3.6 MB on disk; the 403 KB woff2 is what browsers download).
- The unused Material Symbols stylesheet link in `index.html` and the orphan `.material-symbols-outlined` rule in `base/_typography.scss`.

### 3A.4 Requests to Aurora (`AURORA-*`), ordered by how much of the redesign each unblocks

These are **requests to the Aurora repository**. Aurora's own rules apply:
- the admission criteria in `docs/COMPONENT_CATALOG.md` ("do not create components just to increase catalogue size");
- the definition of done and the one-step-per-session process in `docs/ROADMAP.md`;
- the conventions in `COMPONENT_CONVENTIONS.md` and `EVENTS.md`.

The Aurora owner decides each one. Nothing here is implemented in this repository. Every event below follows `EVENTS.md`: native events where a native control exists, otherwise `au-*` kebab-case names with `bubbles` and `composed`, and `au-before-<action>` for cancelable pre-actions.

| # | ID | Request | Aurora roadmap today | Unblocks |
|---|---|---|---|---|
| 1 | AURORA-PKG-001 | Publish a beta (`0.1.0-beta.0`, `beta` dist-tag) after Phase 6 tarball checks | "No npm publish … is part of the current work" | **everything** (DESIGN-A01) |
| 2 | AURORA-PKG-002 | `@re-code/flux` and `rxjs` as optional `peerDependencies` | Hard dependency, pinned beta | single coordinator (DESIGN-A02) |
| 3 | AURORA-ACT-001 | `au-button` ARIA state passthrough and link mode | not planned | header menu toggle, API filters, Pause-motion switch, link CTAs, chapter rail |
| 4 | AURORA-NAV-001 | `au-tabs` | Step 5, planned | install snippets, scene explorer, code workbench, Design Lab |
| 5 | AURORA-OVL-001 | `au-popover` + `au-tooltip` | Step 4, planned | Telemetry Dock, Quality menu, icon-button labels |
| 6 | AURORA-ICON-001 | Slim icon runtime and static icon registration | not planned | `au-icon` in the entry shell within budget |
| 7 | AURORA-FRM-001 | Segmented appearance for `au-radio-group` | not planned | button toggles |
| 8 | AURORA-FRM-002 | `au-slider` | illustrative only ("slider" in the forms domain) | about 7 range controls |
| 9 | AURORA-NAV-002 | Evaluate app bar / nav list / breadcrumb | not planned | header and sidebar (composition acceptable) |
| 10 | AURORA-OVL-002 | `au-toast` | Step 4, planned last | copy feedback |
| 11 | AURORA-SSR-001 | Prerender-friendly output (hydrate script or Declarative Shadow DOM) and attribute hydration flag | not planned | `ENG-HISTORY` prerendered docs |
| 12 | AURORA-FLX-001 | Public motion contract: documented motion-off custom property and part-level motion hooks | Phase 7 "Flux adapter" | C10 choreography |
| 13 | AURORA-DOC-001 | Vue usage guide plus a types-only Vue `GlobalComponents` declaration (no wrappers) | not planned | DX (DESIGN-A03) |

**Contract sketches**

**AURORA-PKG-001 — Publish a beta.**
- Run Phase 6's tarball and consumer checks (`npm run check:package`, a clean consumer install).
- Publish `@re-code/aurora@0.1.0-beta.0` under the `beta` dist-tag, with a CHANGELOG and the license confirmed.
- No API change.
- This needs the Aurora owner's explicit approval, because Aurora's roadmap currently excludes publishing.

**AURORA-PKG-002 — Optional peer Flux.**
- Move `@re-code/flux` (range `>=0.5.0-beta.0 <0.6.0`) and `rxjs` (`^7.8.0`) from `dependencies` to `peerDependencies`, marking both `optional: true` in `peerDependenciesMeta`.
- This matches Aurora's own `ARCHITECTURE.md` ("No mandatory … Flux dependency").
- The lazy `loadFlux()` already reports a clear error when Flux is absent.
- It removes the second copy of Flux that an app like this docs site would otherwise install (§3A.6 iii).

**AURORA-ACT-001 — `au-button` ARIA state and link mode.**
- Forward these attributes to the inner control and keep them in sync: `aria-pressed` (`true`/`false`/`mixed`), `aria-expanded`, `aria-controls`, `aria-haspopup`, `aria-current`, `aria-describedby`.
- Add `href` (plus `target`, `rel`, `download`). When `href` is set, render a native `<a>` in place of `<button>`, with the same variants and parts, and expose `part="control"` on either element.
- `disabled` with `href` renders `aria-disabled="true"` and no `href`.
- **Keyboard:** native (Enter for links; Enter and Space for buttons).
- **Events:** native `click` only.
- **Accessibility tests:** the name, role (`button` vs `link`), pressed state and expanded state are exposed correctly.
- **Vue Router note:** the docs use `RouterLink custom v-slot="{ href, navigate }"` and pass `href` plus `@click="navigate"`.

**AURORA-NAV-001 — `au-tabs`, with `au-tab` and `au-tab-panel` parts.**
- **Roles and focus:** `role="tablist"` holding `role="tab"` items and `role="tabpanel"` panels, using the shared `roving-focus` helper (the same pattern as `au-radio-group`).
- **Keyboard:** ArrowLeft/ArrowRight (ArrowUp/ArrowDown when `orientation="vertical"`) with wrapping, plus Home and End.
- **Activation:** `activation="auto" | "manual"` (manual means Enter or Space activates).
- **Props:** `value` (the selected tab's `value`), `orientation`, `label`.
- **Events:** `au-tab-change` with `{ value, previousValue }`, dispatched on user change only (programmatic changes dispatch nothing, as in `au-radio-group`).
- **Parts:** `list`, `indicator` (for motion; see FLX-001), `tab`, `panel`.
- **CSS custom properties:** the indicator's position and size are exposed as `--au-tabs-indicator-x` and `--au-tabs-indicator-width`.

**AURORA-OVL-001 — `au-popover` and `au-tooltip`.**
- Built on the Popover API with anchor positioning, plus the documented fallback that Aurora's roadmap already names.
- **`au-popover`:** `open`, `placement`, `anchor` (an id), `light-dismiss` (default true). Events `au-open`, `au-close` and the cancelable `au-before-close`, the same family as `au-dialog`. Esc closes it and focus returns to the invoker. It is non-modal and has no focus trap.
- **`au-tooltip`:** `for` (an id) and `placement`. It shows on hover and focus after a delay, hides on Esc, and is never focusable. It supplies `aria-describedby` and is never the only accessible name.

**AURORA-ICON-001 — Icon cost.**
1. Move the names list out of `au-icon`'s runtime chunk. Names should be types plus the dynamic map only, so `au-icon` costs about 1–2 KB.
2. Allow `registerIcons()` to register **official Lucide icon data under its official slug**. Lucide recommends named imports for statically known icons. That way an app with about 70 known icons never fetches the 27 KB import map, and its bundler does not emit about 2,000 chunks.
3. Document a brand-icon policy (Lucide has no brand icons).

**AURORA-FRM-001 — Segmented `au-radio-group`.**
- Add `appearance="segmented"` to the **existing** group rather than creating a new component. This passes the admission criteria ("composition first").
- Same semantics as today: radio role, roving focus, `input` and `change` events.
- Multi-select "filter chips" are covered by ACT-001 (`aria-pressed`), not by this item.

**AURORA-FRM-002 — `au-slider`.**
- A form-associated control wrapping native `<input type="range">`, following the `au-input` model.
- Props: `min`, `max`, `step`, `value`, `label`, `hint`, `disabled`, optional `value-text`. The `value-text` sets `aria-valuetext`, for example "ζ 0.93".
- Events: native `input` and a forwarded `change`.
- It covers `LabeledSlider.vue` and the about 7 native ranges.

**AURORA-NAV-002 — Navigation patterns (evaluation request).** Evaluate an app bar or nav list with disclosure-based collapse on narrow viewports, and a breadcrumb, against the admission criteria. **The expected outcome may be a documented composition recipe instead of components.** The docs app is happy with either.

**AURORA-OVL-002 — `au-toast`.** As already planned by Aurora: a global queue, an always-connected live region, and reuse of `au-before-dismiss`.

**AURORA-SSR-001 — Prerender-friendly output.**
- Either add Stencil's hydrate output (or Declarative Shadow DOM) so prerendered pages contain component markup, or document the no-SSR contract.
- Also switch `hydratedFlag` to an attribute, such as `au-hydrated`, so it does not fight Vue's `class` hydration.

**AURORA-FLX-001 — Public motion contract.**
- A documented `--au-motion: none` style switch that disables a component's own transitions.
- Documented parts on animated regions: dialog panel and backdrop, tabs indicator.
- Optionally a public export of the Flux bridge. Any bridge must resolve the **consumer's** single Flux instance.

**AURORA-DOC-001 — Vue guide plus types.**
- Document `isCustomElement`, property vs attribute binding, events and form usage.
- Ship a generated **types-only** `vue.d.ts` that maps `JSX.IntrinsicElements` into `GlobalComponents`. This is not a wrapper, which is consistent with "No Vue/React/Angular wrappers".

### 3A.5 Interim strategy: nothing waits, and every swap stays mechanical

**What can proceed with existing Aurora components (after DESIGN-A01):**
- cards, badges, alerts, form inputs (`au-input`, `au-select`, `au-switch`, `au-checkbox`, `au-radio-group`, `au-textarea`, `au-label`), container and icons;
- every NATIVE row;
- every organism that needs only those.

That covers DESIGN-001, 002, 004, 007, 008, 011, 012, 014 and 015 fully, and A04–A07.

**Shims:**
- **Location:** `apps/docs/src/components/aurora-shims/`. There is **at most one shim per Aurora request**, and **at most 4 in total**: `au-tabs`, `au-popover` (also used for the tooltip), segmented radio, and a CSS-only pressed/link button style.
- **Same contract as the request.** A shim is a Vue SFC named `RxShim*` (`RxShimTabs.vue`, used as `<RxShimTabs>`/`<rx-shim-tabs>`). It must **not** start with `au-`, because the `isCustomElement` predicate (`tag.startsWith('au-')`) would make Vue treat `<au-shim-tabs>` as an unknown custom element and silently skip the SFC. Its props, events (same names, e.g. `au-tab-change`), slots and parts mirror the §3A.4 sketch, and it is styled only with `--aurora-*` tokens.
- **Swap = rename the tag and delete the file.**
- **Self-describing files.** Each file starts with `// Aurora-Request: AURORA-NAV-001` and `// Delete-When: @re-code/aurora exports ./navigation/au-tabs`.
- **Enforced.** A new contract script, `scripts/check-aurora-shims.mjs`, fails when any shim lacks those headers, and **fails when the installed Aurora package already exports the shimmed component**. That forces the swap.
- **Interim for ACT-001.** Toggle and disclosure buttons and router CTAs are native `<button aria-pressed|aria-expanded>` and `RouterLink`s carrying an `au-shim-button` CSS class. The class re-uses `--aurora-*` button tokens and adds no behaviour. Removed when ACT-001 lands.
- **Interim for FRM-002.** Native ranges styled with tokens. This is NATIVE, not a shim, because native range is already the right element and `au-slider` would wrap it.
- **`au-dialog`.** Until an Aurora release contains it, the palette (DESIGN-013) is **blocked**, because a native-`<dialog>` shim would duplicate work Aurora has in progress. The dock uses the popover shim instead.

### 3A.6 Integration design

#### i) Web Components inside Vue 3.5 — recommendation: raw `au-*` tags plus a thin glue layer, no Vue wrapper components

| Concern | Decision |
|---|---|
| Compiler | `vue({ template: { compilerOptions: { isCustomElement: (tag) => tag.startsWith('au-') } } })` in `apps/docs/vite.config.ts`. Without it, Vue tries to resolve `au-*` as Vue components and warns. Docs-owned shims are therefore named `rx-shim-*`, never `au-*`. |
| Registration | Import per-component entrypoints (`@re-code/aurora/actions/au-button` …). They auto-define (`customElementsExportBehavior: 'auto-define-custom-elements'`). **Shell** components (`au-button`, `au-icon`) are loaded by `apps/docs/src/aurora/register-shell.ts`, which `main.ts` calls **after** `app.mount()`. Because the entrypoints auto-define when their module is evaluated, the shell must use **dynamic** `import()`: a static import would define the elements before Vue mounts. The shell therefore lives in its own chunk, which is why the bundle gate counts *requested bytes*, not entry filenames (§3A.6 v). Everything else is imported by the route or organism that uses it, so it lands in that route's chunk. The `@re-code/aurora/loader` lazy loader is **not** used: it bypasses Vite's chunk graph and budgets. |
| Properties vs attributes | Vue 3.5 sets a binding as a **DOM property** when the key exists on the element (true once defined) and as an attribute otherwise. Primitive props work either way because Aurora reflects them. **Rule:** non-primitive values use `.prop` (`:items.prop="…"`). ARIA and data attributes use `^` or plain attributes. Constants come from Aurora (`:variant="BUTTON_VARIANTS.ghost"`, `:padding="PADDING.small"`), as `COMPONENT_CONVENTIONS.md` recommends. |
| Events | `@click` (native, composed); `@input` (native composed); `@change` (forwarded by Aurora); custom `@au-open`, `@au-close`, `@au-before-close`, `@au-before-dismiss`, `@au-tab-change` (later). Read values from `($event.target as HTMLAuInputElement).value`. |
| `v-model` | Vue's `v-model` does not support custom elements. Add **one directive**, `vAuModel` (about 40 lines, `apps/docs/src/aurora/vAuModel.ts`): it writes `value`/`checked` as properties and listens to `input` (text, select) or `change` (checkbox, switch, radio-group). It has a unit test. This is glue, not a wrapper. |
| Form association | Aurora controls are form-associated through `ElementInternals`. The docs rarely submit forms. Where `<form>` is used (palette, lab), rely on native `submit`/`reset`. Never re-implement validation. |
| Types | `apps/docs/src/aurora/aurora-vue.d.ts` augments `vue`'s `GlobalComponents` from Aurora's exported `JSX` namespace (`export { LocalJSX as JSX }`, `src/components.d.ts:1736`): `'au-button': DefineComponent<JSX.AuButton>` and so on. It is generated by a small script, `scripts/generate-aurora-vue-types.mjs`, and replaced by AURORA-DOC-001's file if Aurora ships one. `vue-tsc` then type-checks `au-*` props in templates. |
| Hydration and prerender (`ENG-HISTORY`) | Aurora has **no SSR output** (finding j). Prerendered HTML contains un-upgraded `<au-*>` tags. **Light-DOM content (slots) is in the HTML and readable without JS**, but attribute-only content (e.g. `au-input`'s `label`) is not. **Rule for documentation pages:** text goes in slots, and props carry only configuration. Add `:where(au-button, au-card, au-badge, au-alert):not(:defined)` placeholder styles that reserve size, to keep CLS ≤ 0.02. Stencil's runtime adds a `hydrated` **class** to hosts (`classList.add("hydrated")` in the shared runtime chunk). The `dist-custom-elements` build checked here injects **no** `:not(.hydrated){visibility:hidden}` rule, so a Vue `class`/`:class` binding on an `au-*` host that drops `hydrated` is harmless today. **Glue rule anyway:** never bind `class` on `au-*` hosts; style through a wrapper element, `::part` or documented custom properties. If elements upgrade before Vue hydrates a prerendered page, Vue reports class mismatches, which is why `register-shell.ts` runs after `app.mount()`. AURORA-SSR-001 asks for an attribute-based flag. |
| Why no wrapper layer | Aurora's architecture rules out framework wrappers, and Vue 3.5 binds custom elements well. A wrapper layer would be a second, home-grown molecule set: exactly what this revision removes. The glue is limited to registration, `vAuModel` and types. |

#### ii) Delivery: Aurora is unpublished, and no `file:`/`link:` specifier may ever be committed

| Option | Verdict |
|---|---|
| **A. Publish a beta to npm** (AURORA-PKG-001) and pin it exactly in `apps/docs/package.json` (`"@re-code/aurora": "0.1.0-beta.0"`) | **Recommended.** Same channel as `@re-code/flux` (npm beta) and `@re-code/basics` (npm 0.1.0). Lockfile integrity, CI caching and Renovate-style updates all work. Local development before publishing uses `npm link` (never committed). **Prerequisite item DESIGN-A01.** Requires the Aurora owner's approval, because Aurora's roadmap currently excludes publishing. |
| B. Monorepo / workspace move | Rejected. It merges three repositories with different toolchains (Stencil, tsup, Vite) and release cadences, and contradicts the separate-repository rules (Basics: "no migrations from re;Flux without explicit approval"). |
| C. Tarball in CI (a `npm pack` artefact referenced by a `https://…/aurora-0.1.0.tgz` specifier) | Possible but fragile. The URL specifier is not `file:`, but it needs a stable host (GitHub Release asset), manual integrity bumps, and breaks offline installs. Acceptable only as a short bridge if publishing is refused. |
| D. Git dependency (`github:…#tag`) | Rejected. Aurora's `dist/` is not committed, so the consumer would run a Stencil build (`build:lib` includes icon generation and Storybook registration) during `npm install`. |

#### iii) The duplicate-Flux hazard

**What happens today if Aurora is installed as-is:**
- The docs import the engine **from source** through Vite aliases (`@lib` → `../../src/index.ts`, and so on, `apps/docs/vite.config.ts`).
- Aurora declares `@re-code/flux: 0.5.0-beta.0` as a hard dependency. Installing it in the `apps/docs` workspace puts the **registry** beta into `node_modules/@re-code/flux`. Today no `@re-code/*` package is installed in this repository at all.
- Aurora's bridge does `import('@re-code/flux/dom')` and `import('@re-code/flux/core')` (`re-aurora/src/integrations/flux/loader.ts:20`). Those resolve to that registry copy.

**The consequences:**
- **Two `FrameCoordinator` singletons**, because `frameCoordinator` is a module-level instance.
- **Two RAF clocks**, the opposite of the library's main claim.
- **A version skew:** the registry beta lacks the PERF-002…008 work on `main`.
- `MotionPreferences` instances that fail `instanceof` across copies. The interface-based `MotionPreferencesSource` still works.
- The governor and Telemetry Dock (C1, C2) would **not see** any Aurora animation.

The hazard is latent today, because no Aurora component uses Flux yet (finding b). It becomes real with C10, FLX-001, or any Aurora motion.

**Fix (DESIGN-A02), in this order:**
1. **Alias every `@re-code/flux` specifier to source in Vite**, with **one exact-match alias entry per export**: `{ find: /^@re-code\/flux\/dom$/, replacement: <abs>/src/adapters/dom.ts }` and so on. A single regex `replacement` string cannot map different subpaths to different files, and a plain-string `find: '@re-code/flux'` would prefix-match its subpaths. The entries are generated from a small map that mirrors the root `package.json` `exports`: `.`, `./core`, `./values`, `./physics`, `./steering`, `./flow-field`, `./operators`, `./utils`, `./dom`, `./svg`, `./canvas`, `./three`, `./effects/canvas`, each pointing at the matching `src/*.ts` (e.g. `./dom` → `src/adapters/dom.ts`). The same source modules are then reached through `@lib/*` and `@re-code/flux/*`, so there is one module instance.
2. Add `resolve.dedupe: ['rxjs']`, because Aurora brings `rxjs ^7.8.0` and the docs use `^7.8.1`.
3. Add `optimizeDeps.exclude: ['@re-code/aurora']`, so the dev pre-bundler does not freeze a copy of Flux inside Aurora's pre-bundle (and does not walk about 2,000 icon imports).
4. **Upstream fix:** AURORA-PKG-002 makes Flux an optional peer, so npm does not install a registry copy at all.
5. **Checks:**
   - **(config, deterministic; the primary check)** `scripts/check-single-flux.mjs` loads `apps/docs/vite.config.ts` (via Vite's `resolveConfig` and plugin container) and resolves **every** `@re-code/flux` export subpath. It asserts that each one lands under `<repo>/src/`, and that the set of aliased subpaths equals the keys of the root `package.json` `exports`. This proves the alias even while no Aurora component imports Flux.
   - **(build, secondary)** After build, at most **one** JS asset contains the unique string `FrameCoordinator is not idle` (from `assertIdle`, a class method, so it is not tree-shaken). This grep passes vacuously today, because no Aurora component pulls in Flux. It becomes meaningful once Aurora motion exists.
   - **(runtime, Playwright)** With a docs scene and an Aurora-driven Flux animation running together (C10 / A09), the DESIGN-002 RAF wrapper never sees more than **one** outstanding `requestAnimationFrame` callback over 120 frames. One shared clock is the visible proof.
   - **(repository safety)** `npm run check:tree-shaking` and `npm run check:package:consumer` still pass after installing Aurora. They resolve `@re-code/flux` by name and must keep resolving the local package (Node self-reference precedes `node_modules` lookup), not the registry copy.

#### iv) Theming: the docs brand as a theme layered over Aurora's dark theme

**Base theme:** Aurora's built-in **dark** theme (`[data-aurora-theme=dark]` in `styles.css`). Not glass, because its backdrop blur is costly on mid-range phones behind live canvases and breaks contrast over moving scenes. Not minimal, because it removes elevation, which the editorial panels use. Not default, which is light.

**How it is set:** `index.html` becomes

```html
<html lang="en" data-rx-theme="dark" style="color-scheme: dark;" data-aurora-theme="dark">
```

The new attribute goes *after* `style`, so `check-dark-theme-only.mjs`'s regex `/<html\s+lang="en"\s+data-rx-theme="dark"\s+style="color-scheme:\s*dark;"/` still matches.

**Theme file:** `apps/docs/src/styles/themes/_aurora-rx.scss`, imported after `@re-code/aurora/styles.css`. Its selector is `:root[data-aurora-theme='dark'][data-rx-theme='dark']`: higher specificity, so it wins regardless of load order. It sets only `--aurora-*` properties, computed from the existing `--rx-theme-*` RGB channel triples.

| Aurora property | Set from |
|---|---|
| `--aurora-color-canvas` | `rgb(var(--rx-theme-background))` |
| `--aurora-color-surface` / `-surface-raised` | `rgb(var(--rx-theme-surface))` / `rgb(var(--rx-theme-surface-variant))` |
| `--aurora-color-text` / `-text-muted` | `rgb(var(--rx-theme-on-background))` / same at ≥ 0.82 alpha (verify ≥ 4.5:1 on raised surfaces) |
| `--aurora-color-border` | `rgba(var(--rx-theme-border-strong), 0.38)` |
| `--aurora-color-primary` / `-primary-contrast` | `rgb(var(--rx-theme-primary))` / `rgb(var(--rx-theme-on-primary))` |
| `--aurora-color-secondary` | `rgb(var(--rx-theme-secondary))` (cyan) |
| `--aurora-color-success` / `-warning` / `-danger` | rx success / warning / error triples |
| `--aurora-color-focus`, `--aurora-focus-ring-color` | `rgb(var(--rx-theme-primary))` |
| `--aurora-font-family-body` / `-description` / `-small` | Inter stack (`--rx-font-body`). This prevents Aurora's Lato default. |
| `--aurora-font-family-heading` | JetBrains Mono stack, as today. This prevents Montserrat. |
| `--aurora-radius-*` | the 3-step consolidated radius map (§4.2) |
| `--aurora-motion-duration-*` (instant/fast/normal/slow/long) | 100 / 160 / 240 / 420 / 600 ms, the §2.3 values, so Aurora's CSS transitions speak the same motion language |
| `--aurora-z-index-*` | aligned with `--rx-z-*` (overlay 800, modal 900, tooltip 950, toast 960) |

**`--rx-*` tokens that disappear** (removed in A04/A06 after the last consumer migrates):
- **Semantic colours.** `--rx-color-background`, `-surface`, `-surface-raised`, `-text`, `-text-muted`, `-primary`, `-secondary`, `-success`, `-warning`, `-error`, `-border` become plain aliases of `--aurora-*`, then are removed.
- **The duplicate brand palette.** All 19 `--rx-brand-*` tokens are identical to the theme triples.
- **Legacy aliases.** `--bg`, `--panel`, `--violet`, `--cyan`, `--orange`, `--pink`, …
- **Radii.** `--rx-radius-*` becomes `--aurora-radius-*`.
- **Durations.** `--rx-motion-duration-*` becomes `--aurora-motion-duration-*`.
- **Spacing.** The rx spacing tokens are replaced by Aurora's spacing scale and utilities.

**`--rx-*` tokens that stay**, because Aurora has no equivalent or the need is docs-specific:
- the `--rx-theme-*` **RGB channel triples** (needed for alpha compositing; Aurora's tokens are full colours);
- visualization and canvas palettes, gradients, telemetry, syntax and quality-tier tokens (§4.1);
- `--rx-ease-*` engine-twin easings;
- stage heights and layout widths specific to the docs.

**Light-theme guard:** `check-dark-theme-only.mjs` stays satisfiable. Aurora's light defaults live in Aurora's own `styles.css`, which the script does not read. The docs tokens, `App.vue` and the locale gain no light palette or toggle. The `prefers-color-scheme: dark` rule in Aurora's CSS is inert, because the theme attribute is set statically before first paint.

#### v) Bundle impact (gzip, measured from `../re-aurora/dist`; re-measure on the published beta)

| Piece | gzip | When it loads |
|---|---|---|
| `styles.css` (tokens, reduced-motion and forced-colors foundations) | 1.7 KB | entry CSS |
| Stencil runtime shared chunk | 9.3 KB | with the first component |
| `au-button` / `au-card` / `au-badge` / `au-alert` / `au-container` / `au-label` | 2.2 / 1.9 / 1.7 / 2.6 / 1.2 / 0.9 KB | per route |
| `au-input` / `au-select` / `au-switch` / `au-checkbox` / `au-textarea` / `au-radio-group` / `au-radio` | 3.9 / 3.8 / 3.0 / 3.0 / 3.2 / 3.4 / 1.6 KB | per route |
| `au-dialog` (unreleased build) | 2.6 KB | palette chunk |
| `au-icon` chunk (apparently includes the names list; inferred) | **20.0 KB** | with the first icon |
| Lucide dynamic import map | **27.2 KB** | lazily on the first icon render |
| each Lucide icon | ~0.3 KB | on demand |
| `utilities.css` (whole) | **36.1 KB** | **never.** Generate selectively instead. |
| `themes/glass.css`, `themes/minimal.css` | 0.5 / 0.3 KB | C12 route only |
| **Removed:** `@mdi/font` CSS | **≈ −54 KB** (from entry CSS) | — |
| **Removed:** MDI woff2 | **−403 KB** download | — |

**Entry estimate**, with the shell using `au-button` and `au-icon`:
- JS: +9.3 + 2.2 + 20.0 ≈ **+31.5 KB** in the entry, plus 27.2 KB fetched lazily right after first paint, plus about 15 header icons at 0.3 KB each.
- CSS: −54 + 1.7 + the selective utilities (≤ 8 KB budget) ≈ **−44 KB**.
- **Net entry change:** about −13 KB gzip, and −403 KB of font download.
- With AURORA-ICON-001, the icon cost drops from about 47 KB to about 2 KB, for a net of about −58 KB.

**Shared-gate change:** the rev 1 "entry ±512 B" rule is suspended for A05 and A06 only. It is replaced by a **first-load rule:** the gzip total of **all JS and CSS bytes requested on the first load of `/`** must not exceed the pre-item total. That covers the entry, the Home chunk, the dynamically imported Aurora shell, the Lucide import map and icons. It is measured from the DESIGN-002 Playwright request log (transfer sizes, cache disabled), not from filename globs. After A06, the ±512 B entry rule resumes from the new baseline, alongside the first-load rule.

**Utilities:** do not import `utilities.css`. Use `@use 'pkg:@re-code/aurora/scss' as aurora;` with `aurora.generate-spacing-utilities()`, `generate-flex-utilities()` and the grid utilities. That needs `css.preprocessorOptions.scss.importers: [new NodePackageImporter()]` in Vite. Budget ≤ 8 KB gzip.

**Build artefacts:** about 2,000 Lucide chunk files will be emitted into `apps/docs/dist/assets` (each tiny, fetched only on demand). The GitHub Pages deploy and the `check-route-delivery.mjs` scan must tolerate that. AURORA-ICON-001 removes it.

**Per-route Aurora entrypoints:**

| Route chunk | Imports |
|---|---|
| Entry (`App.vue` shell) | `actions/au-button`, `primitives/au-icon`, `@re-code/aurora/styles.css`, the docs theme, selective utilities |
| Home | `data-display/au-card`, `data-display/au-badge` |
| Visual Lab | `au-card`, `au-badge`, `forms/au-select`, `forms/au-switch`; C11/C12: `forms/au-input`, `forms/au-radio-group`, `forms/au-radio`, `themes/glass.css`, `themes/minimal.css` |
| Playground | `au-card`, `au-badge`, `feedback/au-alert`, `forms/au-input`, `forms/au-select`, `forms/au-switch`, `forms/au-label` |
| Docs | `au-card`, `au-alert`, `au-badge`, `forms/au-input` (API search) |
| Benchmark Lab | `au-card`, `au-alert`, `forms/au-select`, `forms/au-input`, `forms/au-checkbox` |
| Command palette (lazy) | `overlays/au-dialog`, `forms/au-input` |

#### vi) Contract scripts that assert `Ui*` markup, `ui-*` classes or MDI names (all tie to DOCS-004)

| Script | Literal it asserts | Changed by |
|---|---|---|
| `scripts/check-visual-lab.mjs:61,67,111` | `UiRow`/`UiCol` tag pairs, `<UiCol …>` columns, a `<UiRow align="start" class="visual-lab__layout">` negative | A06 |
| `scripts/check-playground-layout.mjs:32-34,45` | `.playground-route > .ui-row` selectors, no nested `<UiContainer` | A06 |
| `scripts/check-docs-redesign.mjs:46` | no `<UiExpansionPanels` in `DocsVisualExample.vue` (a negative, so it stays true) | — (keep) |
| `scripts/check-ui-framework.mjs:15-40` | no Vuetify and no `<v-*>` tags (`au-*` is unaffected) | — (keep; extend with "no `@mdi/font`" in A05) |
| `scripts/check-dark-theme-only.mjs` | `<html … data-rx-theme="dark" style="color-scheme: dark;"` and no light palette | A04 (must keep passing) |
| `scripts/check-home-experience.mjs` | Home structure (rev 1 §5) | DESIGN-001/008/011 |
| `scripts/check-scss-tokens.mjs` | token hygiene in SCSS; 15 SCSS files still style `.ui-*` classes (e.g. `.ui-row` ×24, `.ui-col` ×10, `.ui-icon` ×8, `.ui-card` ×8) | A06 deletes `_ui-primitives.scss` and those selectors |
| `scripts/check-locale-common.mjs` | locale structure (MDI names live in locale data) | A05 |
| **New** `scripts/check-aurora-shims.mjs` | shim headers; shim must not outlive the Aurora component | A08 |

No script asserts specific `mdi-*` names today (verified with grep). The migration risk is in the `ui-*` selectors and the `Ui*` tag literals.

### 3A.7 Basics adoption

**Import style:** named exports from **domain subpaths** only, for example `import { get } from '@re-code/basics/object/get'`. Never import the package root (`@re-code/basics`) and never the default-export flat facades. The dependency goes in `apps/docs/package.json` `dependencies` as `"@re-code/basics": "~0.1.0"` (registry). This is **docs-app-only**: the published `@re-code/flux` package gains no dependency.

| Hand-rolled today (file:line) | Basics replacement | Note |
|---|---|---|
| `getPath()` in `resolveLocaleReferences` (`stores/app.ts:12-21`) | `get` (`@re-code/basics/object/get`) | Keep the "Unknown locale reference" error: `const target = get(root, path, MISSING); if (target === MISSING) throw …` with a module-private sentinel. Write characterization tests first. |
| `Object.fromEntries(Object.entries(value).map(…))` (`stores/app.ts:37`) | `mapValues` (`@re-code/basics/object/mapValues`) | Arrays keep `Array.prototype.map` (platform). |
| `round(value, digits)` (`views/BrowserBenchmarks.vue:231-234`) | `roundTo` (`@re-code/basics/number/roundTo`) | Same semantics for the integer `digits` used. |
| `median()` returning `null` on empty (`BrowserBenchmarks.vue:236-244`) | `median` (`@re-code/basics/number/median`) wrapped: `values.length ? roundTo(median(values), 3) : null` | Basics returns `NaN` for empty input. The wrapper keeps today's `null` contract (CHORE-011 recorded the same difference). |
| `percentile()` (`BrowserBenchmarks.vue:246-252`) | **none in Basics** | Stays local until CHORE-012 adds it to Basics (candidates A5/A6 in `roadmap/basics-candidates.md`). Do not add it to Basics from here. |
| Sum reductions (`BrowserBenchmarks.vue:438,782,786`; `VisualLabFeaturedStage.vue:145`) | `sum` (`@re-code/basics/number/sum`) | `BrowserBenchmarks.vue:765` becomes `sum(intervals.map(…))`. |
| API reference search: per-keystroke `toLowerCase().includes` over every entry (`DocsApiReference.vue:21-22`) | `debounce` (150 ms, `@re-code/basics/function/debounce`) on the query ref, plus `filter` where an iteratee shorthand helps | Announce the result count once per settled query. |
| `getCategoryLabel()` doing a linear `find` per row (`DocsApiReference.vue:18-20`) | `keyBy(categories, 'value')` once (`@re-code/basics/collection/keyBy`) | — |
| Category counts (new in the redesign: filter chips show counts) | `countBy(entries, 'category')` (`@re-code/basics/collection/countBy`) | — |
| Palette result descriptions (C8, new) | `truncate(description, 96)` (`@re-code/basics/string/truncate`) | — |
| Search-index slugs and test ids (C8, A08, new) | `kebabCase` (`@re-code/basics/string/kebabCase`) | — |
| Resize and pointer handlers that re-measure (`VisualLabFeaturedStage.vue` resize, `LandingLabPreview.vue` resize) | `throttle` (`@re-code/basics/function/throttle`) **only where the handler is not already coalesced by `ResizeObserver` or the coordinator's read phase** | Prefer the engine's read phase for layout reads (a Flux showcase). |
| 68 inline `Math.min(max, Math.max(min, v))` clamps in demo and scene code (e.g. `SteeringPanel.vue:151-152,173-174`, `StreamsPanel.vue:35,51-52`, `EasingCurve.vue:48,63`) | **the engine's `clamp`** (`@lib` → `src/utils/math.ts:17`), *not* Basics | Demo code teaches the Flux API. The engine `clamp` also tolerates reversed bounds, while Basics' `clamp` throws `RangeError` when `minimum > maximum`. Under CHORE-011 option C, the engine `clamp` would delegate to Basics anyway, so behaviour converges without churn in the docs. In **non-animation app logic** (none found today besides `UiPrimitives.ts:506-508`, which is deleted), use Basics' `clamp`. |
| Hand-written `a + (b - a) * t` in scenes | **the engine's `lerp`** (`@lib`) | Same reasoning. The two are identical formulas (CHORE-011 table). |
| 9 copy-feedback `setTimeout` blocks (§3A.2 b) | a docs composable, `useCopyFeedback()` | Not a Basics concern (no timer utility). One composable replaces nine copies. |

**`sanitize/`.**
- **Today there is nothing to sanitize.** The docs app has no `v-html`. All external `href`s are static or code constants (`App.vue:75`, `Docs.vue:72,134`, `VisualLabOverview.vue:456-457`, `BrowserBenchmarks.vue:1205` from a constant engine list). No URL state is parsed (no `URLSearchParams` or `JSON.parse` of user input).
- **It becomes mandatory** as soon as these planned features land:
  - (a) shareable Playground or Design Lab state in the URL (C4, C5): `stripControlCharacters` on every string parameter, then numeric parsing, then `clamp`;
  - (b) any `href` built from imported or URL data, for example an imported benchmark report's engine link: `sanitizeUrl`, rendering no link when it returns `undefined`;
  - (c) any text rendered into canvas or SVG labels from user input: `stripControlCharacters`.
- Vue's text interpolation already escapes HTML, so `escapeHtml` is only needed if a string is ever injected as HTML, which is forbidden by rule.

**How this relates to CHORE-011 / CHORE-012:**
- They are about the **library** (`src/**`) taking a runtime dependency on Basics and upstreaming helpers to Basics. They remain a separate, pending owner decision.
- Basics' rule "no migrations from re;Flux without explicit approval" governs moving re;Flux code **into** Basics (CHORE-012). It does not govern the docs app **consuming** published Basics functions.
- To avoid duplicate work:
  1. DESIGN-A07 does not touch `src/**`.
  2. The docs' `percentile`, and the engine-vs-Basics `clamp` choice, wait on CHORE-011/012.
  3. If CHORE-011 chooses option B ("dev-only use, optionally in the docs app"), A07 *is* the docs half of that option. Record it in CHORE-011's ADR rather than deciding it twice.

---

## 4. Shared design-system work

### 4.1 Token additions and changes (`styles/abstracts/_tokens.scss` plus `motion/tokens.ts`)

**Rev 2:** semantic colours, radii, font families, durations and z-layers now live in Aurora's `--aurora-*` properties, which the docs theme sets (§3A.6 iv). The rows below are the **docs-only** additions. The "Text floor" and "Contrast preference" rows are implemented in DESIGN-A04 through `--aurora-color-text-muted`.

| Group | Change |
|---|---|
| **Motion** | Add `--rx-motion-instant/quick/standard/deliberate` and `--rx-ease-standard/enter/exit/move` (§2.3). Alias the seven old duration tokens to the nearest new one and mark them deprecated in a comment. Remove them in a later cleanup (not a mass rename now; see CHORE-006's "never mix formatting and logic"). |
| **Springs (TS only)** | `springPresets = { snappy, standard, gentle, playful }` in `apps/docs/src/motion/tokens.ts`, typed as `SpringOptions`. |
| **Telemetry / data-viz** | `--rx-telemetry-read-rgb`, `--rx-telemetry-consumer-rgb`, `--rx-telemetry-write-rgb`, `--rx-telemetry-idle-rgb`, `--rx-quality-tier-0…3-rgb`. Each is paired with a pattern or text label in components, never colour alone. |
| **Syntax** | `--rx-syntax-keyword / string / number / comment / function / punctuation / scrub`. Every one must reach ≥ 4.5:1 on `--rx-color-surface-sunken`. |
| **Elevation** | `--rx-elevation-0…3`, each a composite of surface, border and shadow, replacing ad-hoc `panel-overlay-*` mixes in new components. |
| **Text floor** | Raise `--rx-brand-text-subtle` alpha from 0.46 to ≥ 0.52. That is about 5.0:1 on the page background by computed estimate (0.56 gives about 5.7:1); verify with axe on raised surfaces too. Add `--rx-font-size-label-min: 0.6875rem`. Re-point `--rx-font-size-micro` and `--rx-font-size-code-label` to it wherever they carry information. Purely ornamental uses may stay, `aria-hidden`. |
| **Contrast preference** | `@media (prefers-contrast: more)` raises subtle and muted text to full emphasis and borders to `--rx-color-border-strong`. This is the justified alternative to a light theme (§6 Q3). |
| **Layers** | `--rx-z-dock: 700` (below `--rx-z-overlay`), `--rx-z-palette: 900`. |
| **Canvas palette** | No new CSS. Add `readCanvasPalette(element)` in `apps/docs/src/motion/palette.ts`. It is the single place that turns `--rx-*-rgb` triples into canvas and WebGL colours, and it replaces `getColor`/`alphaColor` in `VisualLabFeaturedStage.vue` and the literal hex in `LandingLabPreview.vue`. |
| **Consolidation (documented, later)** | The "Spacing and radius consolidation map" in §4.2 folds the near-duplicate spacing and radius tokens into the existing numeric scale. It is executed later in a dedicated CHORE. |

### 4.2 Components (rev 2: organisms built from `au-*` parts)

**Rule:** every component below is a **docs-specific organism** (Aurora's admission criterion 1 would reject it as page-specific). It is composed from `au-*` parts and native HTML, and it is styled with `--aurora-*` plus docs-only `--rx-*` tokens. Each touches `window` and canvas **only in `onMounted`**, which keeps it prerender-safe.

**What happened to the rev 1 molecules:**

| Rev 1 molecule | Rev 2 |
|---|---|
| `PlaybackControls` | **Composition recipe**, not a component: an `au-button` group (`variant="ghost"`, `aria-label` from locale, `au-icon` `play`/`pause`/`rotate-ccw`) inside `role="group"`. The play/pause button switches its label rather than using `aria-pressed`. |
| `QualityChip` | **Composition:** `au-button` (the label carries the tier) + `au-popover` (**AURORA-OVL-001**, shim meanwhile) containing an `au-radio-group` (Auto/High/Medium/Low/Static). |
| `CopyButton` | **Composition plus composable:** `au-button` + `au-icon` (`copy` → `check`) + `useCopyFeedback()` (status text in a `role="status"` region). The rev 1 icon morph via `bindSvgPathMorph` is dropped: `au-icon` renders Lucide internally, and reaching into its shadow SVG would break encapsulation. |
| `PageMotionSwitch` | **Composition:** `au-button` with `aria-pressed` (**AURORA-ACT-001**; `au-shim-button` meanwhile). Not `au-switch`, because Aurora defines a switch as a form value, not an immediate action. Entry rules from rev 1 still hold (no rxjs in the entry; `data-rx-motion` attribute plus a DOM event). |
| `ParamPad`'s two range inputs | `au-slider` × 2 (**AURORA-FRM-002**); native ranges meanwhile. |
| `CommandPalette`'s dialog shell | `au-dialog` (unreleased). The listbox stays an internal part, because Aurora defers combobox. |

#### 1. `MotionStage` (organism)

- **Parts:**
  - `au-card variant="surface" padding="none"` as the frame;
  - the scene slot;
  - a **controls bar** made of `au-button` items (Pause/Play, plus scene-specific ones);
  - an `au-badge` showing state ("Paused · off-screen", "Reduced motion", "T2");
  - a `role="status"` region (throttled).
- **Props:** `label` (required), `description`, `autoplay: 'visible' | 'interaction' | 'never'`, `tiers`.
- **Slots:** `default({ active, tier, reducedMotion, preferences })`, `poster` (required), `controls`, `caption`.
- **Events:** `state-change`, `tier-change`.
- **Docs CSS custom properties:** `--rx-stage-min-height`, `--rx-stage-scrim`.
- **Accessibility:** unchanged from rev 1. Pause is always present when `autoplay !== 'never'`. The canvas is `aria-hidden`. Forced colours show the poster.

#### 2. `TelemetryDock` (organism)

- **Parts:**
  - `au-popover` (**AURORA-OVL-001**; shim meanwhile) anchored to the header's "engine" `au-button`;
  - inside: an `<h2>`, `<dl>` metric rows, an SVG sparkline, a sources list (`<ul>` with an `au-badge` per state) and the quality composition.
- **Props, events and accessibility:** as in rev 1, but focus return and Esc now come from Aurora's popover contract.
- **Docs CSS custom properties:** `--rx-dock-width`, `--rx-telemetry-*` colours.

#### 3. `CodeBlock` (organism)

- **Parts:**
  - a `<pre>` (docs-owned; there is no Aurora code component, and none is warranted);
  - an `au-button` copy control (`useCopyFeedback`);
  - an `au-badge` for the language;
  - easing tokens open an `au-popover` listing `Easings` keys as an `au-radio-group`.
- **Scrubbable numbers:** remain docs-owned `role="spinbutton"` spans. That is a code-specific interaction, so it is not an Aurora candidate.
- **Props and events:** as in rev 1.

#### 4. `ChapterRail` (organism)

- **Parts:**
  - `<nav aria-label>`;
  - an `<ol>` of `au-button variant="ghost"` with `aria-current="step"` (**ACT-001**; `au-shim-button` meanwhile);
  - a native `<progress>`.
- **Props and events:** as in rev 1.

#### 5. `ParamPad` (organism, Design Lab only)

- **Parts:**
  - an SVG plane with labelled region bands;
  - a `draggable()` puck (the engine provides keyboard support);
  - two `au-slider`s (native ranges meanwhile) as the **primary accessible interface**;
  - an `au-badge` showing ζ.

#### 6. `CommandPalette` (organism)

- **Parts:**
  - `au-dialog` (`label` from locale, `size="large"`);
  - `au-input type="search"` (the combobox input: `role` and `aria-activedescendant` set on the host through ARIA attributes, pending Aurora's guidance on ARIA reflection into the inner input; listed under **AURORA-DOC-001**);
  - a docs-owned `role="listbox"`;
  - `au-badge` category labels;
  - the C10 choreography.
- **Blocked:** until an Aurora release contains `au-dialog` (§3A.5).

#### 7. `HeroScene` (organism, new in rev 2 as a named unit)

- **Parts:** the C6 ladder renderers inside a `MotionStage`, with the QualityChip composition and the poster SVG.
- **Aurora parts:** only `au-button` and `au-badge`.

The **component × state matrix below** (from rev 1) still defines the required visual states. For rows that are now compositions (PlaybackControls, QualityChip, CopyButton, PageMotionSwitch), the default, hover, focus, active, disabled and loading states come from the Aurora parts: `au-button` reflects `disabled` and `loading` (with `aria-busy`), and `au-alert` covers error. The docs add only scene, dock and palette states.

#### Component × state matrix

Legend:
- ✓ = a designed visual state is required
- — = not applicable
- **RM** = the reduced-motion behaviour

All focus states use the existing `:focus-visible` ring from `base/_accessibility.scss`, which is never animated, and `Highlight` in forced colours.

| Component | Default | Hover | Focus | Active / pressed | Disabled | Loading | Error | RM |
|---|---|---|---|---|---|---|---|---|
| MotionStage | poster or running | controls fade in (quick) | ring on stage plus controls visible | — | — (unsupported shows poster) | hairline plus `aria-busy` | poster plus message | poster, Pause hidden, "Reduced motion" label |
| PlaybackControls | ✓ | ✓ | ✓ | ✓ (pressed) | ✓ with reason | — | — | Play and Replay disabled with reason |
| QualityChip | ✓ (tier text) | ✓ | ✓ | menu open | ✓ ("Static") | "Measuring…" during calibration | — | fixed "Static" |
| TelemetryDock | ✓ | rows ✓ | ✓ | — | idle-clock greyed | "Measuring…" | "Metrics unavailable" | 1 Hz redraw |
| CodeBlock | ✓ | scrub token underline ✓ | token ring ✓ | scrubbing ✓ | read-only (no scrub) | — | copy failed ✓ | preview jumps, scrub still works |
| CopyButton | ✓ | ✓ | ✓ | ✓ | ✓ | — | ✓ failed | icon swaps without morph |
| ChapterRail | ✓ | ✓ | ✓ | current step ✓ | — | — | — | jumps instead of smooth scroll |
| ParamPad | ✓ | puck ✓ | puck and inputs ✓ | dragging ✓ | ✓ | — | — | puck snaps, no throw inertia |
| CommandPalette | ✓ | option ✓ | active option ✓ | — | — | "Loading index…" | "Index unavailable" plus routes-only fallback | no FLIP or stagger |
| PageMotionSwitch | ✓ | ✓ | ✓ | pressed ✓ | — | — | — | defaults to pressed when the OS prefers reduced motion |

#### Spacing and radius consolidation map

**Rev 2:** the "keep" column is the target until DESIGN-A06. A06 then replaces these `--rx-space-*` and `--rx-radius-*` tokens with Aurora's spacing scale (`SPACING_SCALE` 0–10, utilities `p-*`, `gap-*`) and `--aurora-radius-*`, using the same groupings.

This map is documentation only. It is executed by a later CHORE, never in the same PR as a logic change.

| Keep (scale) | Absorbs (existing tokens) |
|---|---|
| `--rx-space-1` 0.25 rem | `--rx-space-fine` 0.2, `--rx-space-micro` 7 px |
| `--rx-space-1-5` 0.375 rem | `--rx-space-tight` 0.35, `--rx-space-control-gap` 0.4, `--rx-space-icon` 9 px |
| `--rx-space-2` 0.5 rem | `--rx-space-control-tight` 0.45, `--rx-space-compact` 0.55 |
| `--rx-space-2-5` 0.625 rem | `--rx-space-control` 0.65 |
| `--rx-space-3` 0.75 rem | `--rx-space-control-wide` 0.7, `--rx-space-card` 0.8 |
| `--rx-space-3-5` 0.875 rem | `--rx-space-card-gap` 0.85, `--rx-space-content-compact` 0.9 |
| `--rx-space-5` 1.25 rem | `--rx-space-layout-compact` 1.15, `--rx-space-content` 1.2 |
| `--rx-space-6` 1.5 rem | `--rx-space-layout-gap` 1.4, `--rx-space-5-5` 22 px |
| `--rx-radius-sm` 0.25 rem | `--rx-radius-xs`, `--rx-radius-control-tight`, `--rx-radius-control` |
| `--rx-radius-md` 0.5 rem | `--rx-radius-control-sm`, `--rx-radius-control-soft`, `--rx-radius-compact-sm` |
| `--rx-radius-lg` 0.75 rem | `--rx-radius-compact`, `--rx-radius-compact-wide`, `--rx-radius-control-wide` |
| `--rx-radius-xl` / `-2xl` / `-pill` | unchanged |

Differences of up to about 1.6 px are accepted visually, and each absorbed token is spot-checked at 320 px.

---

## 5. Phased implementation plan

Priority = (Impact + Risk) × (6 − Effort). **Risk here follows the roadmap's usage: the exposure if the item is *not* done** (credibility, accessibility or regression). Scores are judgement calls.

### 5.1 Summary (rev 2)

Priority = (Impact + Risk) × (6 − Effort). **Risk here follows the roadmap's usage: the exposure if the item is *not* done.** Scores are judgement calls.

**Blocked column:**
- **—** = can start once its dependencies are done.
- **shim** = proceeds with a §3A.5 shim and swaps when the named Aurora request ships.
- **BLOCKED** = waits for an Aurora release.
- **ext** = depends on an action in another repository.

| ID | Title | Category | I | R | E | Priority | Phase | Depends on | Blocked |
|---|---|---|---|---|---|---|---|---|---|
| DESIGN-001 | Make the hero telemetry real; start on visibility; fix the hash anchor | Showcase / A11y | 4 | 4 | 1 | **40** | A | — (e2e criteria verified with DESIGN-002; Q5) | — |
| DESIGN-A01 | Deliver Aurora: registry beta pinned exactly | Dependencies | 5 | 5 | 2 | **40** | 0 | AURORA-PKG-001 | **ext** |
| DESIGN-A02 | One Flux: alias `@re-code/flux*` to source, dedupe, single-coordinator checks | Architecture / Perf | 4 | 5 | 2 | **36** | 0 | A01, DESIGN-002; AURORA-PKG-002 (soft) | — |
| DESIGN-A03 | Vue integration glue: `isCustomElement`, registration, `vAuModel`, types, `:not(:defined)` | Architecture | 4 | 4 | 2 | **32** | 0 | A01 | — |
| DESIGN-003 | Site motion source: `useMotionGate`, Pause-motion switch, no raw RAF | Architecture / A11y | 5 | 5 | 3 | **30** | A | DESIGN-002; A08 (switch) | shim (ACT-001) |
| DESIGN-002 | Docs e2e smoke plus axe harness (plus RAF-peak and single-coordinator checks) | Testing | 3 | 4 | 2 | **28** | A | — | — |
| DESIGN-A04 | Docs theme over Aurora dark (`--rx-*` → `--aurora-*`), fonts, contrast floor | Design system | 4 | 3 | 2 | **28** | 0 | A01, A03 | — |
| DESIGN-A05 | Icons: MDI → Lucide via `au-icon`; drop `@mdi/font` and Material Symbols | Perf / Design system | 4 | 3 | 2 | **28** | 0 | A03, A04; AURORA-ICON-001 (soft) | — |
| DESIGN-005 | Quality governor plus quality composition | Showcase / Perf | 4 | 3 | 2 | **28** | A | DESIGN-003, A02, A08 | shim (OVL-001) |
| DESIGN-004 | Engine-twin motion tokens, canvas palette, hex check (narrowed: colours moved to A04) | Design system | 3 | 3 | 2 | **24** | A | A04 | — |
| DESIGN-007 | Playground IA: workbench first, compact module switcher | IA | 4 | 2 | 2 | **24** | B | DESIGN-002, A06 | — |
| DESIGN-A08 | Aurora shims (≤ 4) plus `check-aurora-shims.mjs` | Architecture | 3 | 3 | 2 | **24** | 0 | A03 | — |
| DESIGN-008 | The page is the timeline | Showcase / IA | 5 | 2 | 3 | **21** | B | DESIGN-003, DESIGN-004, A06, DOCS-004 (soft) | shim (ACT-001) |
| DESIGN-A07 | Basics adoption (docs app only) | Maintainability | 2 | 2 | 1 | **20** | 0 | — (Basics is on npm) | — |
| DESIGN-006 | Telemetry Dock | Showcase | 4 | 2 | 3 | **18** | B | DESIGN-003, DESIGN-005, A08 | shim (OVL-001) |
| DESIGN-009 | `CodeBlock` with tokenizer and scrubbable values | Showcase | 4 | 2 | 3 | **18** | B | DESIGN-004, A08 | shim (OVL-001) |
| DESIGN-011 | Hero render ladder, Tiers 0–2 | Showcase / Perf | 4 | 2 | 3 | **18** | C | DESIGN-005, A02, ENG-FONTS (soft) | — |
| DESIGN-013 | Command palette | IA / Findability | 4 | 2 | 3 | **18** | C | ENG-META, ENG-LOCALE, DESIGN-002, A06, an Aurora release containing `au-dialog` | **BLOCKED** |
| DESIGN-A09 | Aurora × Flux choreography (C10) | Showcase | 4 | 1 | 3 | **15** | C | A02, A06, DESIGN-003, DESIGN-013 (dialog) | **BLOCKED** (via 013) |
| DESIGN-010 | Motion Design Lab | Showcase | 4 | 1 | 3 | **15** | B | DESIGN-004, DESIGN-009, A08 | shim (NAV-001); native ranges (FRM-002) |
| DESIGN-015 | Frame X-ray | Showcase | 4 | 1 | 3 | **15** | C | ENGINE-A, DESIGN-006 | — |
| DESIGN-A06 | Retire `UiPrimitives` (EXISTS and NATIVE rows); selective utilities; delete `_ui-primitives.scss` | Design system | 4 | 3 | 4 | **14** | A | A03, A04, A05, DOCS-004 (soft) | — (gap rows go via A08) |
| DESIGN-A10 | Integration lab `/visuals/stack` plus scoped theme preview (C11, C12) | Showcase | 3 | 1 | 3 | **12** | C | A06, A07, Q3 | — |
| DESIGN-012 | three.js Tier 3: `/visuals/three`, then Home promotion | Showcase | 5 | 1 | 4 | **12** | C | DESIGN-011, Q6 | — |
| DESIGN-014 | Route and layout transitions | Polish | 2 | 1 | 3 | **9** | C | DESIGN-004, DESIGN-007 | — |

**Sequence:**
1. **DESIGN-001 stays first.** It needs nothing from Aurora and is still the most visible payoff.
2. **DESIGN-A07 can start immediately** in parallel, because Basics is already on npm.
3. **DESIGN-A01 is the gate for all Aurora work**, and it depends on an Aurora owner decision (AURORA-PKG-001, §6 Q1).
4. Until A01 lands, every item that has no Aurora dependency can proceed: 001, 002, 003 (with the native shim button), 004, A07. They use native HTML or the existing primitives they will later swap.

### 5.1a Rev 2 changes to existing items (each item section below keeps its rev 1 text; these deltas override it)

| Item | Change |
|---|---|
| DESIGN-002 | **Add criteria:** AC-DESIGN-002-5 (cmd): the single-coordinator build check from A02 runs inside `check:docs-e2e`. AC-DESIGN-002-6 (e2e): the RAF wrapper also records **peak outstanding callbacks**, and every smoke route reports `peak ≤ 1`. |
| DESIGN-003 | The header switch is `au-button aria-pressed` (ACT-001), or the `au-shim-button` class on a native `<button aria-pressed>` until then. Scene controls use the `PlaybackControls` composition. |
| DESIGN-004 | **Scope narrowed.** Semantic colours, text floor, contrast preference and fonts move to A04. 004 keeps engine-twin easings, spring presets, telemetry, syntax and quality tokens, the canvas palette helper and the hex-literal check. AC-DESIGN-004-4 (contrast) moves to A04. |
| DESIGN-005 | The quality menu is the `QualityChip` composition (`au-button` + `au-popover` shim + `au-radio-group`). |
| DESIGN-006 | The dock is built on the `au-popover` shim. AC-DESIGN-006-2 holds unchanged against the shim, then against OVL-001. |
| DESIGN-007 | The switcher uses `RouterLink`s styled with `au-shim-button` (link mode, ACT-001) and a native `<details>` disclosure. `check-playground-layout.mjs` literals change in A06, not here. |
| DESIGN-009 | Copy uses `useCopyFeedback()` with `au-button`. The easing picker uses the `au-popover` shim containing `au-radio-group`. |
| DESIGN-010 | The Curve/Spring tabs use the `au-tabs` shim. Ranges stay native until AURORA-FRM-002. |
| DESIGN-011 / 012 | No Aurora UI dependency beyond `MotionStage` parts. **Add a dependency on A02**, so the governor sees every animation on one clock. |
| DESIGN-013 | **BLOCKED** until an Aurora release (beta or later) contains `au-dialog`. Uses `au-input type="search"`, and C10 choreography arrives with A09. |
| DESIGN-014 | The brand-mark morph is unchanged, because the mark is docs-owned SVG, not `au-icon`. |

### 5.1b New items

The shared gates in §5.2 apply to every item. The **entry-budget gate is replaced for A05 and A06** by the first-load rule in §3A.6 v.

### DESIGN-A01 — Deliver Aurora as a registry beta, pinned exactly

| Category | Impact | Risk | Effort | Priority score | Phase | Depends on |
|---|---|---|---|---|---|---|
| Dependencies | 5 | 5 | 2 | **40** | 0 | AURORA-PKG-001 (Aurora owner) |

**Scope:**
- Add `"@re-code/aurora": "<exact beta version>"` to `apps/docs/package.json` `dependencies`.
- Record the upgrade policy (exact pins for 0.x betas; upgrade in a dedicated PR running the full Docs gate) in `guidelines/DESIGN_SYSTEM.md`.
- Local pre-publish development uses `npm link`, which is never committed.

**Non-goals:** any change in the Aurora repository; monorepo moves.

**Risks:**
- The Aurora owner declines publishing. Fallback: option C (§3A.6 ii), a GitHub Release tarball URL, with the same criteria except AC-2's registry check.
- Installing Aurora pulls a registry `@re-code/flux` copy. That is handled by A02, which must land in the same PR or immediately after, before any Aurora motion is used.

**Acceptance criteria**
- [ ] AC-DESIGN-A01-1 (cmd) `grep -nE '"(file|link|git\+|github):' apps/docs/package.json package-lock.json` returns nothing.
- [ ] AC-DESIGN-A01-2 (cmd) In `package-lock.json`, the `node_modules/@re-code/aurora` entry's `resolved` starts with `https://registry.npmjs.org/`, and its `version` equals the exact pin in `apps/docs/package.json` (no `^` or `~`).
- [ ] AC-DESIGN-A01-3 (cmd) `npm ci` followed by `npm run build --workspace=re-flux-docs` passes on a clean checkout.
- [ ] AC-DESIGN-A01-4 (inspect) `guidelines/DESIGN_SYSTEM.md` states the Aurora pin and upgrade policy.

### DESIGN-A02 — One Flux

| Category | Impact | Risk | Effort | Priority score | Phase | Depends on |
|---|---|---|---|---|---|---|
| Architecture / Perf | 4 | 5 | 2 | **36** | 0 | DESIGN-A01, DESIGN-002; AURORA-PKG-002 (soft) |

**Scope:** implement §3A.6 iii steps 1–3 and 5:
- the regex alias plus subpath map for `@re-code/flux*` → `src`;
- `resolve.dedupe: ['rxjs']`;
- `optimizeDeps.exclude: ['@re-code/aurora']`;
- `scripts/check-single-flux.mjs` (config-level resolution check), wired into `npm run check:docs`;
- the runtime RAF-peak check in DESIGN-002.

**Non-goals:** changing Aurora; publishing Flux.

**Risks:**
- The subpath map drifts from the root `exports`. The check script compares the alias map with `package.json` `exports` keys.
- Node self-reference might not take precedence in some tool (see AC-4).

**Acceptance criteria**
- [ ] AC-DESIGN-A02-1 (cmd) `node scripts/check-single-flux.mjs` passes: every `@re-code/flux` export subpath resolves through the docs Vite config to a file under `src/`. It fails when one alias entry is removed, or when an export key has no alias (`--self-test`).
- [ ] AC-DESIGN-A02-2 (cmd) After build, `grep -l "FrameCoordinator is not idle" apps/docs/dist/assets/*.js | wc -l` prints `1` (secondary; vacuous until Aurora motion exists).
- [ ] AC-DESIGN-A02-3 (e2e, **deferred to DESIGN-A09**) Given A09's palette choreography and a docs scene running together, when 120 frames elapse, then peak outstanding RAF callbacks ≤ 1. No test-only page is added to satisfy this earlier.
- [ ] AC-DESIGN-A02-4 (cmd) `npm run check:tree-shaking` and `npm run check:package:consumer` pass with Aurora installed.
- [ ] AC-DESIGN-A02-5 (cmd) `npm ls @re-code/flux --all` output is attached to the PR. If AURORA-PKG-002 has landed, it shows no registry copy.

### DESIGN-A03 — Vue integration glue

| Category | Impact | Risk | Effort | Priority score | Phase | Depends on |
|---|---|---|---|---|---|---|
| Architecture | 4 | 4 | 2 | **32** | 0 | DESIGN-A01 |

**Scope:** implement §3A.6 i:
- `isCustomElement` for `au-`;
- `apps/docs/src/aurora/register-shell.ts`, called after `app.mount()`;
- the `vAuModel` directive with a unit test;
- `aurora-vue.d.ts`, generated by `scripts/generate-aurora-vue-types.mjs`;
- `:not(:defined)` placeholder styles;
- a "Using Aurora in the docs" section in `guidelines/DESIGN_SYSTEM.md`, covering property vs attribute rules, events, `vAuModel`, and slots-for-text.

**Non-goals:** Vue wrapper components for `au-*`.

**Risks:**
- `vue-tsc` and Volar may not pick up the augmentation. Verify with a type-test file.
- Upgrade order (see Hydration in §3A.6 i).

**Acceptance criteria**
- [ ] AC-DESIGN-A03-1 (cmd) `npm run build --workspace=re-flux-docs` passes (it includes `vue-tsc`), and `apps/docs/type-tests/aurora.vue` with a wrong `variant` value fails `vue-tsc` when run with `--self-test`.
- [ ] AC-DESIGN-A03-2 (unit) Given an `au-input` element bound with `vAuModel`, when it dispatches `input` with value `"42"`, then the model becomes `"42"`. Given the model changes, then the element's `value` **property** updates. The same is checked for `au-switch` `checked` and `change`.
- [ ] AC-DESIGN-A03-3 (e2e) On every smoke route, the console contains no `Failed to resolve component: au-` and no hydration class-mismatch warning.
- [ ] AC-DESIGN-A03-4 (cmd) `grep -rlE "defineComponent\\(" apps/docs/src/aurora` returns nothing (no wrapper components; the glue is functions and directives only).
- [ ] AC-DESIGN-A03-5 (inspect) Every Aurora import in `apps/docs/src` is a per-component subpath or `styles.css`, never `@re-code/aurora/loader` (`grep -rn "aurora/loader" apps/docs/src` → 0).
- [ ] AC-DESIGN-A03-6 (cmd) `grep -rnE '<au-[a-z-]+[^>]*[ :]class=' apps/docs/src` returns nothing (no `class` bindings on Aurora hosts), and `register-shell.ts` contains only dynamic `import(` calls for Aurora entrypoints.

### DESIGN-A04 — Docs theme over Aurora dark

| Category | Impact | Risk | Effort | Priority score | Phase | Depends on |
|---|---|---|---|---|---|---|
| Design system | 4 | 3 | 2 | **28** | 0 | DESIGN-A01, DESIGN-A03 |

**Scope:**
- Implement §3A.6 iv: `index.html` gets `data-aurora-theme="dark"` (after `style`); add `styles/themes/_aurora-rx.scss`; import `@re-code/aurora/styles.css` once in `main.ts`; override the font families.
- Absorb rev 1's text floor and `prefers-contrast: more` (formerly in DESIGN-004).
- Mark the disappearing `--rx-*` tokens as deprecated aliases of `--aurora-*` (removal happens in A06).

**Non-goals:** glass, minimal or default themes in the shell; a theme toggle.

**Risks:** specificity fights with Aurora's dark block; handled by the doubled attribute selector.

**Acceptance criteria**
- [ ] AC-DESIGN-A04-1 (cmd) `node scripts/check-dark-theme-only.mjs` passes.
- [ ] AC-DESIGN-A04-2 (e2e) Given any route, when `getComputedStyle(document.querySelector('au-button')).getPropertyValue('--aurora-color-primary')` is read, then it resolves to `rgb(167, 139, 250)`.
- [ ] AC-DESIGN-A04-3 (e2e) axe `color-contrast` reports 0 violations on the smoke routes, including content inside Aurora's open shadow roots.
- [ ] AC-DESIGN-A04-4 (e2e) The network log of a full smoke run contains no request for a Lato or Montserrat font file.
- [ ] AC-DESIGN-A04-5 (cmd) `npm run check:scss-tokens` passes, and `_aurora-rx.scss` contains no hex literal.

### DESIGN-A05 — Icons: MDI → Lucide

| Category | Impact | Risk | Effort | Priority score | Phase | Depends on |
|---|---|---|---|---|---|---|
| Perf / Design system | 4 | 3 | 2 | **28** | 0 | DESIGN-A03, DESIGN-A04; AURORA-ICON-001 (soft) |

**Scope:**
- Apply the §3A.3 mapping in `.vue`, `.ts` and `locales/en.json`.
- Register `custom:github` and `custom:spring` through `registerIcons` in `register-shell.ts`.
- Remove `@mdi/font` from `apps/docs/package.json` and `main.ts`.
- Remove the Material Symbols `<link>` from `index.html` and `.material-symbols-outlined` from `base/_typography.scss`.
- Extend `check-ui-framework.mjs` with "no `@mdi/font`, no `mdi-` class".
- Apply P2's rule: `→` for internal links, `↗` only for external ones.

**Non-goals:** redesigning which icon goes where.

**Risks:** the about 2,000 emitted icon chunks (§3A.6 v); the about 47 KB gzip icon first-use cost until ICON-001.

**Acceptance criteria**
- [ ] AC-DESIGN-A05-1 (cmd) `grep -rn "mdi-" apps/docs/src` and `grep -n "materialdesignicons\|Material+Symbols\|material-symbols" apps/docs/index.html apps/docs/src -r` both return nothing, and no `materialdesignicons-webfont-*` file exists in `apps/docs/dist/assets`.
- [ ] AC-DESIGN-A05-2 (cmd) `vue-tsc` passes with every `icon` binding typed as Aurora's `IconName` (a misspelt slug fails, verified by `--self-test`).
- [ ] AC-DESIGN-A05-3 (e2e) On every smoke route, every `au-icon` has rendered an `<svg>` in its shadow root within 2 s.
- [ ] AC-DESIGN-A05-4 (e2e) The gzip total of all JS and CSS requested on the first load of `/` (DESIGN-002 request log, cache disabled) is below the value recorded before the item, and entry CSS (`index-*.css`) drops by ≥ 45 KB. The 403 KB woff2 request is gone.
- [ ] AC-DESIGN-A05-5 (cmd) `npm run check:docs` passes, with `check-ui-framework.mjs` and `check-locale-common.mjs` updated.

### DESIGN-A06 — Retire `UiPrimitives` (EXISTS and NATIVE rows) and adopt selective utilities

| Category | Impact | Risk | Effort | Priority score | Phase | Depends on |
|---|---|---|---|---|---|---|
| Design system | 4 | 3 | 4 | **14** | A | DESIGN-A03, A04, A05; DOCS-004 (soft) |

**Scope:**
- Replace every EXISTS and NATIVE row in §3A.2 a. Gap and missing rows go through A08 shims or native interim elements.
- Generate the grid, flex and spacing utilities from `pkg:@re-code/aurora/scss` (`NodePackageImporter`).
- Reconcile the breakpoints.
- Delete `_ui-primitives.scss` and the `.ui-*` selectors in 15 SCSS files.
- Delete `UiPrimitives.ts`, or reduce it to zero exports, and remove the global registration loop in `main.ts`.
- Remove the deprecated `--rx-*` aliases (§3A.6 iv).
- Update `check-visual-lab.mjs`, `check-playground-layout.mjs` and `check-scss-tokens.mjs`.
- Migrate one route group per PR: Docs → Playground → Visual Lab → Home → Benchmarks.

**Non-goals:** visual redesign beyond token mapping; organism rewrites.

**Risks:**
- Volume (about 410 tags). Mitigated by per-route PRs and the e2e smoke run after each.
- Layout drift from the breakpoint change; checked at 320 px and 200 % zoom.

**Acceptance criteria**
- [ ] AC-DESIGN-A06-1 (cmd) `grep -rn "<Ui[A-Z]" apps/docs/src` returns nothing, and `apps/docs/src/components/ui/UiPrimitives.ts` does not exist.
- [ ] AC-DESIGN-A06-2 (cmd) `grep -rn "utilities.css" apps/docs/src` returns nothing, and the generated utilities CSS is ≤ 8 KB gzip.
- [ ] AC-DESIGN-A06-3 (cmd) `grep -rlE "\\.ui-[a-z]" apps/docs/src/styles` returns nothing.
- [ ] AC-DESIGN-A06-4 (e2e) The smoke suite passes, with 0 serious or critical axe violations, a keyboard pass through the header, Docs sidebar and one Playground module, and no horizontal overflow at 320 px.
- [ ] AC-DESIGN-A06-5 (cmd) `npm run check:docs` passes, with the three contract scripts updated in the same PRs.

### DESIGN-A07 — Basics adoption (docs app only)

| Category | Impact | Risk | Effort | Priority score | Phase | Depends on |
|---|---|---|---|---|---|---|
| Maintainability | 2 | 2 | 1 | **20** | 0 | — |

**Scope:** implement §3A.7:
- add `"@re-code/basics": "~0.1.0"` to `apps/docs/package.json`;
- write characterization tests for the locale resolver and the benchmark summary first;
- then replace the helpers row by row;
- add debounce to the API search.

**Non-goals:** any `src/**` change (CHORE-011/012); moving `percentile` to Basics; replacing platform array methods.

**Risks:** Basics' `median` (`NaN` vs `null`) and `clamp` (throws on reversed bounds) contract differences; handled by the wrappers and the engine-clamp rule.

**Acceptance criteria**
- [ ] AC-DESIGN-A07-1 (cmd) `grep -rnE "from '@re-code/basics'|from '@re-code/basics/[a-zA-Z]+'" apps/docs/src` returns nothing: neither the root import nor the flat default facades. Only domain subpaths are used.
- [ ] AC-DESIGN-A07-2 (unit) Given the existing locale, when references resolve, then the resolved locale deep-equals the pre-change snapshot. Given an unknown reference or a circular one, then the same error messages are thrown.
- [ ] AC-DESIGN-A07-3 (unit) Given a recorded benchmark run fixture, when summarised, then the summary deep-equals the pre-change snapshot, including `null` for empty medians.
- [ ] AC-DESIGN-A07-4 (cmd) `grep -nE "function (getPath|round|median)\\b" apps/docs/src -r` returns nothing (`percentile` remains, by design).
- [ ] AC-DESIGN-A07-5 (e2e) Given the API reference, when `retarget` is typed quickly, then the results-count status region updates once, after typing stops (≥ 150 ms).

### DESIGN-A08 — Aurora shims and their contract check

| Category | Impact | Risk | Effort | Priority score | Phase | Depends on |
|---|---|---|---|---|---|---|
| Architecture | 3 | 3 | 2 | **24** | 0 | DESIGN-A03 |

**Scope:**
- `components/aurora-shims/`: `RxShimTabs.vue` (NAV-001 contract), `RxShimPopover.vue` (OVL-001, also used for tooltips), `RxShimSegmented.vue` (FRM-001), and the CSS-only `au-shim-button` class (ACT-001).
- `scripts/check-aurora-shims.mjs`, wired into `check:docs`.

**Non-goals:** any shim for `au-dialog` (DESIGN-013 is blocked instead); more than 4 shims.

**Risks:**
- A shim drifts from Aurora's eventual API. Mitigation: shims mirror the §3A.4 sketch, and the final swap PR adapts call sites if Aurora's accepted contract differs.

**Acceptance criteria**
- [ ] AC-DESIGN-A08-1 (cmd) `node scripts/check-aurora-shims.mjs` passes. It fails if a shim file lacks `Aurora-Request:` or `Delete-When:` headers, if there are more than 4 shims, or if the installed `@re-code/aurora` `package.json` `exports` already contains the shimmed component (`--self-test` with a stub package proves each failure).
- [ ] AC-DESIGN-A08-2 (e2e) Given `RxShimTabs`, when ArrowRight, Home and End are pressed, then focus and `aria-selected` move per the NAV-001 sketch, and `au-tab-change` fires once per user change and not on programmatic change.
- [ ] AC-DESIGN-A08-3 (e2e) Given `RxShimPopover` is open, when Esc is pressed, then it closes and focus returns to the invoker.
- [ ] AC-DESIGN-A08-4 (inspect) The shim stylesheets reference only `--aurora-*` and `--rx-*` tokens (enforced by `check:scss-tokens`).

### DESIGN-A09 — Aurora × Flux choreography (C10)

| Category | Impact | Risk | Effort | Priority score | Phase | Depends on |
|---|---|---|---|---|---|---|
| Showcase | 4 | 1 | 3 | **15** | C | DESIGN-A02, A06, DESIGN-003, DESIGN-013 |

**Scope:**
- Palette enter and exit choreography through custom properties plus `::part`, with exit via `au-before-close`.
- Experiment-card press springs.
- The tabs indicator spring once NAV-001 ships.
- Every choreography registers with `useMotionSource`.

**Non-goals:** deep imports of Aurora internals; animating inside shadow roots.

**Risks:** Aurora's own transitions double-animating (see C10).

**Acceptance criteria**
- [ ] AC-DESIGN-A09-1 (e2e) Given the palette is open, when Esc is pressed, then `au-before-close` is prevented once, the exit runs, `open` becomes `false` within 300 ms, and focus returns to the trigger.
- [ ] AC-DESIGN-A09-2 (e2e) Given reduced motion, when the palette opens and closes, then no custom property animates (the RAF wrapper records no requests attributable to the dialog) and close is immediate.
- [ ] AC-DESIGN-A09-3 (e2e) Given light-dismiss on the backdrop, then the dialog still closes through the exit choreography.
- [ ] AC-DESIGN-A09-4 (e2e) With the dock open during the choreography, a source named after the dialog appears, and peak outstanding RAF ≤ 1.
- [ ] AC-DESIGN-A09-5 (cmd) The choreography adds ≤ 2 KB gzip to the palette chunk.

### DESIGN-A10 — Integration lab plus scoped theme preview (C11, C12)

| Category | Impact | Risk | Effort | Priority score | Phase | Depends on |
|---|---|---|---|---|---|---|
| Showcase | 3 | 1 | 3 | **12** | C | DESIGN-A06, A07, §6 Q3 |

**Scope:** the `/visuals/stack` route; the three-layer panel; the wiring overlay; the scoped `data-aurora-theme` preview with the Flux cross-fade; route-only imports of `themes/glass.css` and `themes/minimal.css`.

**Non-goals:** any shell theme toggle (unless Q3 is answered differently).

**Risks:** a theme attribute leaking to `<html>`; covered by AC-2.

**Acceptance criteria**
- [ ] AC-DESIGN-A10-1 (e2e) Given the lab, when "Glass" is chosen, then the preview container has `data-aurora-theme="glass"`, its `au-card` computed background changes, and `document.documentElement.dataset.auroraTheme` is still `"dark"`.
- [ ] AC-DESIGN-A10-2 (cmd) `node scripts/check-dark-theme-only.mjs` passes, and `grep -n "data-aurora-theme" apps/docs/src/App.vue` returns nothing.
- [ ] AC-DESIGN-A10-3 (e2e) Given reduced motion, the theme switch applies with no cross-fade frames.
- [ ] AC-DESIGN-A10-4 (cmd) `themes/glass.css` and `themes/minimal.css` appear only in the `/visuals/stack` chunk's CSS, not in the entry.
- [ ] AC-DESIGN-A10-5 (e2e) axe on the preview passes for every theme option, including the Glass dark color-scheme.

### 5.2 Shared gates for every DESIGN item

**Rev 2 amendments:**
- The entry-budget rule below is replaced for DESIGN-A05 and A06 by the first-load request-log rule in §3A.6 v.
- From DESIGN-A02 on, `scripts/check-single-flux.mjs` is part of `npm run check:docs`; from DESIGN-A08 on, so is `scripts/check-aurora-shims.mjs`.
- axe runs include Aurora's open shadow roots.
- No item may import `@re-code/aurora/utilities.css` or `@re-code/aurora/loader`.
- No item may add a `file:`, `link:` or git specifier.

- [ ] **Docs gate** (`roadmap/README.md`): `npm run check:docs` and `npm run build --workspace=re-flux-docs` pass. Contract scripts whose literals change are updated in the same PR, and each such script is named in the PR. The likely ones are `check-home-experience.mjs`, `check-visual-lab*.mjs`, `check-playground-layout.mjs` and `check-ui-framework.mjs`.
- [ ] `npm run check:scss-tokens` passes.
- [ ] **Entry budget:**
  - Measure with `gzip -c apps/docs/dist/assets/index-*.js | wc -c` and `gzip -c apps/docs/dist/assets/index-*.css | wc -c` after the build.
  - Each figure must not exceed the pre-item value by more than **512 bytes**. The current baseline is 98 908 B JS and 81 157 B CSS from the 2026-11-22 dist; re-baseline when ENG-ICONS, ENG-FONTS or ENG-LOCALE land.
  - Any new route or lazy chunk states its gzip ceiling in the item and is measured the same way.
- [ ] Reduced motion: the DESIGN-002 smoke suite passes with `reducedMotion: 'reduce'` emulated, and no new scene schedules frames while reduced. Check this with the harness's RAF counter: no `requestAnimationFrame` call during the last 1 s on that route, measured on the **production build**.
- [ ] axe (DESIGN-002): **0 serious or critical violations** on the routes the item touches.
- [ ] Lighthouse is **descriptive, not gating**, consistent with the repo's benchmark philosophy. Record the mobile Performance and Accessibility scores for touched routes in the PR. Accessibility must be ≥ 95.
- [ ] Copy is only in `en.json` (`npm run check:locale-common` passes). There are no literal hex colours in new or changed `.vue` and `.ts` files (enforced from DESIGN-004 on).
- [ ] Manual checks: 320 px viewport, 200 % zoom, keyboard-only pass, and forced-colors emulation, as `guidelines/DESIGN_SYSTEM.md` requires.

In the criteria below, **(e2e)** means a Playwright check in the DESIGN-002 harness, **(unit)** a Jest test, **(inspect)** a file or build-output inspection and **(cmd)** a shell command.

---

### DESIGN-001 — Make the hero telemetry real; start on visibility; fix the hash anchor

| Category | Impact | Risk | Effort | Priority score | Phase | Depends on |
|---|---|---|---|---|---|---|
| Showcase / A11y | 4 | 4 | 1 | **40** | A | — (e2e criteria are verified once DESIGN-002 lands; the item may merge first with criteria 1, 6, 7 and 8 ticked) |

**Scope**
- `LandingTelemetryStage.vue`:
  - Observe `frameCoordinator.metrics$` only while the stage is visible. **Never** subscribe to `frames$`, so the stage cannot keep the clock alive (C1, Caveats).
  - Render real values: subscribers, pending read/write, work ms and frame Δ, the last two updated at 4 Hz.
  - Replace one decorative trace with a frame-Δ sparkline drawn through `bindSvgAttributes`.
  - Add a Pause button.
- `Home.vue`: replace the `hasScrolled` gate **for the telemetry stage only** with "visible and after the first idle callback". Below-the-fold components keep their gate (see Risks and §6 Q5).
- `Home.vue:304`: replace `href="#home-story"` with a `<button>` that scrolls the `#home-story` element ref into view, with `behavior` chosen by reduced motion.
- New locale keys for metric labels.

**Non-goals:** the dock (DESIGN-006), the governor (DESIGN-005) and visual redesign of the stage.

**Risks**
- Observing `metrics$` turns on timing; it is limited to visibility.
- **The first-scroll gate is a recorded decision, not an accident.** `scripts/check-home-experience.mjs:46` asserts that each landing component receives `:motion-enabled="hasScrolled"`, and `:49`, `:52`–`:54` assert the deferred setup. This item proposes changing that decision for the above-the-fold telemetry stage only. The new gate is "visible **and** after the first idle callback following load", which keeps LCP protected. Lines 46 and 49 of the contract must be updated in the same PR. If the owner rejects this (§6 Q5), DESIGN-001 ships without the gate change, and every other part still applies.
- The shader assertions (`:25`–`:37`) and `<LandingTelemetryStage` stay untouched.

**Acceptance criteria**
- [ ] AC-DESIGN-001-1 (inspect) Given `LandingTelemetryStage.vue`, when it is read, then it imports `frameCoordinator` from `@lib`, observes `metrics$` only inside a visibility-gated branch, does not reference `frames$`, and releases every subscription in `onBeforeUnmount`.
- [ ] AC-DESIGN-001-2 (e2e) Given Home is loaded without scrolling and another scene on the page is running (for example the hero shader), when 1 s passes, then the stage shows a numeric frame value matching `/\d+(\.\d)? ms/`. Given no other scene is running, then the stage shows the idle label and its subscriber count reads 0, which proves the stage does not hold the clock.
- [ ] AC-DESIGN-001-3 (e2e) Given the hero, when the "scroll to story" control is activated, then `location.hash` is unchanged, the route is still `/`, and `#home-story` is within the viewport.
- [ ] AC-DESIGN-001-4 (e2e) Given the stage is running, when its Pause button is pressed, then the button's accessible name becomes "Play …" and the displayed frame counter stops changing for 1 s.
- [ ] AC-DESIGN-001-5 (e2e) Given `reducedMotion: 'reduce'`, when Home loads, then the stage shows the static values and an explicit "Reduced motion" label, and no sparkline updates occur.
- [ ] AC-DESIGN-001-6 (cmd) `grep -n 'href="#' apps/docs/src/views/Home.vue` returns nothing.
- [ ] AC-DESIGN-001-7 (cmd) Home chunk gzip grows ≤ 2 KB; the entry is within the shared-gate tolerance.
- [ ] AC-DESIGN-001-8 (cmd) `npm run check:home-experience` passes, with lines 46 and 49 updated only if Q5 is accepted.

### DESIGN-002 — Docs e2e smoke plus axe harness

| Category | Impact | Risk | Effort | Priority score | Phase | Depends on |
|---|---|---|---|---|---|---|
| Testing | 3 | 4 | 2 | **28** | A | — |

**Rev 2:** adds the RAF-peak and single-coordinator checks (AC-5, AC-6) that the Aurora integration relies on.

**Scope**
- A Playwright script, `scripts/check-docs-e2e.mjs`, run as `npm run check:docs-e2e`. It reuses the existing `playwright` dev dependency, in the same style as `check-browser-integration.mjs`, and runs against `vite preview` of the built docs.
- Smoke path: `/` → `/visuals` → `/playground/spring` → `/docs/introduction` → `/docs/api-reference` → `/benchmarks`. On each route it checks that the h1 is visible, there are no console errors, and axe reports no serious or critical violations.
- Run it twice: with motion allowed, then with reduced motion emulated.
- **RAF counter instead of an app hook.**
  - `page.addInitScript` wraps `requestAnimationFrame` and `cancelAnimationFrame` before the app loads.
  - The wrapper records the timestamp of the last request and the number of outstanding callbacks.
  - After DESIGN-003, every frame goes through the shared coordinator, so "no RAF requested in the last 1 s and 0 outstanding" means the clock is idle.
  - This is measured on the **same production build** whose bundle sizes the gates check. The app ships no test hooks.
- Optional `data-*` attributes on scenes (`data-tier`, `data-agents`, `data-renders`) are part of the production markup. They are tiny and harmless, and they make tests read real state.

**New dev dependency:** `axe-core` (^4.10, MPL-2.0, dev-only, about 0.5 MB unpacked, injected into the page, never shipped). `@axe-core/playwright` is optional; plain `axe-core` injection avoids needing `@playwright/test`.

**Non-goals:** visual regression screenshots, CI gating on Lighthouse, and test-only code paths in the app.

**Risks:**
- Flakiness from timing-based checks. Use generous windows (≥ 1 s) and retry once.
- Headless Chromium RAF throttling. Run headed-equivalent with `--disable-renderer-backgrounding`.

**Acceptance criteria**
- [ ] AC-DESIGN-002-1 (cmd) `npm run check:docs-e2e` exits 0 on a clean build and prints one line per route and motion mode.
- [ ] AC-DESIGN-002-2 (cmd) The same script exits non-zero when run with `--self-test`. In that mode it injects an unlabeled `<button>` into the page before running axe, so no fixture route ships in the app.
- [ ] AC-DESIGN-002-3 (e2e) Given `/docs/introduction` (no live scene) with reduced motion, when 1 s passes after load, then the RAF counter reports 0 outstanding callbacks and no request in the last 1 s.
- [ ] AC-DESIGN-002-4 (inspect) `package.json` lists `axe-core` under `devDependencies` only, and `apps/docs/src` contains no reference to the test harness.
- [ ] AC-DESIGN-002-5 (cmd, rev 2, after DESIGN-A02) `check:docs-e2e` runs `scripts/check-single-flux.mjs` first and fails if it fails.
- [ ] AC-DESIGN-002-6 (e2e, rev 2) The RAF wrapper records **peak outstanding callbacks**, and every smoke route reports `peak ≤ 1` (one shared clock). The run also records the JS and CSS transfer totals for the first load of `/`, which the first-load budget rule in §3A.6 v uses.

### DESIGN-003 — Site motion source: `useMotionGate`, Pause-motion switch, no raw RAF

| Category | Impact | Risk | Effort | Priority score | Phase | Depends on |
|---|---|---|---|---|---|---|
| Architecture / A11y | 5 | 5 | 3 | **30** | A | DESIGN-002, DESIGN-A08 (switch shim) |

**Rev 2:** the header switch is `au-button aria-pressed` once AURORA-ACT-001 ships. Until then it is a native `<button aria-pressed>` with the `au-shim-button` class (DESIGN-A08). Scene controls use the `PlaybackControls` composition (§4.2). The entry-bundle rules for the switch are unchanged.

**Scope**
- `apps/docs/src/motion/siteMotion.ts` (lazy, never imported by `App.vue`): one `MotionPreferencesSource` for the app. It combines an inner `MotionPreferences` (OS plus page visibility) with the user override, read from `<html data-rx-motion>` and the `rx-motion-change` event that the entry-level `PageMotionSwitch` emits (§4.2 #10).
- `useMotionGate(elementRef, { rootMargin: '120px', threshold: 0.05 })`: returns `{ active, reducedMotion, visible, onScreen, preferences }` and a per-element `MotionPreferencesSource` that also folds in IntersectionObserver visibility. One threshold policy for the whole site.
- `PageMotionSwitch` in the header.
- `MotionStage` and `PlaybackControls` (§4.2).
- Migrate the five components listed in S3 onto the gate.
- Move `SteeringPanel.vue` and `kineticTypographyMotion.ts` from raw `requestAnimationFrame` onto `frameCoordinator.frames$`, and `VisualLabFeaturedStage`'s FPS onto `AnimationFrameTick.delta`.

**Non-goals:** a new engine API. That is ENGINE-B, filed separately if the docs-side gate proves general.

**Risks:** behaviour changes in demos during migration. Migrate one component per commit and run the playground lifecycle check after each (`npm run check:playground-lifecycle`, `npm run check:renderer-cleanup`).

**Acceptance criteria**
- [ ] AC-DESIGN-003-1 (cmd) `grep -rn "requestAnimationFrame(" apps/docs/src --include=*.vue --include=*.ts` returns no matches outside comments and locale strings.
- [ ] AC-DESIGN-003-2 (cmd) `grep -rln "matchMedia('(prefers-reduced-motion" apps/docs/src` lists only `motion/siteMotion.ts` (and `App.vue`'s skip-link scroll, if kept).
- [ ] AC-DESIGN-003-3 (unit) Given the site source with override "paused", when OS reduced motion is false and the page is visible, then `snapshot.reducedMotion === true`. Given the override is cleared, then it follows the OS value.
- [ ] AC-DESIGN-003-4 (e2e) Given any route with live motion, when the header "Pause motion" button is pressed, then the button has `aria-pressed="true"`, and from 500 ms after the press the RAF counter records no new request for 1 s. This means the scenes *and* the instrumentation (telemetry stage, governor, dock) have all stopped.
- [ ] AC-DESIGN-003-4b (cmd) After build, `grep -c "object unsubscribed" apps/docs/dist/assets/index-*.js` is still 0 (rxjs has not entered the entry through the switch), and the entry is within the shared-gate tolerance.
- [ ] AC-DESIGN-003-5 (e2e) Given motion is paused, when the page is reloaded, then the switch is still pressed and no scene runs.
- [ ] AC-DESIGN-003-6 (e2e) Given a `MotionStage` is scrolled fully off-screen, when 500 ms pass, then its status text reads "Paused · off-screen" and the frame counter stops.
- [ ] AC-DESIGN-003-7 (e2e) Given every `MotionStage` with `autoplay="visible"`, when it is inspected, then a button whose accessible name begins with "Pause" exists inside it (WCAG 2.2.2).
- [ ] AC-DESIGN-003-8 (cmd) `npm run check:playground-lifecycle`, `npm run check:renderer-cleanup` and `npm run check:visual-lab` pass.

### DESIGN-004 — Engine-mapped motion tokens, canvas palette, contrast floor

| Category | Impact | Risk | Effort | Priority score | Phase | Depends on |
|---|---|---|---|---|---|---|
| Design system | 3 | 3 | 2 | **24** | A | DESIGN-A04 |

**Rev 2: scope narrowed.** Semantic colours, the text floor, `prefers-contrast` and fonts moved to DESIGN-A04. This item keeps engine-twin easings, spring presets, telemetry, syntax and quality tokens, `readCanvasPalette()` and the hex-literal check. AC-4 moved to AC-DESIGN-A04-3.

**Scope:**
- Implement §4.1: motion tokens, `motion/tokens.ts` (easing twins built with `cubicBezier`, spring presets), telemetry, syntax, elevation and layer tokens, the text floor and `prefers-contrast`.
- Add `readCanvasPalette()`.
- Replace every literal hex in `.vue` and `.ts` under `apps/docs/src/components` and `views` with tokens or the palette helper.
- Extend `scripts/check-scss-tokens.mjs` (or add a sibling `check-hex-literals.mjs`) to flag `#[0-9a-f]{3,8}` in `.vue` `<template>`/`<script>` and in `.ts` under `apps/docs/src`, excluding `locales/` and an explicit allowlist for shader GLSL.
- Update `guidelines/DESIGN_SYSTEM.md` → Motion.

**Non-goals:** mass renaming of spacing and radius tokens (documented mapping only); a light theme.

**Risks:**
- Raising text alpha shifts the look of dense panels. Review screenshots of Home, Visual Lab and Docs in the PR.
- The new hex check may flag legitimate GLSL colour constants. Use an explicit allowlist that is reviewed in the PR.

**Acceptance criteria**
- [ ] AC-DESIGN-004-1 (unit) Given each `--rx-ease-*` token and its TS twin, when the token's cubic-bezier is sampled through `cubicBezier()` at t ∈ {0.1…0.9}, then every sample is within 0.02 of the named `Easings` entry. The CSS curves are the standard cubic-bezier approximations of the polynomial easings, so exact equality is not expected. The tolerance is recorded in the test.
- [ ] AC-DESIGN-004-2 (unit) Given `springPresets.standard`, when compared, then it deep-equals `{ stiffness: DEFAULT_SPRING_OPTIONS.stiffness, damping: DEFAULT_SPRING_OPTIONS.damping }`.
- [ ] AC-DESIGN-004-3 (cmd) The hex-literal check passes, and it fails when a hex literal is added to a fixture `.vue` file.
- ~~AC-DESIGN-004-4~~ (moved to AC-DESIGN-A04-3 in rev 2).
- [ ] AC-DESIGN-004-5 (inspect) `--rx-font-size-micro` and `--rx-font-size-code-label` resolve to ≥ 0.6875rem, or every remaining use of them sits on an `aria-hidden` ornament (list them in the PR).
- [ ] AC-DESIGN-004-6 (cmd) `node scripts/check-dark-theme-only.mjs` still passes (no light palette introduced).

### DESIGN-005 — Quality governor plus `QualityChip`

| Category | Impact | Risk | Effort | Priority score | Phase | Depends on |
|---|---|---|---|---|---|---|
| Showcase / Perf | 4 | 3 | 2 | **28** | A | DESIGN-003, DESIGN-A02, DESIGN-A08 |

**Rev 2:** the quality menu is the `QualityChip` composition: `au-button` + `RxShimPopover` (AURORA-OVL-001 later) + `au-radio-group`. It depends on DESIGN-A02 so that every animation, Aurora's included, runs on the measured clock.

**Scope:**
- `motion/qualityGovernor.ts` (C1 algorithm) exposing `tier$`, `reason$` and `override`.
- `QualityChip`.
- Wire the governor into `VisualLabFeaturedStage`: glyph trail length and bubble-chamber drift density per tier, with a DPR cap through `resizeCanvas({ pixelRatio })`.
- Wire it into the Home Lab canvas preview (particle `count` 34 → 20 → 12).
- Add a docs paragraph in Performance: "How this site adapts".

**Non-goals:** an engine API (ENGINE-C, after a release of docs-side use); adapting non-scene UI.

**Risks:**
- Tier oscillation; covered by AC-2.
- Visible quality drops on fast machines during devtools profiling. That is acceptable and the chip explains it.

**Acceptance criteria**
- [ ] AC-DESIGN-005-1 (unit) Given a synthetic `frames$` of 60 frames at 16.7 ms then 60 frames at 33 ms, when fed to the governor at tier 3, then it emits tier 2 after the 45th slow frame and not earlier.
- [ ] AC-DESIGN-005-2 (unit) Given 240 fast frames after a downgrade, then it upgrades exactly once. Given two down/up cycles, then it locks the lower tier and `reason$` reports "locked".
- [ ] AC-DESIGN-005-3 (unit) Given the source reports hidden, when frames with Δ = 2 000 ms arrive after visibility returns, then no downgrade occurs.
- [ ] AC-DESIGN-005-4 (e2e) Given CPU throttling ×6 (CDP `Emulation.setCPUThrottlingRate`) on `/visuals`, when 5 s pass, then the chip text shows a tier lower than at load and a polite status region contains the reduction message.
- [ ] AC-DESIGN-005-5 (e2e) Given the chip menu, when "Static" is chosen, then the featured stage shows its poster and the choice persists across reload.
- [ ] AC-DESIGN-005-6 (cmd) The governor is dynamically imported and lands in its own chunk. Check that `ls apps/docs/dist/assets | grep -i governor` lists exactly one JS file of ≤ 1.5 KB gzip, and that the governor's unique downgrade message key string does not appear in `index-*.js`. Minification removes identifiers, so the check uses a string literal or the filename, never a function name.

### DESIGN-006 — Telemetry Dock

| Category | Impact | Risk | Effort | Priority score | Phase | Depends on |
|---|---|---|---|---|---|---|
| Showcase | 4 | 2 | 3 | **18** | B | DESIGN-003, DESIGN-005, DESIGN-A08 |

**Rev 2:** the dock is built on `RxShimPopover` (AURORA-OVL-001 later). Icons come from DESIGN-A05, which replaces ENG-ICONS.

**Scope:**
- `TelemetryDock`, the header toggle, and `useMotionSource()` registration in each `MotionStage`.
- A sparkline with a text summary.
- A bottom sheet on mobile.

**Non-goals:** a per-phase split (C7 / ENGINE-A); persistence of dock state across sessions.

**Risks:**
- Popover API support gaps; use the `<dialog>` fallback.
- Source registry leaks; `useMotionSource` must unregister on unmount, covered by `check:renderer-cleanup`.

**Acceptance criteria**
- [ ] AC-DESIGN-006-1 (e2e) Given `/visuals`, when the dock is opened, then it lists ≥ 1 source whose primitive name matches a public export (e.g. `RetargetableMotion`).
- [ ] AC-DESIGN-006-2 (e2e) Given the dock is open, when Esc is pressed, then it closes and focus is on the toggle.
- [ ] AC-DESIGN-006-3 (e2e) Given the dock is open and every scene is paused via the header switch, when 1 s passes, then the dock's clock row reads "Idle", and the RAF counter records no new request, which proves the open dock does not keep the clock alive.
- [ ] AC-DESIGN-006-4 (cmd) The dock chunk is ≤ 8 KB gzip and is not referenced from the entry except through a dynamic import.
- [ ] AC-DESIGN-006-5 (e2e) Given the dock is open at a 320 px viewport, then there is no horizontal page overflow (`document.documentElement.scrollWidth <= 320`).

### DESIGN-007 — Playground IA: workbench first, compact module switcher

| Category | Impact | Risk | Effort | Priority score | Phase | Depends on |
|---|---|---|---|---|---|---|
| IA | 4 | 2 | 2 | **24** | B | DESIGN-002, DESIGN-A06 |

**Rev 2:** the switcher uses `RouterLink`s with the `au-shim-button` class (link mode, AURORA-ACT-001 later) and a native `<details>` disclosure. It depends on DESIGN-A06 for the grid and utilities.

**Scope.** `PlaygroundLayout.vue` changes from hero, active card, full index, then workbench, to the layout below:

```
┌ Playground / Spring physics  [◀ 05/12 ▶] [All modules ▾] ┐
│ one-line description                                       │
├────────────────────────────────────────────────────────────┤
│ WORKBENCH (controls · live preview · CodeBlock)            │
├────────────────────────────────────────────────────────────┤
│ Module index (12 links, 4 groups) — below the workbench    │
└────────────────────────────────────────────────────────────┘
```

- The "All modules" control is a disclosure (`<details>`, or a button with `aria-expanded`) containing the grouped links.
- Previous and next are `RouterLink`s.
- The `/playground` landing route keeps the full index at the top.
- Module switches use `flip()` on the switcher only.

**Non-goals:** redesigning individual module panels; renaming routes.

**Risks:**
- `check-playground-layout.mjs` literals change.
- Users who relied on the big index lose it at the top; the index stays on `/playground` and below the workbench.

**Acceptance criteria**
- [ ] AC-DESIGN-007-1 (e2e) Given `/playground/spring` at 1366×768, when loaded, then the top of the workbench region is within the first viewport (`getBoundingClientRect().top < innerHeight`).
- [ ] AC-DESIGN-007-2 (e2e) Given the switcher, when "next" is activated from module 12, then it is disabled or absent (no wrap), and from module 05 it navigates to module 06's route.
- [ ] AC-DESIGN-007-3 (e2e) Given the disclosure is opened with the keyboard, then all 12 module links are reachable by Tab, and the current one has `aria-current="page"`.
- [ ] AC-DESIGN-007-4 (cmd) `npm run check:playground-layout` is updated and passes.

### DESIGN-008 — The page is the timeline

| Category | Impact | Risk | Effort | Priority score | Phase | Depends on |
|---|---|---|---|---|---|---|
| Showcase / IA | 5 | 2 | 3 | **21** | B | DESIGN-003, DESIGN-004, DESIGN-A06, DOCS-004 (soft) |

**Rev 2:** `ChapterRail` buttons use `au-shim-button` with `aria-current` until AURORA-ACT-001 ships. It depends on DESIGN-A06.

**Scope:**
- Implement C3: one `Timeline` with four chapters bound through `createScrollTrigger({ timeline })`, the `ChapterRail`, and per-chapter posters.
- Merge the principle cards' message into the chapters, which removes the third telling of the pipeline (S6). Home becomes: hero → story timeline → lab rail → code workbench → closing.

**Non-goals:** a three.js chapter-04 object (that arrives with DESIGN-012); rewriting story copy beyond merging the principles.

**Risks:**
- `scripts/check-home-experience.mjs:20` asserts the section list `home-hero, home-story-runway, home-lab, home-principles, home-closing`. Removing `home-principles` changes that contract, and `:51` asserts the story trace CSS. Update both in the same PR, or retire them under DOCS-004.
- Sticky behaviour at 200 % zoom (see C3).

**Acceptance criteria**
- [ ] AC-DESIGN-008-1 (e2e) Given ≥ 800 px and motion allowed, when the runway is scrolled to 50 %, then the rail's `<progress>` value is within 0.45–0.55 and chapter 02 or 03 has `aria-current="step"`.
- [ ] AC-DESIGN-008-2 (e2e) Given the rail, when chapter 04 is activated, then `location.hash` is unchanged and chapter 04's heading is in the viewport.
- [ ] AC-DESIGN-008-3 (e2e) Given reduced motion, when Home loads, then no element in the runway has computed `position: sticky`, and each chapter renders its poster stage.
- [ ] AC-DESIGN-008-4 (e2e) Given a 375 px viewport, then each chapter's inline stage plays once on entering the viewport and there is no horizontal overflow.
- [ ] AC-DESIGN-008-5 (inspect) Home renders at most five top-level sections (`.home-page > section` count ≤ 5, plus the code-motion wrapper).
- [ ] AC-DESIGN-008-6 (cmd) Home chunk growth is ≤ 4 KB gzip; `check-home-experience.mjs` is updated (or retired under DOCS-004) and passes.

### DESIGN-009 — `CodeBlock` with tokenizer and scrubbable values

| Category | Impact | Risk | Effort | Priority score | Phase | Depends on |
|---|---|---|---|---|---|---|
| Showcase | 4 | 2 | 3 | **18** | B | DESIGN-004, DESIGN-A08 |

**Rev 2:** copy uses `useCopyFeedback()` with `au-button`. The easing picker is `RxShimPopover` + `au-radio-group`. Depends on DESIGN-A08.

**Scope:**
- `CodeBlock` and `CopyButton`.
- The tokenizer (`ts`, `bash`, `json`).
- Scrub bindings in `LandingCodeMotion` (spring mode) and in the Spring, Tween and Timeline playground modules. Snippets are generated from the same options object that drives the preview.

**Non-goals:** a free-form editor, executing user code, and build-time Shiki.

**Risks:**
- Tokenizer edge cases (template literals with `${}`); covered by the round-trip test in AC-1.
- Spinbuttons inside `<pre>` confuse some screen readers. Also expose a parameter list as ordinary labelled inputs in the module's control panel, which already exists.

**Acceptance criteria**
- [ ] AC-DESIGN-009-1 (unit) Given the tokenizer and each snippet currently in `LandingCodeMotion.vue`, when it is tokenized, then concatenating the token texts reproduces the input exactly.
- [ ] AC-DESIGN-009-2 (e2e) Given the spring snippet, when the `stiffness` spinbutton is focused and ArrowUp is pressed 10 times with Shift, then its `aria-valuenow` increases by 100 and the preview's "target" readout reflects a retarget without a reset to 0.
- [ ] AC-DESIGN-009-3 (e2e) Given scrubbed values, when Copy is pressed, then the clipboard text contains the scrubbed numbers (Chromium with clipboard permission granted).
- [ ] AC-DESIGN-009-4 (unit) Given a scrub binding with `min 20, max 600`, when a value of 900 is requested, then it clamps to 600.
- [ ] AC-DESIGN-009-5 (cmd) The tokenizer plus `CodeBlock` chunk is ≤ 5 KB gzip, and there is no new runtime dependency in `apps/docs/package.json`.

### DESIGN-010 — Motion Design Lab

| Category | Impact | Risk | Effort | Priority score | Phase | Depends on |
|---|---|---|---|---|---|---|
| Showcase | 4 | 1 | 3 | **15** | B | DESIGN-004, DESIGN-009, DESIGN-A08 |

**Rev 2:** the Curve/Spring tabs use `RxShimTabs` (AURORA-NAV-001 later). Ranges stay native until AURORA-FRM-002. Depends on DESIGN-A08.

**Scope:**
- Implement C5 under `/playground/easings` (route name kept) with Curve and Spring tabs.
- `ParamPad`.
- Exports: `cubicBezier(…)`, spring options, and CSS `linear()`.

**Non-goals:** custom easing *names* in the engine; saving presets server-side.

**Risks:**
- The `linear()` export can be long; cap it at 40 stops.
- Older browsers lack `linear()`; show a support note and fall back to the `cubicBezier` export.

**Acceptance criteria**
- [ ] AC-DESIGN-010-1 (unit) Given `{stiffness: 260, damping: 30}`, when exported to `linear()` with n = 40, then the string parses (via `CSS.supports('transition-timing-function', value)` in e2e) and its last stop is `1`.
- [ ] AC-DESIGN-010-2 (e2e) Given the ζ-pad, when the stiffness range input is changed with the keyboard, then the puck position and the ζ text both update.
- [ ] AC-DESIGN-010-3 (e2e) Given the bezier handle is focused, when ArrowRight is pressed, then the exported `cubicBezier(...)` x1 increases by the keyboard step.
- [ ] AC-DESIGN-010-4 (e2e) Given reduced motion, then previews show static start and end poses and no frames are scheduled.
- [ ] AC-DESIGN-010-5 (cmd) The route chunk is ≤ 10 KB gzip.

### DESIGN-011 — Hero render ladder, Tiers 0–2

| Category | Impact | Risk | Effort | Priority score | Phase | Depends on |
|---|---|---|---|---|---|---|
| Showcase / Perf | 4 | 2 | 3 | **18** | C | DESIGN-005, DESIGN-A02, ENG-FONTS (soft) |

**Rev 2:** depends on DESIGN-A02 (one clock for the governor). Its only Aurora parts are `au-button` and `au-badge` inside `MotionStage`.

**Scope:**
- The `HeroScene` controller choosing a tier from the governor.
- Tier 0 is an inline-SVG poster (the prerendered composition). Tier 1 is SVG with a spring.
- Tier 2 is a flow-field canvas: `createFlowField`, `followFlowField`, `stepSteeringAgent` and `bindCanvas`, perturbed by `pointerGestures$` velocity and `scrollProgress$`.
- Move the fluid shader to `/visuals/shaders` only.

**Non-goals:** Tier 3 (DESIGN-012); a new hero copy or layout.

**Risks:**
- `check-home-experience.mjs:25`–`:37` assert the idle-loaded hero shader (`scheduleHeroShader`, `v-if="!heroShaderRequested"`, "Fluid Noise shader"). Rewrite them for the ladder's equivalent guarantees: lazy, idle-loaded, static poster first, and hidden-tab deferral.
- Flow-field visual noise behind the h1. Keep agent alpha low and the text over a scrim; axe contrast still applies.

**Acceptance criteria**
- [ ] AC-DESIGN-011-1 (e2e) Given motion allowed and no override, when Home has been visible for 2 s, then exactly one hero renderer is active (the tier is read from `data-tier` on the stage) and it is ≥ 1.
- [ ] AC-DESIGN-011-2 (e2e) Given the override is "Static", then the hero shows the poster, and no `<canvas>` inside the hero has a non-zero bitmap size.
- [ ] AC-DESIGN-011-3 (e2e) Given ×6 CPU throttling, when 5 s pass, then the Tier 2 agent count (exposed on `data-agents`) is ≤ 300.
- [ ] AC-DESIGN-011-4 (inspect) The Tier 2 canvas uses `resizeCanvas` with an explicit `pixelRatio ≤ 1.5`.
- [ ] AC-DESIGN-011-5 (cmd) The Tier 1–2 chunk is ≤ 6 KB gzip, and the Home chunk does not grow by more than 1 KB (the controller only).
- [ ] AC-DESIGN-011-6 (cmd) Lighthouse mobile on `/` (descriptive): LCP element is the h1, and CLS ≤ 0.02. Both are recorded in the PR.

### DESIGN-012 — three.js Tier 3: `/visuals/three`, then Home promotion

| Category | Impact | Risk | Effort | Priority score | Phase | Depends on |
|---|---|---|---|---|---|---|
| Showcase | 5 | 1 | 4 | **12** | C | DESIGN-011 (incl. DESIGN-A02), Q6 decision |

**Rev 2:** inherits the DESIGN-A02 dependency through DESIGN-011. There is no other Aurora dependency.

**Scope**
1. **Step 1:** a new route `/visuals/three` ("Three adapter") with the C6 scene. It has `bindThreeObject` for the camera rig and kernel group, instanced rods updated in a coordinator write task, rendering on demand, a live streams overlay and a code panel.
2. **Step 2:** register Tier 3 in the Home ladder behind all the gates in C6.

**Dependency:** `three` (MIT, `^0.17x`), a dynamic import only.

**Non-goals:** an engine `bindThreeInstances` (candidate only); post-processing; loading models.

**Risks:**
- Chunk weight exceeds the ceiling; keep the scene Lab-only.
- `three` major or minor upgrades churn the API; pin the minor.
- Context loss on mobile GPUs; handle `webglcontextlost` by dropping to Tier 2.

**Acceptance criteria**
- [ ] AC-DESIGN-012-1 (cmd) After build, the chunk containing three is ≤ 170 KB gzip, and `grep -l "WebGLRenderer" apps/docs/dist/assets/index-*.js` returns nothing (three is not in the entry).
- [ ] AC-DESIGN-012-2 (e2e) Given reduced motion, or override ≤ 2, or no WebGL2, when Home and `/visuals/three` load, then no request for the three chunk is made (Playwright request log), and the Tier ≤ 2 fallback is shown.
- [ ] AC-DESIGN-012-3 (e2e) Given `/visuals/three` with no pointer input for 2 s after the intro timeline completes, then the scene's render counter (exposed on `data-renders`) stops increasing (render on demand).
- [ ] AC-DESIGN-012-4 (e2e) Given the route is left for a route without live scenes, then within 1 s the RAF counter shows 0 outstanding callbacks, and the scene's `<canvas>` is removed from the DOM. Before removal, the scene calls `renderer.dispose()` and `forceContextLoss()`; check that with a unit test of the scene's dispose function, using a mock renderer.
- [ ] AC-DESIGN-012-5 (e2e) Given the stage is focused, when arrow keys are pressed, then the rig's yaw readout in the overlay changes. The Pause button stops all rendering.
- [ ] AC-DESIGN-012-6 (cmd) Home promotion only: Lighthouse mobile (descriptive) LCP and TBT on `/` are within +5 % of the DESIGN-011 recording, documented in the PR. Otherwise Tier 3 stays Lab-only.

### DESIGN-013 — Command palette

| Category | Impact | Risk | Effort | Priority score | Phase | Depends on |
|---|---|---|---|---|---|---|
| IA / Findability | 4 | 2 | 3 | **18** | C | ENG-META, ENG-LOCALE, DESIGN-002, DESIGN-A06, Aurora release containing `au-dialog` — **BLOCKED** |

**Rev 2: BLOCKED** until an Aurora release (beta or later) contains `au-dialog`. That component is uncommitted work in progress in the Aurora repository, and the plan deliberately adds no native-`<dialog>` shim (§3A.5). It is built on `au-dialog` + `au-input type="search"` plus a docs-owned listbox. C10 choreography follows in DESIGN-A09. It also depends on DESIGN-A06.

**Scope:**
- Implement C8: `CommandPalette`, a build-time index generator (`scripts/build-search-index.mjs` emitting a JSON asset), actions, and FLIP results.
- The API reference accepts a preselected entry from the palette through router state, not a hash.

**Non-goals:** full-text article search (Q3); search analytics.

**Risks:**
- Index drift from the API entries; generate it in the build from the same source, never by hand.
- Shortcut conflicts (see C8).

**Acceptance criteria**
- [ ] AC-DESIGN-013-1 (e2e) Given any route, when Ctrl+K (or Meta+K on macOS) is pressed, then a dialog with a focused combobox opens. Esc closes it and focus returns to the previously focused element.
- [ ] AC-DESIGN-013-2 (e2e) Given the query `retarget`, then the first option is the `RetargetableMotion` API entry (exact or prefix name beats a description match), and the count region announces the number of results.
- [ ] AC-DESIGN-013-3 (e2e) Given a text input is focused, when `/` is typed, then the palette does not open.
- [ ] AC-DESIGN-013-4 (e2e) Given the action "Pause all motion", when chosen, then the header switch becomes pressed.
- [ ] AC-DESIGN-013-5 (cmd) The palette UI is ≤ 6 KB gzip and the index ≤ 15 KB gzip, both lazy. The entry grows ≤ 0.3 KB gzip.

### DESIGN-014 — Route and layout transitions

| Category | Impact | Risk | Effort | Priority score | Phase | Depends on |
|---|---|---|---|---|---|---|
| Polish | 2 | 1 | 3 | **9** | C | DESIGN-004, DESIGN-007 |

**Rev 2:** unchanged in substance. The brand-mark morph animates docs-owned SVG, not `au-icon`.

**Scope:**
- View Transitions on router navigation (feature-detected).
- A brand-mark morph via `bindSvgPathMorph`.
- `flip()` on the Visual Lab filter grid and the Playground switcher.

**Non-goals:** cross-route shared-element FLIP (needs ENGINE-D).

**Risks:**
- View Transitions interplay with the sticky header.
- Double animation when a route also runs its own entrance; route entrances are disabled while a view transition runs.

**Acceptance criteria**
- [ ] AC-DESIGN-014-1 (e2e) Given reduced motion, when navigating Home → Docs, then `document.startViewTransition` is not called (spy) and the route swaps immediately.
- [ ] AC-DESIGN-014-2 (e2e) Given navigation, then focus lands on `#main-content` exactly as today.
- [ ] AC-DESIGN-014-3 (e2e) Given a browser without View Transitions (spy removed), navigation still works and only the brand morph runs.
- [ ] AC-DESIGN-014-4 (cmd) ≤ 3 KB gzip lazy; the entry is within tolerance.

### DESIGN-015 — Frame X-ray

| Category | Impact | Risk | Effort | Priority score | Phase | Depends on |
|---|---|---|---|---|---|---|
| Showcase | 4 | 1 | 3 | **15** | C | ENGINE-A, DESIGN-006 |

**Scope:**
- Implement C7 in Playground → Frames and Docs → Performance: a waterfall, a table alternative, and a stress control reusing the Benchmark Lab workloads.
- **No comparison-library numbers.** BENCH-009 owns that decision.

**Non-goals:** a profiler for user code; exporting traces.

**Risks:**
- ENGINE-A slips. Ship the totals-only version and label it so.
- The stress control freezes low-end devices. The ceiling is tied to the governor tier.

**Acceptance criteria**
- [ ] AC-DESIGN-015-1 (e2e) Given the X-ray, when "Show as table" is toggled, then a `<table>` with read, consumer and write columns for ≥ 30 frames is present.
- [ ] AC-DESIGN-015-2 (e2e) Given stress = 1 000 animations, then the displayed "RAF callbacks" value remains 1.
- [ ] AC-DESIGN-015-3 (e2e) Given reduced motion, then the chart updates at most once per second.
- [ ] AC-DESIGN-015-4 (cmd) The chunk is ≤ 6 KB gzip.

### 5.3 Phase summary (rev 2)

- **Phase 0, integration prerequisites.**
  - **No Aurora needed, can start now:** DESIGN-A07 (Basics).
  - **External gate:** DESIGN-A01 (needs AURORA-PKG-001).
  - **After A01:** A02 (one Flux), A03 (Vue glue), A04 (theme), A05 (icons), A08 (shims).
  - **New dependencies:** `@re-code/aurora` (exact beta pin) and `@re-code/basics` (`~0.1.0`).
- **Phase A, foundations.** DESIGN-001…005 and A06. DESIGN-001 and 002 run in parallel with Phase 0, because they need no Aurora. A06, the largest item, migrates route by route.
- **Phase B, signature experiences.** DESIGN-006…010, shim-backed where Aurora is missing.
- **Phase C, big bets and integration showcase.** DESIGN-011…015, A09 and A10.
  - **Blocked** on an Aurora release containing `au-dialog`: DESIGN-013, and A09 through it.
  - `three` remains the only new heavy runtime dependency (Lab-first).

### 5.4 Proposed engine items (separate; would be filed as `API-00x`)

| ID | Capability | Why | Constraint |
|---|---|---|---|
| ENGINE-A | Opt-in per-phase timings in `FrameCoordinatorMetrics` (`lastReadMs`, `lastConsumerMs`, `lastWriteMs`) | C7 Frame X-ray; a better governor signal | Measure only while `metrics$` is observed (as `workStartedAt` is today). It must preserve the PERF-007 phase semantics and add no allocation per frame. Needs the Performance gate. |
| ENGINE-B | `observeElementMotion(element, preferences)` → `MotionPreferencesSource` whose `visible` also reflects on-screen state (IntersectionObserver) | Removes the per-component boilerplate found in S3 for library users too | Tree-shakable and DOM adapter only. Upstream it after DESIGN-003 proves the shape. |
| ENGINE-C | `frameBudget$()` / quality-signal operator (calibrated interval, EWMA, hysteresis) | Upstream of the docs governor (C1); a credible library feature: "adapt quality to measured cadence" | File only after one release of docs-side use; it must have unit tests for oscillation. |
| ENGINE-D | Split FLIP: `flipCapture(targets)` → `{ play(options) }` | Cross-async layout and route shared elements (C9) | Additive; `flip()` stays as is. |

---

## 6. Open questions for the owner (rev 2)

Each question has a recommended default, so work can start without an answer.

**1. How is Aurora delivered?**
- **Default:** the Aurora owner publishes `@re-code/aurora@0.1.0-beta.0` to npm under the `beta` dist-tag (AURORA-PKG-001), after Aurora's Phase 6 tarball and consumer checks. The docs pin it exactly (DESIGN-A01).
- This needs an explicit decision, because Aurora's roadmap currently says no npm publish is part of the current work.
- **Fallback:** a GitHub Release tarball URL (§3A.6 ii, option C). Never `file:` or `link:`.

**2. Who requests and implements the missing Aurora pieces, and in what order?**
- **Default:** the owner files the §3A.4 items as requests in `re-aurora`. They are implemented there under Aurora's process: admission criteria, one roadmap step per session, definition of done. The docs team does not implement Aurora components; it ships the ≤ 4 shims meanwhile (DESIGN-A08).
- **Recommended order:**
  1. PKG-001 and PKG-002 (delivery, optional-peer Flux);
  2. ACT-001 (`au-button` ARIA state and link mode: a small change to an existing component that unblocks the most call sites);
  3. NAV-001 (`au-tabs`, already Aurora Step 5);
  4. OVL-001 (`au-popover`/`au-tooltip`, already Aurora Step 4, next to `au-dialog`);
  5. ICON-001 (icon cost);
  6. then FRM-001, FRM-002, NAV-002 (evaluation), OVL-002, SSR-001, FLX-001 and DOC-001.
- **Note:** Aurora's own rollout puts Step 4 (overlays) before Step 5 (tabs). The docs would benefit from tabs first, but the order is Aurora's call, and shims make either order workable.

**3. A site-wide theme switcher (Aurora default, dark, glass, minimal), or dark-only?**
- **Default: keep the shell dark-only.** It is a recorded product decision enforced by `check-dark-theme-only.mjs`.
- Ship the Aurora theme switcher **only as a scoped preview inside the integration lab** (C12, DESIGN-A10), plus `prefers-contrast: more` and forced-colors support in the shell.
- A shell-wide switcher would retire that script as its own item, with a full contrast audit of every canvas and visualization palette.

**4. Should Aurora be wrapped in Vue components?**
- **Default: no.** Use raw `au-*` tags plus a thin glue layer (registration, the `vAuModel` directive, generated types).
- This matches Aurora's "No Vue/React/Angular wrappers" rule and keeps swaps mechanical.
- Revisit only if AURORA-DOC-001 is rejected and template type-checking proves insufficient.

**5. May the above-the-fold telemetry stage start without the first-scroll gate?**
- `check-home-experience.mjs:46` records the gate as a deliberate decision.
- **Default: yes, for the telemetry stage only.** It starts when visible and after the first idle callback, and it observes `metrics$` only, so it adds no frame work of its own.
- Every below-the-fold component keeps the gate until DESIGN-005 can throttle it.

**6. three.js, or a lighter `ThreeObjectLike`-compatible library, for Tier 3?**
- **Default: three.js.** The adapter is named for it, and users will reach for it.
- It is capped at 170 KB gzip in a lazy chunk, ships on `/visuals/three` first, and is promoted to Home only if AC-DESIGN-012-6 passes.
- Whether OGL's transforms satisfy `ThreeObjectLike` is unverified and worth a 1-hour spike.

**7. How strictly does "utility functions come from Basics" apply?**
- **Default:**
  - No hand-rolled utility helpers: path access, object mapping, grouping, debounce, statistics, string casing and truncation all come from Basics subpaths.
  - Platform built-ins on plain arrays (`Array.prototype.map/filter/find/flatMap`) remain allowed.
  - Animation math in demo code uses the **engine's** public `clamp`/`lerp`, because those demos teach Flux, and Basics' `clamp` throws on reversed bounds.
- If the owner prefers a literal reading (Basics `map`/`filter` everywhere), add an ESLint `no-restricted-syntax` rule in a CHORE item, and expect no bundle benefit.

**8. Header "Pause motion" switch: keep and persist it?**
- **Default: yes.** It is persisted in `localStorage`, initialised from the OS preference, and implemented as a pressed `au-button` (ACT-001; shim meanwhile) that feeds the site `MotionPreferencesSource`.
- It closes the WCAG 2.2.2 gap in one place, and it is itself a showcase.

Questions that rev 1 asked and that are now settled by a stated default:
- **Command palette scope:** routes, docs sections, API entries and actions; no full-text search until `ENG-LOCALE` (C8).
- **Upstreaming the governor and element-visibility source to the engine:** prove them docs-side for one release first (§5.4).
