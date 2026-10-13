# re;Flux Frontend Design System

The re;Flux documentation app uses **Vuetify 4 as its UI system**, not merely as a theme provider. Vuetify owns app chrome, page layout, spacing, cards, forms, buttons, navigation, lists, tables, status labels, and progress indicators. re;Flux styles are reserved for the distinctive violet-and-mint identity and for visuals that explain motion concepts.

## Principles

- **Vuetify first:** choose a Vuetify component or utility class before adding a CSS class. Do not recreate standard buttons, cards, input fields, responsive grids, spacing, or status indicators in CSS.
- **Motion is the content:** custom styles are acceptable for moving objects, SVG easing curves, Gantt tracks, timeline stage geometry, because these are the product demonstrations themselves.
- **Theme-owned color:** violet/mint brand colors and status colors are defined only in the Vuetify `rxDark` / `rxLight` themes; CSS references Vuetify-generated variables.
- **Accessible contrast:** both themes define explicit `on-*` foregrounds; the light theme uses darker accents to keep text contrast.
- **User preferences:** light/dark choice is persisted, first visit respects the OS color preference, focus is visible, and CSS respects reduced-motion / forced-colors settings.
- **Semantic color intent:** violet is the primary action/selection color; mint is secondary and indicates active/success states; amber and rose communicate warnings and errors.
- **Consistent and accessible interaction:** use Vuetify's keyboard/touch behavior, visible focus, semantic labels, button names, and responsive grid.

## Tokens

| Token group | Tokens | Usage |
| --- | --- | --- |
| Color | `--rx-color-background`, `--rx-color-surface`, `--rx-color-surface-raised`, `--rx-color-border` | Background and visualization surfaces |
| Text | `--rx-color-text`, `--rx-color-text-muted`, `--rx-color-text-subtle` | Main copy, supporting copy, metadata |
| Accent/status | `--rx-color-primary`, `--rx-color-secondary`, `--rx-color-error`, `--rx-color-warning`, `--rx-color-info` | Actions, active/success states, warnings, errors, information |
| Typography | `--rx-font-body`, `--rx-font-mono` | Interface copy, code, timestamps and timing values |
| Spacing | `--rx-space-1` through `--rx-space-12` | 4px-based spacing scale for visualization-only layout |
| Shape/elevation | `--rx-radius-sm` through `--rx-radius-xl`, `--rx-shadow-focus` | Visualization stages and focus treatment |

The semantic palette is defined once in `src/plugins/vuetify.ts`. `src/styles/tokens.css` maps semantic and legacy visualization aliases to Vuetify-generated CSS variables; it contains no separate color palette. Update the theme definition when changing colors. Theme border colors are selected to stay distinguishable against both raised and variant surfaces. Legacy aliases are retained only for visual-demo selectors and must not be used to build standard UI components.

## Component rules

- **Layout:** use `v-container`, `v-row`, `v-col`, and Vuetify spacing/display utilities.
- **Surfaces:** use `v-card`, `v-sheet`, and supported Vuetify variants; avoid custom `.panel`, `.metric-card`, or card-like wrappers.
- **Actions:** use `v-btn` with `color="primary"` and `variant="flat"` for the primary action, `variant="outlined"` with a semantic theme color for secondary actions, and `variant="text"` for inline tertiary actions.
- **Inputs:** use `v-select`, `v-slider`, `v-switch`/`v-checkbox`, and `v-text-field` where appropriate.
- **Data/status:** use `v-list`, `v-table`, `v-chip`, `v-alert`, and `v-progress-linear`.
- **Typography/code:** use Vuetify text and typography utilities; use `--rx-font-mono` for code, timestamps, progress values, and timeline labels. Code samples may retain a `pre` rule for overflow, tab sizing, and readable line height, but the containing surface remains a `v-card`.

## Reusable frontend components

Common page patterns live in `src/components/` and should be reused instead of duplicated across views:

- `PageHeader.vue` owns the standard eyebrow/title/description header.
- `MetricTile.vue` presents a small labeled value using a Vuetify `v-sheet`.
- `EventLog.vue` provides the shared lifecycle/event log using Vuetify cards, lists, buttons, and alerts.

Keep these components small and composable. Add a shared component when at least two views have the same interaction or content structure; keep one-off playground visualization elements local to their view or visualization stylesheet.

## CSS ownership

- `src/styles/tokens.css`: shared identity tokens and visualization compatibility aliases.
- `src/style.css`: global font, basic document defaults, Vuetify accessibility polish, and code-sample overflow/typography.
- `src/styles/visualizations.css`: only bespoke visual content (animated stages/objects, SVG curves, Gantt rows/playhead, and nested timeline tree). It must not define shared layouts, standard card surfaces, fields, or application-wide Vuetify component rules.


## Component geometry and contrast

- `v-card` uses Vuetify's `lg` radius (8 px) by default. Avoid one-off large radii on cards; use 4 px for compact non-card surfaces and 8 px for cards and control containers.
- Secondary actions should use `variant="outlined"` with a semantic theme color such as `primary` or `secondary`. Do not use `color="surface-variant"` on tonal buttons: the resulting fill/foreground pairing is difficult to read consistently across light and dark themes.
- Code cards use `surface` for the card, `surface-sunken` for the code area, and `on-surface` for code text. Do not use medium-emphasis text colors for source code.
- Theme colors are declared only in `src/plugins/vuetify.ts`. CSS should consume Vuetify's generated `--v-theme-*` variables through semantic aliases in `styles/tokens.css`.

## Documentation scroll behavior

The documentation route occupies the viewport below the app bar. Its left navigation and right table of contents stay pinned while the central article is the main reading scroll area. Sidebar overflow is only enabled to keep long navigation lists usable on smaller screens. The footer is hidden on this route to avoid creating a second page-level scroll area.
