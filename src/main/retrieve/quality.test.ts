// Retrieval quality on the CSAAP source plans (reference/ncia). The questions are ones the
// generation pipeline asks; the expected sections are what an exercise designer would cite.
// The hash embedder always runs; the local bge model runs with LIVE=1 (downloads ~130 MB once).
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
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

import type { SearchHit } from '@shared/schemas'
import type { EmbeddingProvider } from '../providers/types'

interface Expectation {
  label: string
  match: (h: SearchHit) => boolean
  /** Required rank for this embedder (top-N). */
  within: { hash: number; bge: number }
}

const CASES: { query: string; expect: Expectation[] }[] = [
  {
    query: 'FIDS failure',
    expect: [
      {
        label: 'TIRP 13.6',
        match: (h) => /^TIRP › .*13\.6/.test(h.headingPath),
        within: { hash: 5, bge: 5 },
      },
      {
        label: 'AEP Appendix 6',
        match: (h) => /^AEP › .*APPENDIX 6/i.test(h.headingPath),
        within: { hash: 5, bge: 5 },
      },
    ],
  },
  {
    query: 'access control failure fail unlocked',
    expect: [
      {
        label: 'TIRP 13.5',
        match: (h) => /^TIRP › .*13\.5/.test(h.headingPath),
        within: { hash: 5, bge: 5 },
      },
      {
        // The hash embedder can't tell "Fail-Secure doors mechanically lock" is about this
        // (vector rank 14); FTS ranks it 4th, so fusion lands it at 7-8.
        label: 'ASP 6.4',
        match: (h) => /^ASP › .*6\.4/.test(h.headingPath),
        within: { hash: 10, bge: 5 },
      },
    ],
  },
]

const short = (h: SearchHit): string =>
  h.headingPath.replace(/North Coast International Airport \(NCIA\) — [^›]*› /, '')

function describeHits(hits: SearchHit[]): string {
  return hits
    .map((h, i) => `${i + 1}. ${short(h)} (fts ${h.ftsRank ?? '-'}, vec ${h.vecRank ?? '-'})`)
    .join('\n')
}

async function buildIndex(
  embedder: EmbeddingProvider,
): Promise<InstanceType<typeof SqliteIndexStore>> {
  const file = join(mkdtempSync(join(tmpdir(), 'ttx-q-')), 'index.sqlite')
  const store = new SqliteIndexStore(connectionFor(file), embedder)
  for (const { doc, chunks } of loadNciaCorpus()) await store.replaceDocument(doc, chunks)
  return store
}

function qualitySuite(name: 'hash' | 'bge', makeEmbedder: () => Promise<EmbeddingProvider>): void {
  let store: InstanceType<typeof SqliteIndexStore>
  beforeAll(async () => {
    store = await buildIndex(await makeEmbedder())
  }, 600_000)
  afterAll(() => closeAllConnections())

  it('indexes every reference plan', () => {
    expect(store.status()).toMatchObject({ documents: 4, vectorsStale: false })
    expect(store.status().chunks).toBeGreaterThan(100)
  })

  for (const c of CASES) {
    const labels = c.expect.map((e) => `${e.label} (top ${e.within[name]})`).join(', ')
    it(`"${c.query}" → ${labels}`, async () => {
      const hits = await store.search(c.query, { k: 10, mode: 'hybrid' })
      console.info(`[quality:${name}] ${c.query}\n${describeHits(hits)}`)
      for (const e of c.expect) {
        const rank = hits.findIndex(e.match) + 1
        expect(rank, `${e.label}\n${describeHits(hits)}`).toBeGreaterThan(0)
        expect(rank, `${e.label}\n${describeHits(hits)}`).toBeLessThanOrEqual(e.within[name])
      }
    })
  }
}

describe('retrieval quality on reference/ncia — hash embedder, hybrid', () => {
  qualitySuite('hash', async () => new HashEmbedder())
})

/** Persistent across runs so LIVE tests download the model only once. */
const LIVE_MODELS_DIR = join(tmpdir(), 'ttx-test-models')

describe.runIf(process.env.LIVE === '1')(
  'retrieval quality on reference/ncia — local bge-small (LIVE)',
  () => {
    qualitySuite('bge', async () => {
      if (!isModelDownloaded(LIVE_MODELS_DIR, DEFAULT_LOCAL_MODEL))
        await downloadModel(LIVE_MODELS_DIR, DEFAULT_LOCAL_MODEL)
      return new LocalOnnxEmbedder(DEFAULT_LOCAL_MODEL, LIVE_MODELS_DIR)
    })
  },
)
