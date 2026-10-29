/**
 * The `HubStore` contract (hub.ts), run against every backend: `MemoryHubStore`, the relay's
 * Durable Object SQLite store (#408) and the self-hosted server's `node:sqlite` store (#409). A
 * factory returns a fresh, empty store; `close` releases files. Imported by test files only.
 */
import { afterEach, describe, expect, it } from 'vitest'
import type { HubStore } from './hub'
import { PROTOCOL_VERSION } from './protocol'
import type { ClientId, Envelope } from './schemas'

export interface StoreHarness {
  store: HubStore
  close?(): void | Promise<void>
}

export type StoreFactory = () => StoreHarness | Promise<StoreHarness>

const A = 'playerA-00000000000000' as ClientId
const B = 'playerB-00000000000000' as ClientId
const BLOB = 'blob-00000000000000000'
const OTHER = 'other-0000000000000000'

function envelope(
  n: number,
  from: ClientId = A,
  to = 'all',
): { envelope: Envelope; frame: string } {
  const e: Envelope = {
    v: PROTOCOL_VERSION,
    session: 'session-00000000000000',
    seq: n,
    from,
    to,
    type: 'message.send',
    ts: 1_700_000_000_000,
    payload: { k: 's1', n: 'AAAAAAAAAAAAAAAA', c: 'A'.repeat(n * 10) },
  }
  return { envelope: e, frame: JSON.stringify(e) }
}

export function describeHubStoreContract(name: string, factory: StoreFactory): void {
  describe(`${name}: HubStore contract`, () => {
    const open: StoreHarness[] = []
    afterEach(async () => {
      for (const h of open.splice(0)) await h.close?.()
    })
    async function fresh(): Promise<HubStore> {
      const h = await factory()
      open.push(h)
      return h.store
    }

    it('keeps the hub state as a copy', async () => {
      const s = await fresh()
      expect(s.state()).toBeUndefined()
      s.setState({ joinTokenHash: 'a'.repeat(64), ended: false })
      const read = s.state()!
      read.ended = true
      expect(s.state()).toEqual({ joinTokenHash: 'a'.repeat(64), ended: false })
      s.setState({ joinTokenHash: 'b'.repeat(64), ended: true })
      expect(s.state()).toEqual({ joinTokenHash: 'b'.repeat(64), ended: true })
    })

    it('appends envelopes with contiguous 1-based indexes, their bytes, and reads pages after an index', async () => {
      const s = await fresh()
      expect(s.lastIndex()).toBe(0)
      expect(s.counts()).toEqual({
        envelopes: 0,
        envelopeBytes: 0,
        blobBytes: 0,
        playerBlobBytes: 0,
        writes: 0,
      })
      const rows = [1, 2, 3].map((n) =>
        envelope(n, n === 3 ? B : A, n === 3 ? 'controller' : 'all'),
      )
      const indexes = rows.map((r) => s.appendEnvelope(r.envelope, r.frame, r.frame.length))
      expect(indexes).toEqual([1, 2, 3])
      expect(s.lastIndex()).toBe(3)
      expect(s.counts()).toMatchObject({
        envelopes: 3,
        envelopeBytes: rows.reduce((n, r) => n + r.frame.length, 0),
        writes: 6,
      })
      expect(s.readEnvelopes(0, 2).map((r) => r.index)).toEqual([1, 2])
      expect(s.readEnvelopes(2, 10)).toEqual([
        { index: 3, envelope: rows[2]!.envelope, bytes: rows[2]!.frame.length },
      ])
      expect(s.readEnvelopes(3, 10)).toEqual([])
      expect(s.readEnvelopes(7, 10)).toEqual([])
    })

    it('keeps the last seq per sender (not counted as writes: the envelope counts for both)', async () => {
      const s = await fresh()
      expect(s.lastSeq(A)).toBe(0)
      s.setLastSeq(A, 4)
      s.setLastSeq(A, 9)
      s.setLastSeq(B, 1)
      expect(s.lastSeq(A)).toBe(9)
      expect(s.lastSeq(B)).toBe(1)
      expect(s.counts().writes).toBe(0)
    })

    it('keeps who owns a client id', async () => {
      const s = await fresh()
      expect(s.identity(A)).toBeUndefined()
      s.setIdentity(A, { kind: 'participant', resumeHash: 'd'.repeat(64) })
      s.setIdentity(B, { kind: 'controller' })
      expect(s.identity(A)).toEqual({ kind: 'participant', resumeHash: 'd'.repeat(64) })
      expect(s.identity(B)).toEqual({ kind: 'controller' })
      expect(s.counts().writes).toBe(2)
    })

    it('collects blob chunks in any order, ignores duplicates, and tracks completion and bytes', async () => {
      const s = await fresh()
      expect(s.blob(BLOB)).toBeUndefined()
      const start = { uploader: A, controller: false, count: 3, startedAt: 1_700_000_000_000 }
      let meta = s.putChunk(BLOB, start, 2, 'cc', 30)
      expect(meta).toEqual({ ...start, received: 1, bytes: 30, done: false })
      meta = s.putChunk(BLOB, start, 2, 'xx', 99)
      expect(meta.received).toBe(1)
      expect(s.hasChunk(BLOB, 2)).toBe(true)
      expect(s.hasChunk(BLOB, 0)).toBe(false)
      s.putChunk(BLOB, start, 0, 'aa', 10)
      meta = s.putChunk(BLOB, start, 1, 'bb', 20)
      expect(meta).toMatchObject({ received: 3, bytes: 60, done: true })
      expect(s.chunks(BLOB)).toEqual([
        { index: 0, bytes: 'aa' },
        { index: 1, bytes: 'bb' },
        { index: 2, bytes: 'cc' },
      ])
      s.putChunk(OTHER, { uploader: B, controller: true, count: 1, startedAt: 5 }, 0, 'dd', 5)
      expect(s.counts()).toMatchObject({ blobBytes: 65, playerBlobBytes: 60, writes: 8 })
      expect(s.listBlobs().map((b) => [b.blobId, b.done, b.controller])).toEqual([
        [BLOB, true, false],
        [OTHER, true, true],
      ])
      s.deleteBlob(BLOB)
      expect(s.blob(BLOB)).toBeUndefined()
      expect(s.chunks(BLOB)).toEqual([])
      expect(s.listBlobs()).toHaveLength(1)
      expect(s.counts()).toMatchObject({ blobBytes: 5, playerBlobBytes: 0 })
    })

    it('clear removes everything but the state', async () => {
      const s = await fresh()
      s.setState({ joinTokenHash: 'a'.repeat(64), ended: false })
      const { envelope: e, frame } = envelope(1)
      s.appendEnvelope(e, frame, frame.length)
      s.setLastSeq(A, 3)
      s.setIdentity(A, { kind: 'participant', resumeHash: 'e'.repeat(64) })
      s.putChunk(BLOB, { uploader: A, controller: false, count: 1, startedAt: 1 }, 0, 'aa', 10)
      s.clear()
      expect(s.state()).toEqual({ joinTokenHash: 'a'.repeat(64), ended: false })
      expect(s.lastIndex()).toBe(0)
      expect(s.lastSeq(A)).toBe(0)
      expect(s.identity(A)).toBeUndefined()
      expect(s.blob(BLOB)).toBeUndefined()
      expect(s.counts()).toEqual({
        envelopes: 0,
        envelopeBytes: 0,
        blobBytes: 0,
        playerBlobBytes: 0,
        writes: 0,
      })
      expect(s.appendEnvelope(e, frame, frame.length)).toBe(1)
    })
  })
}
