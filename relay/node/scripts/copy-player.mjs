#!/usr/bin/env node
// Copies the player page (out/player, from `pnpm build:player` at the repository root) into
// public/, which the Docker image and the single executable carry. Without a built player the
// placeholder page stays. `public/assets/` is not tracked; index.html is the placeholder until
// this runs, so do not commit the result.
//   node scripts/copy-player.mjs [--player DIR]
import { cpSync, existsSync, rmSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const pkg = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const arg = process.argv.indexOf('--player')
const source = arg >= 0 ? resolve(process.argv[arg + 1]) : join(pkg, '..', '..', 'out', 'player')
const target = join(pkg, 'public')

if (!existsSync(join(source, 'index.html'))) {
  console.log(`No player bundle at ${source}: public/ keeps the placeholder page`)
} else {
  rmSync(target, { recursive: true, force: true })
  cpSync(source, target, { recursive: true })
  console.log(`public/ now holds the player page from ${source}`)
}
