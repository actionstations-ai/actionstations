import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@shared': resolve('src/shared'),
      '@main': resolve('src/main'),
      '@renderer': resolve('src/renderer/src'),
    },
  },
  test: {
    include: ['src/**/*.test.{ts,tsx}', 'tests/**/*.test.{ts,tsx}'],
    exclude: ['**/node_modules/**', 'e2e/**', 'out/**'],
    // Renderer component tests opt in with a `// @vitest-environment happy-dom` header.
    environment: 'node',
    // Bundled domain profiles (ADR-0020) registered as main does at startup.
    setupFiles: ['tests/setup/bundled-domains.ts'],
    testTimeout: 20000,
    pool: 'forks',
    // The persistent transform cache keeps stale import.meta.glob results when files are
    // added (handlers/adapters discovered by glob silently disappear in tests). Off.
    fsModuleCache: false,
  },
})
