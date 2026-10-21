# ADR-0008: Template rendering to PNG and PDF

Date: 2026-10-21 · Status: Accepted · Issue: #30

## Context
Text-bearing injects (tweets, tickets, emails, logs, FIDS boards) must render from HTML templates so their text is exact and legible (CLAUDE.md rule 5). Renders must be reproducible for golden tests and must not reach the network, since template data comes from model output and user documents.

## Decision
- A pool of hidden, sandboxed offscreen `BrowserWindow`s in `src/main/render/` loads `templates/injects/<type>/template.html` + `style.css`, binds data with Handlebars (plus a `brand` object), and captures output.
- A session request interceptor blocks every non-`file://` URL; the render window has no network.
- Fonts are bundled via `@fontsource` (Inter, JetBrains Mono, Roboto Condensed); template text never depends on system fonts.
- PNG at 2x device scale via `webContents.capturePage`; PDF via `webContents.printToPDF`.
- Golden tests (`pnpm test:templates`): an Electron script renders every `preview.json` and compares against the committed PNG with `pixelmatch` and a small threshold.

## Consequences
- In-app previews, exports and goldens use the same renderer, so they match.
- Goldens are sensitive to platform font rasterization; baselines are regenerated deliberately, never automatically.
- Template authors work in plain HTML/CSS with a preview fixture.
