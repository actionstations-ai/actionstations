// Clinical care format checks (spec 0452 FR-4), registered as field lint rules: lab flags that
// agree with the ranges shown, SBAR with its read-back, plausible doses, triage categories that
// agree with the findings, staffing numbers that add up and an evacuation list without
// duplicates. Importing this module registers them.
import { doseProblem } from '../../../shared/clinical/dose'
import { flagProblem } from '../../../shared/clinical/lab'
import { triageProblem, type TriageCategory } from '../../../shared/clinical/triage'
import { registerFieldLintRule, type FieldLintIssue, type FieldLintRule } from '../field-lint'

type Fields = Record<string, unknown>

const asRows = (v: unknown): Record<string, unknown>[] =>
  Array.isArray(v)
    ? v.filter((x): x is Record<string, unknown> => !!x && typeof x === 'object')
    : []
const str = (v: unknown): string => (typeof v === 'string' ? v : '')
const issue = (path: string, message: string): FieldLintIssue => ({ path, message })

const labFlags: FieldLintRule = {
  id: 'clinical_lab_flags',
  injectTypes: ['clinical_lab_panel'],
  check(fields: Fields) {
    const out: FieldLintIssue[] = []
    asRows(fields.results).forEach((r, i) => {
      const problem = flagProblem({
        test: str(r.test),
        value: str(r.value),
        range: str(r.range),
        flag: str(r.flag),
      })
      if (problem) out.push(issue(`fields.results[${i}].flag`, problem))
      if (!str(r.units))
        out.push(issue(`fields.results[${i}].units`, `${str(r.test)} has no units`))
    })
    return out
  },
}

const sbarComplete: FieldLintRule = {
  id: 'sbar_complete',
  injectTypes: ['sbar_handoff'],
  check(fields: Fields) {
    const out: FieldLintIssue[] = []
    const done = fields.readBackDone === true
    if (done && !str(fields.readBack).trim())
      out.push(issue('fields.readBack', 'A read-back is marked done but its text is empty'))
    if (!done && str(fields.readBack).trim())
      out.push(issue('fields.readBackDone', 'A read-back is written but not marked done'))
    return out
  },
}

const doses: FieldLintRule = {
  id: 'dose_plausibility',
  injectTypes: ['medication_administration_record'],
  check(fields: Fields) {
    const out: FieldLintIssue[] = []
    asRows(fields.medications).forEach((m, i) => {
      const problem = doseProblem({ drug: str(m.drug), dose: str(m.dose), route: str(m.route) })
      if (problem) out.push(issue(`fields.medications[${i}].dose`, problem))
      const status = str(m.status)
      if (status === 'Given' && !str(m.givenAt))
        out.push(
          issue(
            `fields.medications[${i}].givenAt`,
            `${str(m.drug)} is Given but has no time and initials`,
          ),
        )
      if ((status === 'Held' || status === 'Late' || status === 'Refused') && !str(m.reason))
        out.push(
          issue(`fields.medications[${i}].reason`, `${str(m.drug)} is ${status} but has no reason`),
        )
    })
    return out
  },
}

const triage: FieldLintRule = {
  id: 'triage_consistency',
  injectTypes: ['triage_tag'],
  check(fields: Fields) {
    const method = fields.method === 'SALT' ? 'SALT' : 'START'
    const problem = triageProblem(str(fields.category) as TriageCategory, method, {
      walking: fields.walking === true,
      breathing: str(fields.breathing),
      perfusion: str(fields.perfusion),
      mentalStatus: str(fields.mentalStatus),
    })
    return problem ? [issue('fields.category', problem)] : []
  },
}

const staffing: FieldLintRule = {
  id: 'staffing_math',
  injectTypes: ['staffing_grid'],
  check(fields: Fields) {
    const out: FieldLintIssue[] = []
    asRows(fields.shifts).forEach((s, i) => {
      const scheduled = Number(s.scheduled ?? 0)
      const calledOut = Number(s.calledOut ?? 0)
      if (calledOut > scheduled)
        out.push(
          issue(
            `fields.shifts[${i}].calledOut`,
            `${str(s.shift)}: more nurses called out than scheduled`,
          ),
        )
    })
    const assigned = asRows(fields.assignments)
    const census = fields.census
    if (assigned.length && typeof census === 'number') {
      const total = assigned.reduce((n, a) => n + Number(a.patients ?? 0), 0)
      if (total !== census)
        out.push(
          issue(
            'fields.assignments',
            `Assignments cover ${total} patients but the census is ${census}`,
          ),
        )
    }
    return out
  },
}

const evacuation: FieldLintRule = {
  id: 'evacuation_list',
  injectTypes: ['evacuation_priority_list'],
  check(fields: Fields) {
    const out: FieldLintIssue[] = []
    const rows = asRows(fields.patients)
    const seen = new Set<string>()
    const ranks = new Set<number>()
    rows.forEach((p, i) => {
      const name = str(p.name).trim().toLowerCase()
      if (name && seen.has(name))
        out.push(issue(`fields.patients[${i}].name`, `${str(p.name)} appears twice`))
      seen.add(name)
      const rank = Number(p.rank)
      if (ranks.has(rank))
        out.push(issue(`fields.patients[${i}].rank`, `Rank ${rank} is used twice`))
      ranks.add(rank)
      if (!!str(p.destination) !== !!str(p.timeOut) && str(p.timeOut))
        out.push(
          issue(
            `fields.patients[${i}].destination`,
            `${str(p.name)} has a time out but no destination`,
          ),
        )
    })
    return out
  },
}

export const CLINICAL_LINT_RULES: readonly FieldLintRule[] = [
  labFlags,
  sbarComplete,
  doses,
  triage,
  staffing,
  evacuation,
]
for (const rule of CLINICAL_LINT_RULES) registerFieldLintRule(rule)
