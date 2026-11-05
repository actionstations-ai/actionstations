// Image generation over POST {base}/images/generations (OpenAI gpt-image models, Gemini's
// OpenAI-compatible endpoint, Azure OpenAI deployments). One image per job, written into
// job.outDir. Photographic scenes only: text-bearing media render from templates.
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import type { ProviderConfig, ProviderHealth } from '@shared/schemas'
import { AppError } from '../../../lib/errors'
import { joinUrl, request, requestJson } from '../../http'
import type {
  MediaCapability,
  MediaJob,
  MediaOutput,
  MediaProgress,
  MediaProvider,
} from '../../types'
import { elapsed, stringOption } from '../common'
import { VENDOR, apiBaseOf, authHeaders } from './chat'

export const MAX_IMAGE_BYTES = 30 * 1024 * 1024
const HOSTED_IMAGE_PRESETS = new Set(['openai', 'gemini', 'azure-openai'])

export const isHostedImagePreset = (config: ProviderConfig): boolean =>
  HOSTED_IMAGE_PRESETS.has(stringOption(config, 'preset') ?? '')

/** The model that draws images for this job, or undefined when none is routed or set. */
export function imageModelFor(
  config: ProviderConfig,
  job?: Pick<MediaJob, 'model'>,
): string | undefined {
  return job?.model ?? stringOption(config, 'imageModel')
}

/**
 * Map the app's 1216x832 / 832x1216 request to a size the service accepts. Gemini ignores
 * parameters it does not support, so it gets the requested size unchanged.
 */
export function supportedSize(
  config: ProviderConfig,
  model: string,
  width?: number,
  height?: number,
): string {
  const w = width ?? 1216
  const h = height ?? 832
  if (stringOption(config, 'preset') === 'gemini') return `${w}x${h}`
  if (/dall-e-3/i.test(model)) return w > h ? '1792x1024' : w < h ? '1024x1792' : '1024x1024'
  return w > h ? '1536x1024' : w < h ? '1024x1536' : '1024x1024'
}

interface ImagesResponse {
  data?: { b64_json?: string; url?: string }[]
}

interface ImageType {
  mime: string
  ext: string
  width?: number
  height?: number
}

/** Identify PNG, JPEG or WebP from the first bytes (the declared content type is not trusted). */
export function sniffImage(b: Uint8Array): ImageType | undefined {
  if (b.length > 24 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) {
    const v = new DataView(b.buffer, b.byteOffset, b.byteLength)
    return { mime: 'image/png', ext: 'png', width: v.getUint32(16), height: v.getUint32(20) }
  }
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff)
    return { mime: 'image/jpeg', ext: 'jpg' }
  const tag = (o: number, s: string): boolean =>
    s.split('').every((c, i) => b[o + i] === c.charCodeAt(0))
  if (b.length > 12 && tag(0, 'RIFF') && tag(8, 'WEBP')) return { mime: 'image/webp', ext: 'webp' }
  return undefined
}

/** Plain-words message for a failed request; the status and the service's text decide. */
export function imageError(err: unknown, label: string): unknown {
  if (!(err instanceof AppError) || err.code !== 'PROVIDER') return err
  const d = (err.details ?? {}) as { status?: number; retryAfterSec?: number }
  const text = err.message.toLowerCase()
  const fail = (m: string): AppError => new AppError('PROVIDER', m)
  if (d.status === 401 || d.status === 403)
    return fail(`${label} did not accept the API key. Check or replace the key.`)
  if (/quota|billing|credit|insufficient/.test(text))
    return fail(
      `${label} says the account has no credit or quota left. Add credit, then try again.`,
    )
  if (d.status === 429) {
    const wait = d.retryAfterSec !== undefined ? ` Try again in ${d.retryAfterSec} seconds.` : ''
    return fail(`${label} is rate limiting requests.${wait}`)
  }
  if (/moderation|safety|content[_ ]policy|content_filter|blocked|refus/.test(text))
    return fail(
      `${label} refused the image because of its content rules. Reword the image prompt and try again.`,
    )
  if (d.status === 404 || /model.*(not found|does not exist|not available|access)/.test(text))
    return fail(
      `${label} does not offer that image model to this account. Choose another Image model in the provider's Advanced settings.`,
    )
  return err
}

export class OpenAiCompatibleImageProvider implements MediaProvider {
  readonly kind = 'openai-compatible' as const
  constructor(
    readonly config: ProviderConfig,
    private readonly secret: string | undefined,
  ) {}

  get id(): string {
    return this.config.id
  }

  capabilities(): Set<MediaCapability> {
    return new Set<MediaCapability>(
      isHostedImagePreset(this.config) && imageModelFor(this.config) ? ['image'] : [],
    )
  }

  async health(signal?: AbortSignal): Promise<ProviderHealth> {
    const start = Date.now()
    try {
      // The model list is free; no image is requested.
      await request(joinUrl(apiBaseOf(this.config), '/models'), {
        headers: authHeaders(this.config, this.secret),
        signal,
        timeoutMs: 5_000,
        retries: 0,
        vendor: VENDOR,
        secret: this.secret,
      })
      return { ok: true, latencyMs: elapsed(start) }
    } catch (err) {
      return { ok: false, latencyMs: elapsed(start), message: (err as Error).message }
    }
  }

  async generate(job: MediaJob, onProgress?: (p: MediaProgress) => void): Promise<MediaOutput[]> {
    if (job.kind !== 'image')
      throw new AppError('VALIDATION', `${this.config.label} images: got ${job.kind}`)
    const model = imageModelFor(this.config, job)
    const prompt = job.brief.imagePrompt?.trim()
    if (!model)
      throw new AppError('VALIDATION', `Provider "${this.config.label}" has no image model set`)
    if (!prompt) throw new AppError('VALIDATION', 'The media brief has no image prompt')
    onProgress?.({ progress: 0.1, message: `Asking ${this.config.label} for an image` })
    const bytes = await this.fetchImage(model, prompt, job)
    const type = sniffImage(bytes)
    if (!type)
      throw new AppError('PROVIDER', `${this.config.label} returned data that is not an image`)
    await fs.mkdir(job.outDir, { recursive: true })
    const filePath = join(job.outDir, `${job.injectId}-image-${Date.now()}.${type.ext}`)
    await fs.writeFile(filePath, bytes)
    onProgress?.({ progress: 1, message: 'Image ready' })
    return [
      {
        kind: 'image',
        filePath,
        mimeType: type.mime,
        ...(type.width && type.height ? { width: type.width, height: type.height } : {}),
        provenance: { provider: this.id, model, prompt },
      },
    ]
  }

  private body(model: string, prompt: string, job: MediaJob): Record<string, unknown> {
    const body: Record<string, unknown> = {
      model,
      prompt,
      size: supportedSize(this.config, model, job.width, job.height),
      n: 1,
    }
    const quality = stringOption(this.config, 'imageQuality')
    if (quality) body.quality = quality
    // Gemini and DALL-E answer with a URL unless asked; gpt-image models reject the field.
    if (stringOption(this.config, 'preset') === 'gemini' || /dall-e/i.test(model))
      body.response_format = 'b64_json'
    return body
  }

  private async fetchImage(model: string, prompt: string, job: MediaJob): Promise<Uint8Array> {
    let res: ImagesResponse
    try {
      res = await requestJson<ImagesResponse>(
        joinUrl(apiBaseOf(this.config), '/images/generations'),
        {
          method: 'POST',
          headers: authHeaders(this.config, this.secret),
          body: this.body(model, prompt, job),
          signal: job.signal,
          timeoutMs: 300_000,
          retries: 0,
          vendor: VENDOR,
          secret: this.secret,
        },
      )
    } catch (err) {
      throw imageError(err, this.config.label)
    }
    const first = res.data?.[0]
    if (first?.b64_json) return decodeBase64(first.b64_json, this.config.label)
    if (first?.url) return this.download(first.url, job.signal)
    throw new AppError('PROVIDER', `${this.config.label} returned no image`)
  }

  /** The signed URL in the response; no key is sent to it. */
  private async download(url: string, signal?: AbortSignal): Promise<Uint8Array> {
    if (!/^https:\/\//i.test(url))
      throw new AppError('PROVIDER', `${this.config.label} gave an image address that is not https`)
    const res = await request(url, { signal, timeoutMs: 120_000, retries: 1, vendor: VENDOR })
    const type = res.headers.get('content-type') ?? ''
    if (!/^image\//i.test(type))
      throw new AppError(
        'PROVIDER',
        `${this.config.label} sent a file that is not an image (${type || 'no type'})`,
      )
    const declared = Number(res.headers.get('content-length') ?? 0)
    if (declared > MAX_IMAGE_BYTES) throw tooBig(this.config.label)
    const bytes = new Uint8Array(await res.arrayBuffer())
    if (bytes.length > MAX_IMAGE_BYTES) throw tooBig(this.config.label)
    return bytes
  }
}

const tooBig = (label: string): AppError =>
  new AppError('PROVIDER', `${label} returned an image larger than 30 MB; not saved`)

function decodeBase64(b64: string, label: string): Uint8Array {
  if (b64.length > Math.ceil((MAX_IMAGE_BYTES * 4) / 3) + 8) throw tooBig(label)
  return new Uint8Array(Buffer.from(b64, 'base64'))
}
