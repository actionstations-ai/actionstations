// Implemented by the retrieval workstream (#14). Ingestion codes against IndexStore.
import type { IndexStore } from './types'
import { AppError } from '../lib/errors'

export type { IndexStore, ChunkInput, IndexedDocument, SearchOptions } from './types'

export async function openIndex(_projectPath: string): Promise<IndexStore> {
  throw new AppError('NOT_IMPLEMENTED', 'Index store lands with #14')
}
