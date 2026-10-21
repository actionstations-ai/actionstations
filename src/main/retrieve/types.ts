// Contract between ingestion (#11/#12) and the index (#13/#14). Ingestion produces chunks;
// the index stores them in index.sqlite (FTS5 + sqlite-vec), embeds them, and searches.
import type { Chunk, DocumentKind, SearchHit } from '@shared/schemas'

export interface ChunkInput {
  /** "TIRP › Section 13 › 13.6 Scenario C: FIDS / BHS System Failure" */
  headingPath: string
  page?: number
  ord: number
  text: string
  tokenCount: number
}

export interface IndexedDocument {
  id: string
  title: string
  /** Short label for citations, e.g. "TIRP". */
  shortName?: string
  kind: DocumentKind
  /** Project-relative path of the original file. */
  path: string
  pages: number
}

export interface SearchOptions {
  k?: number
  mode?: 'hybrid' | 'fts' | 'vector'
  documentIds?: string[]
  signal?: AbortSignal
}

export interface IndexStore {
  /** Replace all chunks for a document (insert or re-ingest), embedding them. */
  replaceDocument(
    doc: IndexedDocument,
    chunks: ChunkInput[],
    onProgress?: (done: number, total: number) => void,
    signal?: AbortSignal,
  ): Promise<void>
  removeDocument(documentId: string): Promise<void>
  search(query: string, opts?: SearchOptions): Promise<SearchHit[]>
  chunks(documentId: string, limit?: number, offset?: number): Chunk[]
  /** Chunk by id (to resolve citations). */
  chunk(chunkId: number): (Chunk & { documentTitle: string }) | undefined
  /** Drop and recreate all tables (embedder change / Rebuild index). */
  reset(): Promise<void>
  close(): void
}
