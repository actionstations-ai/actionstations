// The SHA-256 of the player bundle in out/player, as the relay reports it at /v1/health and the
// app's Test step compares (issue #410). It is the hash relay/cloudflare/scripts/build-public.mjs
// writes into manifest.json: every served file's path and bytes in sorted order, without
// manifest.json (which only lists the files) and _headers (server configuration).
//   node scripts/player-bundle-hash.mjs [dir]
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { bundleHash, listFiles } from '../relay/cloudflare/scripts/build-public.mjs'

/** The bundle hash of `dir`, or '' when no player build is there. */
export function playerBundleSha256(dir = resolve('out/player')) {
  if (!existsSync(resolve(dir, 'index.html'))) return ''
  const files = listFiles(dir).filter((f) => f !== 'manifest.json' && f !== '_headers')
  return bundleHash(dir, files)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(playerBundleSha256(process.argv[2] ? resolve(process.argv[2]) : undefined))
}
