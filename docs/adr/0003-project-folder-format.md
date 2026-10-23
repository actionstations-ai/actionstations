# ADR-0003: Project folder format

Date: 2026-10-21 · Status: Accepted · Issue: #8

## Context

Projects hold source documents, generated scenarios, injects and media. Users need to back them up, move them between machines, and optionally keep them in git. The data must be inspectable without the app and robust against hand edits or malicious files.

## Decision

A project is a directory named `<name>.asproj/` with the layout in `docs/02-ARCHITECTURE.md` §Storage:

```
<name>.asproj/
  project.json
  documents/<docId>/{original.*, text.md, meta.json}
  scenarios/<scenarioId>/{scenario.json, injects/<injectId>.json,
                          documents/*.md, media/<injectId>/<assetId>.*, history/}
  prompts/
  index.sqlite        # rebuildable, gitignored
```

- Every JSON file is validated with the zod schemas in `src/shared/schemas/` on read and on write. Writes are atomic (temp file + rename).
- `index.sqlite` (chunks, FTS5, sqlite-vec, jobs, provider_calls) is derived data: gitignored inside the project and rebuildable from the folder via "Rebuild index".
- All path construction goes through one guarded join helper that resolves the path and rejects anything outside the project root (`..`, absolute paths, symlink escapes).
- Secrets never live in the project folder (Electron `safeStorage`, `src/main/secrets`).
- The extension was `.ttxproj` before the rename to Action Stations (ADR-0019). Folders with either extension open the same way; the app only checks for `project.json`.

## Consequences

- Projects are portable and diff-friendly; the folder is the source of truth.
- Schema changes need a version field in `project.json` and migrations on read.
- Media lives in the folder, so git users should use LFS or ignore `media/`.
- Losing `index.sqlite` costs only re-indexing time.
