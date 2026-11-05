// Classroom mode on the evaluator device (#724, ADR-0090): the roster goes to evaluator devices
// only, an observation may name a rostered student, and the session log never carries the id.
import { describe, expect, it } from 'vitest'
import type { Observation } from '@shared/schemas/evaluation'
import type { SessionLogInput } from '@shared/schemas/live'
import { LiveEvaluation, type EvalSeat } from './evaluation'

const OBS = 'AAAAAAAAAAAAAAAAAAAAAA'
const scenario = {
  evaluation: {
    objectiveCapabilities: [],
    eegs: [
      {
        capability: 'operational_communications',
        target: '',
        objectiveRefs: [],
        criticalTasks: [
          {
            id: 'T-01',
            capability: 'operational_communications',
            task: 'Call',
            citation: { documentId: 'd', documentTitle: 'T', headingPath: 'T' },
            rowIds: ['I-01'],
            objectiveRefs: [],
            locked: false,
          },
        ],
      },
    ],
  },
  msel: [{ id: 'I-01', purposeTag: 'INJECT', expectedAction: 'x' }],
} as never

function setup(roster: Array<{ id: string; name: string }>) {
  const seats = new Map<string, EvalSeat>()
  const sent: { type: string; to: string; payload: Record<string, unknown> }[] = []
  const logged: SessionLogInput[] = []
  const saved: Observation[] = []
  let n = 0
  const ev = new LiveEvaluation({
    send: async (type, to, payload) => void sent.push({ type, to, payload }),
    log: { append: async (e) => void logged.push(e) },
    seats: () => [...seats.values()],
    seatOf: (id) => seats.get(id),
    clientRef: async (id) => id.padEnd(8, '0'),
    scenario: async () => scenario,
    students: async () => roster,
    save: async (o) => void saved.push(o),
    attribution: () => 'role',
    now: () => Date.now(),
    newId: () => `id${String(++n).padStart(20, '0')}`,
    changed: () => undefined,
  })
  seats.set('ev1', { clientId: 'ev1', kind: 'evaluator', staff: true, online: true, name: 'TA' })
  seats.set('pl1', { clientId: 'pl1', kind: 'player', staff: false, online: true, name: 'Ada' })
  return { ev, sent, logged, saved }
}

const obs = (extra: object = {}) => ({
  observationId: OBS,
  revision: 1,
  kind: 'task' as const,
  taskId: 'T-01',
  rating: 'met' as const,
  notes: 'Called at 1:10',
  exerciseTime: '1:10',
  observedAt: Date.now(),
  ...extra,
})

describe('classroom evaluator form', () => {
  it('sends the roster to the evaluator device only', async () => {
    const { ev, sent } = setup([{ id: 's1', name: 'Ada Lovelace' }])
    await ev.onJoin('ev1')
    await ev.onJoin('pl1')
    expect(sent).toHaveLength(1)
    expect(sent[0]).toMatchObject({
      type: 'eval.assign',
      to: 'client:ev1',
      payload: { students: [{ id: 's1', name: 'Ada Lovelace' }] },
    })
  })

  it('sends no roster when Classroom is off', async () => {
    const { ev, sent } = setup([])
    await ev.onJoin('ev1')
    expect(sent[0]!.payload).not.toHaveProperty('students')
  })

  it('saves the student id with the observation and keeps it out of the log', async () => {
    const { ev, saved, logged } = setup([{ id: 's1', name: 'Ada Lovelace' }])
    await ev.onJoin('ev1')
    await ev.onObservation('ev1', 1, obs({ studentId: 's1' }) as never)
    expect(saved[0]).toMatchObject({ studentId: 's1', rating: 'met' })
    expect(JSON.stringify(logged)).not.toContain('s1')
  })

  it('drops an unknown student id, saves the observation anonymously and logs an anomaly', async () => {
    const { ev, saved, logged } = setup([{ id: 's1', name: 'Ada Lovelace' }])
    await ev.onJoin('ev1')
    await ev.onObservation('ev1', 1, obs({ studentId: 'ghost' }) as never)
    expect(saved[0]).not.toHaveProperty('studentId')
    expect(logged.some((l) => l.kind === 'anomaly')).toBe(true)
  })
})
