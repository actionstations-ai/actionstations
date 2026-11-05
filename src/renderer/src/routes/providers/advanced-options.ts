// Values and rules for the Advanced section of the provider form (prices, Azure api-version,
// JSON mode). Stored in the provider's options.

export interface AdvancedDraft {
  inputUsdPerMTok: string
  outputUsdPerMTok: string
  mediaUsdPerCall: string
  apiVersion: string
  jsonMode: string
}

export const JSON_MODE_CHOICES = [
  { value: '', label: 'Automatic (try the strictest, then fall back)' },
  { value: 'json_schema', label: 'Strict JSON schema' },
  { value: 'json_object', label: 'JSON object' },
  { value: 'prompt', label: 'Ask in the prompt only' },
] as const

const NUMBER_KEYS = ['inputUsdPerMTok', 'outputUsdPerMTok', 'mediaUsdPerCall'] as const
const TEXT_KEYS = ['apiVersion', 'jsonMode'] as const

const asText = (v: unknown): string =>
  typeof v === 'number' && Number.isFinite(v) ? String(v) : typeof v === 'string' ? v : ''

export function advancedFrom(options: Record<string, unknown> | undefined): AdvancedDraft {
  const o = options ?? {}
  return {
    inputUsdPerMTok: asText(o.inputUsdPerMTok),
    outputUsdPerMTok: asText(o.outputUsdPerMTok),
    mediaUsdPerCall: asText(o.mediaUsdPerCall),
    apiVersion: asText(o.apiVersion),
    jsonMode: asText(o.jsonMode),
  }
}

const parsePrice = (raw: string): number | undefined => {
  const t = raw.trim()
  if (t === '') return undefined
  const n = Number(t)
  return Number.isFinite(n) && n >= 0 ? n : NaN
}

/** One message per field that is filled in but is not a price of zero or more. */
export function advancedErrors(a: AdvancedDraft): Partial<Record<keyof AdvancedDraft, string>> {
  const errors: Partial<Record<keyof AdvancedDraft, string>> = {}
  for (const key of NUMBER_KEYS)
    if (Number.isNaN(parsePrice(a[key]))) errors[key] = 'Enter a price in US dollars, such as 1.25.'
  const hasIn = parsePrice(a.inputUsdPerMTok) !== undefined
  const hasOut = parsePrice(a.outputUsdPerMTok) !== undefined
  if (hasIn !== hasOut && !errors.inputUsdPerMTok && !errors.outputUsdPerMTok)
    errors[hasIn ? 'outputUsdPerMTok' : 'inputUsdPerMTok'] =
      'Enter both prices, or leave both empty.'
  return errors
}

/** The options with the advanced values applied; empty fields remove their option. */
export function applyAdvanced(
  options: Record<string, unknown>,
  a: AdvancedDraft,
): Record<string, unknown> {
  const out = { ...options }
  for (const key of NUMBER_KEYS) {
    const n = parsePrice(a[key])
    if (n === undefined || Number.isNaN(n)) delete out[key]
    else out[key] = n
  }
  for (const key of TEXT_KEYS) {
    const t = a[key].trim()
    if (t) out[key] = t
    else delete out[key]
  }
  return out
}
