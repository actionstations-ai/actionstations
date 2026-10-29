import { describe, expect, it } from 'vitest'
import type { CriticalTask, MselRow, Scenario } from '@shared/schemas'
import { criteriaForRow, expectedCriterionId, rowCriteria, tasksForRow } from './eeg-criteria'

const citation = {
  documentId: 'tirp',
  documentTitle: 'TIRP',
  headingPath: 'TIRP › Section 13 › 13.7 Checklist: Cybersecurity Incident',
}

const row = (
  id: string,
  purposeTag: MselRow['purposeTag'],
  expectedAction = `Act on ${id}`,
): MselRow => ({
  id,
  phaseId: 'p1',
  time: '0:10',
  from: 'Helpdesk',
  toRoleIds: ['it'],
  event: `Event ${id}`,
  expectedAction,
  purposeTag,
  citations: [],
  locked: false,
})

const task = (id: string, rowIds: string[]): CriticalTask => ({
  id,
  capability: 'cybersecurity',
  task: `Task ${id}`,
  citation,
  rowIds,
  objectiveRefs: [],
  locked: false,
})

const scenario = (tasks: CriticalTask[], rows: MselRow[]) =>
  ({
    msel: rows,
    evaluation: {
      objectiveCapabilities: [],
      eegs: [{ capability: 'cybersecurity', target: '', objectiveRefs: [], criticalTasks: tasks }],
    },
  }) as unknown as Scenario

describe('rowCriteria', () => {
  const rows = [
    row('START', 'STARTEX', 'Establish baseline operations.'),
    row('I-01', 'CORE_NARRATIVE'),
    row('I-02', 'CLUE'),
    row('I-03', 'NOISE', '   '),
    row('I-04', 'TIME_JUMP'),
    row('END', 'ENDEX'),
  ]

  it('gives every non-control row at least one criterion: its tasks, else its expected action', () => {
    const s = scenario([task('T-01', ['I-01']), task('T-02', ['I-01'])], rows)
    const criteria = rowCriteria(s)
    expect(criteria.filter((c) => c.rowId === 'I-01').map((c) => c.id)).toEqual(['T-01', 'T-02'])
    expect(criteria.filter((c) => c.rowId === 'I-02')).toEqual([
      { id: expectedCriterionId('I-02'), rowId: 'I-02', text: 'Act on I-02' },
    ])
    // Control cards and rows with no expected action get nothing of their own.
    expect(criteria.some((c) => ['START', 'I-03', 'I-04', 'END'].includes(c.rowId))).toBe(false)
  })

  it('carries the task, capability and citation on task criteria', () => {
    const s = scenario([task('T-01', ['I-01', 'I-04'])], rows)
    expect(criteriaForRow(s, rows[1]!)[0]).toEqual({
      id: 'T-01',
      rowId: 'I-01',
      text: 'Task T-01',
      taskId: 'T-01',
      capability: 'cybersecurity',
      citation,
    })
    // A task linked to a control card is still observed there.
    expect(criteriaForRow(s, rows[4]!).map((c) => c.taskId)).toEqual(['T-01'])
    expect(tasksForRow(s, 'I-04')).toHaveLength(1)
  })

  it('keeps MSEL order and returns nothing for a scenario without an evaluation', () => {
    const s = scenario([task('T-01', ['I-02']), task('T-02', ['I-01'])], rows)
    expect(rowCriteria(s).map((c) => `${c.rowId}:${c.id}`)).toEqual(['I-01:T-02', 'I-02:T-01'])
    const none = {
      msel: rows,
      evaluation: { objectiveCapabilities: [], eegs: [] },
    } as unknown as Scenario
    expect(rowCriteria(none).map((c) => c.id)).toEqual(['I-01:expected', 'I-02:expected'])
  })
})
