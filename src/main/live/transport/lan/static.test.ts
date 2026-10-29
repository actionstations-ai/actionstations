import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { contentTypeFor, loadPlayerBundle, PLACEHOLDER_HTML, ROOT_HTML } from './static'

function bundle(): string {
  const dir = mkdtempSync(join(tmpdir(), 'ttx-player-'))
  writeFileSync(join(dir, 'index.html'), '<!doctype html><title>Player</title>')
  mkdirSync(join(dir, 'assets', 'fonts'), { recursive: true })
  writeFileSync(join(dir, 'assets', 'index-a1b2c3.js'), 'console.log(1)')
  writeFileSync(join(dir, 'assets', 'index-a1b2c3.js.map'), '{}')
  writeFileSync(join(dir, 'assets', 'index-d4e5.css'), 'body{}')
  writeFileSync(join(dir, 'assets', 'fonts', 'inter.woff2'), 'x')
  writeFileSync(join(dir, 'main.tsx'), 'export {}')
  writeFileSync(join(dir, '.DS_Store'), '')
  return dir
}

describe('player bundle route map (spec 0407 FR-6)', () => {
  it('maps every servable file by its request path and nothing else', async () => {
    const b = await loadPlayerBundle(bundle())
    expect(b.indexHtml).toContain('<title>Player</title>')
    expect([...b.files.keys()].sort()).toEqual([
      'assets/fonts/inter.woff2',
      'assets/index-a1b2c3.js',
      'assets/index-d4e5.css',
    ])
    expect(b.files.get('assets/index-a1b2c3.js')?.contentType).toBe(
      'text/javascript; charset=utf-8',
    )
    expect(b.files.has('index.html')).toBe(false)
    expect(b.files.has('main.tsx')).toBe(false)
  })

  it('serves nothing and no page when the bundle folder is missing', async () => {
    const b = await loadPlayerBundle(join(tmpdir(), 'does-not-exist-' + Date.now()))
    expect(b.indexHtml).toBeUndefined()
    expect(b.files.size).toBe(0)
  })

  it('knows the bundle content types and refuses unknown extensions', () => {
    expect(contentTypeFor('a.css')).toBe('text/css; charset=utf-8')
    expect(contentTypeFor('a.woff2')).toBe('font/woff2')
    expect(contentTypeFor('a.map')).toBeUndefined()
    expect(contentTypeFor('a.ts')).toBeUndefined()
    expect(contentTypeFor('noext')).toBeUndefined()
  })

  it('placeholder and root pages carry no session information, script or style', () => {
    for (const html of [PLACEHOLDER_HTML, ROOT_HTML]) {
      expect(html).not.toMatch(/<script|<style|<link/)
      expect(html).not.toMatch(/\/s\/|#/)
    }
  })
})
