// The `erg_distance_untabled` field lint rule (spec 0456 FR-6), registered with the field lint
// registry so it runs on the injects of the types the hazmat toolkit adds and on the common
// report types a hazmat exercise uses. Importing this module registers it; lint-rules.ts lists it.
import { registerFieldLintRule } from '../field-lint'
import { ergDistanceUntabled } from '../erg-distance-lint'

const TYPES = [
  'protective_action_order',
  'protective_action_recommendation',
  'hazmat_entry_briefing',
  'hazmat_shipping_paper',
  'chemtrec_call_record',
  'air_monitoring_log',
  'sds_excerpt',
  'sitrep',
  'field_report',
  'press_release',
  'incident_alert_notification',
  'memo',
  'email',
] as const

/** Every string in the fields, one per line, so the rule reads a sentence at a time. */
function textOf(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string') out.push(value)
  else if (Array.isArray(value)) for (const v of value) textOf(v, out)
  else if (value && typeof value === 'object') for (const v of Object.values(value)) textOf(v, out)
  return out
}

registerFieldLintRule({
  id: 'erg_distance_untabled',
  injectTypes: TYPES,
  check: (fields) =>
    ergDistanceUntabled(textOf(fields).join('\n')).map((f) => ({
      path: 'fields',
      message: f.message,
    })),
})
