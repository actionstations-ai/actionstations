// Name-based model classification, used when a server does not report what a model can do.
// Ollama reports capabilities (completion / embedding) and LM Studio reports a model type; this
// is the fallback for everything else, so it errs on the side of "embedding" for known families.

const EMBEDDING_NAME =
  /embed|minilm|mxbai|paraphrase|sentence-transformers|(^|[^a-z0-9])(bge|e5|gte)([^a-z]|$)|bert([^a-z]|$)/i

/** True when a model id looks like an embedding model (nomic-embed, all-minilm, bge, e5, gte…). */
export function looksLikeEmbeddingModel(id: string): boolean {
  return EMBEDDING_NAME.test(id)
}

/**
 * Default chat model: one the server already has loaded, else the first in the given order
 * (callers pass models best-first, e.g. largest first). Never an embedding model while a chat
 * model exists.
 */
export function pickChatModel(
  chatModels: readonly string[],
  loaded: readonly string[] = [],
): string | undefined {
  const chat = chatModels.filter((m) => !looksLikeEmbeddingModel(m))
  const pool = chat.length ? chat : chatModels
  return loaded.find((m) => pool.includes(m)) ?? pool[0]
}
