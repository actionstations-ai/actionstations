import type { EmbeddingProvider } from '../types'

/**
 * Embedders whose models embed queries differently from passages (bge wants an instruction
 * prefix on queries). `embed` is always the passage/document side.
 */
export interface QueryAwareEmbedder extends EmbeddingProvider {
  embedQuery(text: string, signal?: AbortSignal): Promise<Float32Array>
}

function isQueryAware(e: EmbeddingProvider): e is QueryAwareEmbedder {
  return typeof (e as Partial<QueryAwareEmbedder>).embedQuery === 'function'
}

/** Embed a search query with whatever query-side handling the embedder supports. */
export async function embedQuery(
  embedder: EmbeddingProvider,
  text: string,
  signal?: AbortSignal,
): Promise<Float32Array> {
  if (isQueryAware(embedder)) return embedder.embedQuery(text, signal)
  const [v] = await embedder.embed([text], signal)
  if (!v) throw new Error(`${embedder.id} returned no embedding`)
  return v
}
