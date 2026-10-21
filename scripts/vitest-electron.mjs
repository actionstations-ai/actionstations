#!/usr/bin/env node
// Runs Vitest inside Electron's Node runtime (ADR-0004) so tests use the Node
// version the app ships. Usage: node scripts/vitest-electron.mjs [vitest args]
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const require = createRequire(import.meta.url)
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const electron = require('electron') // path to the binary; downloads on first use
const vitest = resolve(root, 'node_modules/vitest/vitest.mjs')
const args = process.argv.slice(2).filter((a) => a !== '--')

const result = spawnSync(electron, [vitest, ...args], {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
})
process.exit(result.status ?? 1)
