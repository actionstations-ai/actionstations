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
    testTimeout: 20000,
    pool: 'forks',
  },
})
