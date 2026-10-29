// Retention and storage of the registry (spec 0409 FR-6, "Storage"): sessions end at their
// retention and are forgotten an hour after, an ended session leaves no rows, and a database
// from a newer server is refused.
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, describe, expect, it } from 'vitest'
import { toBase64Url } from '@shared/live/bytes'
import { RETENTION_MS, TOMBSTONE_MS } from '../src/sessions'
import { RelayDatabase } from '../src/sqlite-store'
import { createSession, startTestServer, type TestServer } from './helpers'

const servers: TestServer[] = []
afterEach(async () => {
  for (const s of servers.splice(0)) await s.destroy()
})

async function start(clock: { now: number }) {
  const s = await startTestServer({ now: () => clock.now })
  servers.push(s)
  return s
}

function tableCounts(db: RelayDatabase): Record<string, number> {
  const out: Record<string, number> = {}
  for (const t of ['sessions', 'envelopes', 'seqs', 'identities', 'blobs', 'chunks']) {
    out[t] = Number((db.db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get() as { n: number }).n)
  }
  return out
}

describe('retention sweeper', () => {
  it('ends a session at its retention, then forgets it an hour later', async () => {
    const clock = { now: Date.now() }
    const s = await start(clock)
    const created = await createSession(s)
    expect(s.registry.sweep().ended).toEqual([])
    clock.now += RETENTION_MS + 1
    expect(s.registry.sweep().ended).toEqual([created.sessionId])
    expect(s.registry.get(created.sessionId)!.store.record()!.endedAt).toBeDefined()
    clock.now += TOMBSTONE_MS + 1
    expect(s.registry.sweep().deleted).toEqual([created.sessionId])
    expect(s.registry.get(created.sessionId)).toBeUndefined()
  })

  it('removes every row of a session when it is forgotten', async () => {
    const clock = { now: Date.now() }
    const s = await start(clock)
    const created = await createSession(s)
    const live = s.registry.get(created.sessionId)!
    const blobId = toBase64Url(new Uint8Array(16).fill(2))
    live.store.putChunk(
      blobId,
      { uploader: 'u'.repeat(22), controller: false, count: 1, startedAt: 1 },
      0,
      'AAAA',
      3,
    )
    live.store.setLastSeq('u'.repeat(22), 4)
    live.store.setIdentity('u'.repeat(22), { kind: 'controller' })
    s.registry.end(created.sessionId)
    expect(tableCounts(s.db).blobs).toBe(0)
    clock.now += TOMBSTONE_MS + 1
    s.registry.sweep()
    expect(Object.values(tableCounts(s.db)).every((n) => n === 0)).toBe(true)
  })

  it('does not count a session that ended against the cap on live sessions', async () => {
    const s = await startTestServer({ maxSessions: 1 })
    servers.push(s)
    const first = await createSession(s)
    s.registry.end(first.sessionId)
    expect((await s.registry.create()).ok).toBe(true)
    expect((await s.registry.create()).ok).toBe(false)
  })
})

describe('chunk files with --blobs disk', () => {
  it('writes chunks under the data directory and deletes them with the session', () => {
    const dir = mkdtempSync(join(tmpdir(), 'relay-disk-'))
    try {
      const db = RelayDatabase.open(dir, 'disk')
      const id = 'sess-0000000000000000'
      const store = db.storeFor(id)
      const blobId = toBase64Url(new Uint8Array(16).fill(8))
      store.putChunk(
        blobId,
        { uploader: 'u'.repeat(22), controller: true, count: 1, startedAt: 1 },
        0,
        'AAAA',
        3,
      )
      expect(existsSync(join(dir, 'blobs', id, blobId, '0'))).toBe(true)
      expect(store.chunks(blobId)).toEqual([{ index: 0, bytes: 'AAAA' }])
      store.setRecord({ sessionId: id, createdAt: 1, expiresAt: 2, controllerTokenHashes: [] })
      db.deleteSession(id)
      expect(existsSync(join(dir, 'blobs', id))).toBe(false)
      db.close()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('refuses ids that could leave the blob directory', () => {
    const dir = mkdtempSync(join(tmpdir(), 'relay-disk-'))
    try {
      const db = RelayDatabase.open(dir, 'disk')
      expect(() => db.storeFor('../escape')).toThrow('Bad session id')
      const store = db.storeFor('sess-0000000000000000')
      expect(() =>
        store.putChunk(
          '../x',
          { uploader: 'u'.repeat(22), controller: true, count: 1, startedAt: 1 },
          0,
          'A',
          1,
        ),
      ).toThrow('Bad blob id')
      db.close()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('database file', () => {
  it('keeps its rows across a close and reopen, in WAL mode', () => {
    const dir = mkdtempSync(join(tmpdir(), 'relay-wal-'))
    try {
      const first = RelayDatabase.open(dir, 'db')
      first
        .storeFor('sess-0000000000000000')
        .setState({ joinTokenHash: 'a'.repeat(64), ended: false })
      expect(
        (first.db.prepare('PRAGMA journal_mode').get() as { journal_mode: string }).journal_mode,
      ).toBe('wal')
      first.close()
      const second = RelayDatabase.open(dir, 'db')
      expect(second.storeFor('sess-0000000000000000').state()?.joinTokenHash).toBe('a'.repeat(64))
      second.close()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('refuses a database written by a newer server', () => {
    const dir = mkdtempSync(join(tmpdir(), 'relay-ver-'))
    try {
      RelayDatabase.open(dir, 'db').close()
      const raw = new DatabaseSync(join(dir, 'relay.sqlite'))
      raw.exec('PRAGMA user_version = 99')
      raw.close()
      expect(() => RelayDatabase.open(dir, 'db')).toThrow('newer server')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
