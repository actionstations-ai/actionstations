#!/usr/bin/env node
// Template tests (ADR-0008), run through the built app (requires `pnpm build:app`; local-ci
// runs this after the build step):
//   e2e/templates-golden.spec.ts   every template × variant vs __golden__/<variant>.png,
//                                  plus a render-twice determinism check
//   e2e/templates-preview.spec.ts  writes test-results/templates/<type>[--variant].png and
//                                  checks the render pool (concurrency, crash recovery)
// UPDATE_GOLDENS=1 pnpm test:templates rewrites the goldens; commit them with the template.
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
if (!existsSync('out/main/index.js')) {
  console.error('Build the app first: pnpm build:app')
  process.exit(1)
}
const specs = ['e2e/templates-golden.spec.ts', 'e2e/templates-preview.spec.ts']
const r = spawnSync('pnpm', ['exec', 'playwright', 'test', ...specs], { stdio: 'inherit' })
process.exit(r.status ?? 1)
