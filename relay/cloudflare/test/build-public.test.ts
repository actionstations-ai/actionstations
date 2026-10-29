// Runs under Node (the script is a Node build step), so this file is left out of the package's
// Workers-typed tsconfig; Vitest runs it from the root config.
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { buildPublic, bundleHash, listFiles } from '../scripts/build-public.mjs'

const dirs: string[] = []
function tmp(): string {
  const dir = mkdtempSync(join(tmpdir(), 'relay-public-'))
  dirs.push(dir)
  return dir
}
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

describe('build-public', () => {
  it('hashes the placeholder page when there is no player bundle and writes the manifest', () => {
    const publicDir = tmp()
    writeFileSync(join(publicDir, 'index.html'), '<!doctype html>placeholder')
    writeFileSync(join(publicDir, '_headers'), '/*\n  X: y\n')
    const manifest = buildPublic({ publicDir, playerDir: join(tmp(), 'missing') })
    expect(manifest.source).toBe('placeholder')
    expect(manifest.files).toEqual(['index.html'])
    expect(manifest.playerBundleSha256).toMatch(/^[a-f0-9]{64}$/)
    const written = JSON.parse(readFileSync(join(publicDir, 'manifest.json'), 'utf8'))
    expect(written.playerBundleSha256).toBe(manifest.playerBundleSha256)
  })

  it('copies the player bundle in, keeps _headers, and hashes deterministically over sorted paths', () => {
    const publicDir = tmp()
    writeFileSync(join(publicDir, 'index.html'), 'old placeholder')
    writeFileSync(join(publicDir, 'placeholder.css'), 'body{}')
    writeFileSync(join(publicDir, '_headers'), '/*\n  X: y\n')
    const playerDir = tmp()
    mkdirSync(join(playerDir, 'assets'))
    writeFileSync(join(playerDir, 'index.html'), '<!doctype html>player')
    writeFileSync(join(playerDir, 'assets', 'app.js'), 'console.log(1)')
    const first = buildPublic({ publicDir, playerDir })
    expect(first.source).toBe('out/player')
    expect(first.files).toEqual(['assets/app.js', 'index.html'])
    expect(readFileSync(join(publicDir, '_headers'), 'utf8')).toContain('X: y')
    expect(() => readFileSync(join(publicDir, 'placeholder.css'))).toThrow()
    const second = buildPublic({ publicDir, playerDir })
    expect(second.playerBundleSha256).toBe(first.playerBundleSha256)
    expect(bundleHash(playerDir, listFiles(playerDir))).toBe(first.playerBundleSha256)
    writeFileSync(join(playerDir, 'assets', 'app.js'), 'console.log(2)')
    expect(buildPublic({ publicDir, playerDir }).playerBundleSha256).not.toBe(
      first.playerBundleSha256,
    )
  })
})
