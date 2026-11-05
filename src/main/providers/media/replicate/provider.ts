// Replicate media provider: images and short video through Replicate's predictions API. A job
// is created on the model's own endpoint with `Prefer: wait`, so quick models answer in one
// call; otherwise the prediction is followed until it ends, and the output is downloaded at
// once with the token (Replicate deletes outputs after an hour).
import type { ProviderConfig, ProviderHealth } from '@shared/schemas'
import { AppError } from '../../../lib/errors'
import { joinUrl, request, requestJson } from '../../http'
import { elapsed, numberOption } from '../../text/common'
import type {
  MediaCapability,
  MediaJob,
  MediaOutput,
  MediaProgress,
  MediaProvider,
} from '../../types'
import {
  buildInputs,
  effectiveInputs,
  readInputMap,
  requestedDuration,
  type ModelInputs,
} from '../cloud-video/inputs'
import { downloadMedia } from '../cloud-video/download'
import { saveDownloaded } from '../cloud-video/files'
import { fitStartingImage, IMAGE_BUDGET } from '../cloud-video/image-fit'
import { pollUntil, type PollStep } from '../cloud-video/poll'
import { friendlyReplicateError, predictionFailed } from './errors'

export const REPLICATE_BASE_URL = 'https://api.replicate.com'
const VENDOR = 'Replicate'
const TIMEOUT_MS = { image: 3 * 60_000, video: 15 * 60_000 } as const
const WAIT_SECONDS = 60
const MODEL_ID = /^[A-Za-z0-9][A-Za-z0-9._-]*\/[A-Za-z0-9][A-Za-z0-9._-]*$/
const PREDICTION_ID = /^[A-Za-z0-9_-]{4,64}$/

interface Prediction {
  id?: string
  status?: string
  output?: unknown
  error?: unknown
}

/** Replicate serves result files from replicate.delivery; only those hosts get the token. */
const isDeliveryHost = (host: string): boolean =>
  host === 'replicate.delivery' || host.endsWith('.replicate.delivery')

/** The first file link in a prediction's output: a string, or a list of them. */
export function pickOutputUrl(output: unknown): string | undefined {
  if (typeof output === 'string') return output
  if (Array.isArray(output)) return output.find((v): v is string => typeof v === 'string')
  return undefined
}

export class ReplicateMediaProvider implements MediaProvider {
  readonly kind = 'replicate' as const

  constructor(
    readonly config: ProviderConfig,
    private readonly secret: string | undefined,
  ) {}

  get id(): string {
    return this.config.id
  }

  private get base(): string {
    return (this.config.baseUrl ?? REPLICATE_BASE_URL).replace(/\/+$/, '')
  }

  capabilities(): Set<MediaCapability> {
    return new Set<MediaCapability>(['image', 'video'])
  }

  private authorization(): string {
    if (!this.secret)
      throw new AppError(
        'VALIDATION',
        'Replicate needs an API token. Add it on the Providers page.',
      )
    return `Bearer ${this.secret}`
  }

  private headers(): Record<string, string> {
    return { authorization: this.authorization() }
  }

  /** Reads the account the token belongs to. Free of charge; no prediction is made. */
  async health(signal?: AbortSignal): Promise<ProviderHealth> {
    const start = Date.now()
    try {
      const account = await requestJson<{ username?: string }>(joinUrl(this.base, 'v1/account'), {
        headers: this.headers(),
        vendor: VENDOR,
        retries: 0,
        timeoutMs: 15_000,
        ...(signal ? { signal } : {}),
        ...(this.secret ? { secret: this.secret } : {}),
      })
      const who = typeof account.username === 'string' ? ` (${account.username})` : ''
      return { ok: true, latencyMs: elapsed(start), message: `Replicate token accepted${who}` }
    } catch (err) {
      return { ok: false, latencyMs: elapsed(start), message: friendlyReplicateError(err).message }
    }
  }

  async generate(job: MediaJob, onProgress?: (p: MediaProgress) => void): Promise<MediaOutput[]> {
    if (job.kind === 'audio')
      throw new AppError('VALIDATION', 'Replicate is used for images and video here')
    const model = (job.model ?? this.config.defaultModel ?? '').trim().replace(/^\/+|\/+$/g, '')
    if (!MODEL_ID.test(model))
      throw new AppError(
        'VALIDATION',
        `Choose a Replicate ${job.kind} model for the ${job.kind} task, as owner/name (for example black-forest-labs/flux-schnell)`,
      )
    const map = effectiveInputs(job.kind, model, readInputMap(this.config.options.inputMap, model))
    const input = await this.requestInput(job, map)
    try {
      return await this.run(job, model, input, map, onProgress)
    } catch (err) {
      throw friendlyReplicateError(err)
    }
  }

  private async requestInput(job: MediaJob, map: ModelInputs): Promise<Record<string, unknown>> {
    const prompt = (
      job.kind === 'video'
        ? (job.brief.videoPrompt ?? job.brief.imagePrompt)
        : job.brief.imagePrompt
    )?.trim()
    if (!prompt) throw new AppError('VALIDATION', `The media brief has no ${job.kind} prompt`)
    const imageUri =
      map.image && job.inputImagePath
        ? await fitStartingImage(job.inputImagePath, IMAGE_BUDGET.replicate)
        : undefined
    if (job.kind === 'video' && map.imageRequired && !imageUri)
      throw new AppError(
        'VALIDATION',
        'This Replicate video model needs a starting image, and the scene image was not generated',
      )
    return buildInputs(map, {
      brief: job.brief,
      prompt,
      numericDuration: true,
      ...(imageUri ? { imageUri } : {}),
      ...(job.width ? { width: job.width } : {}),
      ...(job.height ? { height: job.height } : {}),
      ...(job.seed !== undefined ? { seed: job.seed } : {}),
    })
  }

  private async run(
    job: MediaJob,
    model: string,
    input: Record<string, unknown>,
    map: ModelInputs,
    onProgress?: (p: MediaProgress) => void,
  ): Promise<MediaOutput[]> {
    const kind = job.kind as 'image' | 'video'
    onProgress?.({ progress: 0.03, message: 'Sending to Replicate' })
    const created = await requestJson<Prediction>(
      joinUrl(this.base, `v1/models/${model}/predictions`),
      {
        method: 'POST',
        headers: { ...this.headers(), prefer: `wait=${WAIT_SECONDS}` },
        body: { input },
        vendor: VENDOR,
        retries: 1,
        timeoutMs: (WAIT_SECONDS + 30) * 1000,
        ...(job.signal ? { signal: job.signal } : {}),
        ...(this.secret ? { secret: this.secret } : {}),
      },
    )
    const done = await this.finish(job, kind, created, onProgress)
    onProgress?.({ progress: 0.9, message: 'Downloading the result' })
    const url = pickOutputUrl(done.output)
    if (!url) throw new AppError('PROVIDER', `Replicate finished but returned no ${kind}`)
    const ownHost = new URL(this.base).hostname
    const downloaded = await downloadMedia(url, {
      kind,
      vendor: VENDOR,
      providerHost: ownHost,
      authorization: this.authorization(),
      authHost: (host) => isDeliveryHost(host) || host === ownHost,
      ...(job.signal ? { signal: job.signal } : {}),
    })
    const out = await saveDownloaded(
      job,
      kind,
      downloaded,
      {
        durationSec: requestedDuration(map, job.brief),
        model,
        prompt: String(input[map.prompt] ?? ''),
      },
      this.id,
    )
    onProgress?.({ progress: 1, message: 'Media ready' })
    return [out]
  }

  /** The finished prediction: the one already in hand, or the one followed until it ends. */
  private async finish(
    job: MediaJob,
    kind: 'image' | 'video',
    first: Prediction,
    onProgress?: (p: MediaProgress) => void,
  ): Promise<Prediction> {
    const settled = settle(first, kind, job)
    if (settled) return settled
    const id = first.id
    if (!id || !PREDICTION_ID.test(id))
      throw new AppError('PROVIDER', 'Replicate accepted the job but sent no prediction id')
    const started = Date.now()
    return pollUntil<Prediction>(
      async (): Promise<PollStep<Prediction>> => {
        const p = await requestJson<Prediction>(joinUrl(this.base, `v1/predictions/${id}`), {
          headers: this.headers(),
          vendor: VENDOR,
          timeoutMs: 30_000,
          ...(job.signal ? { signal: job.signal } : {}),
          ...(this.secret ? { secret: this.secret } : {}),
        })
        const ended = settle(p, kind, job)
        if (ended) return { done: true, value: ended }
        onProgress?.(progressFor(p, Date.now() - started))
        return { done: false }
      },
      {
        timeoutMs: numberOption(this.config, 'timeoutMs') ?? TIMEOUT_MS[kind],
        minMs: numberOption(this.config, 'pollMinMs') ?? 2_000,
        maxMs: numberOption(this.config, 'pollMaxMs') ?? 10_000,
        label: `Replicate ${kind}`,
        ...(job.signal ? { signal: job.signal } : {}),
        onStop: () => this.cancelRemote(id),
      },
    )
  }

  /** Ask Replicate to stop (and stop charging for) the prediction. Best effort. */
  private async cancelRemote(id: string): Promise<void> {
    try {
      await request(joinUrl(this.base, `v1/predictions/${id}/cancel`), {
        method: 'POST',
        headers: this.headers(),
        vendor: VENDOR,
        retries: 0,
        timeoutMs: 10_000,
        ...(this.secret ? { secret: this.secret } : {}),
      })
    } catch {
      // The prediction may already be done; nothing more to do.
    }
  }
}

/** The prediction when it has ended well; throws when it ended badly; undefined while running. */
function settle(p: Prediction, kind: 'image' | 'video', job: MediaJob): Prediction | undefined {
  if (p.status === 'succeeded') return p
  if (p.status === 'failed') throw predictionFailed(kind, p.error)
  if (p.status === 'canceled') {
    if (job.signal?.aborted) throw new AppError('CANCELLED', 'Cancelled')
    throw new AppError('PROVIDER', `Replicate cancelled the ${kind} before it finished`)
  }
  return undefined
}

/** A slowly rising estimate: Replicate reports no percentage. */
function progressFor(p: Prediction, elapsedMs: number): MediaProgress {
  if (p.status === 'starting') return { progress: 0.08, message: 'Starting (waiting for a runner)' }
  const eased = 1 - Math.exp(-elapsedMs / 90_000)
  return { progress: 0.12 + 0.75 * eased, message: 'Generating' }
}
