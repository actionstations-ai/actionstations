// fal.ai media provider: images and short video through fal's queue API. A job is submitted to
// queue.fal.run/{model}, followed through the status link in fal's answer until it completes,
// and the finished file is downloaded at once (fal's output links expire).
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
import { dataUri, saveDownloaded } from '../cloud-video/files'
import { pollUntil, type PollStep } from '../cloud-video/poll'

export const FAL_BASE_URL = 'https://queue.fal.run'
const VENDOR = 'fal.ai'
const TIMEOUT_MS = { image: 3 * 60_000, video: 15 * 60_000 } as const
const MODEL_ID = /^[A-Za-z0-9][A-Za-z0-9._-]*(\/[A-Za-z0-9][A-Za-z0-9._-]*)+$/

interface Submitted {
  request_id?: string
  status_url?: string
  response_url?: string
  cancel_url?: string
  queue_position?: number
}

interface Status {
  status?: string
  queue_position?: number
  error?: string
  error_type?: string
}

interface FalFile {
  url?: string
  width?: number
  height?: number
  duration?: number
}

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object'

/** Plain-words message for a failed call; the service's own text is kept for anything unusual. */
export function friendlyFalError(err: unknown): AppError {
  if (!(err instanceof AppError) || err.code !== 'PROVIDER') return err as AppError
  const status = (err.details as { status?: number } | undefined)?.status
  const detail = err.message.replace(/^fal\.ai HTTP \d+( \(check the API key\))?:\s*/, '')
  if (status === 401)
    return new AppError('PROVIDER', 'fal.ai rejected the API key. Check the key.', { status })
  if (status === 403 && /balance|credit|billing|exhaust|locked/i.test(detail))
    return new AppError('PROVIDER', `fal.ai account has no credit left: ${detail}`, { status })
  if (status === 403)
    return new AppError('PROVIDER', `fal.ai refused the request: ${detail}`, { status })
  if (status === 429)
    return new AppError(
      'PROVIDER',
      'fal.ai is rate limiting requests or its queue is full. Try again in a minute.',
      { status },
    )
  if (status === 404)
    return new AppError('PROVIDER', 'fal.ai does not have that model. Check the model id.', {
      status,
    })
  if (status === 422 || status === 400)
    return new AppError(
      'PROVIDER',
      `fal.ai did not accept the request or refused the content: ${detail}`,
      { status },
    )
  return err
}

export class FalMediaProvider implements MediaProvider {
  readonly kind = 'fal' as const

  constructor(
    readonly config: ProviderConfig,
    private readonly secret: string | undefined,
  ) {}

  get id(): string {
    return this.config.id
  }

  private get base(): string {
    return (this.config.baseUrl ?? FAL_BASE_URL).replace(/\/+$/, '')
  }

  capabilities(): Set<MediaCapability> {
    return new Set<MediaCapability>(['image', 'video'])
  }

  private headers(): Record<string, string> {
    if (!this.secret)
      throw new AppError('VALIDATION', 'fal.ai needs an API key. Add it on the Providers page.')
    return { authorization: `Key ${this.secret}` }
  }

  /** Asks for a request that does not exist: 404 means the key was accepted, 401 means it was not. Free of charge. */
  async health(signal?: AbortSignal): Promise<ProviderHealth> {
    const start = Date.now()
    try {
      const url = joinUrl(
        this.base,
        'fal-ai/flux/schnell/requests/00000000-0000-0000-0000-000000000000/status',
      )
      await request(url, {
        headers: this.headers(),
        vendor: VENDOR,
        retries: 0,
        timeoutMs: 15_000,
        ...(signal ? { signal } : {}),
        ...(this.secret ? { secret: this.secret } : {}),
      })
      return { ok: true, latencyMs: elapsed(start), message: 'fal.ai key accepted' }
    } catch (err) {
      const status = (err as AppError).details as { status?: number } | undefined
      if (status?.status === 404)
        return { ok: true, latencyMs: elapsed(start), message: 'fal.ai key accepted' }
      return { ok: false, latencyMs: elapsed(start), message: friendlyFalError(err).message }
    }
  }

  async generate(job: MediaJob, onProgress?: (p: MediaProgress) => void): Promise<MediaOutput[]> {
    if (job.kind === 'audio')
      throw new AppError('VALIDATION', 'fal.ai is used for images and video here')
    const model = (job.model ?? this.config.defaultModel ?? '').trim().replace(/^\/+|\/+$/g, '')
    if (!MODEL_ID.test(model))
      throw new AppError(
        'VALIDATION',
        `Choose a fal.ai ${job.kind} model for the ${job.kind} task (for example fal-ai/flux/schnell)`,
      )
    const map = effectiveInputs(job.kind, model, readInputMap(this.config.options.inputMap, model))
    const body = await this.requestBody(job, map)
    try {
      return await this.run(job, model, body, map, onProgress)
    } catch (err) {
      throw friendlyFalError(err)
    }
  }

  private async requestBody(job: MediaJob, map: ModelInputs): Promise<Record<string, unknown>> {
    const prompt = (
      job.kind === 'video'
        ? (job.brief.videoPrompt ?? job.brief.imagePrompt)
        : job.brief.imagePrompt
    )?.trim()
    if (!prompt) throw new AppError('VALIDATION', `The media brief has no ${job.kind} prompt`)
    const imageUri = map.image && job.inputImagePath ? await dataUri(job.inputImagePath) : undefined
    if (job.kind === 'video' && map.imageRequired && !imageUri)
      throw new AppError(
        'VALIDATION',
        'This fal.ai video model needs a starting image, and the scene image was not generated',
      )
    return buildInputs(map, {
      brief: job.brief,
      prompt,
      ...(imageUri ? { imageUri } : {}),
      ...(job.width ? { width: job.width } : {}),
      ...(job.height ? { height: job.height } : {}),
      ...(job.seed !== undefined ? { seed: job.seed } : {}),
    })
  }

  private async run(
    job: MediaJob,
    model: string,
    body: Record<string, unknown>,
    map: ModelInputs,
    onProgress?: (p: MediaProgress) => void,
  ): Promise<MediaOutput[]> {
    const kind = job.kind as 'image' | 'video'
    onProgress?.({ progress: 0.03, message: 'Sending to fal.ai' })
    const submitted = await requestJson<Submitted>(joinUrl(this.base, model), {
      method: 'POST',
      headers: this.headers(),
      body,
      vendor: VENDOR,
      retries: 1,
      timeoutMs: 120_000,
      ...(job.signal ? { signal: job.signal } : {}),
      ...(this.secret ? { secret: this.secret } : {}),
    })
    const links = this.links(submitted)
    const responseJson = await this.waitFor(job, kind, links, onProgress)
    onProgress?.({ progress: 0.9, message: 'Downloading the result' })
    const file = pickFile(responseJson, kind)
    if (!file?.url) throw new AppError('PROVIDER', `fal.ai finished but returned no ${kind}`)
    const downloaded = await downloadMedia(file.url, {
      kind,
      vendor: VENDOR,
      providerHost: new URL(this.base).hostname,
      ...(job.signal ? { signal: job.signal } : {}),
    })
    const out = await saveDownloaded(
      job,
      kind,
      downloaded,
      {
        width: file.width,
        height: file.height,
        durationSec:
          kind === 'video' ? (file.duration ?? requestedDuration(map, job.brief)) : undefined,
        model,
        prompt: String(body[map.prompt] ?? ''),
      },
      this.id,
    )
    onProgress?.({ progress: 1, message: 'Media ready' })
    return [out]
  }

  /** The status, result and cancel links from fal's answer; each must stay on fal's own host. */
  private links(s: Submitted): { status: string; result: string; cancel?: string } {
    if (!s.status_url || !s.response_url)
      throw new AppError('PROVIDER', 'fal.ai accepted the job but sent no status link')
    for (const u of [s.status_url, s.response_url, s.cancel_url]) {
      if (u && new URL(u).origin !== new URL(this.base).origin)
        throw new AppError(
          'PROVIDER',
          'fal.ai sent a link to another host; not followed so the key stays with fal.ai',
        )
    }
    return {
      status: s.status_url,
      result: s.response_url,
      ...(s.cancel_url ? { cancel: s.cancel_url } : {}),
    }
  }

  private async waitFor(
    job: MediaJob,
    kind: 'image' | 'video',
    links: { status: string; result: string; cancel?: string },
    onProgress?: (p: MediaProgress) => void,
  ): Promise<unknown> {
    const started = Date.now()
    const common = {
      headers: this.headers(),
      vendor: VENDOR,
      ...(this.secret ? { secret: this.secret } : {}),
    }
    await pollUntil<void>(
      async (): Promise<PollStep<void>> => {
        const s = await requestJson<Status>(links.status, {
          ...common,
          timeoutMs: 30_000,
          ...(job.signal ? { signal: job.signal } : {}),
        })
        if (s.status === 'COMPLETED') {
          if (s.error)
            throw new AppError('PROVIDER', `fal.ai could not make the ${kind}: ${s.error}`)
          return { done: true, value: undefined }
        }
        onProgress?.(progressFor(s, Date.now() - started))
        return { done: false }
      },
      {
        timeoutMs: numberOption(this.config, 'timeoutMs') ?? TIMEOUT_MS[kind],
        minMs: numberOption(this.config, 'pollMinMs') ?? 2_000,
        maxMs: numberOption(this.config, 'pollMaxMs') ?? 15_000,
        label: `fal.ai ${kind}`,
        ...(job.signal ? { signal: job.signal } : {}),
        onStop: () => this.cancelRemote(links.cancel),
      },
    )
    return requestJson<unknown>(links.result, {
      ...common,
      timeoutMs: 60_000,
      ...(job.signal ? { signal: job.signal } : {}),
    })
  }

  /** Ask fal to stop (and stop charging for) the job. Best effort. */
  private async cancelRemote(url: string | undefined): Promise<void> {
    if (!url) return
    try {
      await request(url, {
        method: 'PUT',
        headers: this.headers(),
        vendor: VENDOR,
        retries: 0,
        timeoutMs: 10_000,
        ...(this.secret ? { secret: this.secret } : {}),
      })
    } catch {
      // The job may already be done or gone; nothing more to do.
    }
  }
}

/** Queue position while waiting; a slowly rising estimate once a runner has the job. */
function progressFor(s: Status, elapsedMs: number): MediaProgress {
  if (s.status === 'IN_QUEUE')
    return {
      progress: 0.08,
      message:
        s.queue_position !== undefined
          ? `Waiting in line (position ${s.queue_position})`
          : 'Waiting in line',
    }
  const eased = 1 - Math.exp(-elapsedMs / 90_000)
  return { progress: 0.12 + 0.75 * eased, message: 'Generating' }
}

/** The first image or video file in a result, whatever the model calls its output. */
export function pickFile(result: unknown, kind: 'image' | 'video'): FalFile | undefined {
  if (!isRecord(result)) return undefined
  const direct = kind === 'video' ? result.video : isRecord(result.image) ? result.image : undefined
  if (isRecord(direct)) return direct as FalFile
  const list = kind === 'image' ? result.images : result.videos
  if (Array.isArray(list) && isRecord(list[0])) return list[0] as FalFile
  return undefined
}
