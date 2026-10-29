import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { playerBundleSha256 } from './scripts/player-bundle-hash.mjs'

const alias = {
  '@shared': resolve('src/shared'),
  '@main': resolve('src/main'),
  '@renderer': resolve('src/renderer/src'),
}

// The hash of the player page this build ships (issue #410): `pnpm build:player` runs first, so
// out/player is this build's. Production builds only; `pnpm dev` leaves it empty.
const playerHash = process.argv.includes('build') ? playerBundleSha256() : ''

export default defineConfig({
  main: {
    resolve: { alias },
    define: { __RELAY_PLAYER_BUNDLE_SHA256__: JSON.stringify(playerHash) },
    build: {
      rollupOptions: {
        input: {
          index: resolve('src/main/index.ts'),
        },
      },
    },
  },
  preload: {
    resolve: { alias },
    build: {
      rollupOptions: {
        input: { index: resolve('src/preload/index.ts') },
        output: { format: 'cjs', entryFileNames: '[name].cjs' },
      },
    },
  },
  renderer: {
    resolve: { alias },
    plugins: [react()],
  },
})
