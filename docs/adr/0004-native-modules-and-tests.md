# ADR-0004: Native modules and test runtime

Date: 2026-10-21 · Status: Accepted · Issue: #3

## Context
`better-sqlite3` is a native addon compiled against a specific Node ABI. Electron's ABI differs from system Node, so running Vitest under plain Node would need a second build of the module and would test a binary we never ship. `sqlite-vec` is a loadable SQLite extension that also has to be found at runtime inside a packaged app.

## Decision
- `better-sqlite3` is built once, for Electron's ABI (`electron-builder install-app-deps` on postinstall).
- Vitest runs under Electron acting as Node: `ELECTRON_RUN_AS_NODE=1 electron node_modules/vitest/vitest.mjs`, wrapped in the `pnpm test` script. There is exactly one native build.
- `sqlite-vec` comes from the `sqlite-vec` npm package (prebuilt per-platform loadable extension) and is loaded with `db.loadExtension(getLoadablePath())`.
- The `electron-builder` config lists both under `asarUnpack` so the `.node` binary and the extension are real files on disk in packaged builds.

## Consequences
- Tests exercise the same native binary the app ships.
- Tests start slightly slower (Electron startup) and need Electron installed even for unit tests.
- Contributors need a native toolchain (Xcode CLT, Visual Studio Build Tools, or build-essential) when prebuilt binaries are unavailable for their platform.
