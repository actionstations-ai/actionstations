// The full text of one plan section, by document and heading path (#431, FR-2): taken from the
// index's chunks in reading order, never by similarity, so what the model is shown and what a
// proposal must quote are the same words.
import type { Chunk } from '@shared/schemas'
import { normalizedForm } from '@shared/redline/excerpt'

export interface ChunkSource {
  chunks(documentId: string, limit?: number, offset?: number): Chunk[]
}

export interface SectionText {
  text: string
  /** Page of the first chunk, when the source has pages. */
  page?: number
  chunkIds: number[]
}

/** Longest section text sent to a model (characters); longer sections are cut at a chunk. */
export const MAX_SECTION_CHARS = 24_000
const MAX_CHUNKS = 5000

const same = (a: string, b: string): boolean => normalizedForm(a) === normalizedForm(b)
const within = (path: string, parent: string): boolean =>
  normalizedForm(path).startsWith(`${normalizedForm(parent)} › `)

/**
 * Chunks whose heading path is exactly `headingPath`; when the heading has no text of its own
 * (a parent heading), the chunks of its subsections.
 */
export function sectionText(
  index: ChunkSource,
  documentId: string,
  headingPath: string,
): SectionText | null {
  const all = index.chunks(documentId, MAX_CHUNKS, 0)
  let picked = all.filter((c) => same(c.headingPath, headingPath))
  if (!picked.length) picked = all.filter((c) => within(c.headingPath, headingPath))
  if (!picked.length) return null
  picked = [...picked].sort((a, b) => a.ord - b.ord || a.id - b.id)
  const parts: string[] = []
  const ids: number[] = []
  let size = 0
  for (const c of picked) {
    if (parts.length && size + c.text.length > MAX_SECTION_CHARS) break
    parts.push(c.text)
    ids.push(c.id)
    size += c.text.length + 2
  }
  const page = picked[0]?.page
  return { text: parts.join('\n\n'), ...(page !== undefined ? { page } : {}), chunkIds: ids }
}
