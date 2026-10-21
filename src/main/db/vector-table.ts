// chunk_vec (sqlite-vec vec0) has a fixed dimension, so it belongs to one embedder. The meta
// table records which; when the active embedder differs, the table is recreated empty and the
// index is marked stale until every chunk is re-embedded.
import type { Db } from './connection'

export interface EmbedderIdentity {
  /** Stable key for the embedder + model, e.g. "hash:feature-hash-v1". */
  key: string
  dims: number
}

export function getMeta(db: Db, key: string): string | undefined {
  const row = db.prepare('SELECT value FROM meta WHERE key = ?').get(key) as
    { value: string } | undefined
  return row?.value
}

export function setMeta(db: Db, key: string, value: string): void {
  db.prepare(
    'INSERT INTO meta(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
  ).run(key, value)
}

function createVectorTable(db: Db, dims: number): void {
  if (!Number.isInteger(dims) || dims <= 0 || dims > 8192)
    throw new Error(`Invalid embedding dimension ${dims}`)
  db.exec('DROP TABLE IF EXISTS chunk_vec')
  db.exec(
    `CREATE VIRTUAL TABLE chunk_vec USING vec0(
       chunk_id INTEGER PRIMARY KEY,
       doc_id TEXT,
       embedding float[${dims}] distance_metric=cosine
     )`,
  )
}

function hasVectorTable(db: Db): boolean {
  return !!db.prepare("SELECT 1 FROM sqlite_master WHERE name = 'chunk_vec'").get()
}

export function chunkCount(db: Db): number {
  return (db.prepare('SELECT count(*) AS n FROM chunks').get() as { n: number }).n
}

export function vectorCount(db: Db): number {
  return (db.prepare('SELECT count(*) AS n FROM chunk_vec').get() as { n: number }).n
}

/**
 * Make chunk_vec match `embedder`. When the recorded embedder or dimension differs, the vector
 * table is recreated empty and, if chunks exist, `vectors_stale` is set until they are
 * re-embedded. Returns true when that happened.
 */
export function ensureVectorTable(db: Db, embedder: EmbedderIdentity): boolean {
  const sameEmbedder =
    getMeta(db, 'embedder_key') === embedder.key &&
    getMeta(db, 'embedder_dims') === String(embedder.dims)
  if (sameEmbedder && hasVectorTable(db)) return false
  const stale = chunkCount(db) > 0
  db.transaction(() => {
    createVectorTable(db, embedder.dims)
    setMeta(db, 'embedder_key', embedder.key)
    setMeta(db, 'embedder_dims', String(embedder.dims))
    setMeta(db, 'vectors_stale', stale ? '1' : '0')
  })()
  return stale
}
