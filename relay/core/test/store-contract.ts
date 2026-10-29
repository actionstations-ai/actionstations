/**
 * The `SessionStore` contract, run against every backend: `MemoryStore`, the Durable Object's
 * SQLite (relay/cloudflare) and `node:sqlite` (relay/node). A factory returns a fresh, empty
 * store; `close` releases files.
 */
import { afterEach, describe, expect, it } from 'vitest'
import type { SessionMeta, SessionStore } from '../src/store'

export interface StoreHarness {
  store: SessionStore
  close?(): void | Promise<void>
}

export type StoreFactory = () => StoreHarness | Promise<StoreHarness>

const A = 'playerA-00000000000000'
const B = 'playerB-00000000000000'
const META: SessionMeta = {
  sessionId: 'session-00000000000000',
  createdAt: 1_700_000_000_000,
  expiresAt: 1_700_000_000_000 + 72 * 3600_000,
  joinTokenHash: 'a'.repeat(64),
  controllerTokenHashes: ['b'.repeat(64)],
}

export function describeStoreContract(name: string, factory: StoreFactory): void {
  describe(`${name}: SessionStore contract`, () => {
    const open: StoreHarness[] = []
    afterEach(async () => {
      for (const h of open.splice(0)) await h.close?.()
    })
    async function fresh(): Promise<SessionStore> {
      const h = await factory()
      open.push(h)
      return h.store
    }

    it('keeps the session metadata, as a copy, with endedAt and extra controller hashes', async () => {
      const s = await fresh()
      expect(s.meta()).toBeUndefined()
      s.setMeta(META)
      const read = s.meta()!
      expect(read).toEqual(META)
      read.controllerTokenHashes.push('c'.repeat(64))
      expect(s.meta()!.controllerTokenHashes).toEqual(['b'.repeat(64)])
      s.setMeta({ ...META, controllerTokenHashes: ['b'.repeat(64), 'c'.repeat(64)], endedAt: 5 })
      expect(s.meta()).toMatchObject({
        endedAt: 5,
        controllerTokenHashes: ['b'.repeat(64), 'c'.repeat(64)],
      })
    })

    it('appends frames with contiguous 1-based indexes and reads pages after an index', async () => {
      const s = await fresh()
      expect(s.count()).toBe(0)
      expect(s.lastIndex()).toBe(0)
      const indexes = ['clock.state', 'welcome', 'vote.cast'].map((type, i) =>
        s.append({
          from: i === 2 ? A : 'controller-00000000000',
          to: i === 2 ? 'controller' : 'all',
          type: type as 'clock.state',
          frame: `{"n":${i}}`,
        }),
      )
      expect(indexes).toEqual([1, 2, 3])
      expect(s.count()).toBe(3)
      expect(s.lastIndex()).toBe(3)
      expect(s.readAfter(0, 2).map((f) => f.index)).toEqual([1, 2])
      expect(s.readAfter(2, 10)).toEqual([
        { index: 3, from: A, to: 'controller', type: 'vote.cast', frame: '{"n":2}' },
      ])
      expect(s.readAfter(3, 10)).toEqual([])
      expect(s.readAfter(7, 10)).toEqual([])
    })

    it('keeps the last seq per sender, 0 when unknown', async () => {
      const s = await fresh()
      expect(s.lastSeq(A)).toBe(0)
      s.setLastSeq(A, 4)
      s.setLastSeq(A, 9)
      s.setLastSeq(B, 1)
      expect(s.lastSeq(A)).toBe(9)
      expect(s.lastSeq(B)).toBe(1)
    })

    it('keeps who owns a client id', async () => {
      const s = await fresh()
      expect(s.identity(A)).toBeUndefined()
      s.setIdentity(A, { kind: 'participant', resumeHash: 'd'.repeat(64) })
      s.setIdentity(B, { kind: 'controller' })
      expect(s.identity(A)).toEqual({ kind: 'participant', resumeHash: 'd'.repeat(64) })
      expect(s.identity(B)).toEqual({ kind: 'controller' })
    })

    it('collects blob chunks in any order, ignores duplicates, and reports completion and bytes', async () => {
      const s = await fresh()
      expect(s.blob('blob-00000000000000000')).toBeUndefined()
      expect(s.blobBytes()).toBe(0)
      let rec = s.putChunk('blob-00000000000000000', A, 3, 2, 'cc', 30)
      expect(rec).toEqual({
        blobId: 'blob-00000000000000000',
        uploader: A,
        count: 3,
        received: 1,
        bytes: 30,
        done: false,
      })
      rec = s.putChunk('blob-00000000000000000', A, 3, 2, 'xx', 99) // duplicate index: ignored
      expect(rec.received).toBe(1)
      expect(s.hasChunk('blob-00000000000000000', 2)).toBe(true)
      expect(s.hasChunk('blob-00000000000000000', 0)).toBe(false)
      s.putChunk('blob-00000000000000000', A, 3, 0, 'aa', 10)
      rec = s.putChunk('blob-00000000000000000', A, 3, 1, 'bb', 20)
      expect(rec).toMatchObject({ received: 3, bytes: 60, done: true })
      expect([...s.chunks('blob-00000000000000000')]).toEqual([
        { index: 0, bytes: 'aa' },
        { index: 1, bytes: 'bb' },
        { index: 2, bytes: 'cc' },
      ])
      s.putChunk('other-0000000000000000', B, 1, 0, 'dd', 5)
      expect(s.blobBytes()).toBe(65)
      s.deleteBlob('blob-00000000000000000')
      expect(s.blob('blob-00000000000000000')).toBeUndefined()
      expect([...s.chunks('blob-00000000000000000')]).toEqual([])
      expect(s.blobBytes()).toBe(5)
    })

    it('deleteContent removes everything but the metadata; deleteAll removes that too', async () => {
      const s = await fresh()
      s.setMeta(META)
      s.append({ from: A, to: 'controller', type: 'vote.cast', frame: '{}' })
      s.setLastSeq(A, 3)
      s.setIdentity(A, { kind: 'participant', resumeHash: 'e'.repeat(64) })
      s.putChunk('blob-00000000000000000', A, 1, 0, 'aa', 10)
      s.deleteContent()
      expect(s.meta()).toEqual(META)
      expect(s.count()).toBe(0)
      expect(s.lastIndex()).toBe(0)
      expect(s.lastSeq(A)).toBe(0)
      expect(s.identity(A)).toBeUndefined()
      expect(s.blob('blob-00000000000000000')).toBeUndefined()
      expect(s.blobBytes()).toBe(0)
      expect(s.append({ from: A, to: 'all', type: 'message.send', frame: '{}' })).toBe(1)
      s.deleteAll()
      expect(s.meta()).toBeUndefined()
      expect(s.count()).toBe(0)
    })
  })
}
