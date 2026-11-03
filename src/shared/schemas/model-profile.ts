// Per-model inference settings (#585): the sampling, reasoning-effort and draft-model settings
// a model's own card recommends, keyed by model family. The table is data
// (src/shared/model-profiles.json, validated by this schema); resolution lives in
// src/shared/model-profiles.ts. Docs: docs/guides/model-profiles.md.
import { z } from 'zod'

export const ReasoningLevel = z.enum(['off', 'on', 'low', 'medium', 'high'])
export type ReasoningLevel = z.infer<typeof ReasoningLevel>

export const ProfileSampling = z.object({
  temperature: z.number().min(0).max(2),
  topP: z.number().gt(0).max(1).optional(),
  topK: z.number().int().positive().optional(),
  minP: z.number().min(0).max(1).optional(),
})
export type ProfileSampling = z.infer<typeof ProfileSampling>

export const ModelProfile = z.object({
  id: z.string().min(1).max(60),
  label: z.string().min(1).max(100),
  /** Case-insensitive regular expression tested against the model id; the first match wins. */
  match: z.string().min(1).max(200),
  /** Model card or generation_config.json the numbers come from. */
  source: z.array(z.string().url()).min(1),
  sampling: ProfileSampling,
  /**
   * How the prompt's per-stage temperature combines with the card's:
   * `profile`: the card's temperature always (its card warns against greedy or low-temperature
   * decoding); `stage`: the stage's temperature when it sets one, else the card's.
   */
  temperaturePolicy: z.enum(['profile', 'stage']),
  reasoning: z.object({
    /** `effort`: a low/medium/high level; `switch`: thinking on or off; `none`: not supported. */
    kind: z.enum(['none', 'effort', 'switch']),
    default: ReasoningLevel.optional(),
  }),
  /**
   * Structured-output mode to try first on OpenAI-compatible servers. gpt-oss-20b returns one
   * truncated item under strict `json_schema` (#81), so it starts from `json_object`; gpt-oss-120b
   * is rejected under `json_object` by LM Studio's harmony parser (#503) and starts from `json_schema`.
   */
  structuredOutput: z.enum(['json_schema', 'json_object']).optional(),
  /** Small model of the same family for speculative decoding (LM Studio `draft_model`). */
  draftModel: z.string().min(1).max(200).optional(),
})
export type ModelProfile = z.infer<typeof ModelProfile>

export const ModelProfileTable = z.object({
  version: z.literal(1),
  profiles: z.array(ModelProfile).min(1),
})
export type ModelProfileTable = z.infer<typeof ModelProfileTable>

/** What a request carries after the profile and the provider's options are applied. */
export interface InferenceSettings {
  profileId?: string
  temperature?: number
  topP?: number
  topK?: number
  minP?: number
  reasoning?: { kind: 'effort' | 'switch'; level: ReasoningLevel }
  draftModel?: string
}
