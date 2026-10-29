// Citation resolution for grounding (#423, FR-3.1): the full text of the chunk a citation names,
// looked up in the index. A chunk id that is gone, or that now belongs to another document (the
// index was rebuilt in a different order), is re-found by document and quote; when that also
// fails the citation counts as missing.
import { createHash } from 'node:crypto'
import type { Chunk, Citation } from '@shared/schemas'
import type { IndexStore } from '../retrieve/types'
import { collapseSpace } from './normalize'
import type { Passage } from './support'

/** What grounding reads from the index. `chunks` is optional (fakes in engine tests lack it). */
export type GroundingIndex = Pick<IndexStore, 'chunk'> & Partial<Pick<IndexStore, 'chunks'>>

const QUOTE_PREFIX = 80
const MAX_DOC_CHUNKS = 5000

export class PassageResolver {
  private byId = new Map<number, Passage | null>()
  private byDoc = new Map<string, Chunk[]>()

  constructor(private readonly index: GroundingIndex) {}

  /** The citation's passage, or undefined when it no longer resolves. */
  resolve(c: Citation): Passage | undefined {
    if (c.chunkId !== undefined) {
      const direct = this.chunk(c.chunkId)
      if (direct && direct.documentId === c.documentId && this.quoteFits(direct, c)) return direct
    }
    return this.relocate(c)
  }

  private chunk(id: number): Passage | undefined {
    if (!this.byId.has(id)) {
      const ch = this.index.chunk(id)
      this.byId.set(
        id,
        ch
          ? {
              chunkId: ch.id,
              documentId: ch.documentId,
              documentTitle: ch.documentTitle,
              headingPath: ch.headingPath,
              ...(ch.page !== undefined ? { page: ch.page } : {}),
              text: ch.text,
            }
          : null,
      )
    }
    return this.byId.get(id) ?? undefined
  }

  private quoteFits(p: Passage, c: Citation): boolean {
    const quote = collapseSpace(c.quote ?? '')
      .replace(/…$/, '')
      .slice(0, QUOTE_PREFIX)
    return !quote || collapseSpace(p.text).includes(quote)
  }

  /** The chunk of the cited document whose text holds the citation's quote. */
  private relocate(c: Citation): Passage | undefined {
    if (!c.quote || !this.index.chunks) return undefined
    if (!this.byDoc.has(c.documentId))
      this.byDoc.set(c.documentId, this.index.chunks(c.documentId, MAX_DOC_CHUNKS, 0))
    const quote = collapseSpace(c.quote).replace(/…$/, '').slice(0, QUOTE_PREFIX)
    const hit = this.byDoc.get(c.documentId)!.find((ch) => collapseSpace(ch.text).includes(quote))
    return hit ? this.chunk(hit.id) : undefined
  }
}

/** Short hash of a passage's text: an edited or re-imported document changes it. */
export const passageHash = (p: Passage): string =>
  createHash('sha256').update(p.text).digest('hex').slice(0, 8)
