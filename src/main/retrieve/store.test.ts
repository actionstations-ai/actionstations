import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

vi.mock('electron', () => ({ app: { on: vi.fn(), getPath: () => tmpdir() } }))

const { closeAllConnections, connectionFor, getMeta } = await import('../db')
const { SqliteIndexStore } = await import('./store')
const { openIndexAt } = await import('./index')
const { HashEmbedder } = await import('../providers/embedding/hash')
const { AppError } = await import('../lib/errors')

import type { ChunkInput, IndexedDocument } from './types'
import type { EmbeddingProvider } from '../providers/types'

const doc = (id: string, title = id.toUpperCase()): IndexedDocument => ({
  id,
  title,
  shortName: title,
  kind: 'plan',
  path: `documents/${id}.md`,
  pages: 3,
})

const chunk = (ord: number, headingPath: string, text: string, page?: number): ChunkInput => ({
  ord,
  headingPath,
  text,
  tokenCount: text.split(' ').length,
  ...(page ? { page } : {}),
})

const TIRP_CHUNKS = [
  chunk(
    0,
    'TIRP › 13.6 Scenario C: FIDS / BHS System Failure',
    'FIDS go dark; use whiteboards.',
    41,
  ),
  chunk(1, 'TIRP › 13.5 Scenario B: Access Control', 'Doors fail unlocked; dispatch LEO.', 40),
  chunk(2, 'TIRP › 4.1 Winter Storm', 'Snow removal priorities and de-icing.', 12),
]

function count(db: ReturnType<typeof connectionFor>, sql: string): number {
  return (db.prepare(sql).get() as { n: number }).n
}

describe('SqliteIndexStore', () => {
  let file: string
  let db: ReturnType<typeof connectionFor>
  let store: InstanceType<typeof SqliteIndexStore>

  beforeEach(() => {
    file = join(mkdtempSync(join(tmpdir(), 'ttx-idx-')), 'index.sqlite')
    db = connectionFor(file)
    store = new SqliteIndexStore(db, new HashEmbedder())
  })
  afterEach(() => closeAllConnections())

  it('opens in WAL mode with sqlite-vec loaded', () => {
    expect(db.pragma('journal_mode', { simple: true })).toBe('wal')
    expect(db.prepare('SELECT vec_version() AS v').get()).toMatchObject({ v: expect.any(String) })
  })

  it('stores chunks, FTS rows and vectors, and returns chunks in order', async () => {
    const progress: number[] = []
    await store.replaceDocument(doc('tirp'), TIRP_CHUNKS, (done) => progress.push(done))
    expect(progress.at(-1)).toBe(3)
    const chunks = store.chunks('tirp')
    expect(chunks.map((c) => c.ord)).toEqual([0, 1, 2])
    expect(chunks[0]).toMatchObject({ documentId: 'tirp', page: 41, tokenCount: 5 })
    expect(count(db, 'SELECT count(*) n FROM chunks_fts')).toBe(3)
    expect(count(db, 'SELECT count(*) n FROM chunk_vec')).toBe(3)
    expect(store.chunk(chunks[1]!.id)).toMatchObject({ documentTitle: 'TIRP', ord: 1 })
    expect(store.chunks('tirp', 1, 1).map((c) => c.ord)).toEqual([1])
  })

  it('replaceDocument twice replaces the old chunks, FTS rows and vectors', async () => {
    await store.replaceDocument(doc('tirp'), TIRP_CHUNKS)
    const before = store.chunks('tirp').map((c) => c.id)
    await store.replaceDocument(doc('tirp', 'TIRP v2'), [chunk(0, 'TIRP › New', 'Only chunk.')])
    expect(store.chunks('tirp').map((c) => c.text)).toEqual(['Only chunk.'])
    expect(store.chunk(before[0]!)).toBeUndefined()
    expect(count(db, 'SELECT count(*) n FROM chunks_fts')).toBe(1)
    expect(count(db, 'SELECT count(*) n FROM chunk_vec')).toBe(1)
    expect(count(db, 'SELECT count(*) n FROM documents')).toBe(1)
    expect((await store.search('whiteboards', { mode: 'fts' })).length).toBe(0)
    expect((await store.search('only chunk'))[0]?.documentTitle).toBe('TIRP v2')
  })

  it('removeDocument cleans chunks, FTS and vectors for that document only', async () => {
    await store.replaceDocument(doc('tirp'), TIRP_CHUNKS)
    await store.replaceDocument(doc('aep'), [chunk(0, 'AEP › Appendix 6', 'FIDS go dark.')])
    await store.removeDocument('tirp')
    expect(store.chunks('tirp')).toEqual([])
    expect(count(db, 'SELECT count(*) n FROM chunks_fts')).toBe(1)
    expect(
      count(db, "SELECT count(*) n FROM chunks_fts WHERE chunks_fts MATCH 'whiteboards'"),
    ).toBe(0)
    expect(count(db, "SELECT count(*) n FROM chunk_vec WHERE doc_id = 'tirp'")).toBe(0)
    expect(count(db, 'SELECT count(*) n FROM chunk_vec')).toBe(1)
    expect(store.documentIds()).toEqual(['aep'])
  })

  it('returns hits with citation fields and per-retriever ranks', async () => {
    await store.replaceDocument(doc('tirp'), TIRP_CHUNKS)
    const [hit] = await store.search('FIDS failure', { k: 3 })
    expect(hit).toMatchObject({
      documentId: 'tirp',
      documentTitle: 'TIRP',
      headingPath: expect.stringContaining('13.6'),
      page: 41,
      ftsRank: 1,
      vecRank: 1,
    })
    expect(hit!.score).toBeCloseTo(2 / 61, 10)
  })

  it('supports fts-only and vector-only modes', async () => {
    await store.replaceDocument(doc('tirp'), TIRP_CHUNKS)
    const fts = await store.search('whiteboards', { mode: 'fts' })
    expect(fts).toHaveLength(1)
    expect(fts[0]!.vecRank).toBeUndefined()
    const vec = await store.search('whiteboards', { mode: 'vector', k: 2 })
    expect(vec).toHaveLength(2)
    expect(vec[0]!.ftsRank).toBeUndefined()
    expect(vec[0]!.headingPath).toContain('13.6')
  })

  it('weights heading_path matches: a heading-only match is still found', async () => {
    await store.replaceDocument(doc('tirp'), TIRP_CHUNKS)
    const hits = await store.search('scenario', { mode: 'fts' })
    expect(hits).toHaveLength(2)
    expect(hits.map((h) => h.headingPath).sort()).toEqual([
      expect.stringContaining('13.5'),
      expect.stringContaining('13.6'),
    ])
  })

  it('filters by documentIds in both retrievers', async () => {
    await store.replaceDocument(doc('tirp'), TIRP_CHUNKS)
    await store.replaceDocument(doc('aep'), [chunk(0, 'AEP › Appendix 6', 'FIDS go dark.')])
    for (const mode of ['fts', 'vector', 'hybrid'] as const) {
      const hits = await store.search('FIDS dark', { mode, documentIds: ['aep'] })
      expect(hits.length).toBeGreaterThan(0)
      expect(hits.every((h) => h.documentId === 'aep')).toBe(true)
    }
  })

  it('returns nothing for an unsearchable query on an empty index', async () => {
    expect(await store.search('?!')).toEqual([])
  })

  it('reset drops everything and keeps the store usable', async () => {
    await store.replaceDocument(doc('tirp'), TIRP_CHUNKS)
    await store.reset()
    expect(store.status()).toMatchObject({ documents: 0, chunks: 0, vectors: 0 })
    await store.replaceDocument(doc('tirp'), TIRP_CHUNKS)
    expect(store.status().chunks).toBe(3)
  })

  it('serializes concurrent writes for the same document', async () => {
    await Promise.all([
      store.replaceDocument(doc('tirp'), TIRP_CHUNKS),
      store.replaceDocument(doc('tirp'), TIRP_CHUNKS.slice(0, 1)),
    ])
    expect(store.chunks('tirp')).toHaveLength(1)
  })

  it('stops before writing when the signal is aborted', async () => {
    const ac = new AbortController()
    ac.abort()
    await expect(
      store.replaceDocument(doc('tirp'), TIRP_CHUNKS, undefined, ac.signal),
    ).rejects.toThrow()
    expect(store.chunks('tirp')).toEqual([])
  })
})

class FakeEmbedder implements EmbeddingProvider {
  readonly id = 'fake'
  constructor(
    readonly model: string,
    readonly dims: number,
  ) {}
  async embed(texts: string[]): Promise<Float32Array[]> {
    return texts.map((t) => {
      const v = new Float32Array(this.dims)
      v[t.length % this.dims] = 1
      return v
    })
  }
}

describe('embedder changes', () => {
  afterEach(() => closeAllConnections())

  it('records the embedder in meta; a new dimension recreates vectors and marks them stale', async () => {
    const file = join(mkdtempSync(join(tmpdir(), 'ttx-idx-')), 'index.sqlite')
    const store = openIndexAt(file, new HashEmbedder())
    await store.replaceDocument(doc('tirp'), TIRP_CHUNKS)
    const db = connectionFor(file)
    expect(getMeta(db, 'embedder_key')).toBe('hash:feature-hash-v1')
    expect(getMeta(db, 'embedder_dims')).toBe('384')

    const same = openIndexAt(file, new FakeEmbedder('nomic-embed-text', 768))
    expect(same).toBe(store)
    expect(store.status()).toMatchObject({
      embedderKey: 'fake:nomic-embed-text',
      dims: 768,
      chunks: 3,
      vectors: 0,
      vectorsStale: true,
    })
    // Keyword search still works while vectors are stale.
    expect((await store.search('whiteboards')).length).toBe(1)

    const seen: number[] = []
    await store.reembed((done) => seen.push(done))
    expect(seen.at(-1)).toBe(3)
    expect(store.status()).toMatchObject({ vectors: 3, vectorsStale: false })
    expect((await store.search('anything', { mode: 'vector', k: 3 })).length).toBe(3)
  })

  it('keeps vectors when reopened with the same embedder after a restart', async () => {
    const file = join(mkdtempSync(join(tmpdir(), 'ttx-idx-')), 'index.sqlite')
    await openIndexAt(file, new HashEmbedder()).replaceDocument(doc('tirp'), TIRP_CHUNKS)
    closeAllConnections()
    const reopened = openIndexAt(file, new HashEmbedder())
    expect(reopened.status()).toMatchObject({ vectors: 3, vectorsStale: false })
  })

  it('hybrid search degrades to keywords when the embedder is unavailable; vector mode reports it', async () => {
    const file = join(mkdtempSync(join(tmpdir(), 'ttx-idx-')), 'index.sqlite')
    const hash = new HashEmbedder()
    const store = openIndexAt(file, hash)
    await store.replaceDocument(doc('tirp'), TIRP_CHUNKS)
    vi.spyOn(hash, 'embed').mockRejectedValue(new AppError('PROVIDER', 'model not downloaded'))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const hits = await store.search('whiteboards')
    expect(hits).toHaveLength(1)
    expect(hits[0]).toMatchObject({ ftsRank: 1 })
    expect(warn).toHaveBeenCalled()
    await expect(store.search('whiteboards', { mode: 'vector' })).rejects.toMatchObject({
      code: 'PROVIDER',
    })
    warn.mockRestore()
  })

  it('rejects vectors whose length does not match the embedder dims', async () => {
    const file = join(mkdtempSync(join(tmpdir(), 'ttx-idx-')), 'index.sqlite')
    const liar: EmbeddingProvider = {
      id: 'liar',
      model: 'm',
      dims: 8,
      embed: async (t) => t.map(() => new Float32Array(4)),
    }
    const store = openIndexAt(file, liar)
    await expect(store.replaceDocument(doc('x'), TIRP_CHUNKS)).rejects.toMatchObject({
      code: 'PROVIDER',
    })
  })
})
