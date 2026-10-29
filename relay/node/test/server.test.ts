// The Node adapter's own behaviour (spec 0409): the server key, the HTTP routes, TLS, the
// allow-list, restart, graceful stop and the log. The protocol itself is covered by the shared
// contract in conformance.test.ts.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { toBase64Url } from '@shared/live/bytes'
import { PROTOCOL_VERSION } from '@shared/live/protocol'
import { sseTransport, wsTransport } from '@main/live/transport/lan/test-clients'
import { action, createSession, http, startTestServer, type TestServer } from './helpers'

const A = toBase64Url(new Uint8Array(16).fill(1))
const CONTROLLER = toBase64Url(new Uint8Array(16).fill(9))
const JOIN = new Uint8Array(16).fill(7)
const RESUME = new Uint8Array(16).fill(3)

const servers: TestServer[] = []
afterEach(async () => {
  for (const s of servers.splice(0)) await s.destroy()
})
async function start(opts: Parameters<typeof startTestServer>[0] = {}) {
  const s = await startTestServer(opts)
  servers.push(s)
  return s
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))
  return Array.from(digest, (b) => b.toString(16).padStart(2, '0')).join('')
}

function messageFrame(session: string, seq: number): string {
  return JSON.stringify({
    v: PROTOCOL_VERSION,
    session,
    seq,
    from: CONTROLLER,
    to: 'all',
    type: 'message.send',
    ts: Date.now(),
    payload: { k: 's1', n: 'AAAAAAAAAAAAAAAA', c: 'AAAAAAAAAA' },
  })
}

describe('session creation and the server key', () => {
  it('refuses creation without the key, with the same plain answer for a wrong key', async () => {
    const s = await start()
    const none = await http(`${s.url}/v1/sessions`, { method: 'POST', body: '{"v":1}' })
    const wrong = await http(`${s.url}/v1/sessions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${'x'.repeat(43)}` },
      body: '{"v":1}',
    })
    expect(none.status).toBe(401)
    expect(wrong.status).toBe(401)
    expect(wrong.text).toBe(none.text)
    expect(wrong.text).not.toContain(s.serverKey)
  })

  it('creates a session with the key and announces the caps and expiry', async () => {
    const s = await start()
    const created = await createSession(s)
    expect(created.sessionId).toMatch(/^[A-Za-z0-9_-]{22}$/)
    expect(created.caps.clients).toBe(60)
    expect(created.expiresAt).toBeGreaterThan(Date.now())
  })

  it('refuses a creation request that comes from a web page or is not JSON', async () => {
    const s = await start()
    const auth = { Authorization: `Bearer ${s.serverKey}` }
    const page = await http(`${s.url}/v1/sessions`, {
      method: 'POST',
      headers: { ...auth, Origin: 'https://evil.example' },
      body: '{"v":1}',
    })
    const text = await http(`${s.url}/v1/sessions`, {
      method: 'POST',
      headers: { ...auth, 'Content-Type': 'text/plain' },
      body: '{"v":1}',
    })
    expect(page.status).toBe(403)
    expect(text.status).toBe(415)
  })

  it('stops at the session cap with SESSION_FULL', async () => {
    const s = await start({ maxSessions: 2 })
    await createSession(s)
    await createSession(s)
    const third = await http(`${s.url}/v1/sessions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${s.serverKey}` },
      body: '{"v":1}',
    })
    expect(third.status).toBe(503)
    expect(third.json<{ error: { code: string } }>().error.code).toBe('SESSION_FULL')
  })

  it('refuses a key guessed too often from one address', async () => {
    const s = await start()
    let last = 0
    for (let i = 0; i < 25; i++) {
      last = (
        await http(`${s.url}/v1/sessions`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${'y'.repeat(43)}` },
          body: '{"v":1}',
        })
      ).status
    }
    expect(last).toBe(429)
  })
})

describe('probing the server key', () => {
  it('says whether the key is accepted without creating a session', async () => {
    const s = await start()
    const ok = await http(`${s.url}/v1/sessions/probe`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${s.serverKey}` },
      body: '{}',
    })
    const bad = await http(`${s.url}/v1/sessions/probe`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${'x'.repeat(43)}` },
      body: '{}',
    })
    expect(ok.status).toBe(200)
    expect(bad.status).toBe(401)
    expect(s.db.records()).toHaveLength(0)
  })
})

describe('controller actions', () => {
  it('needs the controller token; the server key is not one', async () => {
    const s = await start()
    const created = await createSession(s)
    expect((await action(s, created.sessionId, 'kick', s.serverKey, { client: A })).status).toBe(
      401,
    )
    expect(
      (await action(s, created.sessionId, 'kick', created.controllerToken, { client: A })).status,
    ).toBe(204)
  })

  it('rotates the join token, adds a co-controller and ends the session', async () => {
    const s = await start()
    const created = await createSession(s)
    const hash = await sha256Hex(JOIN)
    expect(
      (
        await action(s, created.sessionId, 'join-token', created.controllerToken, {
          joinTokenHash: hash,
        })
      ).status,
    ).toBe(204)
    const co = await action(s, created.sessionId, 'controllers', created.controllerToken)
    expect(co.status).toBe(201)
    const second = co.json<{ controllerToken: string }>().controllerToken
    expect((await action(s, created.sessionId, 'end', second)).status).toBe(204)
    expect((await action(s, created.sessionId, 'kick', second, { client: A })).status).toBe(410)
  })

  it('answers an unknown session with 404 and a bad body with 400', async () => {
    const s = await start()
    const created = await createSession(s)
    expect((await action(s, 'A'.repeat(22), 'end', created.controllerToken)).status).toBe(404)
    expect(
      (await action(s, created.sessionId, 'kick', created.controllerToken, { nope: 1 })).status,
    ).toBe(400)
  })
})

describe('connecting', () => {
  it('refuses tokens in the URL and a WebSocket from another origin', async () => {
    const s = await start()
    const created = await createSession(s)
    const inQuery = await http(`${s.url}/v1/sessions/${created.sessionId}/events?client=${A}&j=abc`)
    expect(inQuery.status).toBe(400)
    const closed = await wsTransport(
      s.url,
      created.sessionId,
      { clientId: A, joinToken: JOIN, resumeToken: RESUME },
      { headers: { Origin: 'https://evil.example' } },
    )
    const code = await new Promise<number>((resolve) => closed.onClose((c) => resolve(c)))
    expect(code).toBe(403)
  })

  it('refuses a controller socket with a bad token', async () => {
    const s = await start()
    const created = await createSession(s)
    const t = await wsTransport(
      s.url,
      created.sessionId,
      { clientId: CONTROLLER },
      { protocols: ['as-live.v1'], headers: { Authorization: `Bearer ${'z'.repeat(43)}` } },
    )
    expect(await new Promise<number>((resolve) => t.onClose((c) => resolve(c)))).toBe(401)
  })

  it('refuses addresses off the allow-list before TLS and lets listed ones in', async () => {
    const off = await start({ allow: ['10.99.0.0/16'] })
    await expect(http(`${off.url}/v1/health`)).rejects.toThrow()
    const on = await start({ allow: ['127.0.0.0/8', '::1'] })
    expect((await http(`${on.url}/v1/health`)).status).toBe(200)
  })

  it('serves a blob to a device that holds the join token, over the fallback route', async () => {
    const s = await start()
    const hash = await sha256Hex(JOIN)
    const created = await createSession(s, hash)
    const bytes = new Uint8Array(300).fill(5)
    const t = await sseTransport(s.url, created.sessionId, {
      clientId: A,
      joinToken: JOIN,
      resumeToken: RESUME,
    })
    void t
    const live = s.registry.get(created.sessionId)!
    live.store.putChunk(
      toBase64Url(new Uint8Array(16).fill(4)),
      { uploader: CONTROLLER, controller: true, count: 1, startedAt: Date.now() },
      0,
      toBase64Url(bytes),
      bytes.length,
    )
    const blobId = toBase64Url(new Uint8Array(16).fill(4))
    const headers = { 'X-AS-Join': toBase64Url(JOIN) }
    const ok = await http(`${s.url}/v1/sessions/${created.sessionId}/blobs/${blobId}`, { headers })
    expect(ok.status).toBe(200)
    const no = await http(`${s.url}/v1/sessions/${created.sessionId}/blobs/${blobId}`)
    expect(no.status).toBe(401)
    t.close()
  })
})

describe('health and the player page', () => {
  it('reports kind, caps and the bundle hash, and the fingerprint only when self-signed', async () => {
    const plain = await start()
    const h = (await http(`${plain.url}/v1/health`)).json<Record<string, unknown>>()
    expect(h).toMatchObject({ kind: 'self-hosted', protocol: [1] })
    expect(h.playerBundleSha256).toMatch(/^[a-f0-9]{64}$/)
    expect(h.fingerprintSha256).toBeUndefined()
    const tls = await start({ tls: 'self-signed' })
    const res = await http(`${tls.url}/v1/health`)
    expect(res.json<{ fingerprintSha256: string }>().fingerprintSha256).toBe(res.peerFingerprint)
  })

  it('serves the page for / and /s/<id> with a content security policy, and 404 elsewhere', async () => {
    const s = await start()
    const page = await http(`${s.url}/s/${'A'.repeat(22)}`)
    expect(page.status).toBe(200)
    expect(String(page.headers['content-security-policy'])).toContain("default-src 'none'")
    expect((await http(`${s.url}/..%2f..%2fetc%2fpasswd`)).status).toBe(404)
    expect((await http(`${s.url}/v1/nothing`)).status).toBe(404)
  })
})

describe('restart, stop and the log', () => {
  it('keeps the stored frames across a restart and serves a catch-up from them', async () => {
    const first = await start()
    const created = await createSession(first)
    const t = await wsTransport(
      first.url,
      created.sessionId,
      { clientId: CONTROLLER },
      {
        protocols: ['as-live.v1'],
        headers: { Authorization: `Bearer ${created.controllerToken}` },
      },
    )
    t.send(messageFrame(created.sessionId, 1))
    const live = first.registry.get(created.sessionId)!
    await new Promise((r) => setTimeout(r, 200))
    expect(live.hub.lastIndex).toBe(1)
    t.close()
    await first.stop()
    const second = await start({ dataDir: first.dataDir, serverKey: first.serverKey })
    expect(second.registry.get(created.sessionId)!.hub.lastIndex).toBe(1)
    expect(
      (await action(second, created.sessionId, 'controllers', created.controllerToken)).status,
    ).toBe(201)
  })

  it('stops within the deadline with a connected device, closing it with 1001', async () => {
    const s = await start()
    const created = await createSession(s, await sha256Hex(JOIN))
    const t = await wsTransport(s.url, created.sessionId, {
      clientId: A,
      joinToken: JOIN,
      resumeToken: RESUME,
    })
    const closed = new Promise<number>((resolve) => t.onClose((c) => resolve(c)))
    await new Promise((r) => setTimeout(r, 200))
    const started = Date.now()
    await s.stop()
    expect(Date.now() - started).toBeLessThan(10_000)
    expect(await closed).toBe(1001)
  })

  it('logs connections with fixed fields and never a token, key or frame', async () => {
    const s = await start()
    const created = await createSession(s, await sha256Hex(JOIN))
    const t = await wsTransport(s.url, created.sessionId, {
      clientId: A,
      joinToken: JOIN,
      resumeToken: RESUME,
    })
    await new Promise((r) => setTimeout(r, 200))
    t.close()
    await new Promise((r) => setTimeout(r, 200))
    await s.stop()
    const text = readFileSync(join(s.dataDir, 'logs', 'connections.log'), 'utf8')
    const lines = text
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l) as Record<string, unknown>)
    expect(lines.map((l) => l.event)).toEqual(expect.arrayContaining(['connect', 'close']))
    expect(lines[0]).toMatchObject({ session: created.sessionId, remote: '127.0.0.1' })
    for (const secret of [
      s.serverKey,
      created.controllerToken,
      toBase64Url(JOIN),
      toBase64Url(RESUME),
    ]) {
      expect(text).not.toContain(secret)
    }
  })
})
