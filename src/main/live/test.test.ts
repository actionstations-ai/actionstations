// The connection test (spec 0410 FR-4): the checklist for each kind against local stand-in
// servers. LAN: a free port, a port in use, no addresses. Relay: healthy, wrong protocol,
// unreachable. Self-hosted: unconfirmed certificate (with its fingerprint), pinned, changed pin,
// key accepted or refused. Nothing touches a deployed server.
import { createServer } from 'node:net'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: { on: vi.fn(), getPath: () => tmpdir(), isPackaged: false, getVersion: () => 'test' },
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (s: string) => Buffer.from(s, 'utf8'),
    decryptString: (b: Buffer) => b.toString('utf8'),
  },
}))

const addresses = vi.hoisted(() => ({ list: [] as unknown[] }))
vi.mock('./transport/lan/addresses', () => ({ listLanAddresses: () => addresses.list }))

const { connectionTest } = await import('./test')
const { startTestServer } = await import('./transport/test-remote-server')
const { resetSecretsQueue } = await import('../secrets')
const { setServerKey } = await import('./transport/self-hosted-client')

type TestServer = Awaited<ReturnType<typeof startTestServer>>
let server: TestServer | undefined
const status = (r: Awaited<ReturnType<typeof connectionTest>>, id: string) =>
  r.checks.find((c) => c.id === id)?.status

beforeEach(() => {
  process.env.TTX_USER_DATA = mkdtempSync(join(tmpdir(), 'ttx-test-ud-'))
  process.env.TTX_PLAYER_BUNDLE = tmpdir()
  addresses.list = [{ address: '127.0.0.1', interface: 'lo', kind: 'other', recommended: true }]
  resetSecretsQueue()
})
afterEach(async () => {
  delete process.env.TTX_LIVE_RELAY_URL
  await server?.close()
  server = undefined
})

describe('This computer', () => {
  it('passes with a free port and the player page installed', async () => {
    const r = await connectionTest({ kind: 'lan', address: '127.0.0.1', port: 18_485, tls: 'none' })
    expect(r.ok).toBe(true)
    expect(status(r, 'port')).toBe('pass')
  })

  it('warns that the session will use the next port when the port is in use', async () => {
    const busy = createServer()
    await new Promise<void>((resolve) => busy.listen(0, '127.0.0.1', resolve))
    const port = (busy.address() as { port: number }).port
    const r = await connectionTest({ kind: 'lan', address: '127.0.0.1', port, tls: 'none' })
    busy.close()
    expect(status(r, 'port')).toBe('warn')
    expect(r.ok).toBe(true)
  })

  it('fails with a next step when the computer has no network address', async () => {
    addresses.list = []
    const r = await connectionTest({ kind: 'lan', tls: 'none' })
    expect(r.ok).toBe(false)
    expect(r.checks.find((c) => c.id === 'network')?.nextStep).toMatch(/Wi-Fi/)
  })
})

describe('Action Stations relay', () => {
  it('lists reachable, protocol, limits and the player page for a healthy relay', async () => {
    server = await startTestServer({ kind: 'relay', playerBundleSha256: 'a'.repeat(64) })
    process.env.TTX_LIVE_RELAY_URL = server.base
    const r = await connectionTest({ kind: 'relay' })
    expect(r.ok).toBe(true)
    expect(r.checks.map((c) => c.id)).toEqual(['reachable', 'protocol', 'caps', 'bundle'])
    expect(r.server?.kind).toBe('relay')
  })

  it('fails with the update advice when the relay speaks another protocol', async () => {
    server = await startTestServer({ kind: 'relay', protocol: [2] })
    process.env.TTX_LIVE_RELAY_URL = server.base
    const r = await connectionTest({ kind: 'relay' })
    expect(r.ok).toBe(false)
    expect(r.checks.find((c) => c.id === 'protocol')?.nextStep).toMatch(/Update Action Stations/)
  })

  it('fails with a plain message when nothing answers', async () => {
    process.env.TTX_LIVE_RELAY_URL = 'http://127.0.0.1:9'
    const r = await connectionTest({ kind: 'relay' })
    expect(r.ok).toBe(false)
    expect(r.checks[0]?.detail).toMatch(/Could not reach/)
  })
})

describe('Your server', () => {
  it('refuses an http address without the tick before any request', async () => {
    const r = await connectionTest({
      kind: 'self-hosted',
      url: 'http://127.0.0.1:1',
      insecureHttp: false,
    })
    expect(r.ok).toBe(false)
    expect(r.checks[0]?.detail).toMatch(/https/)
  })

  it('shows the fingerprint of an unconfirmed certificate and does not send the key', async () => {
    server = await startTestServer({ kind: 'self-hosted', tls: true, serverKey: 'k', probe: true })
    const r = await connectionTest(
      { kind: 'self-hosted', url: server.base, insecureHttp: false },
      { serverKey: 'k' },
    )
    expect(r.server?.untrusted).toBe(true)
    expect(r.server?.fingerprintSha256).toBe(server.fingerprintSha256)
    expect(status(r, 'certificate')).toBe('warn')
    expect(server.requests.some((q) => q.includes('probe'))).toBe(false)
  })

  it('passes with the pinned fingerprint and an accepted key', async () => {
    server = await startTestServer({ kind: 'self-hosted', tls: true, serverKey: 'k', probe: true })
    const r = await connectionTest(
      {
        kind: 'self-hosted',
        url: server.base,
        insecureHttp: false,
        fingerprintSha256: server.fingerprintSha256!,
      },
      { serverKey: 'k' },
    )
    expect(r.ok).toBe(true)
    expect(status(r, 'certificate')).toBe('pass')
    expect(status(r, 'key')).toBe('pass')
  })

  it('fails with "certificate changed" when the pin no longer matches', async () => {
    server = await startTestServer({ kind: 'self-hosted', tls: true })
    const r = await connectionTest({
      kind: 'self-hosted',
      url: server.base,
      insecureHttp: false,
      fingerprintSha256: Array.from({ length: 32 }, () => 'AB').join(':'),
    })
    expect(r.ok).toBe(false)
    expect(r.checks[0]?.detail).toMatch(/certificate changed/)
  })

  it('fails when the server refuses the key and warns when there is no key', async () => {
    server = await startTestServer({ kind: 'self-hosted', serverKey: 'right', probe: true })
    const conn = { kind: 'self-hosted' as const, url: server.base, insecureHttp: true }
    const refused = await connectionTest(conn, { serverKey: 'wrong' })
    expect(status(refused, 'key')).toBe('fail')
    const missing = await connectionTest(conn)
    expect(status(missing, 'key')).toBe('warn')
    await setServerKey(server.base, 'right')
    expect(status(await connectionTest(conn), 'key')).toBe('pass')
  })
})
