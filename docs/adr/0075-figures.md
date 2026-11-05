# ADR-0075: Figures are pure functions that draw SVG from data

Date: 2026-11-04 · Status: Accepted · Issue: #650 · Spec: [0448](../specs/0448-toolkits.md) FR-4..FR-6 · Related: ADR-0008 (template rendering), ADR-0046 (derived fields)

## Context

Toolkits need injects that are charts, dials, boards and maps drawn from data (a hydrograph, a status board). They must be exact, reproducible and accessible, and project rule 5 forbids AI-rendered pixels for text-bearing media. Packs may not carry code.

## Decision

- **A figure kind is a pure function** `(data, options) => { svg, summary, table? }` in `src/main/render/figures/<kind>.ts`, with a zod schema for its data. The same data gives the same bytes: no random ids, clocks or locale formatting.
- **A registry keyed by kind id** (`registerFigureKind`). The generic kinds register themselves; other modules (the map kind of #652, toolkit kinds) add theirs. Packs configure kinds with data and cannot add kinds.
- **Drawing helpers are d3-scale and d3-shape** (MIT, pinned), used for scales, ticks, lines and arcs only. The SVG is written as strings; no DOM, no canvas.
- **Rendering reuses the template pipeline.** `computeFigures` in main builds `figures.<name>` beside `derived` from `fields.figures`; a template prints `{{{figures.name}}}`. The built-in `figure` inject type is a template whose whole content is one figure, so PNG, PDF and packet embedding need no new path.
- **Every figure explains itself.** The summary is the SVG's accessible description, the alt text and the screen-reader packet text; charts return a data table. Color is never the only cue (dash, marker, pattern, symbol, word).
- **Bad data fails the render** with a `VALIDATION` error naming the figure.

## Consequences

- A new kind is one file, a registration, a sample and tests; it appears in goldens through a preview variant.
- Figure colors are repeated in `figures/theme.ts` because the render window has no app CSS variables; a token change needs the file updated (the values mirror `tokens.css`).
- Rasters and canvas drawing (radar imagery) are not covered here; they belong to the map and field kinds that register later.
