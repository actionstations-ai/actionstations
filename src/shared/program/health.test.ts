// computeHealth (#438): coverage status rules, the matrix, section matching, corrective-action
// arithmetic, never-tested lists, filters, privacy and the size budget. `now` is fixed.
import { describe, expect, it } from 'vitest'
import {
  Program,
  ProgramAction,
  ProjectSnapshot,
  Schedule,
  type SnapshotScenario,
} from '../schemas/program'
import { computeHealth, normalizeHeading, type HealthInput } from './health'

const NOW = new Date('2026-10-28T12:00:00.000Z')
const T = '2026-01-01T00:00:00.000Z'

const program = Program.parse({
  id: 'prog1',
  name: 'County Program',
  createdAt: T,
  updatedAt: T,
  appVersion: '0.8.0',
  cycle: { startYear: 2026, years: 3 },
  priorities: [
    {
      id: 'pr1',
      text: 'Public health surge',
      coreCapabilities: ['public_health_healthcare_and_emergency_medical_services'],
    },
    { id: 'pr2', text: 'Coordination', coreCapabilities: ['operational_coordination'] },
  ],
})

const section = (title: string, path: string, docId = 'd1') => ({
  documentId: docId,
  documentTitle: title,
  headingPath: path,
})

const scenario = (id: string, over: Partial<SnapshotScenario> = {}): SnapshotScenario => ({
  scenarioId: id,
  title: `Scenario ${id}`,
  status: 'ready',
  exercisedAt: '2026-05-10T15:00:00.000Z',
  coreCapabilities: ['operational_coordination'],
  planSections: [],
  aarPresent: true,
  ...over,
})

const snapshot = (id: string, scenarios: SnapshotScenario[], over = {}) =>
  ProjectSnapshot.parse({
    projectId: id,
    name: `Project ${id}`,
    orgName: 'NCIA',
    orgType: 'airport',
    takenAt: '2026-10-20T00:00:00.000Z',
    reachable: true,
    documents: [
      {
        id: 'd1',
        title: 'Emergency Operations Plan',
        shortName: 'EOP',
        kind: 'plan',
        sha256: 'sha-eop',
        sections: ['6 Public Information', '9 Recovery'],
      },
    ],
    scenarios,
    ...over,
  })

const action = (id: string, over: Record<string, unknown> = {}) =>
  ProgramAction.parse({
    id,
    number: Number(id.replace(/\D/g, '')),
    programId: 'prog1',
    title: `Action ${id}`,
    source: { kind: 'manual' },
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: T,
    ...over,
  })

const input = (over: Partial<HealthInput> = {}): HealthInput => ({
  program,
  schedule: Schedule.parse({ exercises: [] }),
  snapshots: [snapshot('a', [scenario('s1')])],
  actions: [],
  ...over,
})

const cap = (h: ReturnType<typeof computeHealth>, id: string) =>
  h.capabilities.find((c) => c.id === id)!

describe('capability status', () => {
  it('is never when nothing exercised it and nothing is planned', () => {
    expect(cap(computeHealth(input(), {}, NOW), 'fatality_management_services').status).toBe(
      'never',
    )
  })

  it('is current when exercised in the cycle and within the stale window', () => {
    const c = cap(computeHealth(input(), {}, NOW), 'operational_coordination')
    expect(c.status).toBe('current')
    expect(c.lastExercisedAt).toBe('2026-05-10T15:00:00.000Z')
    expect(c.inCycle).toBe(1)
    expect(c.priorityIds).toEqual(['pr2'])
  })

  it('is stale when the last exercise is before the cycle start', () => {
    const snaps = [snapshot('a', [scenario('s1', { exercisedAt: '2025-12-31T10:00:00.000Z' })])]
    const c = cap(computeHealth(input({ snapshots: snaps }), {}, NOW), 'operational_coordination')
    expect(c.status).toBe('stale')
    expect(c.inCycle).toBe(0)
  })

  it('is stale when older than staleAfterMonths even inside the cycle', () => {
    const snaps = [snapshot('a', [scenario('s1', { exercisedAt: '2026-01-15T10:00:00.000Z' })])]
    const h = computeHealth(input({ snapshots: snaps }), { staleAfterMonths: 6 }, NOW)
    expect(cap(h, 'operational_coordination').status).toBe('stale')
    expect(
      cap(computeHealth(input({ snapshots: snaps }), {}, NOW), 'operational_coordination').status,
    ).toBe('current')
  })

  it('is planned when never exercised but a planned exercise names it', () => {
    const schedule = Schedule.parse({
      exercises: [
        {
          id: 'e1',
          title: 'Surge TTX',
          type: 'tabletop',
          when: { year: 2027, quarter: 1 },
          coreCapabilities: ['public_health_healthcare_and_emergency_medical_services'],
        },
      ],
    })
    const c = cap(
      computeHealth(input({ schedule }), {}, NOW),
      'public_health_healthcare_and_emergency_medical_services',
    )
    expect(c.status).toBe('planned')
    expect(c.plannedByQuarter).toEqual({ '2027-Q1': 1 })
  })
})

describe('matrix counts', () => {
  it('counts exercises per cycle quarter, one per scenario', () => {
    const snaps = [
      snapshot('a', [
        scenario('s1'),
        scenario('s2', { exercisedAt: '2026-05-20T10:00:00.000Z' }),
        scenario('s3', { exercisedAt: '2026-08-02T10:00:00.000Z' }),
      ]),
    ]
    const c = cap(computeHealth(input({ snapshots: snaps }), {}, NOW), 'operational_coordination')
    expect(c.byQuarter).toEqual({ '2026-Q2': 2, '2026-Q3': 1 })
  })

  it('sums ratings of the scenarios that name the capability', () => {
    const ratings = { met: 2, partial: 1, notMet: 0, notObserved: 1 }
    const snaps = [snapshot('a', [scenario('s1', { ratings }), scenario('s2', { ratings })])]
    const c = cap(computeHealth(input({ snapshots: snaps }), {}, NOW), 'operational_coordination')
    expect(c.results).toEqual({ met: 4, partial: 2, notMet: 0, notObserved: 2 })
  })

  it('leaves a scenario without capability mapping out of the matrix and counts it', () => {
    const snaps = [snapshot('a', [scenario('s1', { coreCapabilities: [] })])]
    const h = computeHealth(input({ snapshots: snaps }), {}, NOW)
    expect(h.unmappedExercises).toBe(1)
    expect(h.capabilities.every((c) => c.exercises.length === 0)).toBe(true)
    expect(h.timeline).toHaveLength(1)
  })

  it('does not count a scenario that was built but never run', () => {
    const snaps = [snapshot('a', [scenario('s1', { exercisedAt: undefined })])]
    expect(computeHealth(input({ snapshots: snaps }), {}, NOW).totals.exercises).toBe(0)
  })
})

describe('plan sections', () => {
  it('matches the same heading across ingests with different spacing and short names', () => {
    const a = snapshot('a', [
      scenario('s1', {
        planSections: [
          section('Emergency Operations Plan', 'EOP › 6 Public  Information › 6.4 Approval chain'),
        ],
      }),
    ])
    const b = snapshot(
      'b',
      [
        scenario('s2', {
          planSections: [
            section(
              'Emergency Operations Plan',
              'Emergency Operations Plan › 6 public information › 6.4 Approval Chain.',
            ),
          ],
        }),
      ],
      {},
    )
    const h = computeHealth(input({ snapshots: [a, b] }), {}, NOW)
    const row = h.sections.find((s) => s.headingPath.endsWith('6.4 Approval chain'))!
    expect(row.timesCited).toBe(2)
    expect(row.depth).toBe(2)
    expect(h.sections.filter((s) => s.depth === 2)).toHaveLength(1)
  })

  it('does not match 6.4 to 6.41', () => {
    const a = snapshot('a', [
      scenario('s1', { planSections: [section('Emergency Operations Plan', 'EOP › Part › 6.4')] }),
      scenario('s2', { planSections: [section('Emergency Operations Plan', 'EOP › Part › 6.41')] }),
    ])
    const h = computeHealth(input({ snapshots: [a] }), {}, NOW)
    const timesFor = (tail: string) =>
      h.sections.find((s) => s.headingPath.endsWith(tail))!.timesCited
    expect(timesFor('6.4')).toBe(1)
    expect(timesFor('6.41')).toBe(1)
  })

  it('rolls a deep citation up to depth 3 and marks its ancestors cited', () => {
    const a = snapshot('a', [
      scenario('s1', {
        planSections: [
          section(
            'Emergency Operations Plan',
            'EOP › 6 Public Information › 6.4 Chain › Step A › Detail',
          ),
        ],
      }),
    ])
    const h = computeHealth(input({ snapshots: [a] }), {}, NOW)
    expect(Math.max(...h.sections.map((s) => s.depth))).toBe(3)
    const top = h.sections.find((s) => s.depth === 1 && s.headingPath === '6 Public Information')!
    expect(top.never).toBe(false)
    expect(top.lastCitedAt).toBe('2026-05-10T15:00:00.000Z')
  })

  it('counts micro-drill runs apart from exercises: practised, but still never exercised (#437)', () => {
    const drill = (runId: string, at: string) => ({
      drillId: 'md1',
      runId,
      at,
      planSection: section('Emergency Operations Plan', 'EOP › 6 Public Information › 6.4 Chain'),
      coreCapabilities: [],
      participants: 2,
      minutes: 14,
      coverage: 0.7,
      hintsUsed: 3,
    })
    const a = snapshot('a', [], {
      drills: [drill('r1', '2026-09-01T10:00:00.000Z'), drill('r2', '2026-10-01T10:00:00.000Z')],
    })
    const h = computeHealth(input({ snapshots: [a] }), {}, NOW)
    const top = h.sections.find((s) => s.depth === 1 && s.headingPath === '6 Public Information')!
    const deep = h.sections.find((s) => s.headingPath === '6 Public Information › 6.4 Chain')!
    expect(top).toMatchObject({ practisedRuns: 2, lastPractisedAt: '2026-10-01T10:00:00.000Z' })
    expect(deep.practisedRuns).toBe(2)
    expect(top).toMatchObject({ timesCited: 0, never: true })
    expect(h.sections.find((s) => s.headingPath === '9 Recovery')!.practisedRuns).toBeUndefined()
  })

  it('marks declared sections that no exercise cited as never', () => {
    const h = computeHealth(input(), {}, NOW)
    const recovery = h.sections.find((s) => s.headingPath === '9 Recovery')!
    expect(recovery.never).toBe(true)
    expect(h.neverTested.sections.map((s) => s.headingPath)).toContain('9 Recovery')
  })

  it('counts open actions against the cited section and its ancestors', () => {
    const a = snapshot('a', [])
    const open = action('CA1', {
      planSections: [
        section('Emergency Operations Plan', 'EOP › 6 Public Information › 6.5 Rumor control'),
      ],
      source: { kind: 'manual', projectId: 'a' },
    })
    const done = action('CA2', {
      status: 'verified',
      planSections: [
        section('Emergency Operations Plan', 'EOP › 6 Public Information › 6.5 Rumor control'),
      ],
      source: { kind: 'manual', projectId: 'a' },
    })
    const h = computeHealth(input({ snapshots: [a], actions: [open, done] }), {}, NOW)
    expect(h.sections.find((s) => s.headingPath.endsWith('6.5 Rumor control'))!.openActions).toBe(1)
    expect(h.sections.find((s) => s.headingPath === '6 Public Information')!.openActions).toBe(1)
  })

  it('normalizes case, spacing and punctuation but keeps numbering dots', () => {
    expect(normalizeHeading('  13.6  FIDS / BHS: Failure. ')).toBe('13.6 fids bhs failure')
  })
})

describe('corrective actions', () => {
  it('flags an action overdue the day after its due date, not on it', () => {
    const acts = [
      action('CA1', { dueDate: '2026-10-28' }),
      action('CA2', { dueDate: '2026-10-27', owner: { name: 'J. Ruiz', organization: 'Ops' } }),
    ]
    const h = computeHealth(input({ actions: acts }), {}, NOW)
    expect(h.actions.overdue.map((o) => [o.label, o.daysOverdue, o.owner])).toEqual([
      ['CA-0002', 1, 'J. Ruiz'],
    ])
    expect(h.totals.overdueActions).toBe(1)
  })

  it('buckets ageing at 90 and 365 days and ignores closed actions', () => {
    const acts = [
      action('CA1', { createdAt: '2026-08-01T00:00:00.000Z' }),
      action('CA2', { createdAt: '2026-07-30T00:00:00.000Z' }),
      action('CA3', { createdAt: '2025-10-28T00:00:00.000Z' }),
      action('CA4', { createdAt: '2025-10-27T00:00:00.000Z' }),
      action('CA5', { createdAt: '2020-01-01T00:00:00.000Z', status: 'completed' }),
    ]
    const h = computeHealth(input({ actions: acts }), {}, NOW)
    expect(h.actions.ageing).toEqual({ under90: 1, d90to365: 2, over365: 1 })
    expect(h.actions.byStatus.completed).toBe(1)
  })

  it('groups by capability and owner organization and counts verified in the cycle', () => {
    const acts = [
      action('CA1', {
        coreCapabilities: ['operational_coordination'],
        owner: { organization: 'Ops' },
        dueDate: '2026-01-01',
      }),
      action('CA2', {
        coreCapabilities: ['operational_coordination'],
        owner: { organization: 'IT' },
      }),
      action('CA3', {
        status: 'verified',
        coreCapabilities: ['operational_coordination'],
        history: [{ at: '2026-09-01T00:00:00.000Z', to: 'verified' }],
      }),
    ]
    const h = computeHealth(input({ actions: acts }), {}, NOW)
    expect(h.actions.byCapability[0]).toMatchObject({
      id: 'operational_coordination',
      open: 2,
      overdue: 1,
      verified: 1,
    })
    expect(h.actions.byOwnerOrg.map((o) => o.organization).sort()).toEqual(['IT', 'Ops'])
    expect(h.actions.verifiedInCycle).toBe(1)
    expect(cap(h, 'operational_coordination')).toMatchObject({ openActions: 2, overdueActions: 1 })
  })

  it('leaves owner names out when includeOwners is false', () => {
    const acts = [
      action('CA1', { dueDate: '2026-01-01', owner: { name: 'J. Ruiz', organization: 'Ops' } }),
    ]
    const h = computeHealth(input({ actions: acts }), { includeOwners: false }, NOW)
    expect(JSON.stringify(h)).not.toContain('Ruiz')
    expect(h.actions.overdue[0]!.organization).toBe('Ops')
  })
})

describe('never tested and timeline', () => {
  it('lists a prioritized capability that was never exercised', () => {
    const h = computeHealth(input(), {}, NOW)
    expect(h.neverTested.capabilities).toEqual([
      {
        id: 'public_health_healthcare_and_emergency_medical_services',
        label: expect.any(String),
        priorityIds: ['pr1'],
      },
    ])
  })

  it('lists a document with no cited sections and a planned exercise in a past quarter', () => {
    const schedule = Schedule.parse({
      exercises: [
        { id: 'e1', title: 'Old drill', type: 'drill', when: { year: 2026, quarter: 2 } },
      ],
    })
    const h = computeHealth(input({ schedule }), {}, NOW)
    expect(h.neverTested.documents.map((d) => d.documentTitle)).toEqual([
      'Emergency Operations Plan',
    ])
    expect(h.neverTested.overduePlanned).toEqual([
      { id: 'e1', title: 'Old drill', when: '2026-Q2', type: 'drill' },
    ])
  })

  it('puts exercises, planned exercises and drill runs on the timeline by quarter', () => {
    const snaps = [
      snapshot('a', [
        scenario('s1', {
          drillRuns: [{ ranAt: '2026-08-05T00:00:00.000Z', pass: 3, fail: 1, partial: 0 }],
        }),
      ]),
    ]
    const schedule = Schedule.parse({
      exercises: [
        { id: 'e1', title: 'Functional', type: 'functional', when: { year: 2026, quarter: 4 } },
      ],
    })
    const h = computeHealth(input({ snapshots: snaps, schedule }), {}, NOW)
    expect(h.timeline.map((t) => [t.quarter, t.kind])).toEqual([
      ['2026-Q2', 'exercise'],
      ['2026-Q3', 'drill'],
      ['2026-Q4', 'planned'],
    ])
    expect(h.timeline[1]!.drill).toEqual({ pass: 3, fail: 1, partial: 0 })
  })
})

describe('filters, freshness and totals', () => {
  const two = [
    snapshot('a', [scenario('s1')]),
    snapshot('b', [
      scenario('s2', { coreCapabilities: ['planning'], exercisedAt: '2027-02-01T00:00:00.000Z' }),
    ]),
  ]

  it('filters by project', () => {
    const h = computeHealth(input({ snapshots: two }), { projectIds: ['b'] }, NOW)
    expect(h.totals.exercises).toBe(1)
    expect(h.freshness.map((f) => f.projectId)).toEqual(['b'])
  })

  it('filters by year', () => {
    const h = computeHealth(input({ snapshots: two }), { years: [2027] }, NOW)
    expect(h.timeline.map((t) => t.ref?.scenarioId)).toEqual(['s2'])
  })

  it('filters capabilities by mission area', () => {
    const h = computeHealth(input({ snapshots: two }), { missionAreas: ['recovery'] }, NOW)
    expect(h.capabilities.length).toBeGreaterThan(0)
    expect(h.capabilities.length).toBeLessThan(32)
    expect(h.capabilities.every((c) => c.missionAreas.includes('recovery'))).toBe(true)
  })

  it('filters plan sections by document', () => {
    const h = computeHealth(input(), { documentKeys: ['nothing'] }, NOW)
    expect(h.sections).toEqual([])
    expect(h.neverTested.documents).toEqual([])
  })

  it('keeps an unreachable or old snapshot but flags it', () => {
    const snaps = [
      snapshot('a', [scenario('s1')]),
      snapshot('b', [], { reachable: false }),
      snapshot('c', [], { takenAt: '2026-09-01T00:00:00.000Z' }),
    ]
    const h = computeHealth(input({ snapshots: snaps }), {}, NOW)
    expect(h.freshness.map((f) => [f.projectId, f.stale])).toEqual([
      ['a', false],
      ['b', true],
      ['c', true],
    ])
    expect(h.totals.exercises).toBe(1)
  })

  it('totals match the panels and the same input gives the same report', () => {
    const h = computeHealth(input(), {}, NOW)
    expect(h.totals.capabilitiesCurrent).toBe(1)
    expect(h.totals.capabilitiesNever).toBe(31)
    expect(computeHealth(input(), {}, NOW)).toEqual(h)
    expect(h.computedAt).toBe(NOW.toISOString())
  })
})

describe('size budget', () => {
  it('computes 50 projects x 20 scenarios x 300 sections in under 300 ms', () => {
    const sections = Array.from({ length: 300 }, (_, i) => `Section ${i}`)
    const snaps = Array.from({ length: 50 }, (_, p) =>
      snapshot(
        `p${p}`,
        Array.from({ length: 20 }, (_, s) =>
          scenario(`s${s}`, {
            planSections: [0, 1, 2, 3, 4].map((k) =>
              section('Emergency Operations Plan', `EOP › Section ${(s * 5 + k) % 300} › Sub`),
            ),
          }),
        ),
        {
          documents: [
            {
              id: 'd1',
              title: 'Emergency Operations Plan',
              shortName: 'EOP',
              kind: 'plan',
              sections,
            },
          ],
        },
      ),
    )
    const started = performance.now()
    computeHealth(input({ snapshots: snaps }), {}, NOW)
    expect(performance.now() - started).toBeLessThan(300)
  })
})
