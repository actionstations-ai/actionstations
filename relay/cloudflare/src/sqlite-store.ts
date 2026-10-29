/**
 * `SessionStore` on a Durable Object's SQLite storage (`ctx.storage.sql`). One object holds one
 * session, so no table carries a session id. Rows hold ciphertext frames and metadata only; the
 * free plan meters rows written, so a frame is one row and a chunk is one row.
 */
import type {
  BlobRecord,
  ClientId,
  SessionMeta,
  SessionStore,
  StoredChunk,
  StoredFrame,
  StoredFrameInput,
  StoredIdentity,
} from '@actionstations/relay-core'

const SCHEMA = `
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS envelopes (idx INTEGER PRIMARY KEY, sender TEXT NOT NULL, dest TEXT NOT NULL, type TEXT NOT NULL, frame TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS seqs (sender TEXT PRIMARY KEY, last INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS identities (client TEXT PRIMARY KEY, kind TEXT NOT NULL, resume_hash TEXT);
CREATE TABLE IF NOT EXISTS blobs (blob_id TEXT PRIMARY KEY, uploader TEXT NOT NULL, count INTEGER NOT NULL, received INTEGER NOT NULL, bytes INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS chunks (blob_id TEXT NOT NULL, idx INTEGER NOT NULL, bytes TEXT NOT NULL, PRIMARY KEY (blob_id, idx));
`

type Row = Record<string, SqlStorageValue>

export class SqliteStore implements SessionStore {
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

  private scalar(query: string, ...bindings: SqlStorageValue[]): number {
    const row = this.one(query, ...bindings)
    const value = row ? Object.values(row)[0] : 0
    return Number(value ?? 0)
  }

  meta(): SessionMeta | undefined {
    const row = this.one(`SELECT value FROM meta WHERE key = 'meta'`)
    return row ? (JSON.parse(String(row.value)) as SessionMeta) : undefined
  }

  setMeta(meta: SessionMeta): void {
    this.sql.exec(
      `INSERT INTO meta (key, value) VALUES ('meta', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      JSON.stringify(meta),
    )
  }

  append(frame: StoredFrameInput): number {
    const index = this.lastIndex() + 1
    this.sql.exec(
      `INSERT INTO envelopes (idx, sender, dest, type, frame) VALUES (?, ?, ?, ?, ?)`,
      index,
      frame.from,
      frame.to,
      frame.type,
      frame.frame,
    )
    return index
  }

  readAfter(after: number, limit: number): StoredFrame[] {
    return this.rows(
      `SELECT idx, sender, dest, type, frame FROM envelopes WHERE idx > ? ORDER BY idx LIMIT ?`,
      after,
      limit,
    ).map((r) => ({
      index: Number(r.idx),
      from: String(r.sender) as StoredFrame['from'],
      to: String(r.dest),
      type: String(r.type) as StoredFrame['type'],
      frame: String(r.frame),
    }))
  }

  count(): number {
    return this.scalar(`SELECT COUNT(*) FROM envelopes`)
  }

  lastIndex(): number {
    return this.scalar(`SELECT COALESCE(MAX(idx), 0) FROM envelopes`)
  }

  lastSeq(client: ClientId): number {
    return this.scalar(`SELECT COALESCE(MAX(last), 0) FROM seqs WHERE sender = ?`, client)
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
  }

  blob(blobId: string): BlobRecord | undefined {
    const row = this.one(
      `SELECT blob_id, uploader, count, received, bytes FROM blobs WHERE blob_id = ?`,
      blobId,
    )
    return row ? toRecord(row) : undefined
  }

  putChunk(
    blobId: string,
    uploader: ClientId,
    count: number,
    index: number,
    bytes: string,
    byteLength: number,
  ): BlobRecord {
    if (!this.blob(blobId)) {
      this.sql.exec(
        `INSERT INTO blobs (blob_id, uploader, count, received, bytes) VALUES (?, ?, ?, 0, 0)`,
        blobId,
        uploader,
        count,
      )
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
    }
    return this.blob(blobId)!
  }

  hasChunk(blobId: string, index: number): boolean {
    return (
      this.scalar(`SELECT COUNT(*) FROM chunks WHERE blob_id = ? AND idx = ?`, blobId, index) > 0
    )
  }

  chunks(blobId: string): Iterable<StoredChunk> {
    return this.rows(`SELECT idx, bytes FROM chunks WHERE blob_id = ? ORDER BY idx`, blobId).map(
      (r) => ({ index: Number(r.idx), bytes: String(r.bytes) }),
    )
  }

  deleteBlob(blobId: string): void {
    this.sql.exec(`DELETE FROM chunks WHERE blob_id = ?`, blobId)
    this.sql.exec(`DELETE FROM blobs WHERE blob_id = ?`, blobId)
  }

  blobBytes(): number {
    return this.scalar(`SELECT COALESCE(SUM(bytes), 0) FROM blobs`)
  }

  deleteContent(): void {
    for (const table of ['envelopes', 'seqs', 'identities', 'blobs', 'chunks']) {
      this.sql.exec(`DELETE FROM ${table}`)
    }
  }

  deleteAll(): void {
    this.deleteContent()
    this.sql.exec(`DELETE FROM meta`)
  }
}

function toRecord(row: Row): BlobRecord {
  return {
    blobId: String(row.blob_id),
    uploader: String(row.uploader) as BlobRecord['uploader'],
    count: Number(row.count),
    received: Number(row.received),
    bytes: Number(row.bytes),
    done: Number(row.received) === Number(row.count),
  }
}
