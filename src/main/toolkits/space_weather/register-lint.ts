// The space weather toolkit's format rules (spec 0468 FR-4), registered as field lint rules so
// they run over the injects of the types they read and feed the repair round of the inject text
// stage. Importing this module registers them; lint-rules.ts lists it.
import { registerFieldLintRule, type FieldLintIssue, type FieldLintRule } from '../field-lint'
import {
  lintCmeArrival,
  lintIcaoAdvisory,
  lintMessageCode,
  lintProductKind,
  lintScaleMapping,
  lintSwpcIssueTime,
  type SpaceLintIssue,
} from './lint'

type Fields = Record<string, unknown>

const SCALE_TYPES = [
  'swpc_message',
  'swpc_cme_discussion',
  'gmd_procedure_notice',
  'gmd_operator_log',
  'gmd_post_event_summary',
  'rc_dissemination_message',
  'satellite_notice',
  'ag_guidance_notice',
  'flight_reroute_notice',
  'sitrep',
  'press_release',
  'emergency_declaration',
  'tweet',
  'facebook_post',
] as const

/** Every string in the fields, with its path, for text checks. */
function strings(v: unknown, path: string, out: { path: string; text: string }[] = []) {
  if (typeof v === 'string') out.push({ path, text: v })
  else if (Array.isArray(v)) v.forEach((x, i) => strings(x, `${path}[${i}]`, out))
  else if (v && typeof v === 'object')
    for (const [k, x] of Object.entries(v)) strings(x, `${path}.${k}`, out)
  return out
}

const at =
  (path: string) =>
  (i: SpaceLintIssue): FieldLintIssue => ({ path, message: i.message })
const str = (v: unknown): string => (typeof v === 'string' ? v : '')

const scaleMapping: FieldLintRule = {
  id: 'space.scale_mapping',
  injectTypes: SCALE_TYPES,
  check(fields: Fields) {
    return strings(fields, 'fields').flatMap(({ path, text }) =>
      lintScaleMapping(text).map(at(path)),
    )
  },
}

const swpcMessage: FieldLintRule = {
  id: 'space.swpc_message',
  injectTypes: ['swpc_message'],
  check(fields: Fields) {
    const kind = str(fields.productKind)
    const headline = str(fields.headline)
    return [
      ...lintMessageCode(str(fields.messageCode), kind, headline).map(at('fields.messageCode')),
      ...lintSwpcIssueTime(str(fields.issueTime)).map(at('fields.issueTime')),
      ...lintProductKind(kind, headline).map(at('fields.headline')),
    ]
  },
}

const cmeArrival: FieldLintRule = {
  id: 'space.cme_arrival',
  injectTypes: ['swpc_cme_discussion'],
  check(fields: Fields) {
    const a = fields.arrival as Fields | undefined
    if (!a) return []
    return [
      ...lintSwpcIssueTime(str(fields.issueTime)).map(at('fields.issueTime')),
      ...lintCmeArrival({
        earliest: str(a.earliest),
        mostLikely: str(a.mostLikely),
        latest: str(a.latest),
      }).map(at('fields.arrival')),
    ]
  },
}

const icaoAdvisory: FieldLintRule = {
  id: 'space.icao_advisory',
  injectTypes: ['icao_space_weather_advisory'],
  check(fields: Fields) {
    const forecasts = Array.isArray(fields.forecasts)
      ? (fields.forecasts as Fields[]).map((f) => ({ hours: str(f.hours) }))
      : undefined
    return lintIcaoAdvisory({
      dtg: typeof fields.dtg === 'string' ? fields.dtg : undefined,
      advisoryNumber: typeof fields.advisoryNumber === 'string' ? fields.advisoryNumber : undefined,
      effect: typeof fields.effect === 'string' ? fields.effect : undefined,
      forecasts,
    }).map(at('fields'))
  },
}

for (const r of [scaleMapping, swpcMessage, cmeArrival, icaoAdvisory]) registerFieldLintRule(r)
