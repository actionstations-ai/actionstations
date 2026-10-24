# ADR-0008: Template rendering to PNG and PDF

Date: 2026-10-21 · Status: Accepted · Issue: #30

## Context

Text-bearing injects (tweets, tickets, emails, logs, FIDS boards) must render from HTML templates so their text is exact and legible ([CONTRIBUTING.md, Project rules 5](../../CONTRIBUTING.md#project-rules)). Renders must be reproducible for golden tests and must not reach the network, since template data comes from model output and user documents.

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

## Addendum: file and navigation lock (#301)

Context: with user, project and pack templates (ADR-0018), template HTML is a shared file. A security review found that "every `file:` URL may load" let a template's meta refresh load any local file into the render window and capture it into the PNG/PDF, and that the source-text template checker could be bypassed.

Decision: two independent layers, either of which alone stops a template from reading local files.

- Window (`src/main/render/sandbox.ts`, used by the render pool and `export/pdf.ts`): per-job policy keyed by webContents. The main frame loads only the document file the app wrote; sub-resources load only from `data:` or files whose realpath is inside the job's read roots (template folder, `templates/_shared`, the exact media files and logo bound into the render; the project folder for export PDFs). Frames, other schemes, `will-navigate` / `will-frame-navigate` / `will-redirect`, popups and webviews are refused. A window between jobs loads nothing. The CSP adds `frame-src`, `child-src`, `form-action`, `base-uri 'none'`.
- Checker (`src/main/packs/template-check.ts`): structural; Handlebars AST + parse5 + CSS tokenizer (docs/packs-format.md "Template HTML and CSS").

Consequences: built-in templates and goldens are unchanged. `e2e/render-sandbox.spec.ts` runs attacking built-in templates (not checked) to prove the window layer alone blocks a meta refresh and an `<img src="file:///…">` outside the roots.
