import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeAll, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ protocol: { registerSchemesAsPrivileged: vi.fn(), handle: vi.fn() } }))

import {
  isAppIndexUrl,
  isAppOrigin,
  mimeTypeFor,
  resolveBundlePath,
  serveBundleFile,
} from './app-protocol'

const ROOT = '/opt/app/out/renderer'

describe('resolveBundlePath', () => {
  it('maps app://bundle paths into the renderer root', () => {
    expect(resolveBundlePath(ROOT, 'app://bundle/index.html')).toBe(`${ROOT}/index.html`)
    expect(resolveBundlePath(ROOT, 'app://bundle/assets/index-abc.js?v=1#x')).toBe(
      `${ROOT}/assets/index-abc.js`,
    )
    expect(resolveBundlePath(ROOT, 'app://bundle/assets/a%20b.css')).toBe(`${ROOT}/assets/a b.css`)
  })

  it('rejects other schemes and hosts', () => {
    expect(resolveBundlePath(ROOT, 'file:///opt/app/out/renderer/index.html')).toBeUndefined()
    expect(resolveBundlePath(ROOT, 'app://other/index.html')).toBeUndefined()
    expect(resolveBundlePath(ROOT, 'https://bundle/index.html')).toBeUndefined()
    expect(resolveBundlePath(ROOT, 'not a url')).toBeUndefined()
  })

  it('never resolves outside the root', () => {
    for (const url of [
      'app://bundle/../main/index.js',
      'app://bundle/%2e%2e/main/index.js',
      'app://bundle/assets/%2E%2E/%2E%2E/main/index.js',
      'app://bundle/%2e%2e%2fmain%2findex.js',
      'app://bundle/..%5cmain%5cindex.js',
      'app://bundle/%2fetc%2fpasswd',
      'app://bundle/%00index.html',
      'app://bundle/%E0%A4%A',
    ]) {
      const abs = resolveBundlePath(ROOT, url)
      expect(abs === undefined || abs.startsWith(`${ROOT}/`), url).toBe(true)
    }
    expect(resolveBundlePath(ROOT, 'app://bundle/%2e%2e%2fmain%2findex.js')).toBeUndefined()
    expect(resolveBundlePath(ROOT, 'app://bundle/%00index.html')).toBeUndefined()
    expect(resolveBundlePath(ROOT, 'app://bundle/%E0%A4%A')).toBeUndefined()
  })

  it('does not name the root directory itself', () => {
    expect(resolveBundlePath(ROOT, 'app://bundle/')).toBeUndefined()
    expect(resolveBundlePath(ROOT, 'app://bundle')).toBeUndefined()
  })
})

describe('mimeTypeFor', () => {
  it('maps the renderer build output to correct content types', () => {
    expect(mimeTypeFor('index.html')).toBe('text/html; charset=utf-8')
    expect(mimeTypeFor('assets/index-abc.js')).toBe('text/javascript; charset=utf-8')
    expect(mimeTypeFor('assets/index-abc.CSS')).toBe('text/css; charset=utf-8')
    expect(mimeTypeFor('assets/inter.woff2')).toBe('font/woff2')
    expect(mimeTypeFor('assets/logo.svg')).toBe('image/svg+xml')
    expect(mimeTypeFor('assets/pdf.worker.mjs')).toBe('text/javascript; charset=utf-8')
    expect(mimeTypeFor('assets/x.wasm')).toBe('application/wasm')
  })

  it('serves unknown extensions as opaque bytes', () => {
    expect(mimeTypeFor('assets/blob.xyz')).toBe('application/octet-stream')
    expect(mimeTypeFor('LICENSE')).toBe('application/octet-stream')
  })
})

describe('isAppIndexUrl / isAppOrigin', () => {
  it('trusts only app://bundle/index.html with any hash route', () => {
    expect(isAppIndexUrl('app://bundle/index.html')).toBe(true)
    expect(isAppIndexUrl('app://bundle/index.html#/present/x/y/z?asset=a')).toBe(true)
    expect(isAppIndexUrl('app://bundle/other.html')).toBe(false)
    expect(isAppIndexUrl('app://bundle/index.html?x=1')).toBe(false)
    expect(isAppIndexUrl('app://evil/index.html')).toBe(false)
    expect(isAppIndexUrl('file:///opt/app/out/renderer/index.html')).toBe(false)
    expect(isAppIndexUrl('')).toBe(false)
  })

  it('recognises the app origin for navigation', () => {
    expect(isAppOrigin('app://bundle/index.html#/p/x')).toBe(true)
    expect(isAppOrigin('app://bundle2/index.html')).toBe(false)
    expect(isAppOrigin('https://example.com/')).toBe(false)
  })
})

describe('serveBundleFile', () => {
  let root: string
  beforeAll(() => {
    const dir = mkdtempSync(join(tmpdir(), 'ttx-app-proto-'))
    root = join(dir, 'renderer')
    mkdirSync(join(root, 'assets'), { recursive: true })
    writeFileSync(join(root, 'index.html'), '<!doctype html><title>t</title>')
    writeFileSync(join(root, 'assets', 'app.js'), 'export {}')
    writeFileSync(join(dir, 'secret.txt'), 'outside')
    symlinkSync(join(dir, 'secret.txt'), join(root, 'assets', 'link.txt'))
  })

  const get = (url: string, method = 'GET') => serveBundleFile(root, new Request(url, { method }))

  it('serves files with their content type and nosniff', async () => {
    const res = await get('app://bundle/index.html')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('text/html; charset=utf-8')
    expect(res.headers.get('x-content-type-options')).toBe('nosniff')
    expect(await res.text()).toContain('<title>t</title>')
    const js = await get('app://bundle/assets/app.js')
    expect(js.headers.get('content-type')).toBe('text/javascript; charset=utf-8')
  })

  it('answers HEAD without a body', async () => {
    const res = await get('app://bundle/index.html', 'HEAD')
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('')
  })

  it('404s for directories, missing files and escapes; no listing', async () => {
    expect((await get('app://bundle/assets/')).status).toBe(404)
    expect((await get('app://bundle/assets')).status).toBe(404)
    expect((await get('app://bundle/missing.js')).status).toBe(404)
    expect((await get('app://bundle/%2e%2e/secret.txt')).status).toBe(404)
  })

  it('does not follow symlinks out of the bundle', async () => {
    expect((await get('app://bundle/assets/link.txt')).status).toBe(404)
  })

  it('rejects non-GET methods', async () => {
    expect((await get('app://bundle/index.html', 'POST')).status).toBe(405)
  })
})
