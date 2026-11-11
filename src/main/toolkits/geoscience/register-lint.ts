// The earth science format checks (spec 0450 FR-7) as field lint rules: the text rules of
// shared/toolkits/geo-lint.ts run over every text field of the injects of the types they read,
// plus checks that read a field directly (an alert level against its color code, the date-time
// group of a notice, a tsunami watch marked as sent by wireless alert). Importing this module
// registers them; lint-rules.ts lists it.
import {
  alertColorAllowed,
  alertColorWords,
  GEO_LINT_RULES,
} from '../../../shared/toolkits/geo-lint'
import { registerFieldLintRule, type FieldLintIssue, type FieldLintRule } from '../field-lint'

type Fields = Record<string, unknown>

const SEISMIC = [
  'earthquake_event_summary',
  'pager_alert',
  'aftershock_forecast',
  'eew_alert',
  'eew_action_log',
  'lifeline_status_board',
  'ground_failure_summary',
  'building_placard',
]
const VOLCANIC = [
  'volcano_activity_notice',
  'vona',
  'volcano_alert_badge',
  'volcanic_ash_advisory',
  'lahar_warning',
]
const TSUNAMI = ['tsunami_message', 'tsunami_threat_message']
const DEBRIS = [
  'debris_flow_assessment',
  'rainfall_threshold_guidance',
  'hazard_road_closure',
  'ground_failure_summary',
]
const PUBLIC = ['sitrep', 'press_release', 'memo', 'tweet', 'facebook_post', 'text_message']

/** Every string in the fields with its path, so a finding points at the field that holds it. */
function leaves(value: unknown, path: string, out: { path: string; text: string }[] = []) {
  if (typeof value === 'string') out.push({ path, text: value })
  else if (Array.isArray(value)) value.forEach((v, i) => leaves(v, `${path}[${i}]`, out))
  else if (value && typeof value === 'object')
    for (const [k, v] of Object.entries(value)) leaves(v, `${path}.${k}`, out)
  return out
}

function textRule(
  id: string,
  injectTypes: readonly string[],
  extra?: (f: Fields) => FieldLintIssue[],
): FieldLintRule {
  const run = GEO_LINT_RULES[id]!
  return {
    id,
    injectTypes,
    check(fields) {
      const found = leaves(fields, 'fields').flatMap((l) =>
        run(l.text).map((hit) => ({ path: l.path, message: hit.message })),
      )
      return [...found, ...(extra?.(fields) ?? [])]
    },
  }
}

const DTG = /^\d{8}\/\d{4}Z$/

const alertPair = (f: Fields): FieldLintIssue[] => {
  const level = String(f.alertLevel ?? '')
  const color = String(f.colorCode ?? '')
  if (!level || !color || level === 'UNASSIGNED' || color === 'UNASSIGNED') return []
  return alertColorAllowed(level, color)
    ? []
    : [
        {
          path: 'fields.colorCode',
          message: `Alert level ${level} pairs with aviation color code ${alertColorWords(level)}, not ${color}.`,
        },
      ]
}

const noticeSyntax = (f: Fields): FieldLintIssue[] => {
  const out: FieldLintIssue[] = []
  if (typeof f.dtg === 'string' && !DTG.test(f.dtg))
    out.push({
      path: 'fields.dtg',
      message: 'The date-time group is written YYYYMMDD/HHMMZ in UTC.',
    })
  if (typeof f.psn === 'string' && !/^[NS]\d{4,6} [EW]\d{5,7}$/.test(f.psn))
    out.push({
      path: 'fields.psn',
      message: 'The position is written like N4652 W12145 (degrees and minutes).',
    })
  if (typeof f.noticeNumber === 'string' && !/^\d{4}\/[A-Z]?\d+$/.test(f.noticeNumber))
    out.push({
      path: 'fields.noticeNumber',
      message: 'The notice number is the year, a slash and a number (2026/147).',
    })
  return out
}

const watchNotWireless = (f: Fields): FieldLintIssue[] =>
  f.level === 'Tsunami Watch' && f.wirelessAlertSent === true
    ? [
        {
          path: 'fields.wirelessAlertSent',
          message: 'A tsunami watch is not sent as a Wireless Emergency Alert.',
        },
      ]
    : []

const RULES: FieldLintRule[] = [
  textRule('magnitude_intensity_labels', [...SEISMIC, ...TSUNAMI, ...PUBLIC]),
  textRule('alert_level_color_pair', [...VOLCANIC, ...PUBLIC], alertPair),
  {
    id: 'volcano_notice_syntax',
    injectTypes: ['vona', 'volcanic_ash_advisory'],
    check: noticeSyntax,
  },
  textRule('eew_timing_limits', ['eew_alert', 'eew_action_log', ...PUBLIC]),
  textRule('aftershock_probability_wording', ['aftershock_forecast', ...PUBLIC]),
  textRule(
    'tsunami_message_levels',
    [...TSUNAMI, 'cap_alert', 'eas_broadcast', ...PUBLIC],
    watchNotWireless,
  ),
  textRule('tsunami_local_distant_timing', [...TSUNAMI, ...PUBLIC]),
  textRule('debris_flow_rainfall_wording', [...DEBRIS, ...PUBLIC]),
  textRule('ground_failure_regional_wording', ['ground_failure_summary', ...PUBLIC]),
]

for (const r of RULES) registerFieldLintRule(r)
