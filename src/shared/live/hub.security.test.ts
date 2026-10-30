// The #457 security review's proofs of concept, turned around: each asserts the attack fails
// against the hub (H1: memory exhaustion by one player; M1: unbounded catch-up).
import { describe, expect, it } from 'vitest'
import { toBase64Url } from './bytes'
import { createWebCryptoProvider } from './crypto/webcrypto'
import { SessionHub, type HubSocket } from './hub'
import { CLOSE_CODES, LIMITS, PROTOCOL_VERSION } from './protocol'

const crypto = createWebCryptoProvider()
const SESSION = toBase64Url(new Uint8Array(16).fill(5))
const JOIN = new Uint8Array(16).fill(7)
const hex = (b: Uint8Array) => [...b].map((x) => x.toString(16).padStart(2, '0')).join('')
const id = (n: number) => toBase64Url(new Uint8Array(16).fill(n))
const resume = (n: number) => new Uint8Array(16).fill(100 + n)
const CHUNK = toBase64Url(new Uint8Array(100 * 1024))

interface Sock extends HubSocket {
  closed: number | undefined
  frames: string[]
  errors(code?: string): number
}
const sock = (): Sock => {
  const s: Sock = {
    closed: undefined,
    frames: [],
    send: (f) => s.frames.push(f),
    close: (c) => (s.closed = c),
    errors: (code) =>
      s.frames.filter((f) => {
        const e = JSON.parse(f) as { type: string; payload: { code?: string } }
        return e.type === 'relay.error' && (!code || e.payload.code === code)
      }).length,
  }
  return s
}

const frame = (from: string, seq: number, type: string, payload: object = {}, to = 'all') =>
  JSON.stringify({
    v: PROTOCOL_VERSION,
    session: SESSION,
    seq,
    from,
    to,
    type,
    ts: Date.now(),
    payload,
  })

let clock = 1_700_000_000_000
async function hub(extra: Partial<ConstructorParameters<typeof SessionHub>[0]> = {}) {
  return new SessionHub({
    sessionId: SESSION,
    kind: 'lan',
    joinTokenHash: hex(await crypto.sha256(JOIN)),
    crypto,
    framesPerMinute: 60,
    now: () => clock,
    ...extra,
  })
}

describe('H1: one device cannot exhaust the host', () => {
  it('the rate limit follows the identity across reconnects: 60 frames a minute, however often it reconnects', async () => {
    const h = await hub()
    let seq = 0
    let stored = 0
    for (let round = 0; round < 5; round++) {
      const s = sock()
      const c = await h.attach(s, { clientId: id(1), joinToken: JOIN, resumeToken: resume(1) })
      for (let i = 0; i < 61 && c.open; i++) c.receive(frame(id(1), ++seq, 'message.send'))
      stored = h.stored.length
      if (round === 0) expect(s.closed).toBe(CLOSE_CODES.RATE_LIMITED)
    }
    expect(stored).toBe(60)
    clock += 60_000 // a minute later the bucket has refilled
    const s = sock()
    const c = await h.attach(s, { clientId: id(1), joinToken: JOIN, resumeToken: resume(1) })
    c.receive(frame(id(1), seq + 1, 'message.send'))
    expect(h.stored.length).toBe(61)
  })

  it('fresh client ids from one address share its budget: a fifth identity is refused and the address bucket caps them all', async () => {
    const h = await hub({ framesPerMinutePerRemote: 100 })
    let total = 0
    for (let n = 1; n <= 4; n++) {
      const s = sock()
      const c = await h.attach(s, {
        clientId: id(n),
        joinToken: JOIN,
        resumeToken: resume(n),
        remote: '10.0.0.9',
      })
      expect(s.closed).toBeUndefined()
      for (let i = 1; i <= 60 && c.open; i++) c.receive(frame(id(n), i, 'message.send'))
      total = h.stored.length
    }
    expect(total).toBe(100) // the per-address bucket, not 4 × 60
    const fifth = sock()
    const c = await h.attach(fifth, {
      clientId: id(5),
      joinToken: JOIN,
      resumeToken: resume(5),
      remote: '10.0.0.9',
    })
    expect(c.open).toBe(false)
    expect(fifth.closed).toBe(CLOSE_CODES.RATE_LIMITED)
    // Another address still gets in.
    const other = sock()
    await h.attach(other, {
      clientId: id(6),
      joinToken: JOIN,
      resumeToken: resume(6),
      remote: '10.0.0.10',
    })
    expect(other.closed).toBeUndefined()
  })

  it('a participant has an upload budget for the session, half-finished uploads are freed after the TTL, and the players share a pool the controller does not touch', async () => {
    const h = await hub({
      framesPerMinute: Infinity,
      playerUploadBudgetBytes: 300 * 1024,
      playersBlobPoolBytes: 500 * 1024,
      incompleteBlobTtlMs: 1_000,
    })
    const s = sock()
    const c = await h.attach(s, { clientId: id(1), joinToken: JOIN, resumeToken: resume(1) })
    let seq = 0
    const put = (blob: number, index: number, count: number) =>
      c.receive(
        frame(
          id(1),
          ++seq,
          'relay.blob.put',
          { blobId: id(50 + blob), index, count, bytes: CHUNK },
          'controller',
        ),
      )
    // 3 × 100 KiB of never-completed uploads fit the 300 KiB budget; the fourth chunk does not.
    put(1, 0, 5)
    put(2, 0, 5)
    put(3, 0, 5)
    expect(h.blobBytes).toBe(300 * 1024)
    put(4, 0, 5)
    expect(s.errors('BLOB_QUOTA')).toBe(1)
    expect(h.blobBytes).toBe(300 * 1024)
    // The TTL frees the memory but not the budget: the device cannot start over.
    clock += 2_000
    expect(h.sweepBlobs()).toBe(3)
    expect(h.blobBytes).toBe(0)
    put(5, 0, 5)
    expect(s.errors('BLOB_QUOTA')).toBe(2)
    // The controller's uploads count against the session quota only, never the players' pool.
    const ctl = sock()
    const cc = await h.attach(ctl, { clientId: id(9), controller: true })
    for (let i = 0; i < 6; i++) {
      cc.receive(
        frame(
          id(9),
          i + 1,
          'relay.blob.put',
          { blobId: id(80), index: i, count: 6, bytes: CHUNK },
          'controller',
        ),
      )
    }
    expect(ctl.errors()).toBe(0)
    expect(h.blobBytes).toBe(600 * 1024)
    expect(h.playerBlobBytes).toBe(0)
  })

  it('the LAN limits keep blobs within what the host can hold in memory', () => {
    expect(LIMITS.lan.blobsTotalBytes).toBeLessThanOrEqual(512 * 1024 * 1024)
    expect(LIMITS.lan.blobBytes).toBeLessThanOrEqual(128 * 1024 * 1024)
  })
})

describe('M1: a participant cannot make the hub replay the store at will', () => {
  it('limits catch-up requests per identity; the controller is exempt', async () => {
    const h = await hub({ framesPerMinute: Infinity, catchupsPerMinute: 2 })
    const s = sock()
    const c = await h.attach(s, { clientId: id(1), joinToken: JOIN, resumeToken: resume(1) })
    for (let i = 1; i <= 4; i++)
      c.receive(frame(id(1), i, 'catchup.request', { after: 0 }, 'controller'))
    expect(s.frames.filter((f) => f.includes('"catchup.batch"'))).toHaveLength(2)
    expect(s.errors('RATE_LIMITED')).toBe(2)
    expect(s.closed).toBeUndefined() // refused, not disconnected
    const ctl = sock()
    const cc = await h.attach(ctl, { clientId: id(9), controller: true })
    for (let i = 1; i <= 5; i++)
      cc.receive(frame(id(9), i, 'catchup.request', { after: 0 }, 'controller'))
    expect(ctl.frames.filter((f) => f.includes('"catchup.batch"'))).toHaveLength(5)
  })

  it('rate-limits a co-controller connection like a device, and never the host (#529)', async () => {
    const h = await hub({ coControllerFramesPerMinute: 3 })
    const co = sock()
    const cc = await h.attach(co, { clientId: id(8), controller: true, host: false })
    for (let i = 1; i <= 5; i++)
      cc.receive(frame(id(8), i, 'catchup.request', { after: 0 }, 'controller'))
    expect(co.frames.filter((f) => f.includes('"catchup.batch"')).length).toBeLessThanOrEqual(3)
    expect(co.errors('RATE_LIMITED')).toBeGreaterThan(0)
    const host = sock()
    const hc = await h.attach(host, { clientId: id(9), controller: true })
    for (let i = 1; i <= 10; i++)
      hc.receive(frame(id(9), i, 'catchup.request', { after: 0 }, 'controller'))
    expect(host.frames.filter((f) => f.includes('"catchup.batch"'))).toHaveLength(10)
  })

  it('binds a controller id to the token that first used it, also across a restart (#529)', async () => {
    const h = await hub()
    const first = sock()
    await h.attach(first, {
      clientId: id(9),
      controller: true,
      controllerTokenHash: 'a'.repeat(64),
    })
    const thief = sock()
    await h.attach(thief, {
      clientId: id(9),
      controller: true,
      host: false,
      controllerTokenHash: 'b'.repeat(64),
    })
    expect(thief.closed).toBe(CLOSE_CODES.CLIENT_ID_IN_USE)
    expect(first.closed).toBeUndefined()
    // No token at all is not the first token either.
    const bare = sock()
    await h.attach(bare, { clientId: id(9), controller: true })
    expect(bare.closed).toBe(CLOSE_CODES.CLIENT_ID_IN_USE)
    // The same token comes back.
    const again = sock()
    await h.attach(again, {
      clientId: id(9),
      controller: true,
      controllerTokenHash: 'a'.repeat(64),
    })
    expect(again.closed).toBeUndefined()
  })
})
