# re;Flux frontend accessibility

This document describes the accessibility conventions used by the documentation app. It is an implementation checklist, not a claim of complete WCAG conformance; manual keyboard and screen-reader testing is still required before release.

## Vuetify is the source of truth

- Brand/status colors are defined in `src/plugins/vuetify.ts` in semantic `colors` entries for the `rxDark` and `rxLight` themes.
- CSS consumes Vuetify-generated variables such as `rgb(var(--v-theme-primary))` and `rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity))`. Do not duplicate theme hex values in `tokens.css` or visualization CSS.
- Prefer Vuetify component `color` props (`primary`, `secondary`, `success`, `warning`, `error`, `info`) and utility classes (`text-primary`, `bg-surface`, `text-medium-emphasis`) for ordinary UI. CSS theme aliases are for SVG strokes, gradients and custom diagram geometry only.
- Explicit `on-*` colors are defined in the theme so controls have intentional foreground/background pairs. The light theme uses darker primary/secondary accents to preserve text contrast.

## Implemented accessibility support

- A keyboard-visible “Skip to main content” link jumps over the app bar. Its click handler prevents changing the URL hash, because Vue Router uses hash history, then moves focus to the main landmark.
- Route changes move focus to the main landmark, whose contents start with a page-level heading. Page and card section headings use semantic `h1`–`h3` elements to support heading navigation, and the focused landmark keeps a visible outline.
- Desktop navigation exposes `aria-current="page"`; the mobile menu button exposes an accessible name, `aria-expanded` and `aria-controls`.
- The theme toggle has an accessible action name, persists the selected theme when storage is available, and respects the system light/dark preference on first visit.
- Sliders use Vuetify `label` props; progress bars have accessible names and value text; changing demo state is exposed with polite status regions.
- Event logs use the `log` role with a polite live region. Keep high-frequency per-frame values out of live regions to avoid overwhelming assistive technology.
- Focus indicators use the active Vuetify primary color, and forced-colors mode retains a system-color focus outline. Vuetify theme classes also set the native `color-scheme` so browser-rendered controls follow the active light/dark theme.
- The browser `theme-color` metadata follows the active theme where supported. A visually hidden helper keeps table captions available to assistive technology.
- CSS transitions and smooth scrolling are reduced when `prefers-reduced-motion: reduce` is enabled. The playground animations themselves are manually started by the user; their JavaScript-driven motion should be tested with users who request reduced motion.
- Interactive easing tiles expose button semantics, keyboard activation and `aria-pressed` selection state.

## Theme contrast spot-check

Contrast ratios below were computed from the configured sRGB theme colors with the WCAG relative-luminance formula. They are spot checks of semantic colors, not a scan of every component state.

| Pair | Dark theme | Light theme | WCAG target |
| --- | ---: | ---: | ---: |
| `on-background` on `background` | 16.28:1 | 16.15:1 | 4.5:1 |
| `primary` on `background` | 7.78:1 | 6.07:1 | 4.5:1 |
| `secondary` on `background` | 11.74:1 | 4.64:1 | 4.5:1 |
| `on-primary` on `primary` | 7.48:1 | 6.44:1 | 4.5:1 |
| `on-secondary` on `secondary` | 11.74:1 | 4.92:1 | 4.5:1 |
| Theme border on the lowest-contrast tested app surface (dark: `surface-bright`; light: `surface-variant`) | 3.30:1 | 3.31:1 | 3:1 non-text UI boundary target |

The `secondary` light-theme pair has the least margin among the listed text pairs. The light border color was darkened slightly so its contrast against `surface-variant` also clears the 3:1 non-text boundary target in this spot check. These computed theme checks are not a substitute for evaluating rendered states.

## Manual release checklist

1. Use only Tab / Shift+Tab / Enter / Space / arrow keys to navigate the header, switch theme, open/close the mobile drawer, operate sliders/selects, and activate the easing tiles.
2. Verify the skip link appears on keyboard focus and moves focus into the main page content.
3. Switch themes and confirm text, cards, code panels, SVG curves, timeline tracks, focus indicators, and semantic status colors update together.
4. Test at 200% browser zoom and a 320 CSS-pixel viewport without loss of content or horizontal page scrolling.
5. Enable the operating system's reduced-motion setting; verify smooth scrolling and CSS transitions are suppressed. Confirm manually started demos remain usable and never start automatically.
6. Use a screen reader to verify slider names/current values, state announcements, the event log and the easing selection state.
7. Run Lighthouse or axe against a production build and review every finding instead of treating the automated score as proof of conformance.
