import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { buildPublic } from '../../relay/cloudflare/scripts/build-public.mjs'
import { playerBundleSha256 } from '../../scripts/player-bundle-hash.mjs'

const dirs: string[] = []
function tmp(): string {
  const dir = mkdtempSync(join(tmpdir(), 'player-hash-'))
  dirs.push(dir)
  return dir
}
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

function fakePlayer(): string {
  const dir = tmp()
  mkdirSync(join(dir, 'assets'))
  writeFileSync(join(dir, 'index.html'), '<!doctype html><script src="/assets/a.js"></script>')
  writeFileSync(join(dir, 'assets', 'a.js'), 'console.log(1)')
  writeFileSync(join(dir, 'manifest.json'), '{"builtAt":"2026-10-29T00:00:00Z"}')
  return dir
}

describe('playerBundleSha256', () => {
  it('is empty when there is no player build', () => {
    expect(playerBundleSha256(join(tmp(), 'missing'))).toBe('')
  })

  it('equals the hash the relay reports for the same player build', () => {
    const player = fakePlayer()
    const published = buildPublic({ publicDir: tmp(), playerDir: player })
    expect(playerBundleSha256(player)).toBe(published.playerBundleSha256)
  })

  it('ignores the build time in manifest.json but not the page contents', () => {
    const player = fakePlayer()
    const before = playerBundleSha256(player)
    writeFileSync(join(player, 'manifest.json'), '{"builtAt":"2030-01-01T00:00:00Z"}')
    expect(playerBundleSha256(player)).toBe(before)
    writeFileSync(join(player, 'assets', 'a.js'), 'console.log(2)')
    expect(playerBundleSha256(player)).not.toBe(before)
  })
})
