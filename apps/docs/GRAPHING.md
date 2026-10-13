# Graphing in the re;Flux frontend

The documentation and playgrounds currently use native SVG and CSS for visualizations. We intentionally do not add a graphing dependency yet. The current graphs are small and purpose-built: easing functions sampled at 101 points, short timeline/Gantt lanes, progress playheads and motion tracks. Native SVG keeps the visualizations crisp at any density, easy to theme with Vuetify CSS variables, and lightweight.

## Layout rules

- Every graph wrapper uses `min-width: 0`, `max-width: 100%`, `box-sizing: border-box` and `overflow: hidden` where its marks must stay inside the chart. This is important inside flex and grid layouts.
- SVG graphs use an explicit `viewBox`, `width: 100%`, and a shared `EasingCurve.vue` component. The component maps the observed easing output range into the viewBox so elastic/back overshoots remain visible instead of clipping out of frame. A clip path protects the SVG drawing region.
- Timeline segments clamp their start and width so `left + width` never exceeds the remaining 100% of a lane. Tiny segments hide their textual labels rather than allowing them to leak into adjacent lanes.
- Moving objects are positioned against an inset rail. The rail reserves at least half the width of the object on each side so its center can reach both endpoints without clipping. Playheads are centered on their percentage coordinate and reverse their time labels near the right edge.
- Chart labels, legends and numeric ranges remain in the DOM where possible; graphs that communicate meaningful information have an accessible name or labels.

## Should we add a chart library?

Not for the existing easing and timeline graphs. A chart library would add dependency weight without solving the main problems, which are sizing, coordinate mapping, flex/grid shrink behavior, and clipping. Those are now handled in the SVG component and chart container styles.

If the `smoothStream()` feature needs a high-density, continuously updating time-series plot (for example, thousands of timestamped values), evaluate [uPlot](https://github.com/leeoniya/uPlot) as an **optional frontend-only dependency**. It uses Canvas 2D and focuses on time-series, line, area and bar charts. Keep it out of the `@re-code/flux` runtime and core peer dependencies. A canvas chart would still need a dedicated sizing container plus an accessible textual summary or data table.

Avoid bringing in Chart.js for the current graphs: it supports responsive canvas rendering, but also requires careful parent-container sizing, so it would not remove the need to solve layout constraints.
