// In-memory IndexStore for ingest tests (the real one lives in src/main/retrieve, #14).
import type { Chunk } from '../../../src/shared/schemas'
import type { ChunkInput, IndexedDocument, IndexStore } from '../../../src/main/retrieve/types'

export class FakeIndex implements IndexStore {
  docs = new Map<string, IndexedDocument>()
  rows = new Map<string, Chunk[]>()
  resets = 0
  private nextId = 1
  /** Throw from replaceDocument for this document id. */
  failFor?: string

  async replaceDocument(
    doc: IndexedDocument,
    chunks: ChunkInput[],
    onProgress?: (done: number, total: number) => void,
  ): Promise<void> {
    if (doc.id === this.failFor) throw new Error('embedder unavailable')
    this.docs.set(doc.id, doc)
    this.rows.set(
      doc.id,
      chunks.map((c) => ({ ...c, id: this.nextId++, documentId: doc.id })),
    )
    onProgress?.(chunks.length, chunks.length)
  }

  async removeDocument(documentId: string): Promise<void> {
    this.docs.delete(documentId)
    this.rows.delete(documentId)
  }

  async search(): Promise<never[]> {
    return []
  }

  chunks(documentId: string, limit = 200, offset = 0): Chunk[] {
    return (this.rows.get(documentId) ?? []).slice(offset, offset + limit)
  }

  chunk(chunkId: number): (Chunk & { documentTitle: string }) | undefined {
    for (const [docId, list] of this.rows) {
      const c = list.find((x) => x.id === chunkId)
      if (c) return { ...c, documentTitle: this.docs.get(docId)?.title ?? '' }
    }
    return undefined
  }

  async reset(): Promise<void> {
    this.resets++
    this.docs.clear()
    this.rows.clear()
  }

  close(): void {}
}
