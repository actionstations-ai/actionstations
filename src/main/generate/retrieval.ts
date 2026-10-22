// Retrieval plan for one stage: render the prompt's frontmatter queries against the scenario
// state, run hybrid search for each, merge round-robin, dedupe, and present the chunks as
// C1..Cn inside a <documents> block the model may cite but must treat as data.
import Handlebars from 'handlebars'
import type { Citation, SearchHit } from '@shared/schemas'
import type { SearchIndex } from './deps'

export interface RetrievedChunk {
  /** Citation key shown in the prompt, "C3". */
  key: string
  hit: SearchHit
}

/** Keep the prompt bounded even when a chunker produced an oversized section. */
const MAX_CHUNK_CHARS = 3200
const MAX_QUOTE_CHARS = 200

/** Render Handlebars query templates; empty results (e.g. {{brief.userPrompt}} unset) are dropped. */
export function renderQueries(templates: string[], vars: Record<string, unknown>): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const t of templates) {
    let q: string
    try {
      q = Handlebars.compile(t, { noEscape: true })(vars).replace(/\s+/g, ' ').trim()
    } catch {
      q = t.trim()
    }
    if (q.length < 3 || seen.has(q.toLowerCase())) continue
    seen.add(q.toLowerCase())
    out.push(q)
  }
  return out
}

/** Round-robin merge so every query contributes its best hits before any query's tail. */
export function mergeHits(perQuery: SearchHit[][], limit: number): SearchHit[] {
  const seen = new Set<number>()
  const out: SearchHit[] = []
  const longest = Math.max(0, ...perQuery.map((h) => h.length))
  for (let i = 0; i < longest && out.length < limit; i++) {
    for (const hits of perQuery) {
      const h = hits[i]
      if (!h || seen.has(h.chunkId)) continue
      seen.add(h.chunkId)
      out.push(h)
      if (out.length >= limit) break
    }
  }
  return out
}

export async function retrieveForStage(
  index: SearchIndex,
  queries: string[],
  k: number,
  signal?: AbortSignal,
): Promise<RetrievedChunk[]> {
  if (!queries.length) return []
  const perQuery: SearchHit[][] = []
  for (const q of queries) {
    signal?.throwIfAborted()
    perQuery.push(await index.search(q, { k, mode: 'hybrid', ...(signal ? { signal } : {}) }))
  }
  return mergeHits(perQuery, k).map((hit, i) => ({ key: `C${i + 1}`, hit }))
}

const escapeAttr = (s: string): string => s.replace(/["<>&]/g, (c) => `&#${c.charCodeAt(0)};`)

/**
 * Chunk text is untrusted (any ingested PDF): escape '&' and '<' so no sequence in it can
 * open or close a tag (</documents>, </DOCUMENTS >, <document …>) and end the data block.
 */
export const escapeText = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;')

/** Split "TIRP › Section 13 › 13.6 …" into the document label and the section path. */
function splitHeading(headingPath: string): { doc: string; section: string } {
  const parts = headingPath.split(/\s+›\s+/)
  if (parts.length <= 1) return { doc: headingPath, section: '' }
  return { doc: parts[0]!, section: parts.slice(1).join(' › ') }
}

/** The doctrine block. The system prompts tell the model this is data, never instructions. */
export function doctrineBlock(chunks: RetrievedChunk[]): string {
  if (!chunks.length) return '<documents>\n(no sections retrieved)\n</documents>'
  const docs = chunks.map(({ key, hit }) => {
    const { doc, section } = splitHeading(hit.headingPath)
    const page = hit.page ? ` page="${hit.page}"` : ''
    const text =
      hit.text.length > MAX_CHUNK_CHARS ? hit.text.slice(0, MAX_CHUNK_CHARS) + ' …' : hit.text
    return `<document key="${key}" source="${escapeAttr(doc)}" section="${escapeAttr(section)}"${page}>\n${escapeText(text)}\n</document>`
  })
  return `<documents>\n${docs.join('\n')}\n</documents>`
}

/** Compact view of the retrieved chunks for prompt variables ({{#each retrieved}}). */
export function retrievedVars(chunks: RetrievedChunk[]) {
  return chunks.map(({ key, hit }) => ({
    key,
    documentTitle: hit.documentTitle,
    headingPath: hit.headingPath,
    page: hit.page,
    text: escapeText(hit.text),
  }))
}

export function toCitation(hit: SearchHit): Citation {
  const quote = hit.text.replace(/\s+/g, ' ').trim().slice(0, MAX_QUOTE_CHARS)
  return {
    documentId: hit.documentId,
    documentTitle: hit.documentTitle,
    headingPath: hit.headingPath,
    ...(hit.page ? { page: hit.page } : {}),
    ...(quote ? { quote } : {}),
    chunkId: hit.chunkId,
  }
}

export interface ResolvedCitations {
  citations: Citation[]
  /** Keys the model used that were never shown in the prompt. */
  dropped: string[]
}

/** Map citation keys back to Citation objects; unknown keys are dropped (and reported). */
export function resolveCitations(keys: string[], chunks: RetrievedChunk[]): ResolvedCitations {
  const byKey = new Map(chunks.map((c) => [c.key, c.hit]))
  const citations: Citation[] = []
  const dropped: string[] = []
  const seen = new Set<string>()
  for (const raw of keys) {
    const key = raw.trim().toUpperCase()
    if (seen.has(key)) continue
    seen.add(key)
    const hit = byKey.get(key)
    if (hit) citations.push(toCitation(hit))
    else dropped.push(raw)
  }
  return { citations, dropped }
}
