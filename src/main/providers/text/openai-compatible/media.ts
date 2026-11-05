// One media provider per openai-compatible config: speech always, images when the provider is
// a hosted OpenAI, Gemini or Azure service with an image model set or routed.
import type { ProviderConfig, ProviderHealth } from '@shared/schemas'
import { AppError } from '../../../lib/errors'
import type {
  MediaCapability,
  MediaJob,
  MediaOutput,
  MediaProgress,
  MediaProvider,
} from '../../types'
import { OpenAiCompatibleImageProvider, imageModelFor, isHostedImagePreset } from './images'
import { OpenAiCompatibleSpeechProvider } from './speech'

export class OpenAiCompatibleMediaProvider implements MediaProvider {
  readonly kind = 'openai-compatible' as const
  private readonly speech: OpenAiCompatibleSpeechProvider
  private readonly images: OpenAiCompatibleImageProvider
  constructor(
    readonly config: ProviderConfig,
    secret: string | undefined,
  ) {
    this.speech = new OpenAiCompatibleSpeechProvider(config, secret)
    this.images = new OpenAiCompatibleImageProvider(config, secret)
  }

  get id(): string {
    return this.config.id
  }

  /**
   * Image is advertised for a hosted provider with an image model in its options. A routed
   * image model (job.model) alone also qualifies: the router only sends the image task here
   * when the user assigned it, so a hosted provider accepts it.
   */
  capabilities(): Set<MediaCapability> {
    const caps = new Set(this.speech.capabilities())
    if (isHostedImagePreset(this.config)) caps.add('image')
    return caps
  }

  health(signal?: AbortSignal): Promise<ProviderHealth> {
    return this.speech.health(signal)
  }

  async generate(job: MediaJob, onProgress?: (p: MediaProgress) => void): Promise<MediaOutput[]> {
    if (job.kind === 'image') {
      if (!isHostedImagePreset(this.config) || !imageModelFor(this.config, job))
        throw new AppError(
          'VALIDATION',
          `Provider "${this.config.label}" needs an image model: set Image model under Advanced or choose one in Routing`,
        )
      return this.images.generate(job, onProgress)
    }
    if (job.kind === 'audio') return this.speech.generate(job, onProgress)
    throw new AppError('VALIDATION', `${this.config.label} cannot generate ${job.kind}`)
  }
}
