/**
 * `HubStore` on a Durable Object's SQLite storage (`ctx.storage.sql`), plus the adapter's own
 * session record (controller token hashes, creation and expiry). One object holds one session,
 * so no table carries a session id. Rows hold ciphertext frames and metadata only.
 *
 * The free plan meters rows written and read, so nothing here counts rows: each envelope row
 * carries the running byte total, and the counters that other writes change (blob bytes, chunk
 * and identity writes) live in one `state` row that is updated with them.
 */
import type {
  HubState,
  HubStore,
  StoreCounts,
  StoredBlobMeta,
  StoredChunk,
  StoredEnvelope,
  StoredIdentity,
} from '@shared/live/hub'
import type { ClientId, Envelope } from '@shared/live/schemas'

const SCHEMA = `
CREATE TABLE IF NOT EXISTS state (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS envelopes (idx INTEGER PRIMARY KEY, sender TEXT NOT NULL, dest TEXT NOT NULL, type TEXT NOT NULL, frame TEXT NOT NULL, bytes INTEGER NOT NULL, total_bytes INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS seqs (sender TEXT PRIMARY KEY, last INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS identities (client TEXT PRIMARY KEY, kind TEXT NOT NULL, resume_hash TEXT);
CREATE TABLE IF NOT EXISTS blobs (blob_id TEXT PRIMARY KEY, uploader TEXT NOT NULL, controller INTEGER NOT NULL, count INTEGER NOT NULL, received INTEGER NOT NULL, bytes INTEGER NOT NULL, started_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS chunks (blob_id TEXT NOT NULL, idx INTEGER NOT NULL, bytes TEXT NOT NULL, PRIMARY KEY (blob_id, idx));
`

/** The adapter's record of the session: what the Worker and the alarms need, never a token. */
export interface SessionRecord {
  sessionId: string
  createdAt: number
  expiresAt: number
  controllerTokenHashes: string[]
  endedAt?: number
}

/** Counters kept in the state row: everything but what the envelope rows carry themselves. */
interface OtherCounts {
  blobBytes: number
  playerBlobBytes: number
  /** Writes other than envelopes and their seqs: identities, chunks (with their blob row). */
  otherWrites: number
}

type Row = Record<string, SqlStorageValue>

export class SqliteHubStore implements HubStore {
  constructor(private readonly sql: SqlStorage) {
    this.ensureSchema()
  }

  /** Creates the tables; called at start and again after `storage.deleteAll()` dropped them. */
  ensureSchema(): void {
    this.sql.exec(SCHEMA)
  }

  private rows(query: string, ...bindings: SqlStorageValue[]): Row[] {
    return this.sql.exec(query, ...bindings).toArray() as Row[]
  }

  private one(query: string, ...bindings: SqlStorageValue[]): Row | undefined {
    return this.rows(query, ...bindings)[0]
  }

  private readState<T>(key: string): T | undefined {
    const row = this.one(`SELECT value FROM state WHERE key = ?`, key)
    return row ? (JSON.parse(String(row.value)) as T) : undefined
  }

  private writeState(key: string, value: unknown): void {
    this.sql.exec(
      `INSERT INTO state (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      key,
      JSON.stringify(value),
    )
  }

  // ---- the adapter's record --------------------------------------------------------------

  record(): SessionRecord | undefined {
    return this.readState<SessionRecord>('record')
  }

  setRecord(record: SessionRecord): void {
    this.writeState('record', record)
  }

  // ---- HubStore --------------------------------------------------------------------------

  state(): HubState | undefined {
    return this.readState<HubState>('hub')
  }

  setState(state: HubState): void {
    this.writeState('hub', state)
  }

  private lastRow(): { idx: number; total: number } {
    const row = this.one(`SELECT idx, total_bytes FROM envelopes ORDER BY idx DESC LIMIT 1`)
    return row ? { idx: Number(row.idx), total: Number(row.total_bytes) } : { idx: 0, total: 0 }
  }

  appendEnvelope(envelope: Envelope, frame: string, bytes: number): number {
    const last = this.lastRow()
    const index = last.idx + 1
    this.sql.exec(
      `INSERT INTO envelopes (idx, sender, dest, type, frame, bytes, total_bytes) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      index,
      envelope.from,
      envelope.to,
      envelope.type,
      frame,
      bytes,
      last.total + bytes,
    )
    return index
  }

  readEnvelopes(after: number, limit: number): StoredEnvelope[] {
    return this.rows(
      `SELECT idx, frame, bytes FROM envelopes WHERE idx > ? ORDER BY idx LIMIT ?`,
      after,
      limit,
    ).map((r) => ({
      index: Number(r.idx),
      envelope: JSON.parse(String(r.frame)) as Envelope,
      bytes: Number(r.bytes),
    }))
  }

  lastIndex(): number {
    return this.lastRow().idx
  }

  private other(): OtherCounts {
    return (
      this.readState<OtherCounts>('counts') ?? { blobBytes: 0, playerBlobBytes: 0, otherWrites: 0 }
    )
  }

  private bumpOther(blobBytes: number, playerBytes: number, writes: number): void {
    const o = this.other()
    this.writeState('counts', {
      blobBytes: o.blobBytes + blobBytes,
      playerBlobBytes: o.playerBlobBytes + playerBytes,
      otherWrites: o.otherWrites + writes,
    })
  }

  counts(): StoreCounts {
    const last = this.lastRow()
    const o = this.other()
    return {
      envelopes: last.idx,
      envelopeBytes: last.total,
      blobBytes: o.blobBytes,
      playerBlobBytes: o.playerBlobBytes,
      writes: 2 * last.idx + o.otherWrites,
    }
  }

  lastSeq(client: ClientId): number {
    const row = this.one(`SELECT last FROM seqs WHERE sender = ?`, client)
    return row ? Number(row.last) : 0
  }

  setLastSeq(client: ClientId, seq: number): void {
    this.sql.exec(
      `INSERT INTO seqs (sender, last) VALUES (?, ?) ON CONFLICT(sender) DO UPDATE SET last = excluded.last`,
      client,
      seq,
    )
  }

  identity(client: ClientId): StoredIdentity | undefined {
    const row = this.one(`SELECT kind, resume_hash FROM identities WHERE client = ?`, client)
    if (!row) return undefined
    return row.kind === 'controller'
      ? { kind: 'controller' }
      : { kind: 'participant', resumeHash: String(row.resume_hash) }
  }

  setIdentity(client: ClientId, identity: StoredIdentity): void {
    this.sql.exec(
      `INSERT INTO identities (client, kind, resume_hash) VALUES (?, ?, ?) ON CONFLICT(client) DO UPDATE SET kind = excluded.kind, resume_hash = excluded.resume_hash`,
      client,
      identity.kind,
      identity.kind === 'participant' ? identity.resumeHash : null,
    )
    this.bumpOther(0, 0, 1)
  }

  private toMeta(row: Row): StoredBlobMeta {
    return {
      uploader: String(row.uploader) as ClientId,
      controller: Number(row.controller) === 1,
      count: Number(row.count),
      received: Number(row.received),
      bytes: Number(row.bytes),
      done: Number(row.received) === Number(row.count),
      startedAt: Number(row.started_at),
    }
  }

  blob(blobId: string): StoredBlobMeta | undefined {
    const row = this.one(
      `SELECT uploader, controller, count, received, bytes, started_at FROM blobs WHERE blob_id = ?`,
      blobId,
    )
    return row ? this.toMeta(row) : undefined
  }

  listBlobs(): ({ blobId: string } & StoredBlobMeta)[] {
    return this.rows(
      `SELECT blob_id, uploader, controller, count, received, bytes, started_at FROM blobs`,
    ).map((row) => ({ blobId: String(row.blob_id), ...this.toMeta(row) }))
  }

  putChunk(
    blobId: string,
    start: { uploader: ClientId; controller: boolean; count: number; startedAt: number },
    index: number,
    bytes: string,
    byteLength: number,
  ): StoredBlobMeta {
    let blob = this.blob(blobId)
    if (!blob) {
      this.sql.exec(
        `INSERT INTO blobs (blob_id, uploader, controller, count, received, bytes, started_at) VALUES (?, ?, ?, ?, 0, 0, ?)`,
        blobId,
        start.uploader,
        start.controller ? 1 : 0,
        start.count,
        start.startedAt,
      )
      blob = this.blob(blobId)!
    }
    if (!this.hasChunk(blobId, index)) {
      this.sql.exec(
        `INSERT INTO chunks (blob_id, idx, bytes) VALUES (?, ?, ?)`,
        blobId,
        index,
        bytes,
      )
      this.sql.exec(
        `UPDATE blobs SET received = received + 1, bytes = bytes + ? WHERE blob_id = ?`,
        byteLength,
        blobId,
      )
      this.bumpOther(byteLength, blob.controller ? 0 : byteLength, 2)
    }
    return this.blob(blobId)!
  }

  hasChunk(blobId: string, index: number): boolean {
    return (
      this.one(`SELECT 1 AS present FROM chunks WHERE blob_id = ? AND idx = ?`, blobId, index) !==
      undefined
    )
  }

  chunks(blobId: string): StoredChunk[] {
    return this.rows(`SELECT idx, bytes FROM chunks WHERE blob_id = ? ORDER BY idx`, blobId).map(
      (r) => ({ index: Number(r.idx), bytes: String(r.bytes) }),
    )
  }

  deleteBlob(blobId: string): void {
    const blob = this.blob(blobId)
    if (!blob) return
    this.sql.exec(`DELETE FROM chunks WHERE blob_id = ?`, blobId)
    this.sql.exec(`DELETE FROM blobs WHERE blob_id = ?`, blobId)
    this.bumpOther(-blob.bytes, blob.controller ? 0 : -blob.bytes, 0)
  }

  clear(): void {
    for (const table of ['envelopes', 'seqs', 'identities', 'blobs', 'chunks']) {
      this.sql.exec(`DELETE FROM ${table}`)
    }
    this.sql.exec(`DELETE FROM state WHERE key = 'counts'`)
  }
}
