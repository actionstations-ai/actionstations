// Provider-neutral "download a model into the provider" entry point (#79). Only Ollama can
// pull models today; IPC handlers call this instead of importing an adapter directly.
import type { ProviderConfig } from '@shared/schemas'
import { AppError } from '../lib/errors'
import { pullModel as ollamaPull, type PullProgress } from './text/ollama/adapter'

export type { PullProgress }

export function canPullModels(kind: ProviderConfig['kind']): boolean {
  return kind === 'ollama'
}

export async function pullProviderModel(
  config: ProviderConfig,
  model: string,
  onProgress?: (p: PullProgress) => void,
  signal?: AbortSignal,
): Promise<void> {
  if (!canPullModels(config.kind))
    throw new AppError('VALIDATION', 'Model pull is only available for Ollama providers')
  await ollamaPull(config, model, onProgress, signal)
}
