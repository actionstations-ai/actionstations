// A keyword-overlap search index over one reference document folder (reference/transit,
// reference/dam …), split at Markdown headings like the ingest parser: the domain-profile
// tests run the pipeline against the fictional document sets without SQLite or embeddings.
import { readdirSync, readFileSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'
import type { Chunk, SearchHit } from '../../../src/shared/schemas'
import type { SearchIndex } from '../../../src/main/generate/deps'
import type { SearchOptions } from '../../../src/main/retrieve/types'
import { splitMarkdown } from '../../../src/main/retrieve/reference-corpus.test-helper'

const tokens = (s: string): string[] =>
  s
    .toLowerCase()
    .split(/[^a-z0-9.]+/)
    .filter((t) => t.length > 2)

/** "emergency-operations-plan-EOP.md" → "EOP"; "site-map.md" → "SITE-MAP". */
const shortNameOf = (file: string): string => {
  const stem = basename(file, '.md')
  const tail = stem.split('-').at(-1) ?? stem
  return /^[A-Z]{2,}$/.test(tail) ? tail : stem.toUpperCase()
}

/** Absolute paths of the Markdown files in a reference folder. */
export function referenceFiles(dir: string): string[] {
  return readdirSync(resolve(dir))
    .filter((f) => f.endsWith('.md'))
    .sort()
    .map((f) => join(resolve(dir), f))
}

export class FakeCorpusIndex implements SearchIndex {
  readonly chunks: (Chunk & { documentTitle: string })[] = []
  readonly queries: string[] = []

  constructor(dir: string) {
    let id = 1
    for (const file of referenceFiles(dir)) {
      const markdown = readFileSync(file, 'utf8')
      const shortName = shortNameOf(file)
      const title = /^#\s+(.*)$/m.exec(markdown)?.[1]?.trim() ?? basename(file)
      for (const c of splitMarkdown(markdown, shortName)) {
        this.chunks.push({
          ...c,
          id: id++,
          documentId: shortName.toLowerCase(),
          documentTitle: title,
        })
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

/** Every document of a reference folder as text, for the facility-fact tests. */
export function referenceTexts(dir: string): string[] {
  return referenceFiles(dir).map((f) => readFileSync(f, 'utf8'))
}

/** Airport words that must not appear in another domain's prompts or outputs unless its documents use them. */
export const AIRPORT_WORDS =
  /\b(?:runways?|taxiways?|concourses?|FIDS|AODB|BHS|TSA|airlines?|airport|terminal building|gate agents?|jet ?bridge|flights?|checkpoint)\b/i
