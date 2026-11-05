// PREP in the program view (#782): exercises of one plan holder form one cycle, coverage counts
// only exercises dated inside it, and the worst case discharge and countermeasure status follow.
import { describe, expect, it } from 'vitest'
import { prepCycles, SnapshotPrep, type PrepProgramExercise } from './program'

const exercise = (
  title: string,
  prep: Partial<SnapshotPrep>,
  projectName = 'Harlan Spur Pipeline',
): PrepProgramExercise => ({
  projectName,
  scenarioId: title.toLowerCase().replace(/\W+/g, '-'),
  title,
  prep: SnapshotPrep.parse({
    exerciseKind: 'imt_tabletop',
    planType: 'pipeline',
    planHolder: 'Harlan Spur Pipeline Company',
    date: '2026-03-10',
    cycleStart: '2026-01-01',
    components: ['notifications'],
    notApplicable: [],
    worstCaseDischarge: false,
    countermeasuresInPlan: [],
    countermeasuresExercised: [],
    ...prep,
  }),
})

describe('prepCycles', () => {
  it('joins the exercises of one plan holder across projects into a single cycle', () => {
    const [cycle, ...rest] = prepCycles([
      exercise('Year 1 tabletop', { components: ['notifications', 'containment'] }),
      exercise(
        'Year 2 tabletop',
        { date: '2027-03-09', components: ['mitigation'] },
        'Harlan Spur Terminal',
      ),
    ])
    expect(rest).toEqual([])
    expect(cycle!.exercises).toHaveLength(2)
    expect(cycle!.coverage.covered).toBe(3)
    expect(cycle!.coverage.applicable).toBe(15)
    expect(cycle!.cycleLine).toContain('Year 2 of the 3-year cycle that began 2026-01-01')
  })

  it('keeps different plan holders and plan types apart', () => {
    const cycles = prepCycles([
      exercise('A', {}),
      exercise('B', { planHolder: 'Marlow Bay Terminals' }),
      exercise('C', { planType: 'area', exerciseKind: 'area_exercise' }),
    ])
    expect(cycles).toHaveLength(3)
  })

  it('leaves out exercises dated outside the cycle and says how many', () => {
    const [cycle] = prepCycles([
      exercise('Old', { date: '2022-05-01', cycleStart: '2026-01-01', components: ['disposal'] }),
      exercise('Current', { components: ['notifications'] }),
    ])
    expect(cycle!.exercises.map((e) => e.title)).toEqual(['Current'])
    expect(cycle!.outsideCycle).toBe(1)
    expect(cycle!.coverage.rows.find((r) => r.component.id === 'disposal')!.count).toBe(0)
  })

  it('counts every exercise when no cycle start is entered', () => {
    const [cycle] = prepCycles([
      exercise('One', { cycleStart: undefined as never, components: ['notifications'] }),
      exercise('Two', {
        cycleStart: undefined as never,
        date: '2029-01-01',
        components: ['source_control'],
      }),
    ])
    expect(cycle!.cycleLine).toBe('')
    expect(cycle!.coverage.covered).toBe(2)
  })

  it('does not count a component the plan holder marked as not applicable', () => {
    const [cycle] = prepCycles([exercise('One', { notApplicable: ['source_control'] })])
    expect(cycle!.coverage.applicable).toBe(14)
    expect(cycle!.coverage.missing).not.toContain('source_control')
  })

  it('reports the worst case discharge and the countermeasures still open', () => {
    const [cycle] = prepCycles([
      exercise('Year 1', {
        countermeasuresInPlan: ['dispersant', 'in-situ burn'],
        countermeasuresExercised: ['dispersant'],
      }),
      exercise('Year 2', { date: '2027-03-09', worstCaseDischarge: true }),
    ])
    expect(cycle!.worstCaseDischarge).toBe(true)
    expect(cycle!.countermeasuresMissing).toEqual(['in-situ burn'])
  })
})
