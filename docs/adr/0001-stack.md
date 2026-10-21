# ADR-0001: Application stack

Date: 2026-10-21 · Status: Accepted · Issue: #8

## Context
Tabletop Generator is a local-first desktop app that parses documents, runs a multi-stage LLM pipeline, renders HTML templates to PNG/PDF, and edits large structured artifacts (MSEL grids, inject forms, long markdown documents). CLAUDE.md fixes the top-level stack (Electron + React + TypeScript + Vite + pnpm, `better-sqlite3` + `sqlite-vec`, Vitest + Playwright, ESLint + Prettier, `electron-builder`). This ADR fixes the libraries inside that stack so parallel workstreams build on the same foundations.

## Decision
- **Build:** `electron-vite` with three entries: `src/main`, `src/preload`, `src/renderer`. pnpm 10 with `onlyBuiltDependencies` limited to `electron`, `better-sqlite3`, `esbuild`.
- **Language:** TypeScript `strict: true` everywhere. Shared types are derived from zod schemas in `src/shared/schemas/` (`z.infer`), never hand-written duplicates.
- **Renderer:** React 19, `react-router` with `HashRouter` (works under `file://`), TanStack Query as the only way components call IPC (through the typed `window.api` preload bridge), Zustand for local UI state.
- **UI kit:** Radix UI primitives plus hand-written CSS using design tokens (CSS custom properties, light and dark themes, WCAG AA contrast). No CSS framework.
- **Editors:** TanStack Table + `dnd-kit` for the MSEL grid; TipTap with markdown round-trip for handbook / briefing / rubric / hotwash.
- **Templates:** Handlebars for inject templates, export templates and prompt files.
- **Packaging:** `electron-builder` (mac dmg, win nsis, linux AppImage).

## Consequences
- One build tool covers main, preload and renderer, with HMR in `pnpm dev`.
- Hash routing avoids custom protocol handling for deep links in packaged builds.
- Radix + tokens means more CSS written by hand, in exchange for no generic look and full control over contrast and print styles.
- Swapping any of these libraries needs a superseding ADR.
