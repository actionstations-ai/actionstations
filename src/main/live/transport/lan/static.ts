/**
 * The player bundle as a fixed route map (spec 0407 FR-6): every servable file is read from
 * the bundle folder at start and looked up by exact request path afterwards, so no string from
 * a request ever reaches `path.join` or `fs`. When the bundle has not been built (#411 lands it
 * as `out/player/`, shipped as `app-resources/player/`), a placeholder page says so.
 */
import { promises as fs } from 'node:fs'
import { join, relative, sep } from 'node:path'

export interface StaticFile {
  /** Absolute path on disk; only paths discovered by the walk. */
  path: string
  contentType: string
  size: number
}

export interface PlayerBundle {
  /** Request path (`assets/index-a1b2.js`) → file. Never `index.html`, which is the page. */
  files: Map<string, StaticFile>
  /** The player page for every `/s/:sessionId`; undefined when the bundle is absent. */
  indexHtml: string | undefined
}

const CONTENT_TYPES: Record<string, string> = {
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.txt': 'text/plain; charset=utf-8',
  '.wasm': 'application/wasm',
  '.mp3': 'audio/mpeg',
  '.vtt': 'text/vtt; charset=utf-8',
}

const MAX_FILES = 2000
const MAX_DEPTH = 4

export function contentTypeFor(name: string): string | undefined {
  const dot = name.lastIndexOf('.')
  return dot === -1 ? undefined : CONTENT_TYPES[name.slice(dot).toLowerCase()]
}

async function walk(root: string, dir: string, depth: number, out: Map<string, StaticFile>) {
  if (depth > MAX_DEPTH || out.size >= MAX_FILES) return
  const entries = await fs.readdir(dir, { withFileTypes: true })
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue
    const abs = join(dir, entry.name)
    if (entry.isDirectory()) {
      await walk(root, abs, depth + 1, out)
      continue
    }
    if (!entry.isFile()) continue
    const type = contentTypeFor(entry.name)
    if (!type) continue // source maps, TypeScript, anything unexpected: not served
    const rel = relative(root, abs).split(sep).join('/')
    if (rel === 'index.html') continue
    const stat = await fs.stat(abs)
    out.set(rel, { path: abs, contentType: type, size: stat.size })
    if (out.size >= MAX_FILES) return
  }
}

/** Read the bundle folder once. A missing folder yields an empty map and no page. */
export async function loadPlayerBundle(dir: string): Promise<PlayerBundle> {
  const files = new Map<string, StaticFile>()
  const isDir = await fs.stat(dir).then(
    (s) => s.isDirectory(),
    () => false,
  )
  if (!isDir) return { files, indexHtml: undefined }
  const indexHtml = await fs.readFile(join(dir, 'index.html'), 'utf8').catch(() => undefined)
  await walk(dir, dir, 0, files)
  return { files, indexHtml }
}

/** A minimal page with no CSS, JS or session information: the real bundle takes its place (#411). */
export const PLACEHOLDER_HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Action Stations</title></head>
<body><main><h1>Action Stations</h1>
<p>This computer is hosting a live session, but the player page is not part of this build yet.</p>
<p>Ask the facilitator which version of Action Stations is running.</p></main></body></html>
`

/** `GET /`: nothing about the session; the QR code is the only way in. */
export const ROOT_HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Action Stations</title></head>
<body><main><h1>Action Stations</h1><p>Scan the QR code the facilitator is showing to join the exercise.</p></main></body></html>
`
