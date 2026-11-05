// Which input names each cloud media model takes (fal.ai now, Replicate later). Shared so the
// provider form can show and edit the same table the adapters use. The app has one
// brief (prompt, negative prompt, duration, aspect ratio, starting image); every model names
// those inputs differently, and sending a field a model does not know can fail the request. So
// only fields the table (or the user's own mapping) names are sent. Field names and ranges were
// checked against each model's published input schema.
import type { MediaBrief } from '@shared/schemas'

/** A model's duration input: the values it accepts, always sent as text ("5"). */
export interface DurationInput {
  field: string
  allowed: number[]
}

export interface ModelInputs {
  kind: 'image' | 'video'
  /** Input name of the prompt. */
  prompt: string
  negativePrompt?: string
  duration?: DurationInput
  aspectRatio?: { field: string; allowed: string[]; skipWithImage?: boolean }
  /** Input name of the starting image; with `imageRequired` the model refuses to run without one. */
  image?: string
  imageRequired?: boolean
  /** Input name of fal's image_size preset (square_hd, landscape_4_3 ...). */
  imageSize?: string
  seed?: string
  label?: string
}

const range = (from: number, to: number, step = 1): number[] => {
  const out: number[] = []
  for (let n = from; n <= to; n += step) out.push(n)
  return out
}

const FAL_IMAGE: Omit<ModelInputs, 'label'> = {
  kind: 'image',
  prompt: 'prompt',
  imageSize: 'image_size',
  seed: 'seed',
}

/** Known models, keyed by the id the service uses. */
export const KNOWN_MODELS: Record<string, ModelInputs> = {
  'fal-ai/kling-video/v2.5-turbo/pro/image-to-video': {
    kind: 'video',
    label: 'Kling 2.5 Turbo Pro (image to video)',
    prompt: 'prompt',
    negativePrompt: 'negative_prompt',
    duration: { field: 'duration', allowed: [5, 10] },
    image: 'image_url',
    imageRequired: true,
  },
  'fal-ai/kling-video/v2.5-turbo/pro/text-to-video': {
    kind: 'video',
    label: 'Kling 2.5 Turbo Pro (text to video)',
    prompt: 'prompt',
    negativePrompt: 'negative_prompt',
    duration: { field: 'duration', allowed: [5, 10] },
    aspectRatio: { field: 'aspect_ratio', allowed: ['16:9', '9:16', '1:1'] },
  },
  'fal-ai/kling-video/v3/pro/image-to-video': {
    kind: 'video',
    label: 'Kling 3 Pro (image to video)',
    prompt: 'prompt',
    negativePrompt: 'negative_prompt',
    duration: { field: 'duration', allowed: range(3, 15) },
    image: 'start_image_url',
    imageRequired: true,
  },
  'fal-ai/ltx-2.5/image-to-video/fast': {
    kind: 'video',
    label: 'LTX 2.5 Fast (image to video)',
    prompt: 'prompt',
    duration: { field: 'duration', allowed: range(6, 20, 2) },
    aspectRatio: { field: 'aspect_ratio', allowed: ['16:9', '9:16'], skipWithImage: true },
    image: 'image_url',
    imageRequired: true,
  },
  'fal-ai/minimax/hailuo-02/standard/image-to-video': {
    kind: 'video',
    label: 'MiniMax Hailuo 02 Standard (image to video)',
    prompt: 'prompt',
    duration: { field: 'duration', allowed: [6, 10] },
    image: 'image_url',
    imageRequired: true,
  },
  'bytedance/seedance-2.5/us/image-to-video': {
    kind: 'video',
    label: 'Seedance 2.5 (image to video)',
    prompt: 'prompt',
    duration: { field: 'duration', allowed: range(4, 30) },
    image: 'image_url',
    imageRequired: true,
  },
  'fal-ai/flux/schnell': { ...FAL_IMAGE, label: 'FLUX.1 schnell (fast, low cost)' },
  'fal-ai/flux-pro/v1.1': { ...FAL_IMAGE, label: 'FLUX 1.1 pro' },
  'fal-ai/flux-2': { ...FAL_IMAGE, label: 'FLUX.2' },
}

export const normalize = (model: string): string =>
  model
    .trim()
    .replace(/^\/+|\/+$/g, '')
    .toLowerCase()

export function knownModel(model: string): ModelInputs | undefined {
  return KNOWN_MODELS[normalize(model)]
}

/** Known models of one kind, for the suggestion list. */
export function suggestedModels(kind: ModelInputs['kind']): { id: string; label: string }[] {
  return Object.entries(KNOWN_MODELS)
    .filter(([, m]) => m.kind === kind)
    .map(([id, m]) => ({ id, label: m.label ?? id }))
}

/** The user's mapping in options.inputMap: input names by role. Empty or missing names are ignored. */
export interface InputMapOverride {
  prompt?: string
  negativePrompt?: string
  duration?: string
  /** Seconds the model accepts, e.g. [5, 10]; without it any whole second is sent. */
  durationAllowed?: number[]
  aspectRatio?: string
  image?: string
  imageSize?: string
  seed?: string
}

const NAME = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/
export const OVERRIDE_KEYS = [
  'prompt',
  'negativePrompt',
  'duration',
  'aspectRatio',
  'image',
  'imageSize',
  'seed',
] as const

const fieldName = (v: unknown): string | undefined =>
  typeof v === 'string' && NAME.test(v.trim()) ? v.trim() : undefined

/**
 * Read options.inputMap defensively: it comes from a settings file the user may have edited.
 * The map is keyed by model id, so one provider can hold a mapping for each model it uses.
 */
export function readInputMap(raw: unknown, model: string): InputMapOverride {
  if (!raw || typeof raw !== 'object') return {}
  const entry = (raw as Record<string, unknown>)[normalize(model)]
  if (!entry || typeof entry !== 'object') return {}
  const o = entry as Record<string, unknown>
  const out: InputMapOverride = {}
  for (const key of OVERRIDE_KEYS) {
    const v = fieldName(o[key])
    if (v) out[key] = v
  }
  const allowed = Array.isArray(o.durationAllowed)
    ? o.durationAllowed.filter((n): n is number => typeof n === 'number' && n > 0 && n < 3600)
    : []
  if (allowed.length) out.durationAllowed = allowed
  return out
}

/** Table entry for the model with the user's names laid over it. Unknown model: prompt only. */
export function effectiveInputs(
  kind: ModelInputs['kind'],
  model: string,
  override: InputMapOverride,
): ModelInputs {
  const base: ModelInputs = knownModel(model) ?? { kind, prompt: 'prompt' }
  const out: ModelInputs = { ...base, kind }
  if (override.prompt) out.prompt = override.prompt
  if (override.negativePrompt) out.negativePrompt = override.negativePrompt
  if (override.seed) out.seed = override.seed
  if (override.imageSize) out.imageSize = override.imageSize
  if (override.image) out.image = override.image
  if (override.duration)
    out.duration = {
      field: override.duration,
      allowed: override.durationAllowed ?? base.duration?.allowed ?? [],
    }
  else if (out.duration && override.durationAllowed)
    out.duration = { ...out.duration, allowed: override.durationAllowed }
  if (override.aspectRatio)
    out.aspectRatio = {
      field: override.aspectRatio,
      allowed: base.aspectRatio?.allowed ?? ['16:9', '9:16', '1:1'],
    }
  return out
}

/** What the adapter knows about one request when it fills the inputs. */
export interface InputContext {
  brief: MediaBrief
  prompt: string
  /** Starting image as a data URI, when the job has one. */
  imageUri?: string
  width?: number
  height?: number
  seed?: number
}

/** Nearest accepted whole-second value; any whole second when the model lists none. */
export function clampDuration(sec: number | undefined, allowed: number[]): number | undefined {
  if (sec === undefined || !(sec > 0)) return undefined
  if (!allowed.length) return Math.max(1, Math.round(sec))
  return allowed.reduce((best, n) => (Math.abs(n - sec) < Math.abs(best - sec) ? n : best))
}

/** The accepted aspect ratio closest to the frame the job asks for. */
export function nearestAspect(
  allowed: string[],
  width: number | undefined,
  height: number | undefined,
): string | undefined {
  if (!width || !height || !allowed.length) return undefined
  const target = width / height
  const ratio = (a: string): number => {
    const [w, h] = a.split(':').map(Number)
    return w && h ? w / h : 1
  }
  return allowed.reduce((best, a) =>
    Math.abs(ratio(a) - target) < Math.abs(ratio(best) - target) ? a : best,
  )
}

const FAL_SIZES: [string, number][] = [
  ['portrait_16_9', 9 / 16],
  ['portrait_4_3', 3 / 4],
  ['square_hd', 1],
  ['landscape_4_3', 4 / 3],
  ['landscape_16_9', 16 / 9],
]

/** fal's image_size preset closest to the requested frame. */
export function nearestImageSize(
  width: number | undefined,
  height: number | undefined,
): string | undefined {
  if (!width || !height) return undefined
  const target = width / height
  return FAL_SIZES.reduce((best, s) =>
    Math.abs(s[1] - target) < Math.abs(best[1] - target) ? s : best,
  )[0]
}

/** The model's request body: only fields the mapping names, only values the job has. */
export function buildInputs(map: ModelInputs, ctx: InputContext): Record<string, unknown> {
  const body: Record<string, unknown> = { [map.prompt]: ctx.prompt }
  const negative = ctx.brief.negativePrompt?.trim()
  if (map.negativePrompt && negative) body[map.negativePrompt] = negative
  if (map.image && ctx.imageUri) body[map.image] = ctx.imageUri
  if (map.duration) {
    const sec = clampDuration(ctx.brief.durationSec, map.duration.allowed)
    if (sec !== undefined) body[map.duration.field] = String(sec)
  }
  if (map.aspectRatio && !(map.aspectRatio.skipWithImage && ctx.imageUri)) {
    const aspect = nearestAspect(map.aspectRatio.allowed, ctx.width, ctx.height)
    if (aspect) body[map.aspectRatio.field] = aspect
  }
  if (map.imageSize) {
    const size = nearestImageSize(ctx.width, ctx.height)
    if (size) body[map.imageSize] = size
  }
  if (map.seed && ctx.seed !== undefined) body[map.seed] = ctx.seed
  return body
}

/** Seconds the request will ask for (for the clip's duration). */
export function requestedDuration(map: ModelInputs, brief: MediaBrief): number | undefined {
  return map.duration ? clampDuration(brief.durationSec, map.duration.allowed) : undefined
}
