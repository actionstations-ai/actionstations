// Test doubles for the generation pipeline: an in-memory keyword index over reference/ncia
// (real heading paths, no SQLite) and a scripted TextProvider for repair / cancel tests.
import type { Chunk, ProviderConfig, SearchHit } from '../../../src/shared/schemas'
import type { SearchIndex } from '../../../src/main/generate/deps'
import type { SearchOptions } from '../../../src/main/retrieve/types'
import type { ChatRequest, ChatResponse, TextProvider } from '../../../src/main/providers/types'
import { loadNciaCorpus } from '../../../src/main/retrieve/reference-corpus.test-helper'

const tokens = (s: string): string[] =>
  s
    .toLowerCase()
    .split(/[^a-z0-9.]+/)
    .filter((t) => t.length > 2)

/** Keyword-overlap search over the NCIA plans; deterministic and fast. */
export class FakeNciaIndex implements SearchIndex {
  readonly chunks: (Chunk & { documentTitle: string })[] = []
  readonly queries: string[] = []

  constructor() {
    let id = 1
    for (const { doc, chunks } of loadNciaCorpus()) {
      for (const c of chunks) {
        this.chunks.push({ ...c, id: id++, documentId: doc.id, documentTitle: doc.title })
      }
    }
  }

  async search(query: string, opts: SearchOptions = {}): Promise<SearchHit[]> {
    this.queries.push(query)
    opts.signal?.throwIfAborted()
    const q = new Set(tokens(query))
    if (!q.size) return []
    return this.chunks
      .map((c) => {
        const words = tokens(`${c.headingPath} ${c.text}`)
        const hits = words.filter((w) => q.has(w)).length
        return { c, score: hits / Math.sqrt(words.length + 1) }
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score || a.c.id - b.c.id)
      .slice(0, opts.k ?? 10)
      .map(({ c, score }) => ({
        chunkId: c.id,
        documentId: c.documentId,
        documentTitle: c.documentTitle,
        headingPath: c.headingPath,
        ...(c.page ? { page: c.page } : {}),
        text: c.text,
        score,
      }))
  }

  chunk(chunkId: number) {
    return this.chunks.find((c) => c.id === chunkId)
  }
}

export type Script = (req: ChatRequest, callIndex: number) => string | Promise<string>

/** Returns scripted text per call; records every request. Streams in 40-char pieces. */
export class ScriptedProvider implements TextProvider {
  readonly kind = 'mock' as const
  readonly config: ProviderConfig = {
    id: 'scripted',
    kind: 'mock',
    label: 'Scripted',
    options: {},
    enabled: true,
  }
  readonly requests: ChatRequest[] = []
  constructor(private readonly script: Script) {}
  get id(): string {
    return this.config.id
  }
  async listModels() {
    return [{ id: 'scripted', kind: 'chat' as const }]
  }
  async health() {
    return { ok: true }
  }
  async chat(req: ChatRequest, onToken?: (t: string) => void): Promise<ChatResponse> {
    req.signal?.throwIfAborted()
    const text = await this.script(req, this.requests.length)
    this.requests.push(req)
    req.signal?.throwIfAborted()
    if (onToken) for (let i = 0; i < text.length; i += 40) onToken(text.slice(i, i + 40))
    return {
      text,
      model: 'scripted',
      usage: { inputTokens: 100, outputTokens: Math.ceil(text.length / 4) },
      finishReason: 'stop',
      latencyMs: 1,
      structuredVia: 'prompt',
    }
  }
}
