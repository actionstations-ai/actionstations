// The SSE stream as a hub connection (#457 review M1): a reader that stops draining is dropped
// once the queued output passes the cap, like a stalled WebSocket.
import { EventEmitter } from 'node:events'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { toBase64Url } from '@shared/live/bytes'
import { createWebCryptoProvider } from '@shared/live/crypto/webcrypto'
import { SessionHub } from '@shared/live/hub'
import { PROTOCOL_VERSION } from '@shared/live/protocol'
import { HttpFallback, SSE_MAX_BUFFERED_BYTES } from './fallback'
import { LanLog } from './log'
import { Peers } from './peers'

const crypto = createWebCryptoProvider()
const SESSION = toBase64Url(new Uint8Array(16).fill(5))
const JOIN = new Uint8Array(16).fill(7)
const hex = (b: Uint8Array) => [...b].map((x) => x.toString(16).padStart(2, '0')).join('')

/** A response whose `writableLength` the test sets: the kernel buffer standing in for a stalled phone. */
class FakeRes extends EventEmitter {
  writableEnded = false
  writableLength = 0
  destroyed = false
  written: string[] = []
  headers: Record<string, unknown> = {}
  writeHead(_status: number, headers: Record<string, unknown>) {
    this.headers = headers
    return this
  }
  setHeader() {
    return this
  }
  write(chunk: string) {
    this.written.push(chunk)
    return true
  }
  end() {
    this.writableEnded = true
  }
  destroy() {
    this.destroyed = true
    this.emit('close')
  }
}

describe('SSE fallback back-pressure', () => {
  it('drops a stream whose reader stalls past the buffered cap instead of queueing more', async () => {
    const hub = new SessionHub({
      sessionId: SESSION,
      kind: 'lan',
      joinTokenHash: hex(await crypto.sha256(JOIN)),
      crypto,
    })
    const dir = mkdtempSync(join(tmpdir(), 'ttx-sse-'))
    const peers = new Peers()
    const fallback = new HttpFallback({ hub, peers, log: new LanLog(join(dir, 'lan.log')) })
    const res = new FakeRes()
    const req = new EventEmitter()
    const clientId = toBase64Url(new Uint8Array(16).fill(1))
    await fallback.events(
      req as never,
      res as never,
      { clientId, joinToken: JOIN, resumeToken: new Uint8Array(16).fill(2) },
      '10.0.0.4',
    )
    expect(res.written.some((w) => w.includes('"relay.hello"'))).toBe(true)
    expect(peers.count).toBe(1)
    // A frame from the controller fans out; while the reader keeps up it is written.
    const ctl = toBase64Url(new Uint8Array(16).fill(9))
    const controller = await hub.attach(
      { send: () => {}, close: () => {} },
      { clientId: ctl, controller: true },
    )
    const envelope = (seq: number) =>
      JSON.stringify({
        v: PROTOCOL_VERSION,
        session: SESSION,
        seq,
        from: ctl,
        to: 'all',
        type: 'clock.state',
        ts: 1,
        payload: {},
      })
    controller.receive(envelope(1))
    expect(res.written.filter((w) => w.includes('"clock.state"'))).toHaveLength(1)
    // The reader stalls: the socket buffer is past the cap when the next frame arrives.
    res.writableLength = SSE_MAX_BUFFERED_BYTES + 1
    controller.receive(envelope(2))
    expect(res.destroyed).toBe(true)
    expect(res.written.filter((w) => w.includes('"clock.state"'))).toHaveLength(1)
    expect(peers.count).toBe(0)
    expect(hub.connected).not.toContain(clientId)
    fallback.closeAll()
  })
})
