import { describe, expect, it } from 'vitest'
import { ProgramAction, type CorrectiveActionView, type PlannedExercise } from '@shared/schemas'
import { countActions, ownerNames, sortActions } from './action-table'
import { cellOf, inCell, outsideCycle } from './schedule-grid'

const view = (id: string, extra: Record<string, unknown> = {}): CorrectiveActionView => ({
  revision: 'r',
  action: ProgramAction.parse({
    id,
    number: Number(id.replace(/\D/g, '')),
    programId: 'p',
    title: `Action ${id}`,
    source: { kind: 'manual' },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...extra,
  }),
})

describe('corrective action table helpers', () => {
  const views = [
    view('CA3', { dueDate: '2026-09-01', owner: { name: 'Zed' } }),
    view('CA1', { dueDate: '2026-03-01', owner: { name: 'Amy' }, status: 'completed' }),
    view('CA2', { owner: { name: 'Amy' }, status: 'in_progress' }),
  ]

  it('sorts by due date, treating an action with no due date as the latest', () => {
    expect(sortActions(views, 'due', 'asc').map((v) => v.action.id)).toEqual(['CA1', 'CA3', 'CA2'])
    expect(sortActions(views, 'due', 'desc').map((v) => v.action.id)).toEqual(['CA2', 'CA3', 'CA1'])
  })

  it('sorts by ID number and by status lifecycle order', () => {
    expect(sortActions(views, 'number', 'asc').map((v) => v.action.id)).toEqual([
      'CA1',
      'CA2',
      'CA3',
    ])
    expect(sortActions(views, 'status', 'asc').map((v) => v.action.status)).toEqual([
      'open',
      'in_progress',
      'completed',
    ])
  })

  it('counts statuses and overdue actions', () => {
    const counts = countActions(views, '2026-06-01')
    expect(counts.total).toBe(3)
    expect(counts.byStatus).toMatchObject({ open: 1, in_progress: 1, completed: 1 })
    expect(counts.overdue).toBe(0)
    expect(countActions(views, '2026-12-01').overdue).toBe(1)
  })

  it('lists each owner once', () => {
    expect(ownerNames(views)).toEqual(['Amy', 'Zed'])
  })
})

describe('schedule grid placement', () => {
  const ex = (when: PlannedExercise['when']): PlannedExercise => ({
    id: 'e',
    title: 'x',
    type: 'drill',
    when,
    status: 'planned',
    priorityIds: [],
    coreCapabilities: [],
    planSections: [],
    correctiveActionIds: [],
    notes: '',
  })

  it('puts a dated exercise in the quarter of its date', () => {
    expect(cellOf(ex({ date: '2026-08-15' }))).toEqual({ year: 2026, quarter: 3 })
    expect(inCell(ex({ year: 2027, quarter: 1 }), { year: 2027, quarter: 1 })).toBe(true)
  })

  it('reports exercises outside the cycle years so none is hidden', () => {
    const list = [ex({ year: 2025, quarter: 4 }), ex({ year: 2027, quarter: 2 })]
    expect(outsideCycle(list, { startYear: 2026, years: 3 })).toHaveLength(1)
  })
})
