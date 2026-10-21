#!/usr/bin/env node
// Template tests (ADR-0008): renders every template's preview.json through the built app
// (e2e/templates-preview.spec.ts). Requires `pnpm build:app` first; local-ci runs it after
// the build step. Golden-image comparison is added with #30.
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
if (!existsSync('out/main/index.js')) {
  console.error('Build the app first: pnpm build:app')
  process.exit(1)
}
const r = spawnSync('pnpm', ['exec', 'playwright', 'test', 'e2e/templates-preview.spec.ts'], {
  stdio: 'inherit',
})
process.exit(r.status ?? 1)
