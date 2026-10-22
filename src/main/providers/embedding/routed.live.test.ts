// Live check (LIVE=1) for embedding mode "Configured provider" (#114): the Embeddings routing
// row picks the provider, LM Studio and Ollama nomic-embed-text return 768-d vectors, and an
// index built with the 384-d hash embedder is reset and rebuilt at 768 dims after the switch.
//   LIVE=1 pnpm test src/main/providers/embedding/routed.live.test.ts
// Base URLs: TTX_LMSTUDIO_URL (default http://127.0.0.1:1234/v1), TTX_OLLAMA_URL (default
// http://127.0.0.1:11434).
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

vi.mock('electron', () => ({
  app: { on: vi.fn(), getPath: () => tmpdir() },
  BrowserWindow: { getAllWindows: () => [] },
  safeStorage: {
    isEncryptionAvailable: () => true,
    getSelectedStorageBackend: () => 'keychain',
    encryptString: (s: string) => Buffer.from(s),
    decryptString: (b: Buffer) => b.toString(),
  },
}))

const { resetSettingsCache, updateSettings } = await import('../../settings/store')
const { resetResolveState } = await import('../resolve')
const { createEmbedder, embedderKey } = await import('./factory')
const { HashEmbedder } = await import('./hash')
const { connectionFor } = await import('../../db')
const { SqliteIndexStore } = await import('../../retrieve/store')

const LIVE = process.env.LIVE === '1'
const SERVERS = [
  {
    id: 'lmstudio',
    kind: 'openai-compatible' as const,
    baseUrl: process.env.TTX_LMSTUDIO_URL ?? 'http://127.0.0.1:1234/v1',
    model: 'text-embedding-nomic-embed-text-v1.5',
  },
  {
    id: 'ollama',
    kind: 'ollama' as const,
    baseUrl: process.env.TTX_OLLAMA_URL ?? 'http://127.0.0.1:11434',
    model: 'nomic-embed-text',
  },
]

async function routeEmbeddingsTo(server: (typeof SERVERS)[number]) {
  await updateSettings((s) => {
    s.providers = [
      {
        id: server.id,
        kind: server.kind,
        label: server.id,
        baseUrl: server.baseUrl,
        options: {},
        enabled: true,
      },
    ]
    s.defaultRouting = { embed: { providerId: server.id, model: server.model } }
    s.embeddings = { mode: 'provider', model: 'Xenova/bge-small-en-v1.5' }
  })
}

const settingsMode = { mode: 'provider' as const, model: 'Xenova/bge-small-en-v1.5' }

describe.skipIf(!LIVE)('embedding mode "Configured provider" (live)', () => {
  beforeEach(() => {
    process.env.TTX_USER_DATA = mkdtempSync(join(tmpdir(), 'ttx-ud-'))
    resetSettingsCache()
    resetResolveState()
  })

  for (const server of SERVERS) {
    it(`${server.id} ${server.model} embeds through the routing row at 768 dims`, async () => {
      await routeEmbeddingsTo(server)
      const e = await createEmbedder(settingsMode, { modelsDir: tmpdir(), providers: [] })
      const [v] = await e.embed(['FIDS outage at Terminal B'])
      expect(v).toHaveLength(768)
      expect(e.dims).toBe(768)
      expect(embedderKey(e)).toBe(`${server.id}:${server.model}`)
    }, 60_000)
  }

  it('resets 384-d hash vectors and rebuilds at 768 dims after switching', async () => {
    await routeEmbeddingsTo(SERVERS[0]!)
    const db = connectionFor(join(mkdtempSync(join(tmpdir(), 'ttx-idx-')), 'index.sqlite'))
    const store = new SqliteIndexStore(db, new HashEmbedder())
    const doc = {
      id: 'tirp',
      title: 'TIRP',
      shortName: 'TIRP',
      kind: 'plan' as const,
      path: 'documents/tirp.md',
      pages: 1,
    }
    const chunks = ['FIDS go dark; use whiteboards.', 'Doors fail unlocked; dispatch LEO.'].map(
      (text, ord) => ({ ord, headingPath: 'TIRP', text, tokenCount: 6 }),
    )
    await store.replaceDocument(doc, chunks)
    expect(store.status()).toMatchObject({ dims: 384, vectors: 2 })

    store.useEmbedder(await createEmbedder(settingsMode, { modelsDir: tmpdir(), providers: [] }))
    expect(store.status()).toMatchObject({ dims: 768, vectors: 0, chunks: 2 })
    await store.reembed()
    expect(store.status()).toMatchObject({ dims: 768, vectors: 2, vectorsStale: false })
    const hits = await store.search('whiteboards when flight displays fail', {
      k: 1,
      mode: 'vector',
    })
    expect(hits[0]?.text).toMatch(/whiteboards/)
  }, 60_000)
})
