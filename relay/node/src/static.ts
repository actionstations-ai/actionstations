/**
 * The player page (spec 0411) as a fixed map built at startup: path → bytes and content type.
 * A request is looked up in the map and never joined onto a filesystem path, so request input
 * cannot reach the disk. Sources: the single executable's embedded assets, a `--public-dir`, or
 * the `public/` folder next to the program.
 */
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'

export interface Asset {
  bytes: Buffer
  contentType: string
  immutable: boolean
}

export interface AssetMap {
  /** Served path (`/index.html`, `/assets/app.js`) → asset. */
  files: Map<string, Asset>
  playerBundleSha256: string
}

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json',
}

export function contentTypeFor(path: string): string {
  const dot = path.lastIndexOf('.')
  return (dot >= 0 ? TYPES[path.slice(dot)] : undefined) ?? 'application/octet-stream'
}

function listFiles(dir: string, base = dir): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir).sort()) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...listFiles(full, base))
    else out.push(relative(base, full).split('\\').join('/'))
  }
  return out
}

/** The same hash the relay's build script computes: path, newline, bytes, for every file sorted. */
export function bundleHash(entries: Iterable<[string, Buffer]>): string {
  const hash = createHash('sha256')
  for (const [path, bytes] of [...entries].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    hash.update(path + '\n')
    hash.update(bytes)
  }
  return hash.digest('hex')
}

function build(entries: [string, Buffer][]): AssetMap {
  const files = new Map<string, Asset>()
  for (const [path, bytes] of entries) {
    if (path === 'manifest.json' || path === '_headers') continue
    files.set('/' + path, {
      bytes,
      contentType: contentTypeFor(path),
      immutable: path.startsWith('assets/'),
    })
  }
  return {
    files,
    playerBundleSha256: bundleHash(
      entries.filter(([p]) => p !== 'manifest.json' && p !== '_headers'),
    ),
  }
}

export function loadAssetsFromDir(dir: string): AssetMap {
  return build(listFiles(dir).map((p) => [p, readFileSync(join(dir, p))]))
}

/** Where the `public/` folder sits for an unbundled or bundled run: next to the program's folder. */
export function defaultPublicDir(programDir: string): string | undefined {
  for (const candidate of [join(programDir, 'public'), join(dirname(programDir), 'public')]) {
    if (existsSync(join(candidate, 'index.html'))) return candidate
  }
  return undefined
}

/** Inside a single executable the files were embedded at build (`scripts/build-sea.mjs`). */
export function loadEmbeddedAssets(): AssetMap | undefined {
  const sea = process.getBuiltinModule?.('node:sea') as
    | {
        isSea(): boolean
        getAsset(key: string): ArrayBuffer
        getAsset(key: string, enc: string): string
      }
    | undefined
  if (!sea?.isSea()) return undefined
  const list = JSON.parse(sea.getAsset('public-files.json', 'utf8')) as string[]
  return build(list.map((p) => [p, Buffer.from(sea!.getAsset('public/' + p))]))
}

/** One page saying the player page is not installed, so the server still answers `/`. */
export function placeholderAssets(): AssetMap {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Action Stations relay</title></head><body><main><h1>Action Stations relay</h1><p>This server forwards encrypted live play sessions. The player page is not installed on it; put the player bundle in the public folder or use the packaged release.</p></main></body></html>\n`
  return build([['index.html', Buffer.from(html)]])
}

export function loadAssets(publicDir: string | undefined, programDir: string): AssetMap {
  if (publicDir) return loadAssetsFromDir(publicDir)
  const embedded = loadEmbeddedAssets()
  if (embedded) return embedded
  const dir = defaultPublicDir(programDir)
  return dir ? loadAssetsFromDir(dir) : placeholderAssets()
}
