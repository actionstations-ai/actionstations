#!/usr/bin/env node
// Copies the practice session page (out/player-demo, spec 0446) into the player apps' bundled
// assets: mobile/android/app/src/main/assets/demo and mobile/ios/Player/Demo. The copies are
// build outputs and are git-ignored.
import { cpSync, existsSync, rmSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SRC = resolve(ROOT, 'out/player-demo')
const TARGETS = ['mobile/android/app/src/main/assets/demo', 'mobile/ios/Player/Demo']

if (!existsSync(resolve(SRC, 'index.html'))) {
  console.error('out/player-demo is missing: run vite build -c vite.player-demo.config.ts')
  process.exit(1)
}
for (const target of TARGETS) {
  const dest = resolve(ROOT, target)
  if (!existsSync(dirname(dest))) continue
  rmSync(dest, { recursive: true, force: true })
  cpSync(SRC, dest, { recursive: true })
  console.log(`practice session copied to ${target}`)
}
