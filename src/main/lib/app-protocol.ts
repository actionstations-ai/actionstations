// Serves the built renderer (out/renderer) from app://bundle/ (#117, ADR-0013). With the page
// on its own origin instead of file://, the GrantFileProtocolExtraPrivileges fuse can be off.
// Files are read with Electron's asar-aware fs, so this works inside app.asar whatever the
// file:// protocol is allowed to do.
import { protocol } from 'electron'
import { promises as fs } from 'node:fs'
import { extname, join, resolve, sep } from 'node:path'

export const APP_SCHEME = 'app'
export const APP_HOST = 'bundle'
export const APP_ORIGIN = `${APP_SCHEME}://${APP_HOST}`
/** The renderer entry document, the only page that gets the window.ttx bridge. */
export const APP_INDEX_URL = `${APP_ORIGIN}/index.html`

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.wasm': 'application/wasm',
  '.txt': 'text/plain; charset=utf-8',
}

/** Content type for a bundle file; unknown extensions are served as opaque bytes. */
export function mimeTypeFor(path: string): string {
  return MIME_TYPES[extname(path).toLowerCase()] ?? 'application/octet-stream'
}

/**
 * Absolute path of the bundle file an app:// URL names, or undefined when the URL is not on
 * the app origin, is malformed, names the root, or would resolve outside `root`.
 */
export function resolveBundlePath(root: string, url: string): string | undefined {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return undefined
  }
  if (parsed.protocol !== `${APP_SCHEME}:` || parsed.host !== APP_HOST) return undefined
  let rel: string
  try {
    rel = decodeURIComponent(parsed.pathname)
  } catch {
    return undefined
  }
  if (rel.includes('\0') || rel.includes('\\')) return undefined
  const base = resolve(root)
  const abs = resolve(base, `.${rel}`)
  if (!abs.startsWith(base + sep)) return undefined
  return abs
}

/** Parsed URL when it is on app://bundle (WHATWG URL reports origin "null" for custom schemes). */
function onAppOrigin(url: string): URL | undefined {
  try {
    const u = new URL(url)
    const ok = u.protocol === `${APP_SCHEME}:` && u.host === APP_HOST && !u.username && !u.password
    return ok ? u : undefined
  } catch {
    return undefined
  }
}

/** True for app://bundle/index.html (any hash), the main and presentation windows' document. */
export function isAppIndexUrl(url: string): boolean {
  const u = onAppOrigin(url)
  return !!u && u.pathname === '/index.html' && u.search === ''
}

/** True for any URL on the app origin (in-app navigation target). */
export function isAppOrigin(url: string): boolean {
  return !!onAppOrigin(url)
}

/** Must run before app ready. */
export function registerAppScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: APP_SCHEME,
      privileges: { standard: true, secure: true, supportFetchAPI: true, codeCache: true },
    },
  ])
}

const SECURITY_HEADERS = { 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-cache' }

function notFound(): Response {
  return new Response('Not found', { status: 404, headers: SECURITY_HEADERS })
}

/** Symlinks must not lead out of the bundle either (fs.realpath is asar-aware). */
async function realInside(root: string, abs: string): Promise<boolean> {
  const [realRoot, realFile] = await Promise.all([fs.realpath(root), fs.realpath(abs)])
  return realFile.startsWith(realRoot + sep)
}

/** Read one regular file from the bundle; directories and missing files are 404. */
export async function serveBundleFile(root: string, request: Request): Promise<Response> {
  if (request.method !== 'GET' && request.method !== 'HEAD')
    return new Response('Method not allowed', { status: 405, headers: SECURITY_HEADERS })
  const abs = resolveBundlePath(root, request.url)
  if (!abs) return notFound()
  try {
    if (!(await realInside(root, abs))) return notFound()
    const stat = await fs.stat(abs)
    if (!stat.isFile()) return notFound()
    const body = request.method === 'HEAD' ? null : await fs.readFile(abs)
    return new Response(body, {
      status: 200,
      headers: { ...SECURITY_HEADERS, 'Content-Type': mimeTypeFor(abs) },
    })
  } catch {
    return notFound()
  }
}

/** Serve `root` (out/renderer) on app://bundle/ in the default session. */
export function registerAppProtocol(root: string): void {
  protocol.handle(APP_SCHEME, (request) => serveBundleFile(root, request))
}

/** out/renderer, next to out/main where the bundled main process runs. */
export const rendererRoot = (mainDir: string): string => join(mainDir, '../renderer')
