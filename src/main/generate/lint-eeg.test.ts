import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Scenario, type CriticalTask } from '@shared/schemas'
import {
  EEG_CAPABILITY_MISSING,
  EEG_CAPABILITY_UNKNOWN,
  EEG_COLLAPSED,
  EEG_GUIDE_MISSING,
  EEG_ROW_UNCOVERED,
  EEG_TASK_UNCITED,
  EEG_TASK_UNLINKED,
  hasEvaluation,
  lintEeg,
} from './lint-eeg'
import { lintScenario } from './lint'

const base = Scenario.parse(
  JSON.parse(readFileSync(resolve('tests/fixtures/scenarios/scenario-3.json'), 'utf8')),
)

const citation = {
  documentId: 'tirp',
  documentTitle: 'Terminal Incident Response Plan',
  headingPath: 'TIRP › Section 13 › 13.6 Scenario C: FIDS / BHS System Failure',
}

const task = (id: string, over: Partial<CriticalTask> = {}): CriticalTask => ({
  id,
  capability: 'infrastructure_systems',
  task: `Task ${id}`,
  citation,
  rowIds: ['I-09'],
  objectiveRefs: [],
  locked: false,
  ...over,
})

const codes = (s: Scenario) => lintEeg(s).map((w) => w.code)

describe('lintEeg', () => {
  it('is silent for a scenario that has no evaluation yet', () => {
    const s = { ...base, evaluation: { objectiveCapabilities: [], eegs: [] } }
    expect(hasEvaluation(s)).toBe(false)
    expect(lintEeg(s)).toEqual([])
    expect(lintScenario(s).some((w) => w.code.startsWith('EEG_'))).toBe(false)
  })

  it('warns about objectives with no capability', () => {
    const s: Scenario = {
      ...base,
      evaluation: {
        objectiveCapabilities: [
          { objectiveId: 'obj-decision', capability: 'operational_coordination', why: '' },
        ],
        eegs: [],
      },
    }
    const missing = lintEeg(s).filter((w) => w.code === EEG_CAPABILITY_MISSING)
    expect(missing.map((w) => w.message)).toEqual([
      'Objective "Communication" is mapped to no Core Capability',
      'Objective "Technical Analysis" is mapped to no Core Capability',
    ])
    expect(missing[0]?.severity).toBe('warning')
    // No EEGs yet: rows cannot be uncovered.
    expect(codes(s)).not.toContain(EEG_ROW_UNCOVERED)
  })

  it('warns when one guide covers more than two objectives or a mapped capability has none', () => {
    const guide = (capability: 'infrastructure_systems' | 'planning') => ({
      capability,
      target: '',
      objectiveRefs: [],
      criticalTasks: [task('T-01', { capability })],
    })
    const s: Scenario = {
      ...base,
      evaluation: {
        objectiveCapabilities: base.objectives.map((o, i) => ({
          objectiveId: o.id,
          capability: i === 0 ? ('planning' as const) : ('infrastructure_systems' as const),
          why: '',
        })),
        eegs: [guide('infrastructure_systems')],
      },
    }
    expect(base.objectives.length).toBeGreaterThan(2)
    expect(codes(s)).toContain(EEG_COLLAPSED)
    const missing = lintEeg(s).filter((w) => w.code === EEG_GUIDE_MISSING)
    expect(missing.map((w) => w.message)).toEqual(['"Planning" has no evaluation guide'])
    const fixed = {
      ...s,
      evaluation: { ...s.evaluation, eegs: [guide('infrastructure_systems'), guide('planning')] },
    }
    expect(codes(fixed)).not.toContain(EEG_COLLAPSED)
    expect(codes(fixed)).not.toContain(EEG_GUIDE_MISSING)
  })

  it('notes unlinked tasks and uncovered non-control rows', () => {
    const s: Scenario = {
      ...base,
      evaluation: {
        objectiveCapabilities: base.objectives.map((o) => ({
          objectiveId: o.id,
          capability: 'infrastructure_systems' as const,
          why: '',
        })),
        eegs: [
          {
            capability: 'infrastructure_systems',
            target: '',
            objectiveRefs: [],
            criticalTasks: [task('T-01'), task('T-02', { rowIds: [] })],
          },
        ],
      },
    }
    const out = lintEeg(s)
    expect(out.filter((w) => w.code === EEG_TASK_UNLINKED)).toMatchObject([
      { severity: 'info', message: 'Critical task T-02 ("Task T-02") is linked to no MSEL row' },
    ])
    const uncovered = out.filter((w) => w.code === EEG_ROW_UNCOVERED)
    expect(uncovered.map((w) => w.rowId)).not.toContain('I-09')
    expect(uncovered.map((w) => w.rowId)).toContain('I-06')
    expect(uncovered.map((w) => w.rowId)).not.toContain('START')
    expect(uncovered[0]?.severity).toBe('info')
    expect(codes(s)).not.toContain(EEG_CAPABILITY_MISSING)
  })

  it('flags a task without a plan section as an error and an unknown capability as a warning', () => {
    const s = {
      ...base,
      evaluation: {
        objectiveCapabilities: [{ objectiveId: 'obj-decision', capability: 'resilience', why: '' }],
        eegs: [
          {
            capability: 'infrastructure_systems',
            target: '',
            objectiveRefs: [],
            criticalTasks: [task('T-01', { citation: { ...citation, headingPath: '' } })],
          },
        ],
      },
    } as unknown as Scenario
    const out = lintEeg(s)
    expect(out.find((w) => w.code === EEG_TASK_UNCITED)).toMatchObject({ severity: 'error' })
    expect(out.find((w) => w.code === EEG_CAPABILITY_UNKNOWN)).toMatchObject({
      severity: 'warning',
      message: '"resilience" is not one of the 32 Core Capabilities',
    })
  })
})
