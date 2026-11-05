// The outbreak-at-sea toolkit's format rules (spec 0470 FR-4) as field lint rules. Importing this
// module registers them (lint-rules.ts lists it). A rule with nothing structured to check
// reports nothing.
import { registerFieldLintRule, type FieldLintIssue, type FieldLintRule } from '../field-lint'
import {
  checkCumulative,
  checkIsolationLetter,
  checkNoMedicalAdvice,
  checkPercents,
  checkReportTiming,
  percentOf,
  type HospLintProblem,
  type ReportType,
} from './lint'

const num = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) ? v : undefined
const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined)
const rec = (v: unknown): Record<string, unknown> | undefined =>
  typeof v === 'object' && v !== null && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : undefined

const issues = (ps: HospLintProblem[], path = 'fields'): FieldLintIssue[] =>
  ps.map((p) => ({ path, message: p.message }))

function counts(f: Record<string, unknown>) {
  const pob = num(f.passengersOnBoard)
  const cob = num(f.crewOnBoard)
  const pc = num(f.passengerCases)
  const cc = num(f.crewCases)
  if (pob === undefined || cob === undefined || pc === undefined || cc === undefined) return null
  return { pob, cob, pc, cc, pp: str(f.passengerPercent), cp: str(f.crewPercent) }
}

const percent: FieldLintRule = {
  id: 'hosp_age_percent',
  injectTypes: ['age_cumulative_report'],
  check(f) {
    const c = counts(f)
    if (!c?.pp || !c.cp) return []
    return issues(
      checkPercents([
        { group: 'passengers', onBoard: c.pob, cases: c.pc, printed: c.pp },
        { group: 'crew', onBoard: c.cob, cases: c.cc, printed: c.cp },
      ]),
    )
  },
}

const cumulative: FieldLintRule = {
  id: 'hosp_age_cumulative',
  injectTypes: ['age_cumulative_report'],
  check(f) {
    const c = counts(f)
    const prev = rec(f.previousReport)
    const pp = num(prev?.passengerCases)
    const pcrew = num(prev?.crewCases)
    if (!c || pp === undefined || pcrew === undefined) return []
    return issues(
      checkCumulative({ passengers: c.pc, crew: c.cc }, { passengers: pp, crew: pcrew }),
    )
  },
}

const timing: FieldLintRule = {
  id: 'hosp_age_report_timing',
  injectTypes: ['age_cumulative_report'],
  check(f) {
    const c = counts(f)
    const h = num(f.hoursBeforeArrival)
    const type = str(f.reportType)
    if (!c || h === undefined || !type) return []
    return issues(
      checkReportTiming({
        type: type as ReportType,
        hoursBeforeArrival: h,
        passengerPercent: percentOf(c.pc, c.pob),
        crewPercent: percentOf(c.cc, c.cob),
      }),
      'fields.reportType',
    )
  },
}

const LETTER_TYPES = ['guest_letter', 'press_release', 'sitrep', 'memo'] as const

/** Every string in the fields, depth first. */
function allStrings(f: Record<string, unknown>): string[] {
  const out: string[] = []
  const walk = (v: unknown): void => {
    if (typeof v === 'string') out.push(v)
    else if (Array.isArray(v)) v.forEach(walk)
    else if (rec(v)) Object.values(rec(v)!).forEach(walk)
  }
  walk(f)
  return out
}

const medicalAdvice: FieldLintRule = {
  id: 'hosp_letter_no_medical_advice',
  injectTypes: LETTER_TYPES,
  check: (f) => issues(checkNoMedicalAdvice(allStrings(f))),
}

const isolation: FieldLintRule = {
  id: 'hosp_isolation_letter',
  injectTypes: ['guest_letter'],
  check(f) {
    if (str(f.letterKind) !== 'Cabin isolation') return []
    return issues(checkIsolationLetter(allStrings(f)))
  },
}

for (const r of [percent, cumulative, timing, medicalAdvice, isolation]) registerFieldLintRule(r)
