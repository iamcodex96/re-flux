# Documentation design system

The docs frontend is migrating from a component-framework-led layout to a small, product-specific design system built on Vue 3, TypeScript, SCSS, and CSS custom properties. Vuetify remains temporarily in place while existing views are migrated; new page-level layouts should not add more dependency on Vuetify's grid or spacing utilities.

## Layout principles

- Use full-bleed layouts for visual scenes, hero sections, interactive canvases, and immersive storytelling.
- Use content rails for reading-heavy content. Choose a readable width instead of stretching articles and code samples across the whole viewport.
- Use wide rails for dashboards and playgrounds, where extra horizontal space helps the live preview and controls coexist.
- Prefer responsive CSS Grid and Flexbox primitives to nested framework grids. All flex/grid children that contain dynamic content should have `min-width: 0`.
- Start from mobile constraints. Avoid horizontal page overflow at 320 CSS pixels, respect safe viewport units, and only introduce sticky or horizontal-scroll experiences when they remain navigable on touch devices.

## Styling ownership

- `src/styles/_tokens.scss` owns the product's color, typography, spacing, radius, content-width, and focus-ring tokens. These tokens are independent of Vuetify so the app can finish migrating without rewriting every visual value.
- `src/styles/_layout.scss` owns small layout primitives such as content rails, full-bleed sections, stacks, and responsive grids.
- `src/style.scss` owns global resets, focus behavior, shared accessibility styles, and legacy selectors that will be removed as views migrate.
- `src/styles/visualizations.scss` owns bespoke visualization and motion-demo styling.
- `src/styles/visual-lab.scss` owns the Visual Lab-specific presentation.
- Component-scoped styles should own styles used by only one Vue component. Promote a pattern into shared styling only when multiple views genuinely need it.

## Theme

The app exposes `rx-theme--dark` and `rx-theme--light` classes to apply the re;Flux token palettes. Legacy Vuetify theme classes are also accepted while migration is in progress. Existing components can continue reading Vuetify's `--v-theme-*` values until each component is converted; new components should prefer `--rx-color-*` tokens.

## Accessibility and motion

- Keep semantic headings, landmarks, labels, and accessible names on controls.
- Preserve visible keyboard focus and keyboard-operable navigation.
- Respect `prefers-reduced-motion` for CSS transitions and scrolling. JavaScript-driven demos should have explicit playback controls when continuous movement is not essential.
- Check both themes, keyboard navigation, 200% zoom, and a 320px viewport during every layout migration.
- Do not trap the user's native scroll position or require horizontal scrolling to access ordinary documentation content.

## Visualizations

- Keep easing curves and timeline graphs in native SVG/CSS unless a specialized chart library has a demonstrated benefit.
- Let the owning Vue view handle playback, tab visibility, resize observation, input, and resource cleanup.
- Prefer public re;Flux primitives for scheduling and interpolation rather than creating unrelated animation loops for every demo.
- Restore modified styles, SVG attributes, DOM nodes, observers, and listeners when a scene is disposed.
