# Documentation design system

The docs frontend uses Vue 3, TypeScript, SCSS, CSS custom properties, and the small product-specific primitives in `components/ui/UiPrimitives.ts`. The UI primitives are intentionally lightweight and implemented with semantic HTML; avoid introducing a component-framework dependency for ordinary presentation.

## Layout principles

- Use full-bleed layouts for visual scenes, hero sections, interactive canvases, and immersive storytelling.
- Use content rails for reading-heavy content. Choose a readable width instead of stretching articles and code samples across the whole viewport.
- Use wide rails for dashboards and playgrounds, where extra horizontal space helps the live preview and controls coexist.
- Prefer responsive CSS Grid and Flexbox primitives to nested framework grids. All flex/grid children that contain dynamic content should have `min-width: 0`.
- Start from mobile constraints. Avoid horizontal page overflow at 320 CSS pixels, respect safe viewport units, and only introduce sticky or horizontal-scroll experiences when they remain navigable on touch devices.

## Styling ownership

All shared/global Sass lives under `apps/docs/src/styles/` and is assembled through `main.scss`:

- `abstracts/_tokens.scss` owns product colors, typography, spacing, radii, content widths, and focus-ring tokens.
- `base/` owns the reset, typography primitives, and accessibility behavior.
- `layout/_primitives.scss` owns reusable content rails, full-bleed sections, stacks, and responsive grids.
- `components/` owns shared UI primitives, code presentations, docs demos, and reusable playground components.
- `views/` owns page-level styling. Long pages are split into purpose-named subfolders: `docs/` separates the application/sidebar shell, article layout, navigation, article content and responsive rules; `home/` separates the hero, story, Visual Lab gallery, principles, closing section and responsive behavior; `visual-lab/` separates layout, scenes, navigation, scroll scenes and responsive rules; `playgrounds/` separates stages by animation primitive and a shared responsive layer. The underscored files at `views/_*.scss` are small entrypoints that assemble these modules in cascade order.
- `components/docs-demos/` groups reusable documentation scenes by visualization type. `components/docs-visual-example/` groups the scoped `DocsVisualExample` rules by demo family, imported through `components/docs-visual-example.scss`.
- Non-shared styles for individual Vue components live in named SCSS files under `components/` or `views/` and are attached through `<style scoped lang="scss" src="...">`. Keep these scoped styles scoped; do not import them globally. When a scoped stylesheet grows, split it into partials and `@use` them from its scoped entrypoint.

Use Sass nesting for BEM element/modifier selectors (`&__element`, `&--modifier`), shared component states, true descendants, pseudo-states and media queries belonging to a component. Keep unrelated selectors at the top level even if they happen to be near each other in the markup; nesting should express real ownership, not just reduce line count. `main.scss` is the only global stylesheet entrypoint; add new global rules to the appropriate partial and import the entrypoint once.

## Theme

The app exposes `rx-theme--dark` and `rx-theme--light` classes to apply the re;Flux token palettes. Theme channel tokens use `--rx-theme-*` RGB triples where alpha compositing is useful; regular colors use `--rx-color-*`. Both are owned by this app and independent of a component framework.

## Accessibility and motion

- Keep semantic headings, landmarks, labels, and accessible names on controls.
- Preserve visible keyboard focus and keyboard-operable navigation.
- Respect `prefers-reduced-motion` for CSS transitions and scrolling. JavaScript-driven demos should have explicit playback controls when continuous movement is not essential.
- Check both themes, keyboard navigation, 200% zoom, and a 320px viewport during every layout migration.
- Do not trap the user's native scroll position or require horizontal scrolling to access ordinary documentation content.

## Visualizations

- Keep easing curves and timeline graphs in native SVG/CSS unless a specialized chart library has a demonstrated benefit.
- Let the owning Vue view handle playback, tab visibility, resize observation, input, and resource cleanup. Home demos should share their focused rendering components and pause when off-screen.
- Prefer public re;Flux primitives for scheduling and interpolation rather than creating unrelated animation loops for every demo.
- Restore modified styles, SVG attributes, DOM nodes, observers, and listeners when a scene is disposed.
