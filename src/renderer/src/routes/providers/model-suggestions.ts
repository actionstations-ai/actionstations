// Which model ids a picker suggests for a purpose (chat vs embedding).
import type { ModelInfo } from '@shared/schemas'
import { looksLikeEmbeddingModel } from '@shared/model-names'

export type ModelPurpose = 'chat' | 'embedding'

const isEmbedding = (m: Pick<ModelInfo, 'id' | 'kind'>): boolean =>
  m.kind === 'embedding' || looksLikeEmbeddingModel(m.id)

/**
 * Suggestions for one purpose: chat pickers never offer embedding models (#225); embedding
 * pickers offer embedding models first and fall back to everything when none are recognised.
 */
export function modelSuggestions(
  models: Pick<ModelInfo, 'id' | 'kind'>[],
  purpose?: ModelPurpose,
): string[] {
  if (purpose === 'chat') return models.filter((m) => !isEmbedding(m)).map((m) => m.id)
  if (purpose === 'embedding') {
    const embed = models.filter(isEmbedding)
    return (embed.length ? embed : models).map((m) => m.id)
  }
  return models.map((m) => m.id)
}
