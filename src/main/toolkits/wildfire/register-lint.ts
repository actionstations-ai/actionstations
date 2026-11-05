// The wildfire toolkit's format rules (spec 0461 FR-6), registered as field lint rules so they
// run over the injects of the types they read and feed the repair round of the inject text
// stage. Importing this module registers them; lint-rules.ts lists it.
import { registerFieldLintRule, type FieldLintIssue, type FieldLintRule } from '../field-lint'
import { lintAqiClaims, lintAqiPair, lintAqiRange } from './lint-air'
import { lintMedicalBaselineCounts, lintPartnerNoticeTiming } from './lint-shutoff'
import { lintContainment, lintZoneNotice, type ZoneRow } from './lint'

type Fields = Record<string, unknown>

const str = (v: unknown): string => (typeof v === 'string' ? v : '')

/** Every string in the fields, for text checks. */
function strings(v: unknown, out: string[] = []): string[] {
  if (typeof v === 'string') out.push(v)
  else if (Array.isArray(v)) v.forEach((x) => strings(x, out))
  else if (v && typeof v === 'object') Object.values(v).forEach((x) => strings(x, out))
  return out
}

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

const AIR_TYPES = [
  'wildfire_smoke_advisory',
  'wildfire_aqi_summary',
  'wildfire_school_air_notice',
  'wildfire_facility_air_status',
] as const

const aqiCategoryRule: FieldLintRule = {
  id: 'wildfire.aqi_category',
  injectTypes: AIR_TYPES,
  check(fields: Fields) {
    const issues: FieldLintIssue[] = []
    const pair = (aqi: unknown, category: unknown, pm25: unknown, path: string) => {
      if (typeof aqi !== 'number' || typeof category !== 'string') return
      const pm = typeof pm25 === 'number' ? pm25 : undefined
      for (const i of lintAqiPair({ aqi, category, pm25: pm }))
        issues.push({ path, message: i.message })
    }
    pair(fields.aqi, fields.category, undefined, 'fields.category')
    if (Array.isArray(fields.rows))
      (fields.rows as Fields[]).forEach((r, i) =>
        pair(r.aqi, r.category, r.pm25, `fields.rows[${i}].category`),
      )
    if (typeof fields.aqiRange === 'string' && typeof fields.category === 'string')
      for (const i of lintAqiRange(fields.aqiRange, fields.category))
        issues.push({ path: 'fields.aqiRange', message: i.message })
    for (const text of strings({ ...fields, rows: undefined }))
      for (const i of lintAqiClaims(text)) issues.push({ path: 'fields', message: i.message })
    return issues
  },
}

const pspsWindows: FieldLintRule = {
  id: 'wildfire.psps_windows',
  injectTypes: ['wildfire_psps_partner_notice'],
  check(fields: Fields) {
    const w = fields.window as Fields | undefined
    if (!w || typeof w.hoursAhead !== 'number') return []
    return lintPartnerNoticeTiming(w.hoursAhead).map((i) => ({
      path: 'fields.window.hoursAhead',
      message: i.message,
    }))
  },
}

const pspsCounts: FieldLintRule = {
  id: 'wildfire.psps_counts',
  injectTypes: ['wildfire_psps_post_event_report'],
  check(fields: Fields) {
    const m = fields.medicalBaseline as Fields | undefined
    if (!m) return []
    const { customers, attempted, reached } = m
    if (
      typeof customers !== 'number' ||
      typeof attempted !== 'number' ||
      typeof reached !== 'number'
    )
      return []
    return lintMedicalBaselineCounts({ customers, attempted, reached }).map((i) => ({
      path: 'fields.medicalBaseline',
      message: i.message,
    }))
  },
}

for (const r of [zoneStatus, containment, aqiCategoryRule, pspsWindows, pspsCounts])
  registerFieldLintRule(r)
