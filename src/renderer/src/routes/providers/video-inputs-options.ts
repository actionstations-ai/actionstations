// Values and rules for the "Video model inputs" section of the provider form (fal.ai and
// Replicate): which input name each model uses for the prompt, duration and so on. Stored in the
// provider's options.inputMap, keyed by model id; models left as the table has them are not stored.
import {
  effectiveInputs,
  knownModel,
  normalize,
  readInputMap,
  type InputMapOverride,
} from '@shared/cloud-video-inputs'

/** The form's text for one model's mapping. */
export interface InputFields {
  prompt: string
  negativePrompt: string
  duration: string
  /** Seconds the model accepts, comma separated ("5, 10"); empty = any whole second. */
  durationAllowed: string
  aspectRatio: string
  image: string
}

export type InputFieldKey = keyof InputFields

/** Models the user changed in this form session, by normalized model id. */
export type InputDrafts = Record<string, InputFields>

const NAME = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/

/** The mapping the app uses for a model: the saved one laid over the table. */
export function fieldsFor(kind: 'image' | 'video', model: string, inputMap: unknown): InputFields {
  const map = effectiveInputs(kind, model, readInputMap(inputMap, model))
  return {
    prompt: map.prompt,
    negativePrompt: map.negativePrompt ?? '',
    duration: map.duration?.field ?? '',
    durationAllowed: map.duration?.allowed.join(', ') ?? '',
    aspectRatio: map.aspectRatio?.field ?? '',
    image: map.image ?? '',
  }
}

/** Whether the model is in the app's table (its mapping is filled in already). */
export const isKnownModel = (model: string): boolean => !!knownModel(model)

/** One message per field that is filled in but is not a plain input name or list of seconds. */
export function inputErrors(f: InputFields): Partial<Record<InputFieldKey, string>> {
  const errors: Partial<Record<InputFieldKey, string>> = {}
  for (const key of ['prompt', 'negativePrompt', 'duration', 'aspectRatio', 'image'] as const) {
    const v = f[key].trim()
    if (v && !NAME.test(v))
      errors[key] = 'Use the input name only: letters, digits and underscores.'
  }
  if (!f.prompt.trim()) errors.prompt = 'Every model needs a prompt input.'
  if (f.durationAllowed.trim() && parseSeconds(f.durationAllowed) === undefined)
    errors.durationAllowed = 'Enter whole seconds separated by commas, such as 5, 10.'
  return errors
}

function parseSeconds(text: string): number[] | undefined {
  const parts = text
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)
  const nums = parts.map(Number)
  return nums.length && nums.every((n) => Number.isInteger(n) && n > 0 && n < 3600)
    ? nums
    : undefined
}

function toOverride(f: InputFields): InputMapOverride {
  const out: InputMapOverride = { prompt: f.prompt.trim() }
  if (f.negativePrompt.trim()) out.negativePrompt = f.negativePrompt.trim()
  if (f.duration.trim()) out.duration = f.duration.trim()
  const allowed = parseSeconds(f.durationAllowed)
  if (allowed) out.durationAllowed = allowed
  if (f.aspectRatio.trim()) out.aspectRatio = f.aspectRatio.trim()
  if (f.image.trim()) out.image = f.image.trim()
  return out
}

/** The options with the edited mappings applied; models whose mapping is empty or invalid are dropped. */
export function applyInputDrafts(
  options: Record<string, unknown>,
  kind: 'image' | 'video',
  drafts: InputDrafts,
): Record<string, unknown> {
  const out = { ...options }
  const map: Record<string, InputMapOverride> = {}
  const existing = options.inputMap
  if (existing && typeof existing === 'object')
    for (const [model, v] of Object.entries(existing as Record<string, InputMapOverride>))
      map[model] = v
  for (const [model, fields] of Object.entries(drafts)) {
    if (Object.keys(inputErrors(fields)).length) continue
    const table = fieldsFor(kind, model, undefined)
    if (JSON.stringify(table) === JSON.stringify(fields)) delete map[model]
    else map[model] = toOverride(fields)
  }
  if (Object.keys(map).length) out.inputMap = map
  else delete out.inputMap
  return out
}

/** Models that already have a saved mapping, for the picker. */
export function savedModels(options: unknown): string[] {
  const raw = (options as { inputMap?: unknown } | undefined)?.inputMap
  return raw && typeof raw === 'object' ? Object.keys(raw) : []
}

export { normalize }
