# Frontend redesign: execution plan (deferred until Aurora is ready)

| Status | Written | Source proposal | Back to |
|---|---|---|---|
| **Deferred. Not started.** | 2026-11-23 | [`frontend-design-proposal.md`](./frontend-design-proposal.md) (rev 2) | [roadmap](../../roadmap.md) · [Aurora/Basics wishlist](./aurora-basics-wishlist.md) |

This file turns the design proposal into an ordered plan. **Nothing in it starts until the Aurora readiness gate (section 1) is open.** The owner's decision: the redesign is built on `@re-code/aurora` and `@re-code/basics`, so both libraries must be completed first and the front is built afterwards. Aurora is built on demand, one roadmap step per session, in its own repository; this repository never implements Aurora components.

The proposal stays the source of truth for the **what** (concepts C1 to C12, component mapping, the criteria of each `DESIGN-*` item). This plan owns the **when and in what order**, and it overrides the proposal where the situation changed (section 3).

## 1. The Aurora readiness gate

The redesign starts only when **every row below is released in an Aurora beta that is published to the npm registry** (the exact version is then pinned in `apps/docs/package.json`). A row counts as done when Aurora's own definition of done is met for it (its roadmap step is ticked and it ships in that beta), not when a branch exists.

Because the owner wants everything in Aurora first, **the interim shims of the proposal (`DESIGN-A08`, at most four `rx-shim-*` components and `check-aurora-shims.mjs`) are not built**. If one row is later waived by the owner, that row alone falls back to the shim contract in proposal section 3A.5, and the item `DESIGN-A08` is reopened for it.

Rows use the Aurora roadmap (`re-aurora/docs/ROADMAP.md`, `main`) as it stands after the requests of 2026-11-23. The `AURORA-*` ids are the ones used in the proposal.

| # | Proposal id | What the redesign needs | Where it is in Aurora's roadmap | Redesign items that need it |
|---|---|---|---|---|
| 1 | AURORA-PKG-001 | A published beta (proposal default: `0.1.0-beta.0`, `beta` dist-tag, pinned exactly) | Phase 6, "publish a beta" item. Needs the Aurora owner's explicit approval, because the roadmap previously excluded publishing | everything (A01) |
| 2 | AURORA-PKG-002 | A single Flux copy: `@re-code/flux` and `rxjs` as optional peers, plus a runtime check | Step 8, "Single Flux copy" | A02, 005, 011, A09 |
| 3 | AURORA-ACT-001 | `au-button` ARIA state passthrough and link mode | Step 7, first item | 003, 005, 007, A06 |
| 4 | AURORA-NAV-001 | `au-tabs` with an indicator slot and change event | Step 5 | 007, 009, 010 |
| 5 | AURORA-OVL-001 | `au-popover` and `au-tooltip` | Step 4 | 005, 006, 009 |
| 6 | (dialog) | `au-dialog` | Step 4 | 013, A09 |
| 7 | AURORA-OVL-002 | `au-toast` and the live-region announcer | Step 4 and Step 8 | 009 (copy feedback), A06 |
| 8 | AURORA-ICON-001 | `au-icon` build and chunk cost fixed, Lucide mapping for the 70 MDI names | Step 8, "`au-icon` build and chunk cost" and "Lucide mapping" | A05 |
| 9 | (utilities) | Selective generation of the utilities (`utilities.css` is about 36 KB gzip) | Step 8 | A06, entry budget |
| 10 | AURORA-FRM-001 | Segmented control (proposal asked for an appearance of `au-radio-group`; Aurora planned `au-segmented-control`. Either satisfies it) | Step 7 | A06 (button toggles) |
| 11 | AURORA-FRM-002 | `au-slider` | Step 7 | 010, A06 (about 7 ranges) |
| 12 | AURORA-NAV-002 | `au-navbar`, `au-sidebar-nav`, `au-breadcrumb`, `au-toc` | Step 5 | A06, 007, 008 |
| 13 | (data display) | `au-code-block`, `au-divider`, `au-avatar`, `au-chip`, `au-accordion`, `au-stat`, `au-list`, `au-table`, `au-skeleton` | Step 6 | 009, A06 |
| 14 | (form and action) | `au-menu`, `au-drawer`, `au-combobox`, `au-number-input`, `au-field`, `au-splitter` | Step 7 | 013, A06 |
| 15 | AURORA-SSR-001 | Prerender and hydration story, attribute-based hydrated flag | Step 8 | ENG-HISTORY |
| 16 | AURORA-FLX-001 | Flux motion for components with a motion-off switch and documented animated parts | Step 8 | A09 |
| 17 | AURORA-DOC-001 | Custom Elements Manifest plus Vue-friendly types | Step 8 | A03 |
| 18 | (foundations) | Observation controllers, live-region announcer, clipboard service, focus helpers, tokens (info colour, code surface, monospace, elevation, focus ring) | Step 8 | 003, 009, A04 |

**Row 6 note.** In the proposal `au-dialog` was the only hard blocker (DESIGN-013 and, through it, A09). It exists in Aurora only as unfinished work, so it is the first thing to confirm when checking the gate.

**Gate check (do this, in order, when the owner says Aurora is ready).**
1. `npm view @re-code/aurora versions dist-tags --json` shows the beta. Install it in a scratch directory and list its `exports`.
2. For each row 3 to 18, confirm the tag or subpath export exists in the installed package (not in the Aurora source tree), and that its docs or stories show the contract of the proposal sketch (3A.4). Record anything that differs in a table at the end of this file.
3. Confirm `@re-code/flux` resolves to one copy when the docs alias is applied (this is the first half of A02).
4. Confirm Basics is at a published version that has every function wanted by A07 (the docs already consume `@re-code/basics@~0.2.1`, see section 3).
5. Settle the open questions of section 5. Only then open Stage 1.

## 2. Stages and order

Every stage keeps the shared gates of proposal section 5.2 (docs gate, token check, entry budget, reduced motion, axe with 0 serious or critical violations, copy only in `en.json`, manual checks) plus the repository's code gate when `src/` is touched.

### Stage 0. Prepare (no product change)

| Task | Output |
|---|---|
| Run the gate check above | A short table appended to this file: each row, the released version, differences |
| Re-baseline the entry budget | The proposal's baseline (98 908 B JS, 81 157 B CSS gzip, from the 2026-11-22 dist) predates the Vue, Vite, router, Pinia and `vue-tsc` upgrades (CHORE-008, which made the bundle about 2.6% smaller). Measure again with the command in proposal 5.2 before the first item |
| File the unfiled engineering items | Create real items (file plus roadmap row) for `ENG-FONTS`, `ENG-LOCALE`, `ENG-META`, `ENG-HISTORY` and a size budget item. `ENG-ICONS` is `DESIGN-A05` |
| File the engine items | `ENGINE-A` to `ENGINE-D` become `API-00x` items only when the stage that needs them starts (section 4) |

### Stage 1. Integration prerequisites (proposal "Phase 0")

Order: **A01, then A03 and A02, then A04, then A05, then A07.** A07 (Basics) has no Aurora dependency and can run in parallel with anything.

| Item | Title | Score | Depends on (revised) |
|---|---|---|---|
| DESIGN-A01 | Deliver Aurora as a registry beta, pinned exactly | 40 | The gate |
| DESIGN-A02 | One Flux: alias `@re-code/flux*` to source, dedupe `rxjs`, single-coordinator check | 36 | A01, DESIGN-002 |
| DESIGN-A03 | Vue integration glue: `isCustomElement`, registration, `vAuModel`, types, `:not(:defined)` placeholders | 32 | A01 |
| DESIGN-A04 | Docs theme over Aurora dark (`--rx-*` to `--aurora-*`), fonts, contrast floor | 28 | A01, A03 |
| DESIGN-A05 | Icons: MDI to Lucide through `au-icon`; drop `@mdi/font` and Material Symbols | 28 | A03, A04 |
| DESIGN-A07 | Basics adoption in the docs app | 20 | none |
| ~~DESIGN-A08~~ | ~~Aurora shims~~ | n/a | **Not built** unless a row of the gate is waived |

### Stage 2. Foundations (proposal "Phase A")

| Item | Title | Score | Depends on (revised) |
|---|---|---|---|
| DESIGN-002 | Docs e2e smoke plus axe harness, with the RAF-peak and single-coordinator checks | 28 | A01 (axe must see Aurora's open shadow roots) |
| DESIGN-001 | Make the hero telemetry real; start on visibility; fix the hash anchor | 40 | DESIGN-002 for its e2e criteria |
| DESIGN-003 | Site motion source: `useMotionGate`, Pause-motion switch, no raw RAF | 30 | DESIGN-002 |
| DESIGN-004 | Engine-twin motion tokens, canvas palette, hex-literal check | 24 | A04 |
| DESIGN-005 | Quality governor plus the quality chip | 28 | DESIGN-003, A02 |
| DESIGN-A06 | Retire `UiPrimitives` and the `_ui-primitives.scss` file; selective utilities; route by route | 14 | A03, A04, A05 (DOCS-004 is done) |

DESIGN-A06 is the largest item (34 primitives, about 410 tags). It migrates one route at a time and each migration is its own commit with the contract scripts of that route updated in the same change.

### Stage 3. Signature experiences (proposal "Phase B")

| Item | Title | Score | Depends on (revised) |
|---|---|---|---|
| DESIGN-007 | Playground IA: workbench first, compact module switcher | 24 | DESIGN-002, A06 |
| DESIGN-008 | The page is the timeline | 21 | DESIGN-003, DESIGN-004, A06 |
| DESIGN-006 | Telemetry Dock | 18 | DESIGN-003, DESIGN-005 |
| DESIGN-009 | `CodeBlock` with tokenizer and scrubbable values | 18 | DESIGN-004 |
| DESIGN-010 | Motion Design Lab | 15 | DESIGN-004, DESIGN-009 |

With every Aurora component released, the "shim" and "native range" workarounds in the proposal's section 5.1a disappear: the dock and the quality menu use `au-popover`, the Lab tabs use `au-tabs`, and the ranges use `au-slider`.

### Stage 4. Big bets and integration showcase (proposal "Phase C")

| Item | Title | Score | Depends on (revised) |
|---|---|---|---|
| DESIGN-011 | Hero render ladder, tiers 0 to 2 | 18 | DESIGN-005, A02, ENG-FONTS (soft) |
| DESIGN-013 | Command palette | 18 | ENG-META, ENG-LOCALE, DESIGN-002, A06, `au-dialog` in the pinned beta |
| DESIGN-A09 | Aurora and Flux choreography (C10) | 15 | A02, A06, DESIGN-003, DESIGN-013 |
| DESIGN-015 | Frame X-ray | 15 | ENGINE-A, DESIGN-006 |
| DESIGN-A10 | Integration lab `/visuals/stack` plus scoped theme preview (C11, C12) | 12 | A06, A07, question 3 |
| DESIGN-012 | three.js tier 3: `/visuals/three`, then Home promotion | 12 | DESIGN-011, question 6 |
| DESIGN-014 | Route and layout transitions | 9 | DESIGN-004, DESIGN-007 |

`three` remains the only new heavy runtime dependency. It ships lazy and capped at 170 KB gzip, on `/visuals/three` first.

### Items that may run before the gate (optional, owner's call)

By default the whole redesign waits for Aurora. Two items need nothing from Aurora and one fixes a real defect, so the owner may choose to pull them forward: **DESIGN-001** (the hero scroll cue `<a href="#home-story">` very likely misbehaves under hash routing; this is unverified in a browser) and **DESIGN-A07** (Basics). DESIGN-002 should wait for A01 because its axe runs must include Aurora's shadow roots.

## 3. What changed in this repository since the proposal was written

The proposal is dated 2026-11-22 (rev 2 on 2026-11-23). These facts changed before the redesign starts and override the proposal where they differ.

| Area | Then | Now |
|---|---|---|
| Engine roadmap | Phases 0 to 4 pending | **Done and merged to `main`** (PERF-002 to PERF-011, REFACTOR-003 to REFACTOR-005, API-001, UNIT, BENCH, CHORE). Sessions and worktrees closed |
| Docs dependencies | Older Vue, Vite, router, Pinia | CHORE-008 landed: `vue` 3.5.46, `vue-router` 5.5.1, `pinia` 4.1.0, `vite` 8.3.8, `@vitejs/plugin-vue` 6.0.11, `vue-tsc` 3.3.14. **Check the `isCustomElement` setup, hash history and the router-link `custom` slot against these versions in A03** |
| Entry budget baseline | 98 908 B JS and 81 157 B CSS | Stale: re-measure in Stage 0 |
| Basics | `@re-code/basics@~0.1.0` | The repository already uses `@re-code/basics@~0.2.1` (dev-only in the library, in `apps/docs/package.json`), with `percentile`, `median` and the deviation helpers consumed by the benchmarks and the Benchmark Lab. **A07 is partly done: its scope is the remaining hand-rolled helpers**. Use the `~0.2.1` line, not `~0.1.0` |
| Library depends on Basics? | open | **No.** CHORE-011 decided against a runtime dependency (adoption made bundles 150 to 450 bytes larger and thin wrappers 2 to 5% slower). The decision is recorded in its file; this redesign adopts Basics in the docs app only, as A07 says |
| Lint | none | Biome lints and formats the library. **`apps/docs` is not covered.** Add it in A06 or as a separate small item, so migrated routes are held to the same rules |
| Contract scripts | many assert source text | DOCS-004 cleaned the Benchmark Lab only. The other `check-*.mjs` scripts remain and are replaced route by route in A06 and in the items that touch their route |
| Browser benchmarks | manual in the page | `npm run bench:browser` runs the Lab headlessly, and it counts forced layout and style recalculation. Use it for the performance claims of DESIGN-005, DESIGN-011 and DESIGN-012 instead of inventing a harness |
| Engine items | proposed | ENGINE-A (per-phase timings) must keep the PERF-007 phase semantics and add no allocation per frame (now measurable); ENGINE-D (split FLIP) builds on PERF-010's batched `flip()` |
| Known finding | not in the proposal | `followSvgPath$` calls `getPointAtLength` three times per emission and its cost grows with path complexity (about 26 ms per call at 2,000 segments, on a loaded machine). Any redesign scene that follows a long path should cap path complexity or wait for a table-based option |

## 4. Engine items this plan may need

| Item | Needed by | Filed when | Constraint |
|---|---|---|---|
| ENGINE-A: opt-in per-phase timings in the coordinator metrics | DESIGN-015 and a better governor signal | Before Stage 4 | Measure only while `metrics$` is observed; no allocation per frame; passes the performance gate |
| ENGINE-B: element-visibility motion source | DESIGN-003, then library users | After DESIGN-003 proves the shape | Tree-shakable, DOM adapter only |
| ENGINE-C: frame-budget operator | DESIGN-005 | After one release of docs-side use | Unit tests for oscillation |
| ENGINE-D: split `flip()` into capture and play | DESIGN-014 | With Stage 4 | Additive; `flip()` unchanged |

**Open engineering decision that interacts with this plan: dropping RxJS from the engine.** If the owner takes it, the Flux motion contract of Aurora (row 16) and Aurora's optional `rxjs` peer (row 2) should be revisited together, because the public streams are RxJS observables today. Decide it before DESIGN-A09, and preferably before Aurora publishes its Flux integration. It needs a measurement phase first (bundle size and per-frame cost of the RxJS pieces actually used).

## 5. Decisions the owner still owes

Defaults are in the proposal (section 6) so work can start without an answer, but these must be explicit before Stage 1:

1. **How Aurora is delivered:** a beta on npm with the `beta` dist-tag and an exact pin (recommended), or a GitHub Release tarball. Never `file:`, `link:` or a git specifier. Publishing needs the owner's explicit approval.
2. **Theme:** keep the shell dark-only (recommended; `check-dark-theme-only.mjs` records the decision), with the Aurora theme switcher only as a scoped preview in the integration lab (A10).
3. **Vue wrappers or raw `au-*` tags plus glue:** raw tags and glue (recommended, matches Aurora's "no framework wrappers" rule).
4. **Animation math in demos:** use the engine's own `clamp` and `lerp` (recommended; Basics' `clamp` throws on inverted bounds and the demos teach Flux).
5. **First-scroll motion gate:** whether the telemetry stage may start without it (`check-home-experience.mjs:46` records the gate). Recommended: yes for the telemetry stage only.
6. **three.js or a lighter compatible library** for tier 3 (recommended: three.js, with the one-hour OGL spike optional).
7. **How strictly "utilities come from Basics" applies** (recommended: no hand-rolled helpers, but plain array built-ins stay).
8. **Header "Pause motion" switch:** keep and persist (recommended).

## 6. Order in which Aurora should be built

This is the order the proposal recommends for the owner's Aurora sessions, ranked by how much of the redesign each unblocks. Aurora's own roadmap decides the real order; the gate only needs all of it.

1. Beta delivery and the single-Flux guarantee (rows 1, 2).
2. `au-button` ARIA state and link mode (row 3): a small change to an existing component that unblocks the most call sites.
3. `au-tabs` and the navigation set (rows 4, 12).
4. Overlays: `au-popover`, `au-tooltip`, `au-dialog`, `au-toast` and the announcer (rows 5, 6, 7).
5. Icon cost and the utilities generation (rows 8, 9).
6. Data display, form and action additions (rows 10, 11, 13, 14).
7. Prerender, Flux motion and the Vue types (rows 15, 16, 17), plus the remaining foundations (row 18).

## 7. Gate check log

Filled in when the owner says Aurora is ready (Stage 0). One line per row: released version, subpath or tag found, difference from the sketch in proposal 3A.4, and the verdict (`ok`, `differs, accepted`, `waived`).

| # | Verdict | Version and evidence | Notes |
|---|---|---|---|
| (empty) | | | |
