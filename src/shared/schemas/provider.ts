import { z } from 'zod'
import { HttpUrl, Id } from './common'

export const PROVIDER_TASKS = [
  'ideate',
  'draft',
  'critique',
  /** Player-language translation; falls back to the draft route when unset (spec 0435). */
  'translate',
  /** SimCell replies (#429); falls back to `draft` when not routed. */
  'roleplay',
  'embed',
  'image',
  'video',
  'audio',
  'transcribe',
] as const
export const ProviderTask = z.enum(PROVIDER_TASKS)
export type ProviderTask = z.infer<typeof ProviderTask>

export const ProviderKind = z.enum([
  'anthropic',
  'openai-compatible',
  'ollama',
  'comfyui',
  'system-tts',
  'template',
  'local-whisper',
  'mock',
])
export type ProviderKind = z.infer<typeof ProviderKind>

/** Stored in app settings. API keys are NOT here — they live in secrets (safeStorage). */
export const ProviderConfig = z.object({
  id: Id,
  kind: ProviderKind,
  label: z.string().min(1),
  baseUrl: HttpUrl.optional(),
  defaultModel: z.string().optional(),
  /** Free-form adapter options (e.g. anthropic-version, json mode override, timeouts).
   *  Never put API keys here — this object is stored in plain settings.json. */
  options: z.record(z.string(), z.unknown()).default({}),
  enabled: z.boolean().default(true),
})
export type ProviderConfig = z.infer<typeof ProviderConfig>

/** What the renderer sees: config plus whether a secret is stored. */
export const ProviderView = ProviderConfig.extend({ hasKey: z.boolean() })
export type ProviderView = z.infer<typeof ProviderView>

export const ProviderRef = z.object({ providerId: Id, model: z.string().optional() })
export type ProviderRef = z.infer<typeof ProviderRef>

export const ProviderRouting = z.partialRecord(ProviderTask, ProviderRef)
export type ProviderRouting = z.infer<typeof ProviderRouting>

export const ModelInfo = z.object({
  id: z.string(),
  label: z.string().optional(),
  contextWindow: z.number().int().optional(),
  kind: z
    .enum(['chat', 'embedding', 'image', 'video', 'audio', 'speech', 'unknown'])
    .default('chat'),
  /** Size on disk when the server reports it (Ollama); used to prefer the most capable model. */
  sizeBytes: z.number().nonnegative().optional(),
})
export type ModelInfo = z.infer<typeof ModelInfo>

export const ProviderHealth = z.object({
  ok: z.boolean(),
  latencyMs: z.number().optional(),
  message: z.string().optional(),
  details: z.record(z.string(), z.unknown()).optional(),
})
export type ProviderHealth = z.infer<typeof ProviderHealth>
