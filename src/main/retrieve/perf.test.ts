// Embed + index 500 chunks and time it (hash always; local bge with LIVE=1). Budgets are loose
// so slow machines don't flake; the console line is the measurement.
import { afterAll, describe, expect, it, vi } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

vi.mock('electron', () => ({ app: { on: vi.fn(), getPath: () => tmpdir() } }))

const { closeAllConnections, connectionFor } = await import('../db')
const { SqliteIndexStore } = await import('./store')
const { HashEmbedder } = await import('../providers/embedding/hash')
const { LocalOnnxEmbedder, DEFAULT_LOCAL_MODEL, downloadModel, isModelDownloaded } =
  await import('../providers/embedding/local-onnx')
const { loadNciaCorpus } = await import('./reference-corpus.test-helper')

import type { EmbeddingProvider } from '../providers/types'
import type { ChunkInput, IndexedDocument } from './types'

const N = 500
const LIVE_MODELS_DIR = join(tmpdir(), 'ttx-test-models')

/** 500 realistic chunks: the reference corpus repeated with distinct suffixes. */
function corpus500(): { doc: IndexedDocument; chunks: ChunkInput[] } {
  const base = loadNciaCorpus().flatMap((d) => d.chunks)
  const chunks = Array.from({ length: N }, (_, i) => {
    const c = base[i % base.length]!
    return { ...c, ord: i, text: `${c.text}\n(copy ${Math.floor(i / base.length)})` }
  })
  return {
    doc: { id: 'perf', title: 'Perf corpus', kind: 'plan', path: 'documents/perf.md', pages: 1 },
    chunks,
  }
}

async function measure(
  embedder: EmbeddingProvider,
): Promise<{ indexMs: number; searchMs: number }> {
  const file = join(mkdtempSync(join(tmpdir(), 'ttx-perf-')), 'index.sqlite')
  const store = new SqliteIndexStore(connectionFor(file), embedder)
  const { doc, chunks } = corpus500()
  const t0 = performance.now()
  await store.replaceDocument(doc, chunks)
  const indexMs = performance.now() - t0
  const queries = ['FIDS failure', 'access control fail unlocked', 'who can shut down the network']
  const t1 = performance.now()
  for (const q of queries) await store.search(q, { k: 10 })
  const searchMs = (performance.now() - t1) / queries.length
  expect(store.status()).toMatchObject({ chunks: N, vectors: N })
  console.info(
    `[perf:${embedder.id}] embed+index ${N} chunks: ${indexMs.toFixed(0)} ms ` +
      `(${(indexMs / N).toFixed(2)} ms/chunk); hybrid search avg ${searchMs.toFixed(1)} ms`,
  )
  return { indexMs, searchMs }
}

describe('index performance', () => {
  afterAll(() => closeAllConnections())

  it(`hash: embeds and indexes ${N} chunks quickly`, async () => {
    const { indexMs, searchMs } = await measure(new HashEmbedder())
    expect(indexMs).toBeLessThan(10_000)
    expect(searchMs).toBeLessThan(500)
  })

  it.runIf(process.env.LIVE === '1')(
    `local bge-small: embeds and indexes ${N} chunks (LIVE)`,
    async () => {
      if (!isModelDownloaded(LIVE_MODELS_DIR, DEFAULT_LOCAL_MODEL))
        await downloadModel(LIVE_MODELS_DIR, DEFAULT_LOCAL_MODEL)
      const { indexMs } = await measure(new LocalOnnxEmbedder(DEFAULT_LOCAL_MODEL, LIVE_MODELS_DIR))
      expect(indexMs).toBeLessThan(300_000)
    },
    600_000,
  )
})
