// Remembered servers (spec 0410 FR-2, FR-10): addresses and pins in settings, the key only in the
// encrypted secret store, `hasKey` as all anyone else learns.
import { mkdtempSync, readFileSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: { on: vi.fn(), getPath: () => tmpdir(), isPackaged: false, getVersion: () => 'test' },
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (s: string) => Buffer.from(`enc:${s}`, 'utf8'),
    decryptString: (b: Buffer) => b.toString('utf8').replace(/^enc:/, ''),
  },
}))

const { saveServer, listServers, forgetServer, recordServerTest } = await import('./servers')
const { getServerKey } = await import('./transport/self-hosted-client')
const { resetSettingsCache, getSettings } = await import('../settings/store')
const { resetSecretsQueue } = await import('../secrets')

const FP = Array.from({ length: 32 }, () => 'AB').join(':')
let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'ttx-servers-ud-'))
  process.env.TTX_USER_DATA = dir
  resetSettingsCache()
  resetSecretsQueue()
})

describe('remembered servers', () => {
  it('keeps the key out of settings and reports only that it is stored', async () => {
    const saved = await saveServer({
      url: 'https://live.example.org/',
      name: 'County EOC',
      fingerprintSha256: FP,
      serverKey: 'sk-very-secret',
    })
    expect(saved).toMatchObject({
      url: 'https://live.example.org',
      name: 'County EOC',
      hasKey: true,
    })
    const settingsText = readFileSync(join(dir, 'settings.json'), 'utf8')
    expect(settingsText).not.toContain('sk-very-secret')
    expect(settingsText).toContain(FP)
    expect(await getServerKey('https://live.example.org')).toBe('sk-very-secret')
    expect(await listServers()).toEqual([expect.objectContaining({ hasKey: true })])
  })

  it('updates an entry in place and keeps the stored key when none is sent', async () => {
    await saveServer({ url: 'https://live.example.org', serverKey: 'k1' })
    await saveServer({ url: 'https://live.example.org/', name: 'Renamed' })
    const list = await listServers()
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({ name: 'Renamed', hasKey: true })
  })

  it('forgetting a server removes its key too', async () => {
    await saveServer({ url: 'https://live.example.org', serverKey: 'k1' })
    await forgetServer('https://live.example.org')
    expect(await listServers()).toEqual([])
    expect(await getServerKey('https://live.example.org')).toBeUndefined()
  })

  it('holds at most 20 servers', async () => {
    for (let i = 0; i < 20; i++) await saveServer({ url: `https://s${i}.example.org` })
    await expect(saveServer({ url: 'https://one-too-many.example.org' })).rejects.toThrow(
      /up to 20/,
    )
  })

  it('notes the last test of a remembered server and ignores any other address', async () => {
    await saveServer({ url: 'https://live.example.org' })
    await recordServerTest('https://live.example.org', 'The server did not answer.')
    await recordServerTest('https://stranger.example.org', 'x')
    const [entry] = (await getSettings()).live.servers
    expect(entry?.lastError).toBe('The server did not answer.')
    expect(entry?.lastTestedAt).toBeTruthy()
    await recordServerTest('https://live.example.org')
    expect((await getSettings()).live.servers[0]?.lastError).toBeUndefined()
    expect(readdirSync(dir).length).toBeGreaterThan(0)
  })
})
