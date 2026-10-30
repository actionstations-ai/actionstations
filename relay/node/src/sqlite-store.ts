/**
 * Storage on `node:sqlite` (spec 0409 "Storage"): one database file for every session, WAL mode,
 * `PRAGMA user_version` for the schema. `SqliteHubStore` is the shared hub's `HubStore` for one
 * session; `RelayDatabase` owns the file, lists sessions, deletes one in a transaction and
 * reports what the disk holds. Blob chunks live in the database by default or as files under
 * `<data-dir>/blobs/` with `--blobs disk`, named from validated base64url ids only.
 *
 * Running totals (stored envelopes and bytes, blob bytes, row writes) sit in the session's own
 * row and change in the same savepoint as the rows they describe, so `counts()` never scans.
 */
import { DatabaseSync, type SQLInputValue } from 'node:sqlite'
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
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

export const SCHEMA_VERSION = 1

const SCHEMA = `
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY, record TEXT, hub_state TEXT,
  created_at INTEGER NOT NULL DEFAULT 0, expires_at INTEGER NOT NULL DEFAULT 0, ended_at INTEGER,
  env_count INTEGER NOT NULL DEFAULT 0, env_bytes INTEGER NOT NULL DEFAULT 0,
  blob_bytes INTEGER NOT NULL DEFAULT 0, player_blob_bytes INTEGER NOT NULL DEFAULT 0,
  other_writes INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS envelopes (
  session_id TEXT NOT NULL, idx INTEGER NOT NULL, frame TEXT NOT NULL, bytes INTEGER NOT NULL,
  PRIMARY KEY (session_id, idx));
CREATE TABLE IF NOT EXISTS seqs (
  session_id TEXT NOT NULL, sender TEXT NOT NULL, last INTEGER NOT NULL, PRIMARY KEY (session_id, sender));
CREATE TABLE IF NOT EXISTS identities (
  session_id TEXT NOT NULL, client TEXT NOT NULL, kind TEXT NOT NULL, resume_hash TEXT,
  PRIMARY KEY (session_id, client));
CREATE TABLE IF NOT EXISTS blobs (
  session_id TEXT NOT NULL, blob_id TEXT NOT NULL, uploader TEXT NOT NULL, controller INTEGER NOT NULL,
  count INTEGER NOT NULL, received INTEGER NOT NULL, bytes INTEGER NOT NULL, started_at INTEGER NOT NULL,
  PRIMARY KEY (session_id, blob_id));
CREATE TABLE IF NOT EXISTS chunks (
  session_id TEXT NOT NULL, blob_id TEXT NOT NULL, idx INTEGER NOT NULL, bytes TEXT, path TEXT,
  PRIMARY KEY (session_id, blob_id, idx));
`

/** Ids become directory names with `--blobs disk`; only base64url characters, never a separator. */
const SAFE_NAME = /^[A-Za-z0-9_-]{1,64}$/

/** The adapter's record of a session: what the routes and the sweeper need, never a token. */
export interface SessionRecord {
  sessionId: string
  createdAt: number
  expiresAt: number
  controllerTokenHashes: string[]
  endedAt?: number
}

export interface StorageUse {
  databaseBytes: number
  sessions: number
  envelopes: number
  blobBytes: number
}

type Row = Record<string, SQLInputValue | null>

export class RelayDatabase {
  readonly db: DatabaseSync
  private freedBytes = 0

  constructor(
    readonly path: string,
    readonly blobDir: string | undefined,
  ) {
    this.db = new DatabaseSync(path)
    this.db.exec(
      `PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA busy_timeout = 5000;`,
    )
    this.db.exec(SCHEMA)
    const row = this.db.prepare(`PRAGMA user_version`).get() as { user_version: number }
    const version = Number(row.user_version)
    if (version === 0) this.db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`)
    else if (version > SCHEMA_VERSION) {
      throw new Error(
        `Database ${path} was written by a newer server (schema ${version}); this one knows ${SCHEMA_VERSION}`,
      )
    }
  }

  static open(dataDir: string, blobs: 'db' | 'disk'): RelayDatabase {
    mkdirSync(dataDir, { recursive: true })
    return new RelayDatabase(
      join(dataDir, 'relay.sqlite'),
      blobs === 'disk' ? join(dataDir, 'blobs') : undefined,
    )
  }

  storeFor(sessionId: string): SqliteHubStore {
    return new SqliteHubStore(this, sessionId)
  }

  /** Every session that has a record (a store that only holds rows is not a session yet). */
  records(): SessionRecord[] {
    const rows = this.db
      .prepare(`SELECT record FROM sessions WHERE record IS NOT NULL ORDER BY created_at`)
      .all() as { record: string }[]
    return rows.map((r) => JSON.parse(r.record) as SessionRecord)
  }

  /** Everything about one session goes in one transaction; chunk files after. */
  deleteSession(sessionId: string): void {
    const store = this.storeFor(sessionId)
    const freed = store.counts().blobBytes
    this.db.exec('BEGIN')
    try {
      store.clear()
      this.db.prepare(`DELETE FROM sessions WHERE id = ?`).run(sessionId)
      this.db.exec('COMMIT')
    } catch (e) {
      this.db.exec('ROLLBACK')
      throw e
    }
    store.removeChunkFiles()
    this.freedBytes += freed
  }

  /** `VACUUM` after the sweeper freed more than 256 MiB (spec 0409 "Storage"). */
  vacuumIfNeeded(threshold = 256 * 1024 * 1024): boolean {
    if (this.freedBytes < threshold) return false
    this.db.exec('VACUUM')
    this.freedBytes = 0
    return true
  }

  checkpoint(): void {
    this.db.exec(`PRAGMA wal_checkpoint(TRUNCATE)`)
  }

  storageUse(): StorageUse {
    const sum = (sql: string) => Number((this.db.prepare(sql).get() as { n: number }).n)
    return {
      databaseBytes: existsSync(this.path) ? statSync(this.path).size : 0,
      sessions: sum(`SELECT COUNT(*) AS n FROM sessions WHERE record IS NOT NULL`),
      envelopes: sum(`SELECT COALESCE(SUM(env_count), 0) AS n FROM sessions`),
      blobBytes: sum(`SELECT COALESCE(SUM(blob_bytes), 0) AS n FROM sessions`),
    }
  }

  close(): void {
    this.db.close()
  }
}

export class SqliteHubStore implements HubStore {
  private readonly db: DatabaseSync
  private savepoints = 0

  constructor(
    private readonly relay: RelayDatabase,
    readonly sessionId: string,
  ) {
    if (!SAFE_NAME.test(sessionId)) throw new Error('Bad session id')
    this.db = relay.db
  }

  private one(sql: string, ...params: SQLInputValue[]): Row | undefined {
    return this.db.prepare(sql).get(...params) as Row | undefined
  }

  private all(sql: string, ...params: SQLInputValue[]): Row[] {
    return this.db.prepare(sql).all(...params) as Row[]
  }

  private run(sql: string, ...params: SQLInputValue[]): void {
    this.db.prepare(sql).run(...params)
  }

  /** Runs `work` atomically; nests inside the sweeper's or the caller's transaction. */
  private atomically<T>(work: () => T): T {
    const name = `sp${this.savepoints++}`
    this.db.exec(`SAVEPOINT ${name}`)
    try {
      const result = work()
      this.db.exec(`RELEASE ${name}`)
      return result
    } catch (e) {
      this.db.exec(`ROLLBACK TO ${name}; RELEASE ${name}`)
      throw e
    }
  }

  private ensureRow(): void {
    this.run(`INSERT OR IGNORE INTO sessions (id) VALUES (?)`, this.sessionId)
  }

  // ---- the adapter's record --------------------------------------------------------------

  record(): SessionRecord | undefined {
    const row = this.one(`SELECT record FROM sessions WHERE id = ?`, this.sessionId)
    return row?.record ? (JSON.parse(String(row.record)) as SessionRecord) : undefined
  }

  setRecord(record: SessionRecord): void {
    this.ensureRow()
    this.run(
      `UPDATE sessions SET record = ?, created_at = ?, expires_at = ?, ended_at = ? WHERE id = ?`,
      JSON.stringify(record),
      record.createdAt,
      record.expiresAt,
      record.endedAt ?? null,
      this.sessionId,
    )
  }

  // ---- HubStore --------------------------------------------------------------------------

  state(): HubState | undefined {
    const row = this.one(`SELECT hub_state FROM sessions WHERE id = ?`, this.sessionId)
    return row?.hub_state ? (JSON.parse(String(row.hub_state)) as HubState) : undefined
  }

  setState(state: HubState): void {
    this.ensureRow()
    this.run(
      `UPDATE sessions SET hub_state = ? WHERE id = ?`,
      JSON.stringify(state),
      this.sessionId,
    )
  }

  appendEnvelope(envelope: Envelope, frame: string, bytes: number): number {
    return this.atomically(() => {
      this.ensureRow()
      const index = this.lastIndex() + 1
      this.run(
        `INSERT INTO envelopes (session_id, idx, frame, bytes) VALUES (?, ?, ?, ?)`,
        this.sessionId,
        index,
        frame,
        bytes,
      )
      this.run(
        `UPDATE sessions SET env_count = env_count + 1, env_bytes = env_bytes + ? WHERE id = ?`,
        bytes,
        this.sessionId,
      )
      return index
    })
  }

  readEnvelopes(after: number, limit: number): StoredEnvelope[] {
    return this.all(
      `SELECT idx, frame, bytes FROM envelopes WHERE session_id = ? AND idx > ? ORDER BY idx LIMIT ?`,
      this.sessionId,
      after,
      limit,
    ).map((r) => ({
      index: Number(r.idx),
      envelope: JSON.parse(String(r.frame)) as Envelope,
      bytes: Number(r.bytes),
    }))
  }

  lastIndex(): number {
    const row = this.one(
      `SELECT COALESCE(MAX(idx), 0) AS n FROM envelopes WHERE session_id = ?`,
      this.sessionId,
    )
    return Number(row?.n ?? 0)
  }

  counts(): StoreCounts {
    const r = this.one(
      `SELECT env_count, env_bytes, blob_bytes, player_blob_bytes, other_writes FROM sessions WHERE id = ?`,
      this.sessionId,
    )
    return {
      envelopes: Number(r?.env_count ?? 0),
      envelopeBytes: Number(r?.env_bytes ?? 0),
      blobBytes: Number(r?.blob_bytes ?? 0),
      playerBlobBytes: Number(r?.player_blob_bytes ?? 0),
      writes: 2 * Number(r?.env_count ?? 0) + Number(r?.other_writes ?? 0),
    }
  }

  lastSeq(client: ClientId): number {
    const row = this.one(
      `SELECT last FROM seqs WHERE session_id = ? AND sender = ?`,
      this.sessionId,
      client,
    )
    return Number(row?.last ?? 0)
  }

  setLastSeq(client: ClientId, seq: number): void {
    this.run(
      `INSERT INTO seqs (session_id, sender, last) VALUES (?, ?, ?)
       ON CONFLICT(session_id, sender) DO UPDATE SET last = excluded.last`,
      this.sessionId,
      client,
      seq,
    )
  }

  identity(client: ClientId): StoredIdentity | undefined {
    const row = this.one(
      `SELECT kind, resume_hash FROM identities WHERE session_id = ? AND client = ?`,
      this.sessionId,
      client,
    )
    if (!row) return undefined
    return row.kind === 'controller'
      ? {
          kind: 'controller',
          ...(row.resume_hash ? { tokenHash: String(row.resume_hash) } : {}),
        }
      : { kind: 'participant', resumeHash: String(row.resume_hash ?? '') }
  }

  setIdentity(client: ClientId, identity: StoredIdentity): void {
    this.atomically(() => {
      this.ensureRow()
      this.run(
        `INSERT INTO identities (session_id, client, kind, resume_hash) VALUES (?, ?, ?, ?)
         ON CONFLICT(session_id, client) DO UPDATE SET kind = excluded.kind, resume_hash = excluded.resume_hash`,
        this.sessionId,
        client,
        identity.kind,
        identity.kind === 'participant' ? identity.resumeHash : (identity.tokenHash ?? null),
      )
      this.bump(0, 0, 1)
    })
  }

  private bump(blobBytes: number, playerBytes: number, writes: number): void {
    this.run(
      `UPDATE sessions SET blob_bytes = blob_bytes + ?, player_blob_bytes = player_blob_bytes + ?,
         other_writes = other_writes + ? WHERE id = ?`,
      blobBytes,
      playerBytes,
      writes,
      this.sessionId,
    )
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
      `SELECT uploader, controller, count, received, bytes, started_at FROM blobs WHERE session_id = ? AND blob_id = ?`,
      this.sessionId,
      blobId,
    )
    return row ? this.toMeta(row) : undefined
  }

  listBlobs(): ({ blobId: string } & StoredBlobMeta)[] {
    return this.all(
      `SELECT blob_id, uploader, controller, count, received, bytes, started_at FROM blobs
       WHERE session_id = ? ORDER BY rowid`,
      this.sessionId,
    ).map((row) => ({ blobId: String(row.blob_id), ...this.toMeta(row) }))
  }

  putChunk(
    blobId: string,
    start: { uploader: ClientId; controller: boolean; count: number; startedAt: number },
    index: number,
    bytes: string,
    byteLength: number,
  ): StoredBlobMeta {
    if (!SAFE_NAME.test(blobId)) throw new Error('Bad blob id')
    return this.atomically(() => {
      this.ensureRow()
      if (!this.blob(blobId)) {
        this.run(
          `INSERT INTO blobs (session_id, blob_id, uploader, controller, count, received, bytes, started_at)
           VALUES (?, ?, ?, ?, ?, 0, 0, ?)`,
          this.sessionId,
          blobId,
          start.uploader,
          start.controller ? 1 : 0,
          start.count,
          start.startedAt,
        )
      }
      if (!this.hasChunk(blobId, index)) this.storeChunk(blobId, start, index, bytes, byteLength)
      return this.blob(blobId)!
    })
  }

  private storeChunk(
    blobId: string,
    start: { controller: boolean },
    index: number,
    bytes: string,
    byteLength: number,
  ): void {
    const path = this.chunkPath(blobId, index)
    if (path) {
      mkdirSync(join(this.relay.blobDir!, this.sessionId, blobId), { recursive: true })
      writeFileSync(path, bytes)
    }
    this.run(
      `INSERT INTO chunks (session_id, blob_id, idx, bytes, path) VALUES (?, ?, ?, ?, ?)`,
      this.sessionId,
      blobId,
      index,
      path ? null : bytes,
      path,
    )
    this.run(
      `UPDATE blobs SET received = received + 1, bytes = bytes + ? WHERE session_id = ? AND blob_id = ?`,
      byteLength,
      this.sessionId,
      blobId,
    )
    this.bump(byteLength, start.controller ? 0 : byteLength, 2)
  }

  private chunkPath(blobId: string, index: number): string | null {
    if (!this.relay.blobDir) return null
    return join(this.relay.blobDir, this.sessionId, blobId, String(index))
  }

  hasChunk(blobId: string, index: number): boolean {
    return (
      this.one(
        `SELECT 1 AS present FROM chunks WHERE session_id = ? AND blob_id = ? AND idx = ?`,
        this.sessionId,
        blobId,
        index,
      ) !== undefined
    )
  }

  chunks(blobId: string): StoredChunk[] {
    return this.all(
      `SELECT idx, bytes, path FROM chunks WHERE session_id = ? AND blob_id = ? ORDER BY idx`,
      this.sessionId,
      blobId,
    ).map((r) => ({
      index: Number(r.idx),
      bytes: r.bytes === null ? readFileSync(String(r.path), 'utf8') : String(r.bytes),
    }))
  }

  deleteBlob(blobId: string): void {
    const blob = this.blob(blobId)
    if (!blob) return
    this.atomically(() => {
      this.run(`DELETE FROM chunks WHERE session_id = ? AND blob_id = ?`, this.sessionId, blobId)
      this.run(`DELETE FROM blobs WHERE session_id = ? AND blob_id = ?`, this.sessionId, blobId)
      this.bump(-blob.bytes, blob.controller ? 0 : -blob.bytes, 0)
    })
    if (this.relay.blobDir && SAFE_NAME.test(blobId)) {
      rmSync(join(this.relay.blobDir, this.sessionId, blobId), { recursive: true, force: true })
    }
  }

  clear(): void {
    this.atomically(() => {
      for (const table of ['envelopes', 'seqs', 'identities', 'blobs', 'chunks']) {
        this.run(`DELETE FROM ${table} WHERE session_id = ?`, this.sessionId)
      }
      this.run(
        `UPDATE sessions SET env_count = 0, env_bytes = 0, blob_bytes = 0, player_blob_bytes = 0,
           other_writes = 0 WHERE id = ?`,
        this.sessionId,
      )
    })
    this.removeChunkFiles()
  }

  /** Chunk files of `--blobs disk`; the database rows are gone or going. */
  removeChunkFiles(): void {
    if (this.relay.blobDir && SAFE_NAME.test(this.sessionId)) {
      rmSync(join(this.relay.blobDir, this.sessionId), { recursive: true, force: true })
    }
  }
}
