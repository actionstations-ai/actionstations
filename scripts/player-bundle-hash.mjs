// The SHA-256 of the player bundle in out/player, as the relay reports it at /v1/health and the
// app's Test step compares (issue #410). It is the hash relay/cloudflare/scripts/build-public.mjs
// writes into manifest.json: every served file's path and bytes in sorted order, without
// manifest.json (which only lists the files) and _headers (server configuration).
//   node scripts/player-bundle-hash.mjs [dir]
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// Kept in step with build-public.mjs (not imported: electron.vite.config.ts bundles this file,
// and a test checks the two agree).
function listFiles(dir, base = dir) {
  const out = []
  for (const entry of readdirSync(dir).sort()) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...listFiles(full, base))
    else out.push(relative(base, full).split('\\').join('/'))
  }
  return out
}

function bundleHash(dir, files) {
  const hash = createHash('sha256')
  for (const file of files) {
    hash.update(file + '\n')
    hash.update(readFileSync(join(dir, file)))
  }
  return hash.digest('hex')
}

/** The bundle hash of `dir`, or '' when no player build is there. */
export function playerBundleSha256(dir = resolve('out/player')) {
  if (!existsSync(resolve(dir, 'index.html'))) return ''
  const files = listFiles(dir).filter((f) => f !== 'manifest.json' && f !== '_headers')
  return bundleHash(dir, files)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(playerBundleSha256(process.argv[2] ? resolve(process.argv[2]) : undefined))
}
