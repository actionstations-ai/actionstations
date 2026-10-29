import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  contentTypeFor,
  defaultPublicDir,
  loadAssets,
  loadAssetsFromDir,
  placeholderAssets,
} from '../src/static'

const dirs: string[] = []
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})
function tmp(): string {
  const d = mkdtempSync(join(tmpdir(), 'relay-static-'))
  dirs.push(d)
  return d
}

describe('static assets', () => {
  it('builds a fixed map with content types, immutable assets, and the bundle hash the relay build computes', () => {
    const dir = tmp()
    mkdirSync(join(dir, 'assets'))
    writeFileSync(join(dir, 'index.html'), '<!doctype html>page')
    writeFileSync(join(dir, 'assets', 'app.js'), 'console.log(1)')
    writeFileSync(join(dir, 'manifest.json'), '{}')
    writeFileSync(join(dir, '_headers'), '/*')
    const assets = loadAssetsFromDir(dir)
    expect([...assets.files.keys()].sort()).toEqual(['/assets/app.js', '/index.html'])
    expect(assets.files.get('/index.html')).toMatchObject({
      contentType: 'text/html; charset=utf-8',
      immutable: false,
    })
    expect(assets.files.get('/assets/app.js')).toMatchObject({
      contentType: 'text/javascript; charset=utf-8',
      immutable: true,
    })
    const expected = createHash('sha256')
      .update('assets/app.js\n')
      .update('console.log(1)')
      .update('index.html\n')
      .update('<!doctype html>page')
      .digest('hex')
    expect(assets.playerBundleSha256).toBe(expected)
    expect(contentTypeFor('x.woff2')).toBe('font/woff2')
    expect(contentTypeFor('x.unknown')).toBe('application/octet-stream')
  })

  it('finds public/ next to the program or one level up, and falls back to the placeholder page', () => {
    const root = tmp()
    mkdirSync(join(root, 'dist'))
    expect(defaultPublicDir(join(root, 'dist'))).toBeUndefined()
    mkdirSync(join(root, 'public'))
    writeFileSync(join(root, 'public', 'index.html'), 'x')
    expect(defaultPublicDir(join(root, 'dist'))).toBe(join(root, 'public'))
    expect(
      loadAssets(undefined, join(root, 'dist')).files.get('/index.html')?.bytes.toString(),
    ).toBe('x')
    const placeholder = loadAssets(undefined, tmp())
    expect(placeholder.files.get('/index.html')?.bytes.toString()).toContain(
      'player page is not installed',
    )
    expect(placeholderAssets().playerBundleSha256).toMatch(/^[a-f0-9]{64}$/)
  })
})
