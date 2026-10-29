import { describe, expect, it } from 'vitest'
import {
  applyAssignment,
  filterTasks,
  groupByCapability,
  latestReleasedRow,
  matchesWatch,
  watchFor,
  type Assignment,
  type AssignedTask,
} from './assignment'

const task = (id: string, extra: Partial<AssignedTask> = {}): AssignedTask => ({
  id,
  capability: 'operational_communications',
  task: `Task ${id}`,
  citation: { documentTitle: 'TIRP', headingPath: 'TIRP › 13.6' },
  rowIds: [],
  ...extra,
})

const assignment = (over: Partial<Assignment> = {}): Assignment => ({
  assignmentId: 'A'.repeat(22),
  revision: 1,
  label: 'Evaluator 1',
  watch: { roleIds: [], capabilities: [] },
  showExpected: true,
  tasks: [task('T-01')],
  ...over,
})

describe('applyAssignment', () => {
  it('takes the first assignment and any newer revision of it', () => {
    const first = assignment()
    expect(applyAssignment(undefined, first)).toBe(first)
    const second = assignment({ revision: 2 })
    expect(applyAssignment(first, second)).toBe(second)
  })

  it('ignores an older or repeated revision, however late it arrives', () => {
    const current = assignment({ revision: 3 })
    expect(applyAssignment(current, assignment({ revision: 2 }))).toBe(current)
    expect(applyAssignment(current, assignment({ revision: 3 }))).toBe(current)
  })

  it('takes a different assignment id even at a lower revision', () => {
    const other = assignment({ assignmentId: 'B'.repeat(22), revision: 1 })
    expect(applyAssignment(assignment({ revision: 5 }), other)).toBe(other)
  })
})

describe('grouping and filters', () => {
  const tasks = [
    task('T-01', { expectedBy: 'pio', rowIds: ['I-01'] }),
    task('T-02', { capability: 'cybersecurity', expectedBy: 'it', rowIds: ['I-06'] }),
    task('T-03', { capability: 'operational_communications', rowIds: ['I-06', 'I-07'] }),
  ]

  it('groups by capability in first-seen order, keeping the task order', () => {
    const groups = groupByCapability(tasks)
    expect(groups.map((g) => [g.name, g.tasks.map((t) => t.id)])).toEqual([
      ['Operational Communications', ['T-01', 'T-03']],
      ['Cybersecurity', ['T-02']],
    ])
  })

  it('watches everything when both lists are empty, else by role or capability', () => {
    const none = { roleIds: [], capabilities: [] }
    expect(tasks.every((t) => matchesWatch(t, none))).toBe(true)
    const pio = { roleIds: ['pio'], capabilities: [] }
    expect(tasks.filter((t) => matchesWatch(t, pio)).map((t) => t.id)).toEqual(['T-01'])
    const cyber = { roleIds: [], capabilities: ['cybersecurity'] }
    expect(tasks.filter((t) => matchesWatch(t, cyber)).map((t) => t.id)).toEqual(['T-02'])
  })

  it('filters to my watch list, all, unrated and due now', () => {
    const ctx = {
      watch: { roleIds: ['pio'], capabilities: [] },
      rated: new Set(['T-01']),
      due: new Set(['T-03']),
    }
    const ids = (f: Parameters<typeof filterTasks>[1]) =>
      filterTasks(tasks, f, ctx).map((t) => t.id)
    expect(ids('mine')).toEqual(['T-01'])
    expect(ids('all')).toEqual(['T-01', 'T-02', 'T-03'])
    expect(ids('unrated')).toEqual(['T-02', 'T-03'])
    expect(ids('due')).toEqual(['T-03'])
  })
})

describe('watch for', () => {
  const tasks = [
    task('T-01', { rowIds: ['I-06'] }),
    task('T-02', { rowIds: ['I-06'] }),
    task('T-03', { rowIds: ['I-08'] }),
  ]
  const released = [
    { rowId: 'I-06', releaseId: 'r6', time: '1:15', ts: 100 },
    { rowId: 'I-08', releaseId: 'r8', time: '1:30', ts: 200 },
  ]

  it('lists the open tasks of each released row, newest release first', () => {
    const entries = watchFor(tasks, released, new Set(), new Set())
    expect(entries.map((e) => [e.row.rowId, e.tasks.map((t) => t.id)])).toEqual([
      ['I-08', ['T-03']],
      ['I-06', ['T-01', 'T-02']],
    ])
  })

  it('drops rated tasks, and a row once all its tasks are rated or it is dismissed', () => {
    const afterRating = watchFor(tasks, released, new Set(['T-01', 'T-03']), new Set())
    expect(afterRating.map((e) => [e.row.rowId, e.tasks.map((t) => t.id)])).toEqual([
      ['I-06', ['T-02']],
    ])
    expect(watchFor(tasks, released, new Set(), new Set(['I-06', 'I-08']))).toEqual([])
  })

  it('names the most recently released row among a task rows for the Inject field', () => {
    const t = task('T-09', { rowIds: ['I-06', 'I-08', 'I-09'] })
    expect(latestReleasedRow(t, released)).toBe('I-08')
    expect(latestReleasedRow(task('T-10', { rowIds: ['I-20'] }), released)).toBeUndefined()
  })
})
