import type { ProviderConfig, ProviderKind } from '@shared/schemas'
import { AppError } from '../lib/errors'
import type {
  AdapterModule,
  EmbeddingProvider,
  MediaProvider,
  SpeechToTextProvider,
  TextProvider,
} from './types'

// Adapters are discovered at build time: each folder exports `adapter` from adapter.ts.
// Adding a provider never requires editing this file.
const found = import.meta.glob<{ adapter: AdapterModule }>(['./**/adapter.ts', '!./**/*.test.ts'], {
  eager: true,
})

const adapters = new Map<ProviderKind, AdapterModule>()
for (const [file, mod] of Object.entries(found)) {
  const a = mod.adapter
  if (!a) throw new Error(`${file} must export "adapter"`)
  if (adapters.has(a.kind)) {
    // Several modules may contribute to one kind (e.g. text + embedding); merge them.
    adapters.set(a.kind, { ...adapters.get(a.kind)!, ...a })
  } else adapters.set(a.kind, a)
}

export function adapterFor(kind: ProviderKind): AdapterModule {
  const a = adapters.get(kind)
  if (!a) throw new AppError('NOT_IMPLEMENTED', `No adapter for provider kind "${kind}"`)
  return a
}

export function listAdapterKinds(): ProviderKind[] {
  return [...adapters.keys()]
}

export function createTextProvider(config: ProviderConfig, secret?: string): TextProvider {
  const a = adapterFor(config.kind)
  if (!a.createText)
    throw new AppError('VALIDATION', `${config.kind} does not provide text generation`)
  return a.createText(config, secret)
}

export function createEmbeddingProvider(
  config: ProviderConfig,
  model: string,
  secret?: string,
): EmbeddingProvider {
  const a = adapterFor(config.kind)
  if (!a.createEmbedding)
    throw new AppError('VALIDATION', `${config.kind} does not provide embeddings`)
  return a.createEmbedding(config, secret, model)
}

export function createMediaProvider(config: ProviderConfig, secret?: string): MediaProvider {
  const a = adapterFor(config.kind)
  if (!a.createMedia)
    throw new AppError('VALIDATION', `${config.kind} does not provide media generation`)
  return a.createMedia(config, secret)
}

export function createSpeechToTextProvider(
  config: ProviderConfig,
  secret?: string,
): SpeechToTextProvider {
  const a = adapterFor(config.kind)
  if (!a.createSpeechToText)
    throw new AppError('VALIDATION', `${config.kind} does not provide transcription`)
  return a.createSpeechToText(config, secret)
}
