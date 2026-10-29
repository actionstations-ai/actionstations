#!/usr/bin/env node
// `pnpm dev:player`: rebuilds the player page on every change (vite build --watch, so the page
// runs with its real CSP: no dev-server inline scripts) and serves it from a scripted session on
// loopback (src/player/harness). The harness itself is TypeScript, bundled once here for Node.
// Env: PLAYER_PORT (8485), PLAYER_NO_WS=1 (force the fetch fallback), PLAYER_LOG=1.
import { spawn } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'vite'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const HARNESS_OUT = resolve(ROOT, 'out/player-harness')

async function buildHarness() {
  await build({
    root: ROOT,
    configFile: false,
    logLevel: 'warn',
    build: {
      ssr: resolve(ROOT, 'src/player/harness/dev.ts'),
      outDir: HARNESS_OUT,
      emptyOutDir: true,
      rollupOptions: { output: { entryFileNames: 'dev.mjs', format: 'es' } },
    },
    ssr: { noExternal: [], target: 'node' },
  })
}

async function main() {
  // One full build first so the harness has a manifest to serve, then watch.
  const watcher = await build({
    configFile: resolve(ROOT, 'vite.player.config.ts'),
    build: { watch: {} },
    logLevel: 'info',
  })
  await buildHarness()
  const child = spawn(process.execPath, [resolve(HARNESS_OUT, 'dev.mjs')], {
    cwd: ROOT,
    stdio: 'inherit',
    env: process.env,
  })
  const stop = () => {
    child.kill('SIGINT')
    if (watcher && typeof watcher.close === 'function') void watcher.close()
  }
  process.on('SIGINT', stop)
  process.on('SIGTERM', stop)
  child.on('exit', (code) => {
    if (watcher && typeof watcher.close === 'function') void watcher.close()
    process.exit(code ?? 0)
  })
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
