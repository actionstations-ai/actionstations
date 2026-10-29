// Status rules and the next-exercise proposal (#424): pure, so the tests are plain fixtures.
import { describe, expect, it } from 'vitest'
import {
  Program,
  ProgramAction,
  ProjectSnapshot,
  Schedule,
  type PlannedExercise,
} from '../schemas/program'
import { proposeNextExercise, sectionKey } from './propose'
import { isOverdue, statusChangeProblem, withStatusChange, actionLabel } from './status'

const NOW = new Date('2026-05-15T12:00:00Z')

const program = (extra: Partial<Program> = {}): Program =>
  Program.parse({
    id: 'prog1',
    name: 'Summit County Program',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    appVersion: '0.5.1',
    cycle: { startYear: 2026, years: 3 },
    ...extra,
  })

const action = (id: string, extra: Record<string, unknown> = {}): ProgramAction =>
  ProgramAction.parse({
    id,
    number: Number(id.replace(/\D/g, '')) || 1,
    programId: 'prog1',
    title: `Action ${id}`,
    source: { kind: 'manual' },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...extra,
  })

const section = {
  documentId: 'eop',
  documentTitle: 'EOP',
  headingPath: 'EOP › 6.4 Public Information',
}

const snapshot = (scenarios: Record<string, unknown>[]): ProjectSnapshot =>
  ProjectSnapshot.parse({
    projectId: 'proj1',
    name: 'Airport',
    orgName: '',
    orgType: 'airport',
    takenAt: '2026-05-01T00:00:00.000Z',
    reachable: true,
    documents: [],
    scenarios: scenarios.map((s, i) => ({
      scenarioId: `s${i}`,
      title: `Scenario ${i}`,
      status: 'ready',
      coreCapabilities: [],
      planSections: [],
      aarPresent: false,
      ...s,
    })),
  })

describe('status rules', () => {
  const open = action('CA1')
  it('requires a note to defer or cancel', () => {
    expect(statusChangeProblem('open', 'deferred', '  ')).toMatch(/note/)
    expect(statusChangeProblem('open', 'cancelled', 'Superseded by CA-0003')).toBeNull()
  })

  it('requires a verification to mark an action verified', () => {
    expect(statusChangeProblem('completed', 'verified', '')).toMatch(/verification/)
    const manual = {
      method: 'exercise' as const,
      at: '2026-05-01T00:00:00.000Z',
      result: 'pass' as const,
      note: 'Observed in the 2026 TTX, scenario 2',
    }
    expect(statusChangeProblem('completed', 'verified', '', manual)).toBeNull()
    expect(statusChangeProblem('completed', 'verified', '', { ...manual, note: '' })).toMatch(
      /observed/,
    )
  })

  it('records each change in the history and keeps the verification', () => {
    const verification = {
      method: 'drill' as const,
      at: '2026-05-01T00:00:00.000Z',
      result: 'pass' as const,
      note: '',
    }
    const done = withStatusChange(open, 'completed', 'Procedure signed', '2026-05-02T00:00:00.000Z')
    const verified = withStatusChange(
      done,
      'verified',
      '',
      '2026-05-03T00:00:00.000Z',
      verification,
    )
    expect(verified.history.map((h) => h.to)).toEqual(['completed', 'verified'])
    expect(verified.verifications).toHaveLength(1)
    expect(() => withStatusChange(open, 'open', '', 'x')).toThrow(/already/)
  })

  it('counts only open and in-progress actions with a past due date as overdue', () => {
    expect(isOverdue(action('CA2', { dueDate: '2026-03-31' }), '2026-05-15')).toBe(true)
    expect(
      isOverdue(action('CA3', { dueDate: '2026-03-31', status: 'completed' }), '2026-05-15'),
    ).toBe(false)
    expect(isOverdue(action('CA4', { dueDate: '2026-12-31' }), '2026-05-15')).toBe(false)
    expect(actionLabel(action('CA7'))).toBe('CA-0007')
  })
})

describe('proposeNextExercise', () => {
  const schedule = Schedule.parse({})

  it('ranks a capability with an overdue action above one with none', () => {
    const snaps = [
      snapshot([
        {
          coreCapabilities: ['public_information_and_warning'],
          exercisedAt: '2025-04-01T00:00:00.000Z',
        },
        { coreCapabilities: ['operational_coordination'], exercisedAt: '2025-04-01T00:00:00.000Z' },
      ]),
    ]
    const actions = [
      action('CA7', {
        coreCapabilities: ['public_information_and_warning'],
        dueDate: '2026-03-31',
      }),
    ]
    const out = proposeNextExercise(program(), schedule, snaps, actions, NOW)
    expect(out.capabilities[0]!.key).toBe('public_information_and_warning')
    expect(out.capabilities[0]!.reasons[0]).toBe('1 open action (CA-0007 overdue)')
    expect(out.correctiveActionIds).toEqual(['CA7'])
    expect(out.suggestedConstraints).toContain('Verify CA-0007: Action CA7')
  })

  it('ranks a never-exercised subject above a recently exercised one', () => {
    const snaps = [
      snapshot([
        { coreCapabilities: ['planning'], exercisedAt: '2026-03-01T00:00:00.000Z' },
        { coreCapabilities: ['cybersecurity'] },
      ]),
    ]
    const out = proposeNextExercise(program(), schedule, snaps, [], NOW)
    expect(out.capabilities.map((c) => c.key)).toEqual(['cybersecurity', 'planning'])
    expect(out.capabilities[0]!.reasons).toContain('never exercised')
    expect(out.capabilities[1]!.reasons).toContain('last exercised 2026-03')
  })

  it('uses a cycle priority as the tie-break until an exercise addresses it', () => {
    const snaps = [
      snapshot([
        { coreCapabilities: ['planning'] },
        { coreCapabilities: ['logistics_and_supply_chain_management'] },
      ]),
    ]
    const withPriority = program({
      priorities: [
        {
          id: 'pr1',
          text: 'TSA directive',
          coreCapabilities: ['planning'],
          rationale: '',
          sources: [],
        },
      ],
    })
    const first = proposeNextExercise(withPriority, schedule, snaps, [], NOW)
    expect(first.capabilities[0]!.key).toBe('planning')
    expect(first.capabilities[0]!.reasons.join(' ')).toContain('priority P-1')
    const done: PlannedExercise = {
      id: 'e1',
      title: 'TTX',
      type: 'tabletop',
      when: { year: 2026, quarter: 1 },
      status: 'completed',
      priorityIds: [],
      coreCapabilities: ['planning'],
      planSections: [],
      correctiveActionIds: [],
      completedAt: '2026-02-10',
      notes: '',
    }
    const second = proposeNextExercise(
      withPriority,
      Schedule.parse({ exercises: [done] }),
      snaps,
      [],
      NOW,
    )
    expect(second.capabilities.find((c) => c.key === 'planning')!.reasons.join(' ')).not.toContain(
      'priority',
    )
  })

  it('scores plan sections from snapshots and actions, and adds the planned-soon point', () => {
    const snaps = [snapshot([{ planSections: [section], exercisedAt: '2024-03-01T00:00:00.000Z' }])]
    const planned: PlannedExercise = {
      id: 'e2',
      title: 'Drill',
      type: 'drill',
      when: { year: 2026, quarter: 3 },
      status: 'planned',
      priorityIds: [],
      coreCapabilities: [],
      planSections: [section],
      correctiveActionIds: [],
      notes: '',
    }
    const out = proposeNextExercise(
      program(),
      Schedule.parse({ exercises: [planned] }),
      snaps,
      [],
      NOW,
    )
    const item = out.planSections[0]!
    expect(item.key).toBe(sectionKey(section))
    expect(item.reasons).toContain('already on the schedule for this or next quarter')
    expect(item.reasons).toContain('last exercised 2024-03')
    // 2.1 years since 2024-03-01 (not capped below 3), plus 1 for the schedule.
    expect(item.score).toBeCloseTo(3.1, 0)
  })

  it('gives the same answer twice and never puts an owner name in a constraint', () => {
    const actions = [
      action('CA1', {
        coreCapabilities: ['planning'],
        owner: { name: 'J. Ruiz', organization: 'PIO' },
      }),
    ]
    const a = proposeNextExercise(program(), schedule, [], actions, NOW)
    const b = proposeNextExercise(program(), schedule, [], actions, NOW)
    expect(a).toEqual(b)
    expect(a.suggestedConstraints.join(' ')).not.toContain('Ruiz')
  })
})
