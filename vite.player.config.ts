/**
 * The player web page (spec 0411): a second, small Vite bundle built from `src/player/` to
 * `out/player/`, served by the live-play servers at `/s/<sessionId>` with its assets under
 * `/assets/`. It shares the renderer's design tokens (CSS) and the protocol library
 * (`src/shared/live/`) and nothing else: no renderer components, no router, no query cache.
 *
 * Two build-time additions: the sha256 of the inline theme bootstrap goes into the page's CSP
 * (so no `unsafe-inline`), and `manifest.json` lists every served file with its type, size,
 * gzipped size and hash for the servers' fixed route maps (spec 0407) and the size budget
 * check (`scripts/check-player-bundle.mjs`).
 */
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { gzipSync } from 'node:zlib'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

const pkg = JSON.parse(readFileSync(resolve('package.json'), 'utf8')) as { version: string }
const OUT_DIR = resolve('out/player')

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8',
}

export interface PlayerManifestEntry {
  file: string
  type: string
  bytes: number
  gzipBytes: number
  sha256: string
}

export interface PlayerManifest {
  version: string
  protocol: number
  builtAt: string
  /** Served path (`/index.html`, `/assets/...`) → file details. */
  files: Record<string, PlayerManifestEntry>
}

/** Hash the inline theme bootstrap into the CSP so the page keeps `script-src 'self'` plus that one hash. */
function cspHashPlugin(): Plugin {
  return {
    name: 'player-csp-hash',
    enforce: 'post',
    transformIndexHtml(html) {
      const m = /<script data-theme-bootstrap>([\s\S]*?)<\/script>/.exec(html)
      if (!m) return html
      const hash = createHash('sha256').update(m[1]!, 'utf8').digest('base64')
      return html.replace("script-src 'self';", `script-src 'self' 'sha256-${hash}';`)
    },
  }
}

function manifestPlugin(): Plugin {
  return {
    name: 'player-manifest',
    apply: 'build',
    writeBundle(_options, bundle) {
      const files: PlayerManifest['files'] = {}
      for (const [fileName, output] of Object.entries(bundle)) {
        const content: string | Uint8Array =
          output.type === 'chunk' ? output.code : (output.source as string | Uint8Array)
        const bytes =
          typeof content === 'string' ? Buffer.from(content, 'utf8') : Buffer.from(content)
        const ext = fileName.slice(fileName.lastIndexOf('.'))
        files[`/${fileName}`] = {
          file: fileName,
          type: TYPES[ext] ?? 'application/octet-stream',
          bytes: bytes.length,
          gzipBytes: gzipSync(bytes).length,
          sha256: createHash('sha256').update(bytes).digest('hex'),
        }
      }
      const manifest: PlayerManifest = {
        version: pkg.version,
        protocol: 1,
        builtAt: new Date().toISOString(),
        files: Object.fromEntries(Object.entries(files).sort(([a], [b]) => a.localeCompare(b))),
      }
      writeFileSync(resolve(OUT_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
    },
  }
}

export default defineConfig({
  root: resolve('src/player'),
  // Served at /s/<sessionId>, so asset URLs must be absolute (/assets/...), never relative.
  base: '/',
  publicDir: false,
  define: { __PLAYER_VERSION__: JSON.stringify(pkg.version) },
  plugins: [react(), cspHashPlugin(), manifestPlugin()],
  build: {
    outDir: OUT_DIR,
    emptyOutDir: true,
    assetsDir: 'assets',
    sourcemap: false,
    target: ['es2022', 'safari16'],
    // One page, one stylesheet, one main chunk (the noble fallback loads lazily). The gzipped
    // budget (250 KB) is enforced by scripts/check-player-bundle.mjs, not by this warning.
    chunkSizeWarningLimit: 500,
  },
})
