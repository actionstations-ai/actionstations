// Resolve a model's inference settings (#585): the matching profile from the model-card table,
// combined with the prompt's per-stage temperature and the provider's options. Unknown models
// resolve to the request as it was (the stage temperature, nothing else). Pure; no I/O.
import table from './model-profiles.json'
import {
  ModelProfileTable,
  ReasoningLevel,
  type InferenceSettings,
  type ModelProfile,
} from './schemas/model-profile'

export const MODEL_PROFILES: ModelProfile[] = ModelProfileTable.parse(table).profiles

/** The first profile whose pattern matches the model id (matched case-insensitively). */
export function findModelProfile(
  modelId: string,
  profiles: readonly ModelProfile[] = MODEL_PROFILES,
): ModelProfile | undefined {
  return profiles.find((p) => new RegExp(p.match, 'i').test(modelId))
}

export interface InferenceOptions {
  /** `options.modelProfile`: "off" turns profiles off for this provider (today's behaviour). */
  modelProfile?: unknown
  /** `options.reasoningEffort`: off | on | low | medium | high, overriding the profile default. */
  reasoningEffort?: unknown
  /** `options.draftModel`: a draft model id, or "off" to ignore the profile's. */
  draftModel?: unknown
}

export interface ResolveInput {
  modelId: string
  /** The prompt's per-stage temperature, when it sets one. */
  stageTemperature?: number
  options?: InferenceOptions
  /** Model ids the server has installed; a draft model is used only when listed here. */
  installedModels?: ReadonlySet<string>
}

/** An effort model takes low/medium/high (or off); a switch model takes on/off (a level means on). */
function reasoningFor(
  profile: ModelProfile,
  option: unknown,
): InferenceSettings['reasoning'] | undefined {
  const { kind } = profile.reasoning
  if (kind === 'none') return undefined
  const parsed = ReasoningLevel.safeParse(option)
  const level = parsed.success ? parsed.data : profile.reasoning.default
  if (!level) return undefined
  if (kind === 'switch') return { kind, level: level === 'off' ? 'off' : 'on' }
  return { kind, level: level === 'on' ? 'medium' : level }
}

/** The draft model a request would use if it is installed, so callers list models only then. */
export function draftCandidate(modelId: string, options?: InferenceOptions): string | undefined {
  const option = options?.draftModel
  if (option === 'off') return undefined
  const profile = options?.modelProfile === 'off' ? undefined : findModelProfile(modelId)
  const draft = typeof option === 'string' && option ? option : profile?.draftModel
  return draft && draft !== modelId ? draft : undefined
}

function draftFor(input: ResolveInput): string | undefined {
  const draft = draftCandidate(input.modelId, input.options)
  return draft && input.installedModels?.has(draft) ? draft : undefined
}

export function resolveInference(input: ResolveInput): InferenceSettings {
  const stage = input.stageTemperature
  const profile =
    input.options?.modelProfile === 'off' ? undefined : findModelProfile(input.modelId)
  if (!profile) return stage === undefined ? {} : { temperature: stage }
  const { sampling } = profile
  const temperature =
    profile.temperaturePolicy === 'stage' && stage !== undefined ? stage : sampling.temperature
  const reasoning = reasoningFor(profile, input.options?.reasoningEffort)
  const draftModel = draftFor(input)
  return {
    profileId: profile.id,
    temperature,
    ...(sampling.topP !== undefined ? { topP: sampling.topP } : {}),
    ...(sampling.topK !== undefined ? { topK: sampling.topK } : {}),
    ...(sampling.minP !== undefined ? { minP: sampling.minP } : {}),
    ...(reasoning ? { reasoning } : {}),
    ...(draftModel ? { draftModel } : {}),
  }
}
