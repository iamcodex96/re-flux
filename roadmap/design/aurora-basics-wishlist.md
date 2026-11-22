# Wishlist: what `@re-code/aurora` and `@re-code/basics` should have before the re;Flux frontend is rebuilt

Back to the [roadmap](../../roadmap.md) · companion to the [frontend design proposal](./frontend-design-proposal.md) and to [`basics-candidates.md`](../basics-candidates.md) (the flux-library side of Basics).

**Premise (owner decision):** finish the two sibling libraries first, then build the frontend from them. Atomic and molecular UI comes from Aurora; generic functions (`get`, `map`, …) come from Basics. Both libraries are built on demand, so this is a **requested list**, not a commitment: each entry must still pass the target repository's own admission process (Aurora: `docs/COMPONENT_CATALOG.md` admission criteria and one step per session; Basics: contract paragraph before implementation, Lodash-contract naming, ≥95% coverage per module). Nothing here is implemented.

**Status (2026-11-23):** recorded as unchecked requests in the sibling roadmaps: Aurora `docs/ROADMAP.md` (Steps 3-8 and Phase 6) and Basics `docs/roadmap.md` (Phase 9). Both edits are uncommitted in those repositories. Adjusted to their own rules while recording: Aurora already planned `au-popover`, `au-tooltip`, `au-toast`, `au-tabs` and `au-link` and keeps `au-table` and the combobox under "Not now" (the evidence is attached, the verdict stays with Aurora); in Basics `memoize` stays deferred, the random utilities carry the injectable-source condition, and everything that comes from `re;Flux` is listed under its Phase 8 rules (separate explicit approval) instead of as a request to migrate.

**Evidence base** (grep over `apps/docs/src` at `98c1bd6`, plus the flux library and its benchmarks): the docs app uses its home-grown `Ui*` primitives 400+ times; hand-builds 33 `IntersectionObserver`, 37 `ResizeObserver` and 9 `matchMedia` sites; has about 8 separate copy-to-clipboard handlers (11 `navigator.clipboard` calls); 23 hand-written live regions (`aria-live` / `role="status"`); 72 `Math.min(Math.max(…))` clamps and ~12 inline lerps; hand-rolled `get`, `percentile`, `median`, `wrap`, `formatMs`, `seededRandom`; and `BrowserBenchmarks.vue` alone has 30 inline array pipelines. Aurora today ships 15 components and an **empty `navigation` domain**.

Legend: **P0** = the frontend cannot start without it; **P1** = needed by a concrete design concept or removes a clear duplicate; **P2** = useful, defer until a second consumer exists. "Evidence" is the number that justifies the request (Aurora's rule: recurring need, no composition alternative, distinct contract).

---

## Part A. Aurora

### A.0 Already there: adopt, do not request

`au-button`, `au-input`, `au-textarea`, `au-checkbox`, `au-switch`, `au-radio-group`/`au-radio`, `au-select`, `au-label`, `au-card`, `au-badge`, `au-alert`, `au-container`, `au-dialog`, `au-icon` (Lucide, lazy). Known gaps to close in these (small requests, not new components):

| Component | Gap | Why the docs need it |
|---|---|---|
| `au-card` | A documented "interactive/link card" pattern (whole card is one link, correct focus ring and one accessible name). | Experiment cards, module index tiles (30 `UiCard`). |
| `au-badge` | Optional `removable`/`selected`: either a separate `au-chip` (preferred, see A.1) or an explicit "use `au-chip`" note. | 33 `UiChip` uses; filter pills in the API reference. |
| `au-icon` | A checked Lucide mapping for the ~70 `mdi-*` names the docs use (top ones: play 12, pause 9, check 8, stop 7, copy 7, restart 6, refresh 6, replay 4, code-braces 4). | Replaces the 418 KB MDI stylesheet and 3.5 MB of font files. |
| `au-dialog` | Documented mobile/drawer presentation or a sibling `au-drawer` (A.1). | Mobile navigation, playground side panels. |
| All | Custom Elements Manifest + Vue-friendly type metadata (Volar custom data or `web-types`). | `.vue` templates need typed `au-*` tags. |

### A.1 Components to add

| # | Component (domain) | Priority | Evidence / why it cannot be composed | Contract sketch |
|---|---|---|---|---|
| 1 | **`au-tabs` / `au-tab` / `au-tab-panel`** (navigation) | **P0** | Install snippets (pnpm/npm/yarn/bun), playground modules, docs sections; today faked with `aria-pressed` buttons (7) and one hand-made `role="tablist"`. Already planned in Aurora's docs (reuses `roving-focus`). | WAI-ARIA tabs: roving focus, arrow/Home/End, automatic vs manual activation, `selected` value, `au-tab-change` event, lazy panels, indicator slot so the active-tab pill can be animated by Flux. |
| 2 | **`au-navbar`** (+ `au-nav-link`) (navigation) | **P0** | Site header with brand, links, actions, responsive collapse (App.vue). | `<nav>` landmark, brand/links/actions slots, `current` handling (`aria-current`), collapse breakpoint, menu button owned by the component, `au-navbar-toggle` event, sticky option. |
| 3 | **`au-sidebar-nav`** (or `au-nav` + `au-nav-group`) (navigation) | **P0** | Docs sidebar with sections, active item, collapsible groups; also the playground module list. | Nested list with disclosure groups, `aria-current`, optional scroll-into-view of the active item, works as drawer content on mobile. |
| 4 | **`au-breadcrumb`** (navigation) | P0 | Docs "Core Architecture › Introduction". Listed in Aurora's own catalogue examples. | `<nav aria-label>` + ordered list, last item `aria-current="page"`, separator via CSS. |
| 5 | **`au-tooltip`** + **`au-popover`** (overlays) | **P0** | Icon-only buttons (GitHub, copy, play/pause) currently rely on `title`; Telemetry Dock and command palette in the design proposal need the Popover API. | Popover API where available, positioning with CSS anchor positioning + fallback, hover/focus/escape/long-press, `aria-describedby`; popover is non-modal and focus-aware. |
| 6 | **`au-toast`** (+ toast region) (feedback) | **P0** | "Copied!" feedback is reimplemented per handler (about 8) with 23 hand-built live regions. | Queue, stacking, `polite`/`assertive`, auto-dismiss with pause on hover/focus, reduced-motion safe, one live region per region, imperative `toast.show()` plus declarative. |
| 7 | **`au-code-block`** (+ internal copy button) (data-display) | **P0** | The product is a library: every page has code. 69 `<code>`/`<pre>` sites, 8 copy handlers, tabbed install commands. | `<pre><code>` with language label, copy button with live-region status, optional line numbers/highlighted lines, horizontal scroll with keyboard focus, **pluggable highlighter** (tokenizer injected, never bundled by default), tabs slot for variants. |
| 8 | **`au-divider`**, **`au-avatar`** (layout / data-display) | P0 (cheap) | 25 and 24 current uses. | Divider: `<hr>`/`role="separator"`, orientation, inset, label. Avatar: image/initials/icon fallback, sizes, group, decorative vs named. |
| 9 | **`au-chip`** (data-display) | P0 | 33 uses; some filterable/removable. | Static, selectable (`aria-pressed`) or removable variants; removal button has its own name; keyboard delete. |
| 10 | **`au-accordion`** (+ item) (data-display) | P0 | 5 `UiExpansionPanel` uses; FAQs and API sections. | Prefer native `<details name>` semantics where possible, single/multiple mode, animated height as a Flux-driven option behind reduced-motion. |
| 11 | **`au-segmented-control`** (or `au-toggle-group`) (forms) | **P0** | `UiButtonToggle` + 7 `aria-pressed` groups: scenario/render-target/engine pickers. | Single/multi select, radio-group or toggle semantics chosen by prop, roving focus, form-associated when single. |
| 12 | **`au-slider`** (forms) | **P0** | 8 native `type="range"` parameter controls with hand-made value readouts (spring stiffness, damping, easing curves, scroll progress); the playground is built around them. | Form-associated native `<input type="range">`, value text, min/max/step, optional marks, `input`/`change`, vertical, dual-thumb deferred. |
| 13 | **`au-progress`** + **`au-spinner`** (feedback) | P1 | 3 `UiProgressLinear`; benchmark run state, lazy chunks. Aurora deferred them in Step 3; the revisit trigger now exists. | Determinate/indeterminate `role="progressbar"`, reduced-motion fallback, label. |
| 14 | **`au-table`** (data-display) | P1 | 5 `UiTable`; benchmark results and API reference tables. | Semantic `<table>` styling, sortable headers (`aria-sort`), sticky header, responsive overflow wrapper; **no virtualization**. |
| 15 | **`au-list`** / **`au-list-item`** (data-display) | P1 | 3 current uses; module index, metric lists. | Semantic list, leading/trailing slots, interactive variant. |
| 16 | **`au-menu`** (+ item) (actions/overlays) | P1 | Overflow menus, theme switcher, language, per-demo actions. | Menu button pattern (`role="menu"`), typeahead, Escape/arrow handling, built on `au-popover`. |
| 17 | **`au-combobox`** + listbox (forms) | P1 | API reference search/filters; command palette (DESIGN-013). | ARIA 1.2 combobox, async options, highlighted match, announcements. |
| 18 | **`au-drawer`** (overlays) | P1 | Mobile navigation and side panels. | Modal/non-modal, side, focus trap, scroll lock, shares `au-dialog` internals. |
| 19 | **`au-stat`** (data-display) | P1 | Telemetry/metric tiles ("FPS sample", "Canvas draw time", benchmark KPIs) are everywhere and repeated by hand. Listed as "statistic" in Aurora's catalogue. | Label + value + delta/trend slot, tabular numerals, live-region optional, unit. |
| 20 | **`au-toc`** (scroll-spy "On this page") (navigation) | P1 | Long docs pages have no in-page navigation. | List of anchors, active heading via `IntersectionObserver`, `aria-current="location"`. |
| 21 | **`au-kbd`**, **`au-link`** (data-display / actions) | P1 | Shortcut hints (command palette), external links with `rel` and an icon (GitHub etc.). | Kbd: semantic `<kbd>` styling. Link: external indicator and sr-only text, router-agnostic (`href` or slotted). |
| 22 | **`au-skeleton`** (feedback) | P2 | Lazy routes and Visual Lab stages. | Reduced-motion safe shimmer, `aria-busy` guidance. |
| 23 | **`au-splitter`** (layout) | P2 | Playground workbench (controls vs preview). | Keyboard-resizable separator (`role="separator"` + `aria-valuenow`), persisted size hook. |
| 24 | **`au-number-input`**, **`au-field`** (forms) | P2 | 3 numeric inputs; a field wrapper (label, hint, error) reused by every form. | Form-associated stepper; field = label + control + description + error wiring. |
| 25 | **`au-theme-provider`** / theme switcher (foundations/actions) | P2 (blocked on the dark-only decision) | Live re-theming showcase. | Sets theme attribute, persists preference, honors `prefers-color-scheme`/`prefers-contrast`. |
| 26 | **`au-pagination`**, **`au-empty-state`** | P2 | Not needed by the current site. Keep off the list until a page needs them. | n/a |

### A.2 Cross-cutting capabilities (foundations, not components)

| # | Capability | Priority | Evidence | Notes |
|---|---|---|---|---|
| F1 | **Observation controllers**: `observeVisibility`, `observeSize`, `matchMedia` as small subscribe-based helpers with automatic cleanup | **P0** | 33 + 37 + 9 hand-written sites in the docs app; Aurora's catalogue already says to extract visibility observation "when multiple real consumers justify it": they do. | Framework-agnostic; should cooperate with Flux's `MotionPreferences` (visibility) instead of duplicating it. |
| F2 | **Live-region announcer** service (polite/assertive queue shared by toast, alert, copy button, combobox) | **P0** | 23 hand-built live regions. | One region per document, de-duplication, test utility. |
| F3 | **Clipboard service** (`copyText` with permission/fallback and result event) | **P0** | 8 handlers, 11 API calls, inconsistent failure handling. | Consumed by `au-code-block`, `au-copy-button`. |
| F4 | **Focus management** (trap, restore, `inert` helpers) shared by dialog/drawer/popover | P1 | Already partly internal. | Publish as a foundation only once two components use it. |
| F5 | **Flux motion bridge for components**: tab-indicator spring, dialog/drawer choreography, accordion height, toast enter/exit, all behind `createFluxAnimation()` and reduced motion | P1 | The site is meant to show Flux driving real UI; Aurora already has the lazy bridge. | CSS stays for simple hover/colour transitions (Aurora's own rule). |
| F6 | **Single-engine guarantee**: Aurora must not bundle or resolve a second copy of `@re-code/flux` when used next to it | **P0** | The docs app resolves flux from source via aliases while Aurora pins `0.5.0-beta.0`: two `FrameCoordinator` singletons means two clocks and invisible animations for any governor/telemetry. | Make `@re-code/flux` a peer dependency (optional) or document the aliasing; add a runtime check. |
| F7 | **Prerender/hydration story** (Stencil hydrate or declarative shadow DOM) | P1 | The docs plan history mode with prerendered pages. | Needed before static HTML for docs routes can include Aurora markup. |
| F8 | **Published beta on npm** | **P0** | Aurora is unpublished; this repo forbids committing `file:`/`link:`. | Prerequisite for everything above. |
| F9 | **Token coverage for the missing semantics**: `--aurora-color-info` (already on its roadmap), a "code" surface/typography token set, a mono font token, elevation/focus-ring tokens | P1 | `au-code-block`, `au-stat`, telemetry panels. | Brand theme for re;Flux is a docs-owned override layered on Aurora tokens. |

**P0 total for Aurora:** 12 components (tabs, navbar, sidebar nav, breadcrumb, tooltip + popover, toast, code block, divider + avatar, chip, accordion, segmented control, slider), plus F1, F2, F3, F6, F8.

---

## Part B. Basics

### B.0 Already there: adopt in the docs app (no new work)

`get` (replaces `getPath` in `apps/docs/src/stores/app.ts`), `map`, `mapValues`, `mapKeys`, `filter`, `find`, `groupBy`, `keyBy`, `countBy`, `partition`, `reduce`, `uniqBy`, `flatten`, `zip`, `chunk`, `debounce`, `throttle`, `once`, `clamp` (replaces **72** inline `Math.min(Math.max(…))`), `lerp` (~12 inline), `roundTo`, `mean`, `median`, `sum`, `inRange`, `truncate`, `kebabCase`, `capitalize`, `isPlainObject`, `pick`, `omit`, `defaults`, `sanitize/html|text|url`. Note Basics' `clamp` throws if `min > max`; adopt only where bounds are ordered.

### B.1 Functions to add

Names follow Basics' rule: Lodash-equivalent utilities use the Lodash name and contract (differential tests); Basics-native ones need a one-paragraph contract first. The three flux names that collide with unrelated Lodash functions are renamed.

| # | Function (domain) | Priority | Lodash? | Evidence | Contract notes |
|---|---|---|---|---|---|
| 1 | `sortBy` / `orderBy` (collection) | **P0** | yes | Basics has **no sorting at all**; 30 array pipelines in `BrowserBenchmarks.vue`, API reference ordering. | Stable, iteratee/path shorthand, `orderBy` with directions. |
| 2 | `minBy` / `maxBy` / `sumBy` (collection) (+ `min`/`max`) | **P0** | yes | Benchmark stats, metric panels. | Empty input returns `undefined` (min/max) or `0` (sumBy), as Lodash. |
| 3 | `percentile` (number) | **P0** | no | Two copies already (`benchmarks/benchmark-utils.mjs`, `BrowserBenchmarks.vue`) with different empty-input results. | Pick one: `NaN` on empty, matching Basics' `mean`/`median`; interpolation rule written down. |
| 4 | `standardDeviation`, `coefficientOfVariation` (number) | **P0** | no | BENCH-007 needed CV and wrote it locally; the Benchmark Lab shows variability. | Population vs sample flag, `NaN` on empty. |
| 5 | `formatNumber`, `formatBytes`, `formatDuration` (+ `formatPercent`) (string/number) | **P0** | no | `formatMs`, three `formatNumber` copies in flux, every benchmark label, telemetry stats. | `Intl`-based, locale and fraction digits explicit; one rounding rule (the flux `formatNumber` has `-0` handling; keep that behaviour in a separate `formatDecimal`). |
| 6 | `interpolate` / `template` string substitution (`{name}`, `{count}`) (string) | **P0** | `template` is Lodash but different (ERB-like) | The 3,380-line `en.json` locale needs parameterised copy and plural forms; today there is none. | Name it `format`/`interpolate`, **not** `template`; `Intl.PluralRules` helper `plural(count, forms)`. |
| 7 | `dedent` / `stripIndent` (string) | P1 | no | Many multi-line code snippets stored in locale JSON. | Removes common leading indentation, keeps relative indentation, normalises line endings. |
| 8 | `slugify` (string) | P1 | no (`kebabCase` differs) | Heading anchors and TOC ids (`au-toc`, docs routes). | Unicode/diacritics folded, stable, collision helper separate. |
| 9 | `createSeededRandom(seed)` (+ `shuffle`, `sample` seeded) (number/collection) | **P0** | `shuffle`/`sample` yes; PRNG no | `seededRandom` in the docs, mulberry32 copied into several flux tests, benchmark data generation, `sample`/`random` consts in demos. | Deterministic, small state, documented algorithm (mulberry32), `shuffle`/`sample` accept a source. |
| 10 | `wrapRange` (number) | P1 | no (`wrap` is unrelated in Lodash) | Docs `wrap`/`wrappedX/Y`, flux `wrap`. Candidate A1. | `[min, max)`; throws on non-finite or equal bounds. |
| 11 | `mapRange` / `inverseLerp` (+ `interpolateRange`) (number) | P1 | no | Docs `normalize*`, flux `mapRange`, `interpolateRange`. Candidates A2/B1. | Degenerate input range returns `outMin`; optional clamp. |
| 12 | `snap` (number) | P1 | no | Flux candidate A3 (nearest multiple or nearest list entry). | Throws on non-positive interval or empty list. |
| 13 | `randomBetween(min, max, source)` (number) | P1 | no (`random` differs) | Flux candidate A4. | Injectable source for tests. |
| 14 | `range` / `times` (array) | P1 | yes | Docs `range` const, grid/sample generation. | Lodash `range` contract (step, negative). |
| 15 | `rotate` (array) | P2 | no | Benchmark `rotateOrder` (order-bias control). | Returns a new array rotated by `n`. |
| 16 | `memoize` / `memoizeLast` (function) | P1 | `memoize` yes | Parsers and colour/templates that re-run per frame; locale lookups. | Lodash `memoize` contract (key resolver, `.cache`); a single-argument, last-value variant is Basics-native. |
| 17 | `flow` (function) | P1 | yes (flux `pipe`) | Flux candidate A9; combine per-frame transforms. | Lodash `flow` contract. |
| 18 | `createDeferred` (function) | P2 | no | Flux `Completion` core (B4). | Promise + `resolve`/`reject` + `settled`. |
| 19 | `isIterable`, `isFiniteNumber`, `assertNever` (type) | P1 | partly | Flux A8 and several `Number.isFinite` guards. | Pure type guards. |
| 20 | `positiveOr` / `nonNegativeOr` / `finiteOr` (number) | P2 | no | Identical copies in `spring.ts` and `gestures.ts` (B3). | "Finite and `>` 0 else fallback". |
| 21 | `splitGraphemes` (string) | P2 | no | Flux `animateText` (A7). | `Intl.Segmenter` with `Array.from` fallback. |
| 22 | `approxEqual` (number) | P1 | no | Dozens of `toBeCloseTo` and tolerance comparisons in tests and benchmarks. | Absolute and relative tolerance, `NaN` rules. |
| 23 | `merge` / `mergeWith`, `cloneDeep`, `isEqual` (object) | P2 | yes | No concrete evidence yet in the docs; they are the obvious next requests once options objects and playground state grow. Ask only when a real call site exists. | Lodash contracts. |

**P0 total for Basics:** `sortBy`/`orderBy`, `minBy`/`maxBy`/`sumBy`, `percentile`, `standardDeviation`/`coefficientOfVariation`, `formatNumber`/`formatBytes`/`formatDuration`, string `format` + `plural`, `createSeededRandom` (+ seeded `shuffle`/`sample`).

### B.2 Things that should **not** go into Basics (decided by Basics' own rules)

- DOM helpers (clipboard, observers, matchMedia): Aurora foundations (A.2), because Basics has no DOM domain.
- A `vector` domain (flux `Vector2`): Basics' README curates "everyday" utilities; recommendation in `basics-candidates.md` stands (do not move).
- Easings, stagger, timeline composition and anything RxJS: stays in flux.

---

## Part C. Sequencing and what the frontend waits for

1. **Aurora F8 (publish a beta) and F6 (single flux)** first; without them nothing downstream can be built or verified.
2. **Aurora P0 navigation + overlay + feedback components (1-7)** unlock the entire shell and the docs pages. Order: tabs and navbar (shell and install tabs), sidebar nav + breadcrumb (docs layout), tooltip/popover + toast + code block (every docs page), then the small data-display set (8-12).
3. **Basics P0 (1-6, 9)** can run in parallel with Aurora: they are small, independent modules and the docs app already has call sites for them.
4. The frontend items from the design proposal (DESIGN-0xx) that depend only on existing Aurora components (button, card, badge, alert, dialog, icon, inputs) can start earlier; those that need tabs/navbar/toast/code-block are blocked until those ship (the proposal's revision marks them).
5. Per-item process in each repo stays as is: Aurora (spec and acceptance criteria first, tests seen failing, one step per session); Basics (contract paragraph, Lodash differential tests where applicable, ≥95% coverage per module). This repo only consumes published versions: no `file:`/`link:` specifiers.

## Part D. Open questions for the owner

1. ~~Turn Part A and Part B into roadmap items in each repository~~ Done (see Status above). Remaining: commit them on a suitable branch in each repository.
2. Confirm the DOM-helper split: observers/clipboard/live-region in Aurora foundations, nothing DOM in Basics.
3. Aurora highlighter: ship a small built-in tokenizer for the languages the docs need (TypeScript, bash, JSON, CSS, HTML) or keep `au-code-block` highlighter-agnostic and let the docs inject one? Recommendation: agnostic, with the docs providing a lightweight tokenizer.
4. `au-tabs` and `au-navbar` first, as the proposed first two requests.
