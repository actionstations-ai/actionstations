// Picks the embedder from settings.embeddings (ADR-0005): built-in hash (default, offline),
// local ONNX model, or a configured provider's embeddings endpoint. In 'provider' mode the
// provider is the one routed to the Embeddings task (Providers → Routing), unless settings
// name a provider explicitly (older settings files).
import type { EmbeddingSettings, ProviderConfig } from '@shared/schemas'
import { AppError } from '../../lib/errors'
import { createEmbeddingProvider } from '../registry'
import { resolveEmbeddingProvider } from '../resolve'
import type { EmbeddingProvider } from '../types'
import { HashEmbedder } from './hash'
import { LocalOnnxEmbedder } from './local-onnx'

export interface EmbedderDeps {
  /** userData/models */
  modelsDir: string
  providers: ProviderConfig[]
  /** Secret for a provider id (keychain); omitted when no secret store is wired. */
  secretFor?: (providerId: string) => string | undefined
  /** Project whose Embeddings routing override applies; global routing without it. */
  projectPath?: string
  /** Resolves the 'embed' routing row (providers/resolve); injectable for tests. */
  resolveRouted?: (projectPath?: string) => Promise<{ provider: EmbeddingProvider }>
}

/**
 * Provider embedders learn their size from the first response (unless options.embeddingDims
 * is set); the index needs it before creating its vector table, so ask once with a probe.
 */
export async function withKnownDims(e: EmbeddingProvider): Promise<EmbeddingProvider> {
  if (e.dims > 0) return e
  try {
    await e.embed(['dimension probe'])
  } catch (err) {
    const why = err instanceof Error ? err.message : String(err)
    throw new AppError('PROVIDER', `Could not reach the embeddings provider (${e.model}): ${why}`)
  }
  if (e.dims <= 0)
    throw new AppError('PROVIDER', `The embeddings provider (${e.model}) returned no vector size`)
  return e
}

/** The provider routed to the Embeddings task, with errors that point at the right screen. */
async function routedEmbedder(deps: EmbedderDeps): Promise<EmbeddingProvider> {
  const resolveRouted = deps.resolveRouted ?? resolveEmbeddingProvider
  try {
    return await withKnownDims((await resolveRouted(deps.projectPath)).provider)
  } catch (err) {
    if (err instanceof AppError && err.code === 'VALIDATION')
      throw new AppError(
        'VALIDATION',
        `Embedding mode "Configured provider" uses the Embeddings row in Providers → Routing: ${err.message}`,
      )
    throw err
  }
}

async function providerEmbedder(
  settings: EmbeddingSettings,
  deps: EmbedderDeps,
): Promise<EmbeddingProvider> {
  const id = settings.providerId
  if (!id) return routedEmbedder(deps)
  const config = deps.providers.find((p) => p.id === id)
  if (!config) throw new AppError('NOT_FOUND', `Embedding provider "${id}" is not configured`)
  if (!config.enabled) throw new AppError('PROVIDER', `Embedding provider "${id}" is disabled`)
  try {
    return await withKnownDims(
      createEmbeddingProvider(config, settings.model, deps.secretFor?.(id)),
    )
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
