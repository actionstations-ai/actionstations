// The flooding toolkit's format rules (spec 0454 FR-4), registered as field lint rules so they
// run over the injects of the types they read and feed the repair round of the inject text
// stage. Importing this module registers them; lint-rules.ts lists it.
import { registerFieldLintRule, type FieldLintIssue, type FieldLintRule } from '../field-lint'
import { lintFlashFloodWarning, lintStageUnits, type FlashFloodTag } from './lint'

type Fields = Record<string, unknown>

const STAGE_TYPES = [
  'nws_hydrologic_product',
  'flood_forecast_discussion',
  'road_closure_notice',
  'sandbag_pump_request',
  'nws_weather_warning',
] as const

/** Every string in the fields, with its path, for text checks. */
function strings(v: unknown, path: string, out: { path: string; text: string }[] = []) {
  if (typeof v === 'string') out.push({ path, text: v })
  else if (Array.isArray(v)) v.forEach((x, i) => strings(x, `${path}[${i}]`, out))
  else if (v && typeof v === 'object')
    for (const [k, x] of Object.entries(v)) strings(x, `${path}.${k}`, out)
  return out
}

const stageUnits: FieldLintRule = {
  id: 'flood.stage_units',
  injectTypes: STAGE_TYPES,
  check(fields: Fields) {
    return strings(fields, 'fields').flatMap(({ path, text }) =>
      lintStageUnits(text).map((i): FieldLintIssue => ({ path, message: i.message })),
    )
  },
}

const TAGS: Record<string, FlashFloodTag> = {
  CONSIDERABLE: 'considerable',
  CATASTROPHIC: 'catastrophic',
}

const flashTags: FieldLintRule = {
  id: 'flood.flash_tags',
  injectTypes: ['nws_weather_warning'],
  check(fields: Fields) {
    const product = typeof fields.product === 'string' ? fields.product : ''
    if (!/flash flood/i.test(product)) return []
    const tags = Array.isArray(fields.tags) ? (fields.tags as Fields[]) : []
    const threat = tags.find((t) => /damage threat/i.test(String(t.name ?? '')))
    const tag = TAGS[String(threat?.value ?? '').toUpperCase()] ?? 'base'
    const text = strings(
      { bulletin: fields.bulletin, at: fields.at, hazard: fields.hazard, impact: fields.impact },
      'fields',
    )
      .map((s) => s.text)
      .join(' ')
    return lintFlashFloodWarning({ tag, text }).map((i) => ({
      path: 'fields.tags',
      message: i.message,
    }))
  },
}

for (const r of [stageUnits, flashTags]) registerFieldLintRule(r)
