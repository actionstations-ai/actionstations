// The clinical field lint rules on the previews of the clinical templates and on broken copies.
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { deriveFields } from '../../render/derived'
import { fieldLintIssues, fieldLintRuleIds } from '../lint-rules'

const CLINICAL_TYPES = [
  'clinical_lab_panel',
  'medication_administration_record',
  'sbar_handoff',
  'triage_tag',
  'staffing_grid',
  'rapid_response_record',
  'patient_event_report',
  'isolation_cohort_board',
  'evacuation_priority_list',
  'debrief_guide',
  'learner_feedback_form',
]

const preview = (type: string): Record<string, unknown> =>
  (
    JSON.parse(readFileSync(resolve(`templates/injects/${type}/preview.json`), 'utf8')) as {
      fields: Record<string, unknown>
    }
  ).fields

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T

describe('clinical field lint rules', () => {
  it('registers every rule the toolkit names', () => {
    expect(fieldLintRuleIds()).toEqual(
      expect.arrayContaining([
        'clinical_lab_flags',
        'dose_plausibility',
        'evacuation_list',
        'sbar_complete',
        'staffing_math',
        'triage_consistency',
      ]),
    )
  })

  it.each(CLINICAL_TYPES)('finds nothing wrong in the %s preview', (type) => {
    expect(fieldLintIssues(type, preview(type))).toEqual([])
  })

  it('catches a lab flag that disagrees with the range', () => {
    const f = preview('clinical_lab_panel')
    ;(f.results as Record<string, string>[])[0]!.flag = 'H'
    const issues = fieldLintIssues('clinical_lab_panel', f)
    expect(issues).toHaveLength(1)
    expect(issues[0]!.path).toBe('fields.results[0].flag')
  })

  it('catches an implausible dose and a missing reason', () => {
    const f = preview('medication_administration_record')
    const meds = f.medications as Record<string, string>[]
    meds[0]!.dose = '6500 mg'
    meds[2]!.reason = ''
    const paths = fieldLintIssues('medication_administration_record', f).map((i) => i.path)
    expect(paths).toEqual(['fields.medications[0].dose', 'fields.medications[2].reason'])
  })

  it('catches a read-back that is marked but empty', () => {
    const f = clone(preview('sbar_handoff'))
    f.readBack = ''
    expect(fieldLintIssues('sbar_handoff', f).map((i) => i.path)).toEqual(['fields.readBack'])
  })

  it('catches a triage tag that contradicts its findings', () => {
    const f = clone(preview('triage_tag'))
    f.category = 'Minor'
    expect(fieldLintIssues('triage_tag', f)[0]!.message).toMatch(/give Immediate/)
  })

  it('catches assignments that do not add up to the census', () => {
    const f = clone(preview('staffing_grid'))
    f.census = 40
    expect(fieldLintIssues('staffing_grid', f)[0]!.message).toMatch(
      /18 patients but the census is 40/,
    )
  })

  it('catches a duplicated patient and a repeated rank on an evacuation list', () => {
    const f = clone(preview('evacuation_priority_list'))
    const rows = f.patients as Record<string, unknown>[]
    rows[1]!.name = rows[0]!.name
    rows[1]!.rank = 1
    expect(fieldLintIssues('evacuation_priority_list', f)).toHaveLength(2)
  })

  it('derives the staffing grid arithmetic from the written numbers', () => {
    const derived = deriveFields('staffing_grid', preview('staffing_grid')) as {
      shifts: { onDuty: number; shortBy: number }[]
    }
    expect(derived.shifts.map((s) => [s.onDuty, s.shortBy])).toEqual([
      [3, 1],
      [4, 0],
    ])
  })

  it('has a template folder for every clinical type', () => {
    const dirs = new Set(readdirSync(resolve('templates/injects')))
    for (const type of CLINICAL_TYPES) expect(dirs.has(type)).toBe(true)
  })
})
