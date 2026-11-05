// The wildfire toolkit's format rules (spec 0461 FR-6), registered as field lint rules so they
// run over the injects of the types they read and feed the repair round of the inject text
// stage. Importing this module registers them; lint-rules.ts lists it.
import { registerFieldLintRule, type FieldLintRule } from '../field-lint'
import { lintContainment, lintZoneNotice, type ZoneRow } from './lint'

type Fields = Record<string, unknown>

const str = (v: unknown): string => (typeof v === 'string' ? v : '')

function zoneRows(fields: Fields): ZoneRow[] {
  if (!Array.isArray(fields.zones)) return []
  return (fields.zones as Fields[])
    .filter((z) => typeof z.zone === 'string' && typeof z.status === 'string')
    .map((z) => ({ zone: z.zone as string, status: z.status as string }))
}

const zoneStatus: FieldLintRule = {
  id: 'wildfire.zone_status',
  injectTypes: ['wildfire_evacuation_notice'],
  check(fields: Fields) {
    const zones = zoneRows(fields)
    if (!zones.length) return []
    return lintZoneNotice({
      zones,
      headline: str(fields.headline),
      text: [fields.action, fields.routes, fields.shelters, fields.accessNeeds, fields.reentryRules]
        .map(str)
        .filter(Boolean),
    }).map((i) => ({ path: 'fields.zones', message: i.message }))
  },
}

const containment: FieldLintRule = {
  id: 'wildfire.containment',
  injectTypes: ['wildfire_incident_summary', 'wildfire_ics_209'],
  check(fields: Fields) {
    const pct = typeof fields.containmentPct === 'number' ? fields.containmentPct : undefined
    const text = ['sizeNote', 'activity', 'outlook', 'remarks', 'evacuations', 'changes']
      .flatMap((k) => (Array.isArray(fields[k]) ? (fields[k] as unknown[]) : [fields[k]]))
      .map(str)
      .filter(Boolean)
    return lintContainment({ containmentPct: pct, text }).map((i) => ({
      path: 'fields.containmentPct',
      message: i.message,
    }))
  },
}

for (const r of [zoneStatus, containment]) registerFieldLintRule(r)
