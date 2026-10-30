// Project index (index.sqlite): one cached store per project, using the embedder selected in
// settings. Ingestion codes against IndexStore; retrieve:search and generation read from it.
import { resolve } from 'node:path'
import { closeConnection, connectionFor } from '../db'
import { userDataPath } from '../lib/paths'
import { projectPaths } from '../project/store'
import { createEmbedder, embedderKey } from '../providers/embedding/factory'
import type { EmbeddingProvider } from '../providers/types'
import { getSettings } from '../settings/store'
import { SqliteIndexStore } from './store'

export type { IndexStore, ChunkInput, IndexedDocument, SearchOptions } from './types'
export type { IndexStatus } from './store'
export { SqliteIndexStore } from './store'

const stores = new Map<string, { store: SqliteIndexStore; embedder: EmbeddingProvider }>()

export const modelsDir = (): string => userDataPath('models')

/**
 * The embedder chosen in settings.embeddings. With a project path, "Configured provider" mode
 * uses that project's Embeddings routing override (Providers → Routing) over the global row.
 */
export async function activeEmbedder(projectPath?: string): Promise<EmbeddingProvider> {
  const settings = await getSettings()
  return createEmbedder(settings.embeddings, {
    modelsDir: modelsDir(),
    providers: settings.providers,
    ...(projectPath ? { projectPath } : {}),
  })
}

/**
 * Store for an index file. Reuses the cached connection; when `embedder` has a different
 * identity than the cached one, switches to it (recreating vectors if dims/model changed).
 */
export function openIndexAt(file: string, embedder: EmbeddingProvider): SqliteIndexStore {
  const key = resolve(file)
  const cached = stores.get(key)
  if (cached?.store.isOpen()) {
    if (embedderKey(cached.embedder) !== embedderKey(embedder)) {
      cached.store.useEmbedder(embedder)
      cached.embedder = embedder
    }
    return cached.store
  }
  const store = new SqliteIndexStore(connectionFor(key), embedder)
  stores.set(key, { store, embedder })
  return store
}

/** Index for a project root (already checked with requireProject by IPC handlers). */
export async function openIndex(projectPath: string): Promise<SqliteIndexStore> {
  const embedder = await activeEmbedder(projectPath)
  const store = openIndexAt(projectPaths(projectPath).index, embedder)
  if (embedder.remote) {
    const { neverSendDocuments } = await import('../providers/outbound/never-send')
    store.setWithheld(await neverSendDocuments(projectPath, embedder))
  } else store.setWithheld(new Set())
  return store
}

/** Close a project's index connection (project closed or deleted). */
export function closeIndex(projectPath: string): void {
  const file = projectPaths(projectPath).index
  stores.delete(resolve(file))
  closeConnection(file)
}
