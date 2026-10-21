// Task → provider resolution (#22). Effective routing = project.providerRouting over
// settings.defaultRouting. The settings/routing workstream implements this.
import type { ProviderTask } from '@shared/schemas'
import { AppError } from '../lib/errors'
import type { EmbeddingProvider, MediaProvider, TextProvider } from './types'

export interface ResolvedText {
  provider: TextProvider
  model: string
  providerId: string
}

export async function resolveTextProvider(
  _task: Extract<ProviderTask, 'ideate' | 'draft' | 'critique'>,
  _projectPath?: string,
): Promise<ResolvedText> {
  throw new AppError('NOT_IMPLEMENTED', 'Provider routing lands with #22')
}

export async function resolveMediaProvider(
  _task: Extract<ProviderTask, 'image' | 'video' | 'audio'>,
  _projectPath?: string,
): Promise<{ provider: MediaProvider; providerId: string }> {
  throw new AppError('NOT_IMPLEMENTED', 'Provider routing lands with #22')
}

export type { EmbeddingProvider }
