// The structures toolkit's format rules (spec 0471 FR-4) as field lint rules: they run on the
// injects of the types below, so an inject with a wrong placard color, an OSHA clock that does
// not match its event, a depth rule for engineered trenches, a building declared unsafe by the
// wrong person or a pick that continues past the wind limit goes back to the model with the
// issue named. Importing this module registers them (lint-rules.ts lists it). A rule with
// nothing structured to check reports nothing.
import { registerFieldLintRule, type FieldLintIssue, type FieldLintRule } from '../field-lint'
import {
  checkAuthority,
  checkCraneWind,
  checkExcavationProse,
  checkExcavationRecord,
  checkOshaProse,
  checkOshaRecord,
  checkPlacardWords,
  type StructuresProblem,
  type WindReading,
} from './lint'

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined)

/** Every string in `value`, depth first, skipping the `figures` field (drawn data, not prose). */
function strings(value: unknown, out: string[] = [], key = ''): string[] {
  if (key === 'figures') return out
  if (typeof value === 'string') out.push(value)
  else if (Array.isArray(value)) for (const v of value) strings(v, out)
  else if (isRecord(value)) for (const [k, v] of Object.entries(value)) strings(v, out, k)
  return out
}

const issues = (ps: StructuresProblem[], path = 'fields'): FieldLintIssue[] =>
  ps.map((p) => ({ path, message: p.message }))

const PROSE_TYPES = [
  'construction_incident_report',
  'stop_work_order',
  'osha_report_record',
  'construction_change_request',
  'unsafe_building_order',
  'rapid_evaluation_form',
  'detailed_evaluation_form',
  'inspection_assignment_log',
  'utility_strike_report',
  'excavation_inspection_record',
  'crane_lift_record',
  'fixed_equipment_checklist',
  'building_placard',
  'sitrep',
  'memo',
  'email',
  'press_release',
  'official_letter',
  'ics_213_general_message',
] as const

const PLACARD_TYPES = [
  'building_placard',
  'rapid_evaluation_form',
  'detailed_evaluation_form',
  'inspection_assignment_log',
  'unsafe_building_order',
  'sitrep',
  'memo',
  'press_release',
  'official_letter',
] as const

const placardWords: FieldLintRule = {
  id: 'structures.placard_words',
  injectTypes: PLACARD_TYPES,
  check: (f) => {
    const cats = [str(f.category), str(f.placard), str(f.priorPlacard)].filter(
      (c): c is string => c !== undefined && c !== 'None',
    )
    const rows = Array.isArray(f.buildings) ? f.buildings : []
    const rowCats = rows.flatMap((r) =>
      isRecord(r) && typeof r.placard === 'string' && r.placard !== 'None yet' ? [r.placard] : [],
    )
    const bad = [...cats, ...rowCats].flatMap((c) => checkPlacardWords(c, []))
    return issues([...bad, ...checkPlacardWords(undefined, strings(f))])
  },
}

const oshaClock: FieldLintRule = {
  id: 'structures.osha_clock',
  injectTypes: PROSE_TYPES,
  check: (f) => [
    ...issues(
      checkOshaRecord({
        eventType: str(f.eventType),
        clockHours: str(f.clockHours),
        occurredAt: str(f.occurredAt),
        dueBy: str(f.dueBy),
      }),
    ),
    ...issues(checkOshaProse(strings(f))),
  ],
}

const excavationRules: FieldLintRule = {
  id: 'structures.excavation_rules',
  injectTypes: PROSE_TYPES,
  check: (f) => [
    ...issues(
      checkExcavationRecord({
        depthFt: str(f.depthFt),
        protectiveSystem: str(f.protectiveSystem),
        soilType: str(f.soilType),
      }),
    ),
    ...issues(checkExcavationProse(strings(f))),
  ],
}

const authority: FieldLintRule = {
  id: 'structures.authority',
  injectTypes: PROSE_TYPES,
  check: (f) => issues(checkAuthority(strings(f))),
}

const craneWind: FieldLintRule = {
  id: 'structures.crane_wind',
  injectTypes: ['crane_lift_record'],
  check: (f) => {
    const log: WindReading[] = Array.isArray(f.windLog)
      ? f.windLog.flatMap((r): WindReading[] =>
          isRecord(r)
            ? [
                {
                  time: str(r.time) ?? '',
                  avgMph: str(r.avgMph) ?? '',
                  gustMph: str(r.gustMph) ?? '',
                  action: str(r.action) ?? '',
                },
              ]
            : [],
        )
      : []
    return issues(checkCraneWind(str(f.windLimitMph), log), 'fields.windLog')
  },
}

for (const r of [placardWords, oshaClock, excavationRules, authority, craneWind])
  registerFieldLintRule(r)
