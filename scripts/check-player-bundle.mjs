#!/usr/bin/env node
// Checks the built player page (spec 0411, NFR-4): out/player/manifest.json exists, lists an
// index.html whose CSP has no unsafe-inline, every listed file is on disk with the recorded
// size, and the files a first load needs (page, stylesheet, main chunk) stay under the gzipped
// budget. The lazily loaded crypto fallback chunks do not count toward a first load.
// Usage: node scripts/check-player-bundle.mjs [--dir out/player] [--budget-kb 250]
import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
export const DEFAULT_BUDGET_KB = 250
/** Chunks loaded only through `import()` (the noble crypto fallback): not part of a first load. */
const LAZY_CHUNK =
  /\/assets\/(noble|aes|nist|sha2|hmac|hkdf|utils|_?curves?|ciphers?|hashes)-[^/]+\.js$/

export function readManifest(dir) {
  const path = join(dir, 'manifest.json')
  if (!existsSync(path)) throw new Error(`${path} is missing (run pnpm build:player)`)
  return JSON.parse(readFileSync(path, 'utf8'))
}

/** Problems with a built player bundle; an empty list means it passes. */
export function bundleProblems(dir, manifest, budgetKb = DEFAULT_BUDGET_KB) {
  const problems = []
  const files = manifest.files ?? {}
  const index = files['/index.html']
  if (!index) problems.push('manifest lists no /index.html')
  for (const [served, entry] of Object.entries(files)) {
    if (!served.startsWith('/') || served.includes('..')) problems.push(`bad served path ${served}`)
    const onDisk = join(dir, entry.file)
    if (!existsSync(onDisk)) problems.push(`${served} is listed but ${entry.file} is missing`)
    else if (statSync(onDisk).size !== entry.bytes)
      problems.push(
        `${served}: ${statSync(onDisk).size} bytes on disk, manifest says ${entry.bytes}`,
      )
  }
  if (index) {
    const html = readFileSync(join(dir, index.file), 'utf8')
    if (!/Content-Security-Policy/.test(html)) problems.push('index.html has no CSP meta tag')
    if (/unsafe-inline|unsafe-eval/.test(html))
      problems.push('index.html CSP allows unsafe-inline or unsafe-eval')
    if (!/'sha256-[A-Za-z0-9+/=]+'/.test(html))
      problems.push('index.html CSP has no hash for the theme bootstrap')
    if (/https?:\/\//.test(html.replace(/<!--[\s\S]*?-->/g, '')))
      problems.push('index.html references an absolute http(s) URL')
  }
  const firstLoad = Object.entries(files).filter(
    ([served]) => /\.(html|css|js)$/.test(served) && !LAZY_CHUNK.test(served),
  )
  const gzipKb = firstLoad.reduce((n, [, e]) => n + e.gzipBytes, 0) / 1024
  if (gzipKb > budgetKb)
    problems.push(`first load is ${gzipKb.toFixed(1)} KB gzipped, over the ${budgetKb} KB budget`)
  return { problems, gzipKb, firstLoad: firstLoad.map(([s]) => s) }
}

function main() {
  const args = process.argv.slice(2)
  const flag = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined)
  const dir = resolve(ROOT, flag('--dir') ?? 'out/player')
  const budget = Number(flag('--budget-kb') ?? DEFAULT_BUDGET_KB)
  const manifest = readManifest(dir)
  const { problems, gzipKb, firstLoad } = bundleProblems(dir, manifest, budget)
  console.log(
    `player bundle ${manifest.version}: ${Object.keys(manifest.files).length} files, first load ${gzipKb.toFixed(1)} KB gzipped (${firstLoad.length} files, budget ${budget} KB)`,
  )
  if (problems.length) throw new Error(`player bundle check failed:\n  ${problems.join('\n  ')}`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    main()
  } catch (err) {
    console.error(`✖ ${err.message}`)
    process.exit(1)
  }
}
