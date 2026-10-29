/**
 * The Durable Object and Worker under workerd, the real Workers runtime (issue #496): hibernation,
 * eviction, alarms and WebSocket limits that the in-process shim cannot show. Run with
 * `pnpm --filter @actionstations/relay-cloudflare test:workers`. It is a separate run
 * because it needs the workerd binary; the app's own `pnpm test` does not include these tests.
 */
import { resolve } from 'node:path'
import { cloudflareTest } from '@cloudflare/vitest-plugin'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: { '@shared': resolve(import.meta.dirname, '../../src/shared') },
  },
  plugins: [
    cloudflareTest({
      wrangler: { configPath: './wrangler.toml' },
      // The bundled workerd lags the deployed runtime; wrangler.toml's date is newer.
      miniflare: { compatibilityDate: '2026-08-22' },
    }),
  ],
  test: { include: ['workers-test/**/*.test.ts'], testTimeout: 20000 },
})
