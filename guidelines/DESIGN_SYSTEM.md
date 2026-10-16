# Documentation design system

The docs app uses Vuetify 4 for application UI. Custom CSS is reserved for re;Flux's motion visualizations, SVG geometry, Canvas scenes, and other content that explains animation behavior.

## UI conventions

- Prefer Vuetify components and utility classes for layout, cards, buttons, inputs, navigation, lists, tables, alerts, and status indicators.
- Use `v-container`, `v-row`, and `v-col` for responsive layout. Keep flex/grid children shrinkable with `min-width: 0` where needed.
- Use supported Vuetify variants and semantic colors. Primary actions use `color="primary"` and `variant="flat"`; secondary actions use a semantic color with `variant="outlined"`.
- Use 8px radius for cards and control containers, and 4px for compact surfaces. Avoid one-off styling for common components.
- Reuse `PageHeader.vue`, `MetricTile.vue`, and `EventLog.vue` when the same content pattern appears in multiple views.

## Theme and styling ownership

- The `rxDark` and `rxLight` themes in `src/plugins/vuetify.ts` own the semantic palette and foreground colors.
- CSS should consume Vuetify-generated `--v-theme-*` variables through `src/styles/tokens.css`; do not introduce duplicate theme hex values.
- `src/style.css` owns global defaults and accessibility polish. `src/styles/visualizations.css` owns bespoke visual content such as motion stages, SVG curves, Gantt rows, and timeline trees.
- Use `--rx-font-mono` for code, timestamps, numeric values, and timeline labels. Source code should use a readable foreground on a `surface-sunken` code area.

## Accessibility

- Provide semantic headings, labels, names, landmarks, and accessible names for interactive controls.
- Preserve visible keyboard focus. Keep navigation state exposed with appropriate ARIA attributes, and use polite live regions for meaningful state changes only; do not announce per-frame updates.
- Respect `prefers-reduced-motion` for CSS transitions and scrolling. Demos should not unexpectedly auto-start JavaScript-driven motion; users should be able to control playback.
- Ensure layouts remain usable at 200% zoom and 320 CSS-pixel viewport width. Check contrast and theme changes across cards, code, graphs, focus rings, and status colors.
- Automated accessibility tools are useful but do not prove full conformance. Before release, test keyboard navigation and use a screen reader on important flows.

## Graphs and visualizations

- Keep the current easing curves and timeline graphs in native SVG/CSS unless a demonstrated use case needs a specialized chart library. Avoid dependencies for small purpose-built graphs.
- Graph wrappers should constrain overflow and include `min-width: 0`, `max-width: 100%`, and `box-sizing: border-box` where needed.
- SVG charts should define a `viewBox` and responsive width. Account for easing overshoot, clip geometry deliberately, and keep labels accessible in the DOM where practical.
- Clamp timeline segments and playhead geometry to their tracks so labels and objects do not spill into adjacent regions.
- For a future dense, continuously updating time-series graph, evaluate an optional frontend-only library such as uPlot. Never add charting dependencies to the published animation runtime solely for documentation visuals.

## Visual Lab and demos

- Keep each scene focused on one rendering technique or interaction.
- Prefer deterministic render functions driven by supplied values and dimensions. The owning Vue view handles playback, reduced-motion behavior, tab visibility, resize observation, user input, and cleanup.
- Use public re;Flux primitives for scheduling, interpolation, and disposal rather than creating an unrelated requestAnimationFrame loop for each demo.
- Restore original inline styles, SVG attributes, DOM nodes, and listeners when a scene or interaction is disposed.
- Only promote demo helpers into the library when they are broadly reusable and have a stable contract.

## Manual review checklist

- Navigate key flows using only the keyboard and verify visible focus.
- Test light and dark themes, mobile navigation, form labels, event logs, and status announcements.
- Test 200% zoom and a 320px-wide viewport without page-level horizontal overflow.
- Enable reduced motion and verify transitions, scrolling, and demo playback follow the documented policy.
- Review production build findings from tools such as axe or Lighthouse, then manually check any remaining issues.
