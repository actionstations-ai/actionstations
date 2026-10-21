// Picks the embedder from settings.embeddings (ADR-0005): built-in hash (default, offline),
// local ONNX model, or a configured provider's embeddings endpoint.
import type { EmbeddingSettings, ProviderConfig } from '@shared/schemas'
import { AppError } from '../../lib/errors'
import { createEmbeddingProvider } from '../registry'
import type { EmbeddingProvider } from '../types'
import { HashEmbedder } from './hash'
import { LocalOnnxEmbedder } from './local-onnx'

export interface EmbedderDeps {
  /** userData/models */
  modelsDir: string
  providers: ProviderConfig[]
  /** Secret for a provider id (keychain); omitted when no secret store is wired. */
  secretFor?: (providerId: string) => string | undefined
}

async function providerEmbedder(
  settings: EmbeddingSettings,
  deps: EmbedderDeps,
): Promise<EmbeddingProvider> {
  const id = settings.providerId
  if (!id) throw new AppError('VALIDATION', 'Embedding mode "provider" needs a provider selected')
  const config = deps.providers.find((p) => p.id === id)
  if (!config) throw new AppError('NOT_FOUND', `Embedding provider "${id}" is not configured`)
  if (!config.enabled) throw new AppError('PROVIDER', `Embedding provider "${id}" is disabled`)
  try {
    return createEmbeddingProvider(config, settings.model, deps.secretFor?.(id))
  } catch (err) {
    if (err instanceof AppError && (err.code === 'NOT_IMPLEMENTED' || err.code === 'VALIDATION')) {
      throw new AppError(
        'PROVIDER',
        `Embeddings via "${config.label}" (${config.kind}) are not available: ${err.message}. Use built-in or local embeddings instead.`,
      )
    }
    throw err
  }
}

export async function createEmbedder(
  settings: EmbeddingSettings,
  deps: EmbedderDeps,
): Promise<EmbeddingProvider> {
  switch (settings.mode) {
    case 'hash':
      return new HashEmbedder()
    case 'local-onnx':
      return new LocalOnnxEmbedder(settings.model, deps.modelsDir)
    case 'provider':
      return providerEmbedder(settings, deps)
  }
}

/** Stable identity of an embedder + model, recorded in the index meta table. */
export function embedderKey(e: EmbeddingProvider): string {
  return `${e.id}:${e.model}`
}
