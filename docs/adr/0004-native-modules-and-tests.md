# ADR-0004: Native modules and test runtime

Date: 2026-10-21 · Status: Accepted · Issue: #3

## Context

`better-sqlite3` is a native addon. Older releases were compiled against a specific Node ABI, which forced a separate build for Electron. `sqlite-vec` is a loadable SQLite extension that also has to be found at runtime inside a packaged app.

## Decision

- `better-sqlite3` ≥ 13 ships N-API prebuilds (`prebuilds/<platform>-<arch>.node`) that load unchanged in Node and in Electron. Verified on 2026-10-21 with Electron 45.0.0 (Node 24.22) and Node 25.8: `sqlite_version()` 3.53.4, FTS5 and `vec0` virtual tables both work. No `electron-rebuild` step on install; `pnpm rebuild:native` exists only as an escape hatch for platforms without a prebuild.
- Vitest runs under Electron acting as Node (`ELECTRON_RUN_AS_NODE=1 electron node_modules/vitest/vitest.mjs`, wrapped by `scripts/vitest-electron.mjs` and `pnpm test`) so tests use the exact Node version the app ships.
- `sqlite-vec` comes from the `sqlite-vec` npm package (per-platform optional dependency) and is loaded with `sqliteVec.load(db)`.
- `electron-builder` sets `npmRebuild: false` and lists `better-sqlite3`, `sqlite-vec*` under `asarUnpack` so the `.node` binary and the extension are real files on disk in packaged builds.

## Consequences

- One binary for tests, dev and packaged builds.
- Tests start slightly slower (Electron startup) and need the Electron binary (downloaded lazily on first use by `electron` ≥ 45).
- If a future better-sqlite3 drops a platform prebuild, contributors need a native toolchain and `pnpm rebuild:native`.
