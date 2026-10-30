// SQLite-backed IndexStore: chunks + FTS5 (BM25 over text and heading path) + sqlite-vec KNN,
// fused with reciprocal rank fusion. Writes for one store are serialized.
import type { Chunk, SearchHit } from '@shared/schemas'
import {
  chunkCount,
  dropAll,
  ensureVectorTable,
  getMeta,
  setMeta,
  vectorCount,
  type Db,
} from '../db'
import { AppError } from '../lib/errors'
import { embedderKey } from '../providers/embedding/factory'
import { embedQuery } from '../providers/embedding/query-aware'
import type { EmbeddingProvider } from '../providers/types'
import { toFtsQuery } from './fts-query'
import { reciprocalRankFusion } from './rrf'
import type { ChunkInput, IndexedDocument, IndexStore, SearchOptions } from './types'

/**
 * BM25 column weights: text, heading_path (all ancestors), heading (the section's own title).
 * Ancestor headings are shared by every sibling, so the section's own title weighs most.
 */
const BM25_WEIGHTS = '1.0, 1.0, 3.0'
const DEFAULT_K = 10
/** vec0 caps k at 4096. */
const MAX_CANDIDATES = 4096
const EMBED_BATCH = 64

export interface IndexStatus {
  embedderKey: string
  dims: number
  documents: number
  chunks: number
  vectors: number
  /** Chunks exist without vectors for the current embedder; call reembed(). */
  vectorsStale: boolean
}

interface ChunkRow {
  id: number
  doc_id: string
  heading_path: string
  page: number | null
  ord: number
  text: string
  token_count: number
  title?: string
}

function toChunk(r: ChunkRow): Chunk {
  return {
    id: r.id,
    documentId: r.doc_id,
    headingPath: r.heading_path,
    ...(r.page != null && r.page > 0 ? { page: r.page } : {}),
    ord: r.ord,
    text: r.text,
    tokenCount: r.token_count,
  }
}

/** "TIRP › Section 13 › 13.6 FIDS" → "13.6 FIDS" (also accepts ">" and "/" separators). */
export function ownHeading(headingPath: string): string {
  return (
    headingPath
      .split(/\s+[›>]\s+/)
      .at(-1)
      ?.trim() ?? ''
  )
}

const placeholders = (n: number): string => Array.from({ length: n }, () => '?').join(', ')

function candidateDepth(k: number): number {
  return Math.min(MAX_CANDIDATES, Math.max(50, k * 5))
}

export class SqliteIndexStore implements IndexStore {
  private writes: Promise<unknown> = Promise.resolve()

  constructor(
    private readonly db: Db,
    private embedder: EmbeddingProvider,
  ) {
    this.useEmbedder(embedder)
  }

  /** Switch the active embedder; recreates chunk_vec when its identity or dims change. */
  useEmbedder(embedder: EmbeddingProvider): void {
    this.embedder = embedder
    ensureVectorTable(this.db, { key: embedderKey(embedder), dims: embedder.dims })
  }

  private serialize<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.writes.catch(() => undefined).then(fn)
    this.writes = run
    return run
  }

  private async embedAll(
    texts: string[],
    onProgress?: (done: number, total: number) => void,
    signal?: AbortSignal,
    titles?: string[],
  ): Promise<Float32Array[]> {
    const out: Float32Array[] = []
    onProgress?.(0, texts.length)
    for (let i = 0; i < texts.length; i += EMBED_BATCH) {
      signal?.throwIfAborted()
      const batch = texts.slice(i, i + EMBED_BATCH)
      const meta = titles ? { documentTitles: titles.slice(i, i + EMBED_BATCH) } : undefined
      out.push(...(await this.embedder.embed(batch, signal, meta)))
      onProgress?.(out.length, texts.length)
    }
    for (const v of out) {
      if (v.length !== this.embedder.dims)
        throw new AppError(
          'PROVIDER',
          `Embedder returned ${v.length} dims, expected ${this.embedder.dims}`,
        )
    }
    return out
  }

  replaceDocument(
    doc: IndexedDocument,
    chunks: ChunkInput[],
    onProgress?: (done: number, total: number) => void,
    signal?: AbortSignal,
  ): Promise<void> {
    return this.serialize(async () => {
      const vectors = await this.embedAll(
        chunks.map((c) => (c.headingPath ? `${c.headingPath}\n${c.text}` : c.text)),
        onProgress,
        signal,
        chunks.map(() => doc.title),
      )
      signal?.throwIfAborted()
      this.writeDocument(doc, chunks, vectors)
    })
  }

  private writeDocument(doc: IndexedDocument, chunks: ChunkInput[], vectors: Float32Array[]): void {
    const insertChunk = this.db.prepare(
      `INSERT INTO chunks(doc_id, heading_path, heading, page, ord, text, token_count)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    const insertVec = this.db.prepare(
      'INSERT INTO chunk_vec(chunk_id, doc_id, embedding) VALUES (?, ?, ?)',
    )
    this.db.transaction(() => {
      this.deleteDocumentRows(doc.id)
      this.db
        .prepare(
          `INSERT INTO documents(id, title, short_name, kind, path, pages, ingested_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          doc.id,
          doc.title,
          doc.shortName ?? null,
          doc.kind,
          doc.path,
          doc.pages,
          new Date().toISOString(),
        )
      chunks.forEach((c, i) => {
        const { lastInsertRowid } = insertChunk.run(
          doc.id,
          c.headingPath,
          ownHeading(c.headingPath),
          c.page ?? null,
          c.ord,
          c.text,
          c.tokenCount,
        )
        insertVec.run(BigInt(lastInsertRowid), doc.id, vectors[i]!)
      })
    })()
  }

  private deleteDocumentRows(documentId: string): void {
    this.db.prepare('DELETE FROM chunk_vec WHERE doc_id = ?').run(documentId)
    this.db.prepare('DELETE FROM chunks WHERE doc_id = ?').run(documentId)
    this.db.prepare('DELETE FROM documents WHERE id = ?').run(documentId)
  }

  removeDocument(documentId: string): Promise<void> {
    return this.serialize(async () => {
      this.db.transaction(() => this.deleteDocumentRows(documentId))()
    })
  }

  async search(query: string, opts: SearchOptions = {}): Promise<SearchHit[]> {
    const k = opts.k ?? DEFAULT_K
    const mode = opts.mode ?? 'hybrid'
    const docIds = opts.documentIds?.length ? opts.documentIds : undefined
    const depth = candidateDepth(k)
    const ftsIds = mode === 'vector' ? [] : this.ftsSearch(query, depth, docIds)
    const vecIds = mode === 'fts' ? [] : await this.vectorSide(query, depth, docIds, mode, opts)
    const fused = reciprocalRankFusion(ftsIds, vecIds).slice(0, k)
    return this.hydrate(fused)
  }

  /**
   * Vector candidates. In hybrid mode an unavailable embedder (e.g. local model not downloaded)
   * degrades to keyword-only results instead of failing the search; vector mode reports it.
   */
  private async vectorSide(
    query: string,
    depth: number,
    docIds: string[] | undefined,
    mode: 'hybrid' | 'vector',
    opts: SearchOptions,
  ): Promise<number[]> {
    try {
      return await this.vectorSearch(query, depth, docIds, opts.signal)
    } catch (err) {
      if (mode === 'hybrid' && err instanceof AppError && err.code === 'PROVIDER') {
        console.warn(`[retrieve] vector search unavailable, using keyword results: ${err.message}`)
        return []
      }
      throw err
    }
  }

  /** Chunk ids ranked by BM25, best first. */
  ftsSearch(query: string, limit: number, documentIds?: string[]): number[] {
    const match = toFtsQuery(query)
    if (!match) return []
    const filter = documentIds ? `AND c.doc_id IN (${placeholders(documentIds.length)})` : ''
    const rows = this.db
      .prepare(
        `SELECT chunks_fts.rowid AS id FROM chunks_fts
         JOIN chunks c ON c.id = chunks_fts.rowid
         WHERE chunks_fts MATCH ? ${filter}
         ORDER BY bm25(chunks_fts, ${BM25_WEIGHTS}), c.id
         LIMIT ?`,
      )
      .all(match, ...(documentIds ?? []), limit) as { id: number }[]
    return rows.map((r) => r.id)
  }

  /** Chunk ids ranked by cosine distance to the query embedding, best first. */
  async vectorSearch(
    query: string,
    limit: number,
    documentIds?: string[],
    signal?: AbortSignal,
  ): Promise<number[]> {
    if (vectorCount(this.db) === 0) return []
    const v = await embedQuery(this.embedder, query, signal)
    const filter = documentIds ? `AND doc_id IN (${placeholders(documentIds.length)})` : ''
    const rows = this.db
      .prepare(
        `SELECT chunk_id AS id FROM chunk_vec
         WHERE embedding MATCH ? AND k = ? ${filter}
         ORDER BY distance`,
      )
      .all(v, limit, ...(documentIds ?? [])) as { id: number }[]
    return rows.map((r) => Number(r.id))
  }

  private hydrate(fused: ReturnType<typeof reciprocalRankFusion>): SearchHit[] {
    if (!fused.length) return []
    const rows = this.db
      .prepare(
        `SELECT c.*, d.title FROM chunks c JOIN documents d ON d.id = c.doc_id
         WHERE c.id IN (${placeholders(fused.length)})`,
      )
      .all(...fused.map((f) => f.id)) as ChunkRow[]
    const byId = new Map(rows.map((r) => [r.id, r]))
    return fused.flatMap((f) => {
      const r = byId.get(f.id)
      if (!r) return []
      const c = toChunk(r)
      return [
        {
          chunkId: c.id,
          documentId: c.documentId,
          documentTitle: r.title ?? '',
          headingPath: c.headingPath,
          ...(c.page ? { page: c.page } : {}),
          text: c.text,
          score: f.score,
          ...(f.ftsRank ? { ftsRank: f.ftsRank } : {}),
          ...(f.vecRank ? { vecRank: f.vecRank } : {}),
        },
      ]
    })
  }

  chunks(documentId: string, limit = 200, offset = 0): Chunk[] {
    const rows = this.db
      .prepare('SELECT * FROM chunks WHERE doc_id = ? ORDER BY ord, id LIMIT ? OFFSET ?')
      .all(documentId, limit, offset) as ChunkRow[]
    return rows.map(toChunk)
  }

  chunk(chunkId: number): (Chunk & { documentTitle: string }) | undefined {
    const r = this.db
      .prepare(
        'SELECT c.*, d.title FROM chunks c JOIN documents d ON d.id = c.doc_id WHERE c.id = ?',
      )
      .get(chunkId) as ChunkRow | undefined
    return r ? { ...toChunk(r), documentTitle: r.title ?? '' } : undefined
  }

  /** Document ids currently in the index. */
  documentIds(): string[] {
    return (this.db.prepare('SELECT id FROM documents ORDER BY id').all() as { id: string }[]).map(
      (r) => r.id,
    )
  }

  status(): IndexStatus {
    return {
      embedderKey: embedderKey(this.embedder),
      dims: this.embedder.dims,
      documents: (this.db.prepare('SELECT count(*) AS n FROM documents').get() as { n: number }).n,
      chunks: chunkCount(this.db),
      vectors: vectorCount(this.db),
      vectorsStale: getMeta(this.db, 'vectors_stale') === '1',
    }
  }

  /** Embed every chunk that has no vector for the current embedder (after an embedder change). */
  reembed(onProgress?: (done: number, total: number) => void, signal?: AbortSignal): Promise<void> {
    return this.serialize(async () => {
      const rows = this.db
        .prepare(
          `SELECT c.id, c.doc_id, c.heading_path, c.text, d.title AS doc_title FROM chunks c
           JOIN documents d ON d.id = c.doc_id
           WHERE c.id NOT IN (SELECT chunk_id FROM chunk_vec) ORDER BY c.id`,
        )
        .all() as (Pick<ChunkRow, 'id' | 'doc_id' | 'heading_path' | 'text'> & {
        doc_title: string
      })[]
      const vectors = await this.embedAll(
        rows.map((r) => (r.heading_path ? `${r.heading_path}\n${r.text}` : r.text)),
        onProgress,
        signal,
        rows.map((r) => r.doc_title),
      )
      signal?.throwIfAborted()
      const insert = this.db.prepare(
        'INSERT INTO chunk_vec(chunk_id, doc_id, embedding) VALUES (?, ?, ?)',
      )
      this.db.transaction(() => {
        rows.forEach((r, i) => insert.run(BigInt(r.id), r.doc_id, vectors[i]!))
        setMeta(this.db, 'vectors_stale', '0')
      })()
    })
  }

  reset(): Promise<void> {
    return this.serialize(async () => {
      dropAll(this.db)
      ensureVectorTable(this.db, { key: embedderKey(this.embedder), dims: this.embedder.dims })
    })
  }

  isOpen(): boolean {
    return this.db.open
  }

  /** Handles share one cached connection; closing is done by closeIndex / app quit. */
  close(): void {}
}
