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

## Implementation notes (#30)

- Pool: 2 warm windows by default, one zoom factor per window (the zoom is a window preference), emptied with a script between jobs rather than navigated, recycled after 50 renders, on renderer crash, or on a 15 s timeout. Measured on 50 renders of the time_jump_card preview at 2× (M-series Mac): sequential p50 208 → 75 ms, p95 234 → 83 ms; 50 parallel requests 9.9 s → 2.6 s wall (pool size 1: 3.4 s, size 4: 2.1 s).
- Goldens live beside each template (`__golden__/<variant>.png`). Each run also renders twice and requires identical bytes. Windows rendering in parallel can differ by a few anti-aliased pixels, which the pixelmatch threshold absorbs.
- AI images reach composite slots through the asset id convention `<slot>-<ULID>` (docs/09), so the MediaAsset schema did not change.
