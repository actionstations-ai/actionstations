// The app-side clients for the relay (#408) and a self-hosted server (#409) against a local
// stand-in server over the real SessionHub: health, create, join token, the controller socket,
// kick and end; then certificate pinning on a self-signed https server, the server key and the
// address rules. No deployed server is contacted.
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

const { startTestServer } = await import('./test-remote-server')
const { createRelayClient, relayBase } = await import('./relay-client')
const { createSelfHostedClient, serverKeyName, setServerKey, hasServerKey, getServerKey } =
  await import('./self-hosted-client')
const { CERT_CHANGED_MESSAGE, normalizeServerUrl } = await import('./remote')
const { resetSecretsQueue } = await import('../../secrets')

type TestServer = Awaited<ReturnType<typeof startTestServer>>
let server: TestServer | undefined

beforeEach(() => {
  process.env.TTX_USER_DATA = mkdtempSync(join(tmpdir(), 'ttx-remote-ud-'))
  resetSecretsQueue()
})
afterEach(async () => {
  delete process.env.TTX_LIVE_RELAY_URL
  await server?.close()
  server = undefined
})

function firstFrame(t: { onFrame(cb: (f: string) => void): () => void }): Promise<string> {
  return new Promise((resolve) => t.onFrame(resolve))
}

describe('relay client', () => {
  it('creates a session, registers the join token and opens the controller socket', async () => {
    server = await startTestServer({ kind: 'relay' })
    const client = createRelayClient(server.base)
    expect((await client.health()).health.kind).toBe('relay')
    const created = await client.create()
    const auth = { sessionId: created.sessionId, controllerToken: created.controllerToken }
    await client.setJoinToken(auth, 'a'.repeat(64))
    const transport = await client.connect(auth, 'ABCDEFGHIJKLMNOPQRSTUV')
    expect(JSON.parse(await firstFrame(transport))).toBeTruthy()
    transport.close()
    await client.end(auth)
    expect(server.requests).toContain(`POST /v1/sessions/${created.sessionId}/end`)
  })

  it('names the daily limit when the relay refuses a new session', async () => {
    server = await startTestServer({ kind: 'relay', dailyLimit: true })
    await expect(createRelayClient(server.base).create()).rejects.toThrow(/daily limit/)
  })

  it('refuses a controller socket with the wrong token', async () => {
    server = await startTestServer({ kind: 'relay' })
    const client = createRelayClient(server.base)
    const created = await client.create()
    await expect(
      client.connect(
        { sessionId: created.sessionId, controllerToken: 'x'.repeat(30) },
        'c'.repeat(22),
      ),
    ).rejects.toThrow(/refused/)
  })

  it('uses the shipped address unless an unpackaged run overrides it', () => {
    expect(relayBase()).toBe('https://relay.actionstations.ai')
    process.env.TTX_LIVE_RELAY_URL = 'http://127.0.0.1:8787/'
    expect(relayBase()).toBe('http://127.0.0.1:8787')
    process.env.TTX_LIVE_RELAY_URL = 'http://relay.example.com'
    expect(() => relayBase()).toThrow(/not usable/)
  })
})

describe('self-hosted client', () => {
  it('sends the server key to create a session and refuses a wrong one', async () => {
    server = await startTestServer({ kind: 'self-hosted', serverKey: 'sk-right-key' })
    const good = await createSelfHostedClient({
      url: server.base,
      insecureHttp: true,
      serverKey: 'sk-right-key',
    })
    expect((await good.create()).sessionId).toHaveLength(22)
    const bad = await createSelfHostedClient({
      url: server.base,
      insecureHttp: true,
      serverKey: 'sk-wrong',
    })
    await expect(bad.create()).rejects.toThrow(/refused the server key/)
  })

  it('checks the key with the dry-run route, or says the server has none', async () => {
    server = await startTestServer({ kind: 'self-hosted', serverKey: 'sk-right-key', probe: true })
    const url = server.base
    const probe = (serverKey: string) =>
      createSelfHostedClient({ url, insecureHttp: true, serverKey }).then((c) => c.probeKey())
    expect(await probe('sk-right-key')).toBe('accepted')
    expect(await probe('sk-wrong')).toBe('refused')
    await server.close()
    server = await startTestServer({ kind: 'self-hosted', serverKey: 'k' })
    const older = await createSelfHostedClient({
      url: server.base,
      insecureHttp: true,
      serverKey: 'k',
    })
    expect(await older.probeKey()).toBe('unsupported')
  })

  it('takes the stored key when none is typed', async () => {
    server = await startTestServer({ kind: 'self-hosted', serverKey: 'sk-stored' })
    await setServerKey(server.base, 'sk-stored')
    expect(await hasServerKey(server.base)).toBe(true)
    const client = await createSelfHostedClient({ url: server.base, insecureHttp: true })
    expect((await client.create()).caps.clients).toBeGreaterThan(0)
  })

  it('keeps the key under a name derived from the address, never the address itself', async () => {
    const name = serverKeyName('https://live.example.org/')
    expect(name).toMatch(/^live-server-[a-f0-9]{64}$/)
    expect(name).toBe(serverKeyName('https://live.example.org'))
    await setServerKey('https://live.example.org', 'secret-value')
    expect(await getServerKey('https://live.example.org/')).toBe('secret-value')
  })
})

describe('certificate pinning on a self-signed server', () => {
  it('rejects an unknown self-signed certificate until it is pinned', async () => {
    server = await startTestServer({ kind: 'self-hosted', tls: true })
    const client = await createSelfHostedClient({ url: server.base })
    await expect(client.health()).rejects.toThrow(/not trusted/)
  })

  it('shows the fingerprint of an unknown certificate when inspecting', async () => {
    server = await startTestServer({ kind: 'self-hosted', tls: true })
    const client = await createSelfHostedClient({ url: server.base })
    const res = await client.health({ inspect: true })
    expect(res.certificate?.authorized).toBe(false)
    expect(res.certificate?.fingerprint256).toBe(server.fingerprintSha256)
  })

  it('talks to the server once the fingerprint is pinned, including the socket', async () => {
    server = await startTestServer({ kind: 'self-hosted', tls: true })
    const client = await createSelfHostedClient({
      url: server.base,
      fingerprintSha256: server.fingerprintSha256!,
    })
    const created = await client.create()
    const transport = await client.connect(
      { sessionId: created.sessionId, controllerToken: created.controllerToken },
      'c'.repeat(22),
    )
    expect(await firstFrame(transport)).toBeTruthy()
    transport.close()
  })

  it('stops with the certificate-changed message when the pin does not match', async () => {
    server = await startTestServer({ kind: 'self-hosted', tls: true })
    const wrong = Array.from({ length: 32 }, () => 'AB').join(':')
    const client = await createSelfHostedClient({ url: server.base, fingerprintSha256: wrong })
    await expect(client.health()).rejects.toThrow(CERT_CHANGED_MESSAGE)
    await expect(client.create()).rejects.toThrow(CERT_CHANGED_MESSAGE)
    // Nothing, including the server key, reached the server whose certificate was not pinned.
    expect(server.requests).toEqual([])
  })

  it('does not open the controller socket on a certificate that is not the pinned one', async () => {
    server = await startTestServer({ kind: 'self-hosted', tls: true })
    const pinned = await createSelfHostedClient({
      url: server.base,
      fingerprintSha256: server.fingerprintSha256!,
    })
    const created = await pinned.create()
    const wrong = Array.from({ length: 32 }, () => 'CD').join(':')
    const other = await createSelfHostedClient({ url: server.base, fingerprintSha256: wrong })
    await expect(
      other.connect(
        { sessionId: created.sessionId, controllerToken: created.controllerToken },
        'c'.repeat(22),
      ),
    ).rejects.toThrow(CERT_CHANGED_MESSAGE)
  })
})

describe('server addresses', () => {
  it('accepts https and strips a trailing slash', () => {
    expect(normalizeServerUrl('https://live.example.org/')).toBe('https://live.example.org')
    expect(normalizeServerUrl('https://live.example.org/as/')).toBe('https://live.example.org/as')
  })

  it('accepts http only with the tick and a loopback or private host', () => {
    expect(() => normalizeServerUrl('http://10.1.2.3:8443')).toThrow(/https/)
    expect(normalizeServerUrl('http://10.1.2.3:8443', true)).toBe('http://10.1.2.3:8443')
    expect(normalizeServerUrl('http://localhost:8080', true)).toBe('http://localhost:8080')
    expect(() => normalizeServerUrl('http://live.example.org', true)).toThrow(/https/)
  })

  it('refuses logins, queries, fragments and other schemes', () => {
    for (const bad of [
      'https://user:pw@live.example.org',
      'https://live.example.org/?token=1',
      'https://live.example.org/#x',
      'ftp://live.example.org',
      'not a url',
    ]) {
      expect(() => normalizeServerUrl(bad, true), bad).toThrow()
    }
  })
})
