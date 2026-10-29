#!/usr/bin/env node
// Builds relay/cloudflare/public/: the player bundle from out/player/ (spec 0411) when it exists,
// otherwise the placeholder page, plus manifest.json with the bundle's SHA-256 (the hash over
// every file's path and bytes, sorted) that /v1/health reports and the app compares.
//   node scripts/build-public.mjs [--player <dir>]
import { createHash } from 'node:crypto'
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const pkg = resolve(here, '..')
const repo = resolve(pkg, '..', '..')
const publicDir = join(pkg, 'public')
const playerArg = process.argv.indexOf('--player')
const playerDir =
  playerArg >= 0 ? resolve(process.argv[playerArg + 1]) : join(repo, 'out', 'player')

/** Every file under `dir`, as repo-relative posix paths, sorted. */
export function listFiles(dir, base = dir) {
  const out = []
  for (const entry of readdirSync(dir).sort()) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...listFiles(full, base))
    else out.push(relative(base, full).split('\\').join('/'))
  }
  return out
}

/** SHA-256 over "path\n" + bytes for every file in order: one hash for the whole bundle. */
export function bundleHash(dir, files) {
  const hash = createHash('sha256')
  for (const file of files) {
    hash.update(file + '\n')
    hash.update(readFileSync(join(dir, file)))
  }
  return hash.digest('hex')
}

export function buildPublic({ publicDir: target = publicDir, playerDir: source = playerDir } = {}) {
  const hasPlayer = existsSync(join(source, 'index.html'))
  if (hasPlayer) {
    // Replace the page and assets; keep _headers and manifest.json (rewritten below).
    for (const entry of readdirSync(target)) {
      if (entry !== '_headers' && entry !== 'manifest.json')
        rmSync(join(target, entry), { recursive: true })
    }
    cpSync(source, target, { recursive: true })
  }
  mkdirSync(target, { recursive: true })
  const files = listFiles(target).filter((f) => f !== 'manifest.json' && f !== '_headers')
  const manifest = {
    playerBundleSha256: bundleHash(target, files),
    files,
    source: hasPlayer ? 'out/player' : 'placeholder',
  }
  writeFileSync(join(target, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
  return manifest
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const manifest = buildPublic()
  console.log(
    `public/: ${manifest.files.length} files from ${manifest.source}, sha256 ${manifest.playerBundleSha256}`,
  )
}
