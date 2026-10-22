# ADR-0013: Serve the renderer from app://bundle/ and turn GrantFileProtocolExtraPrivileges off

Date: 2026-10-21 · Status: Accepted · Issue: #117

## Context

Packaged builds flip Electron fuses (#55). `GrantFileProtocolExtraPrivileges` had to stay on because the main and presentation windows loaded `out/renderer/index.html` with `loadFile()`, i.e. from `file://` inside `app.asar`; with the fuse off that load fails (`ERR_FILE_NOT_FOUND`, blank window). With it on, any `file://` page gets privileges a browser would not give it (reading `app.asar`, wider `file://` access), and the app's trust check (`isAppUrl`) was a `file://` path comparison.

## Decision

- `src/main/lib/app-protocol.ts` registers a privileged `app` scheme (`standard`, `secure`, `supportFetchAPI`, `codeCache`) and serves `out/renderer` on the single origin `app://bundle/` in the default session with `protocol.handle`. Files are read with Electron's asar-aware `fs` (not `net.fetch(file://)`), so serving does not depend on what `file://` may do.
- Path guard: the URL must be `app://bundle/…`; the percent-decoded path may not hold NUL or `\`, must resolve strictly inside the root, and its `realpath` must stay inside the root's `realpath` (no symlink escape). Only regular files are served (directories and the root are 404, so there is no listing); only GET/HEAD. Content types come from a fixed extension map (unknown = `application/octet-stream`) with `X-Content-Type-Options: nosniff`.
- The main window and the presentation window load `app://bundle/index.html` (`#/…` hash routes). `isAppUrl` (the IPC trust check) accepts exactly that document with any hash and no query; `will-navigate` allows only the app origin. Dev mode (Vite dev server URL) is unchanged.
- The renderer CSP is unchanged: `'self'` now means `app://bundle`; `ttx-media:` stays allowed for images, media and fetch.
- Render and print windows keep loading temporary `file://` documents in their own `render-sandbox` partition, which has no `app://` handler and blocks everything but `file:` and `data:`. They read templates and fonts from `app-resources/` (outside `app.asar`), which plain `file://` can do.
- `electronFuses.grantFileProtocolExtraPrivileges: false`; `scripts/package-smoke.mjs` expects it off and `e2e/packaged.spec.ts` proves the packaged app still works (main window, IPC, `ttx-media:` images, template goldens, presentation window).

## Consequences

- All Electron fuses that harden a release are now in their hardened state.
- The renderer origin changed from `file://` to `app://bundle`, so `localStorage` written by earlier builds (wizard progress, MSEL snap step, export folder, variant preference) is not carried over. No release had shipped, so nothing is migrated.
- Anything new the renderer needs at runtime must be in `out/renderer` (served by app://) or reached via IPC / `ttx-media:`; `file://` URLs in the renderer do not work in packaged builds.
- The e2e suite loads `out/` through the same `app://` path as the packaged app, so it covers the handler on every run.
