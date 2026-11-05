// PREP exercise support (#782): the Appendix A list, objective sets per plan type, cycle
// arithmetic, coverage across exercises, play tags and the exercise record's fields.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ConductDetails } from '../schemas/scenario'
import { INJECT_TYPE_IDS } from '../taxonomy'
import {
  CORE_COMPONENTS,
  DECISION_COMPONENTS,
  INJECT_TYPE_COMPONENTS,
  PREP_PLAN_RULES,
  PREP_PLAN_TYPES,
  PrepSettings,
  buildPrepRecord,
  componentEvidence,
  cycleCoverage,
  cycleLine,
  cyclePosition,
  defaultPlanType,
  prepObjectives,
  wcdObjectiveId,
} from './index'

const settings = (over: Record<string, unknown> = {}) =>
  PrepSettings.parse({ exerciseKind: 'imt_tabletop', planType: 'pipeline', ...over })

describe('Appendix A core components', () => {
  it('lists the 15 components in the guidelines order, A.1 to A.15', () => {
    expect(CORE_COMPONENTS.map((c) => c.ref)).toEqual(
      Array.from({ length: 15 }, (_, i) => `A.${i + 1}`),
    )
    expect(CORE_COMPONENTS.map((c) => c.name.split(' (')[0])).toEqual([
      'Notifications',
      'Staff mobilization',
      'Operate within the response management system',
      'Source control',
      'Assessment',
      'Containment',
      'Mitigation',
      'Protection',
      'Disposal',
      'Communications',
      'Transportation',
      'Personnel support',
      'Equipment maintenance and support',
      'Procurement',
      'Documentation',
    ])
  })

  it("keeps protection's four sub-items (booming, intakes, wildlife, population)", () => {
    const protection = CORE_COMPONENTS.find((c) => c.id === 'protection')!
    expect(protection.subs).toHaveLength(4)
    expect(protection.subs.join(' ')).toMatch(/Water intake/)
  })
})

describe('objective sets', () => {
  it('give the IMT tabletop objectives A to I for facilities, with the countermeasure objective', () => {
    const ids = prepObjectives('inland_facility').map((x) => x.id)
    expect(ids).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'])
    expect(prepObjectives('inland_facility')[1]?.text).toBe('Proper notifications')
  })

  it('differ by plan type where the guidelines differ', () => {
    expect(prepObjectives('vessel').map((x) => x.id)).toEqual('ABCDEFGHIJK'.split(''))
    expect(prepObjectives('vessel')[3]?.text).toMatch(/resource providers/)
    expect(prepObjectives('area')[0]?.text).toBe('Knowledge of the Area Contingency Plan')
    expect(prepObjectives('area').map((x) => x.id)).toEqual('ABCDEFGHIJ'.split(''))
  })

  it('every plan type asks for a worst case discharge scenario', () => {
    for (const t of PREP_PLAN_TYPES) {
      const id = wcdObjectiveId(t)
      expect(prepObjectives(t).find((x) => x.id === id)?.text).toMatch(/worst case discharge/i)
    }
  })

  it('records retention, verification and cycle as the guidelines state them', () => {
    expect(PREP_PLAN_RULES.inland_facility.retention).toBe('Five years')
    expect(PREP_PLAN_RULES.inland_facility.verification).toBe('EPA')
    expect(PREP_PLAN_RULES.pipeline.retention).toBe('Three years')
    expect(PREP_PLAN_RULES.vessel.cycleYears).toBe(3)
    expect(PREP_PLAN_RULES.area.cycleYears).toBe(4)
    expect(defaultPlanType('area_exercise')).toBe('area')
  })
})

describe('cycle position', () => {
  it('counts the year of a triennial cycle', () => {
    const at = (d: string) => cyclePosition('pipeline', '2025-01-01', d)
    expect(at('2025-01-01')).toMatchObject({ yearOfCycle: 1, cycleEnd: '2027-12-31', status: 'in' })
    expect(at('2025-12-31').yearOfCycle).toBe(1)
    expect(at('2026-01-01').yearOfCycle).toBe(2)
    expect(at('2027-12-31')).toMatchObject({ yearOfCycle: 3, daysLeft: 0 })
    expect(at('2028-01-01')).toMatchObject({ status: 'after', yearOfCycle: 4 })
    expect(at('2024-12-31')).toMatchObject({ status: 'before', yearOfCycle: 0 })
  })

  it('uses four years for an Area Contingency Plan and words the position', () => {
    const p = cyclePosition('area', '2024-06-01', '2027-07-01')
    expect(p).toMatchObject({ cycleYears: 4, yearOfCycle: 4, cycleEnd: '2028-05-31' })
    expect(cycleLine(p)).toBe('Year 4 of the 4-year cycle that began 2024-06-01 (ends 2028-05-31)')
  })

  it('refuses a date that is not ISO', () => {
    expect(() => cyclePosition('vessel', '01/01/2025', '2025-02-01')).toThrow(/ISO/)
  })
})

describe('coverage', () => {
  const ex = (
    date: string,
    ...components: Parameters<typeof cycleCoverage>[0][number]['components'][number][]
  ) => ({
    date,
    components,
  })

  it('shows which components each cycle has exercised and which are missing', () => {
    const cov = cycleCoverage(
      [
        ex('2025-05-01', 'notifications', 'communications'),
        ex('2026-05-01', 'notifications', 'protection'),
      ],
      { start: '2025-01-01', end: '2027-12-31' },
    )
    expect(cov.covered).toBe(3)
    expect(cov.applicable).toBe(15)
    expect(cov.percent).toBe(20)
    expect(cov.missing).toHaveLength(12)
    const notif = cov.rows.find((r) => r.component.id === 'notifications')!
    expect(notif).toMatchObject({ count: 2, firstDate: '2025-05-01' })
  })

  it('leaves out exercises outside the cycle and components that do not apply', () => {
    const cov = cycleCoverage(
      [ex('2024-05-01', 'disposal'), ex('2025-05-01', 'notifications')],
      { start: '2025-01-01', end: '2027-12-31' },
      ['source_control', 'transportation'],
    )
    expect(cov.applicable).toBe(13)
    expect(cov.covered).toBe(1)
    expect(cov.missing).not.toContain('source_control')
    expect(cov.missing).toContain('disposal')
  })
})

describe('play tags', () => {
  it('names real inject types and keeps the decision ids of the spill_plume toolkit', () => {
    for (const id of Object.keys(INJECT_TYPE_COMPONENTS)) {
      const builtin = INJECT_TYPE_IDS.includes(id)
      const inToolkit = (
        JSON.parse(
          readFileSync(join(process.cwd(), 'packs/toolkits/spill_plume.json'), 'utf8'),
        ) as {
          injectTypes: string[]
        }
      ).injectTypes.includes(id)
      expect(builtin || inToolkit, id).toBe(true)
    }
    expect(Object.keys(DECISION_COMPONENTS)).toContain('request_countermeasure')
  })

  it('collects the injects and decisions behind each component', () => {
    const ev = componentEvidence({
      injectTypes: ['nrc_report_record', 'press_release'],
      decisionIds: ['make_notifications', 'unknown_decision'],
    })
    expect(ev.get('notifications')).toEqual(['nrc_report_record', 'make_notifications'])
    expect(ev.get('communications')).toEqual(['nrc_report_record', 'press_release'])
    expect(ev.has('disposal')).toBe(false)
  })
})

describe('exercise record', () => {
  const base = {
    exerciseName: 'River Crossing 2026',
    dates: ['2026-11-04'],
    startTime: '0900',
    endTime: '1330',
    site: 'Operations center',
    description: 'A pipeline release to a creek.',
    participants: [
      { name: 'R. Hollis', organization: 'Corbin Valley', role: 'Qualified Individual' },
    ],
    play: { injectTypes: ['nrc_report_record', 'countermeasure_request'], decisionIds: [] },
  }

  it('fills identification, the cycle position and the retention reminder', () => {
    const f = buildPrepRecord({
      ...base,
      settings: settings({ planHolder: 'Corbin Valley Pipeline', cycleStart: '2025-01-01' }),
    })
    expect(f).toMatchObject({
      planHolder: 'Corbin Valley Pipeline',
      planType: 'Onshore pipeline response plan',
      exerciseType: 'PREP IMT tabletop',
      exerciseDate: '2026-11-04, 0900 to 1330',
      cyclePosition: 'Year 2 of the 3-year cycle that began 2025-01-01 (ends 2027-12-31)',
    })
    expect(f.retention).toMatch(/three years/)
    expect(f.retention).toMatch(/not legal advice/)
    expect(String(f.edition)).toContain('2016.1')
  })

  it('records the worst case discharge flag and each countermeasure', () => {
    const yes = buildPrepRecord({
      ...base,
      settings: settings({
        worstCaseDischarge: true,
        worstCaseNote: 'river crossing segment',
        countermeasuresInPlan: ['In-situ burning', 'Dispersant'],
        countermeasuresExercised: ['In-situ burning'],
      }),
    })
    expect(yes.worstCaseDischarge).toBe('Yes: river crossing segment')
    expect(yes.countermeasures).toEqual([
      { name: 'In-situ burning', exercised: 'Yes' },
      { name: 'Dispersant', exercised: 'No' },
    ])
    const no = buildPrepRecord({ ...base, settings: settings() })
    expect(String(no.worstCaseDischarge)).toMatch(/^No worst case/)
    const wcd = (r: Record<string, unknown>) =>
      (r.objectives as { id: string; result: string }[]).find((o) => o.id === 'I')?.result
    expect(wcd(yes)).toBe('Met')
    expect(wcd(no)).toBe('Not met')
  })

  it('marks every component, with evidence for the ones the play reached', () => {
    const f = buildPrepRecord({
      ...base,
      settings: settings({ notApplicable: ['source_control'] }),
    }) as { components: { ref: string; exercised: string; evidence: string }[] }
    expect(f.components).toHaveLength(15)
    expect(f.components[0]).toMatchObject({
      ref: 'A.1',
      exercised: 'Yes',
      evidence: 'nrc_report_record',
    })
    expect(f.components[3]).toMatchObject({ ref: 'A.4', exercised: 'Not applicable to the plan' })
    expect(f.components[6]).toMatchObject({ ref: 'A.7', exercised: 'Yes' })
    expect(f.components[8]).toMatchObject({ ref: 'A.9', exercised: 'No' })
  })

  it('leaves the signature to the plan holder and marks objectives nobody evaluated as not evaluated', () => {
    const f = buildPrepRecord({ ...base, settings: settings() }) as {
      certifierName: string
      objectives: { result: string }[]
    }
    expect(f.certifierName).toBe('')
    expect(f.objectives.filter((o) => o.result === 'Not evaluated').length).toBeGreaterThan(5)
  })
})

describe('conduct details', () => {
  it('carry optional PREP settings that older scenarios lack', () => {
    expect(ConductDetails.parse({}).prep).toBeUndefined()
    const c = ConductDetails.parse({ prep: { exerciseKind: 'area_exercise' } })
    expect(c.prep).toMatchObject({ exerciseKind: 'area_exercise', worstCaseDischarge: false })
    expect(() => ConductDetails.parse({ prep: { exerciseKind: 'drill' } })).toThrow()
  })
})
