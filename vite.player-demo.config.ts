/**
 * The practice session page the player apps ship (spec 0446): the player page plus the scripted
 * controller and the in-memory server, built from `src/player/demo/` to `out/player-demo/` with
 * relative asset URLs so the apps can serve it from their own bundle. `pnpm build:player-demo`
 * copies it into both apps.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const pkg = JSON.parse(readFileSync(resolve('package.json'), 'utf8')) as { version: string }

export default defineConfig({
  root: resolve('src/player/demo'),
  base: './',
  publicDir: false,
  define: { __PLAYER_VERSION__: JSON.stringify(pkg.version) },
  plugins: [react()],
  build: {
    outDir: resolve('out/player-demo'),
    emptyOutDir: true,
    assetsDir: 'assets',
    sourcemap: false,
    target: ['es2022', 'safari16'],
    // One file per kind keeps the copy into the apps simple.
    rollupOptions: { output: { inlineDynamicImports: true } },
    chunkSizeWarningLimit: 800,
  },
})
