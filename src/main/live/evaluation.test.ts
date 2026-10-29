import { describe, expect, it } from 'vitest'
import type { EvalObservationPayload } from '@shared/live/schemas'
import type { Observation } from '@shared/schemas/evaluation'
import type { SessionLogInput } from '@shared/schemas/live'
import {
  assignmentTasks,
  criterionTaskId,
  EXPECTED_GROUP,
  LiveEvaluation,
  MAX_ASSIGNED_TASKS,
  MAX_OBSERVATIONS_PER_EVALUATOR,
  truncateHeadingPath,
  type EvalSeat,
} from './evaluation'

const OBS_A = 'AAAAAAAAAAAAAAAAAAAAAA'
const OBS_B = 'BBBBBBBBBBBBBBBBBBBBBB'

const task = (id: string, rowIds: string[], extra: object = {}) => ({
  id,
  capability: 'operational_communications',
  task: `Task ${id}`,
  citation: { documentId: 'd1', documentTitle: 'TIRP', headingPath: 'TIRP › 13.6' },
  rowIds,
  objectiveRefs: [],
  locked: false,
  ...extra,
})

function scenario(tasks = [task('T-01', ['I-01']), task('T-02', ['I-02'], { expectedBy: 'pio' })]) {
  return {
    evaluation: {
      objectiveCapabilities: [],
      eegs: [
        {
          capability: 'operational_communications',
          target: '',
          objectiveRefs: [],
          criticalTasks: tasks,
        },
      ],
    },
    msel: [
      { id: 'I-01', purposeTag: 'INJECT', expectedAction: 'Call the duty manager' },
      { id: 'I-02', purposeTag: 'INJECT', expectedAction: 'Open the checklist' },
      { id: 'I-03', purposeTag: 'INJECT', expectedAction: 'Notify the airlines' },
    ],
  } as never
}

function observation(over: Partial<EvalObservationPayload> = {}): EvalObservationPayload {
  return {
    observationId: OBS_A,
    revision: 1,
    kind: 'task',
    taskId: 'T-01',
    rating: 'partial',
    notes: 'IT isolated one VLAN',
    exerciseTime: '1:12',
    observedAt: Date.now(),
    mselRowId: 'I-01',
    ...over,
  }
}

function setup(opts: { sc?: never; attribution?: 'role' | 'named' } = {}) {
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
    clientRef: async (id) => Buffer.from(id.padEnd(4, '0')).toString('hex').slice(0, 8),
    scenario: async () => opts.sc ?? scenario(),
    save: async (o) => void saved.push(o),
    attribution: () => opts.attribution ?? 'role',
    now: () => Date.now(),
    newId: () => `id${String(++n).padStart(20, '0')}`,
    changed: () => undefined,
  })
  const seat = (clientId: string, kind: string, staff = true, online = true) =>
    seats.set(clientId, { clientId, kind, staff, online, name: `name-${clientId}` })
  return { ev, seat, seats, sent, logged, saved }
}

describe('assignmentTasks', () => {
  it('lists the EEG critical tasks with their citations, then each row expected action', () => {
    const tasks = assignmentTasks(scenario(), true)
    expect(tasks.map((t) => t.id)).toEqual(['T-01', 'T-02', criterionTaskId('I-03')])
    expect(tasks[0]!.citation.headingPath).toBe('TIRP › 13.6')
    const expected = tasks[2]!
    expect(expected).toMatchObject({
      capability: EXPECTED_GROUP,
      criterionId: 'I-03:expected',
      rowIds: ['I-03'],
      task: 'Notify the airlines',
    })
  })

  it('leaves out expected actions unless the facilitator shows them', () => {
    const tasks = assignmentTasks(scenario(), false)
    expect(tasks.map((t) => t.id)).toEqual(['T-01', 'T-02'])
    expect(JSON.stringify(tasks)).not.toContain('Notify the airlines')
  })

  it('truncates a long heading path from the front so the section name survives', () => {
    const path = `${'Document › '.repeat(40)}13.6 Scenario C`
    const cut = truncateHeadingPath(path)
    expect(cut.length).toBe(200)
    expect(cut.endsWith('13.6 Scenario C')).toBe(true)
  })

  it('caps the count and keeps the payload inside the byte budget, expected actions first to go', () => {
    const many = Array.from({ length: 150 }, (_, i) => task(`T-${i}`, ['I-01']))
    const tasks = assignmentTasks(scenario(many), true)
    expect(tasks.length).toBeLessThanOrEqual(MAX_ASSIGNED_TASKS)
    expect(tasks.every((t) => t.capability !== EXPECTED_GROUP)).toBe(true)
    const fat = Array.from({ length: 100 }, (_, i) =>
      task(
        `T-${i}`,
        Array.from({ length: 32 }, (_, r) => `ROW-${r}-${i}`),
        {
          task: 'x'.repeat(500),
        },
      ),
    )
    expect(JSON.stringify(assignmentTasks(scenario(fat), true)).length).toBeLessThan(45 * 1024)
  })
})

describe('assignments', () => {
  it('goes to an evaluator holding the staff key, with a label and the watch list', async () => {
    const { ev, seat, sent } = setup()
    seat('ev1', 'evaluator')
    await ev.onJoin('ev1')
    expect(sent).toHaveLength(1)
    expect(sent[0]).toMatchObject({ type: 'eval.assign', to: 'client:ev1' })
    expect(sent[0]!.payload).toMatchObject({
      label: 'Evaluator 1',
      revision: 1,
      showExpected: true,
      watch: { roleIds: [], capabilities: [] },
    })
  })

  it('is never sent to a player, an observer or a device that lacks the staff key', async () => {
    const { ev, seat, sent } = setup()
    seat('p1', 'player')
    seat('o1', 'observer')
    seat('e2', 'evaluator', false)
    for (const id of ['p1', 'o1', 'e2']) await ev.onJoin(id)
    await ev.refresh()
    await ev.setShowExpected(false)
    expect(sent).toEqual([])
  })

  it('numbers evaluators in join order and keeps a label across rejoins', async () => {
    const { ev, seat, sent } = setup()
    seat('ev1', 'evaluator')
    seat('ev2', 'evaluator')
    await ev.onJoin('ev1')
    await ev.onJoin('ev2')
    await ev.onJoin('ev1')
    expect(sent.map((s) => s.payload.label)).toEqual(['Evaluator 1', 'Evaluator 2', 'Evaluator 1'])
  })

  it('repeats an unchanged assignment at the same revision and raises it when the watch list changes', async () => {
    const { ev, seat, sent, logged } = setup()
    seat('ev1', 'evaluator')
    await ev.onJoin('ev1')
    await ev.onJoin('ev1')
    expect(sent.map((s) => s.payload.revision)).toEqual([1, 1])
    expect(logged.filter((l) => l.kind === 'eval.assign')).toHaveLength(1)
    const ref = (await ev.coverage()).evaluators[0]!.clientRef
    await ev.setWatch(ref, { roleIds: ['pio'], capabilities: [] })
    expect(sent.at(-1)!.payload).toMatchObject({ revision: 2, watch: { roleIds: ['pio'] } })
    expect(logged.map((l) => l.kind)).toContain('eval.watch')
  })

  it('differs by watch list between two evaluators, and re-sends when expected actions are turned off', async () => {
    const { ev, seat, sent } = setup()
    seat('ev1', 'evaluator')
    seat('ev2', 'evaluator')
    await ev.onJoin('ev1')
    await ev.onJoin('ev2')
    const [a, b] = (await ev.coverage()).evaluators
    await ev.setWatch(a!.clientRef, { roleIds: ['pio'], capabilities: [] })
    await ev.setWatch(b!.clientRef, { roleIds: [], capabilities: ['planning'] })
    const last = (to: string) => sent.filter((s) => s.to === to).at(-1)!.payload
    expect(last('client:ev1').watch).toEqual({ roleIds: ['pio'], capabilities: [] })
    expect(last('client:ev2').watch).toEqual({ roleIds: [], capabilities: ['planning'] })
    await ev.setShowExpected(false)
    expect(last('client:ev1')).toMatchObject({ showExpected: false })
    expect((last('client:ev1').tasks as unknown[]).length).toBe(2)
  })

  it('does not send to an evaluator who is offline', async () => {
    const { ev, seat, sent } = setup()
    seat('ev1', 'evaluator')
    await ev.onJoin('ev1')
    seat('ev1', 'evaluator', true, false)
    await ev.refresh()
    expect(sent).toHaveLength(1)
  })

  it('asks one evaluator to watch with a notice to that device only', async () => {
    const { ev, seat, sent, logged } = setup()
    seat('ev1', 'evaluator')
    seat('ev2', 'evaluator')
    await ev.onJoin('ev1')
    await ev.onJoin('ev2')
    const [a] = (await ev.coverage()).evaluators
    await ev.ask(a!.clientRef, 'Please watch for T-04 at the next inject')
    const notice = sent.at(-1)!
    expect(notice).toMatchObject({ type: 'controller.notice', to: 'client:ev1' })
    expect(notice.payload).toMatchObject({ targets: ['client:ev1'], level: 'info' })
    expect(logged.at(-1)).toMatchObject({ kind: 'eval.ask' })
  })
})

describe('observations', () => {
  it('logs the observation and upserts it into the evaluation record as source live', async () => {
    const { ev, seat, saved, logged } = setup()
    seat('ev1', 'evaluator')
    await ev.onJoin('ev1')
    await ev.onObservation('ev1', 5, observation())
    expect(saved).toHaveLength(1)
    expect(saved[0]).toMatchObject({
      taskId: 'T-01',
      rowId: 'I-01',
      rating: 'partial',
      note: 'IT isolated one VLAN',
      exerciseTime: '1:12',
      evaluator: 'Evaluator 1',
      source: 'live',
      kind: 'task',
    })
    expect(saved[0]!.id).toMatch(/^live-[a-f0-9]{8}-AAAAAAAAAAAAAAAAAAAAAA$/)
    const entry = logged.find((l) => l.kind === 'eval.observation')!
    expect(entry.actor.evaluator).toBe('Evaluator 1')
    expect(entry.ref).toMatchObject({ observationId: OBS_A, taskId: 'T-01' })
    expect(entry.data).toMatchObject({ revision: 1, rating: 'partial' })
  })

  it('keeps the newest revision: older and equal revisions change nothing', async () => {
    const { ev, seat, saved, logged } = setup()
    seat('ev1', 'evaluator')
    await ev.onJoin('ev1')
    await ev.onObservation('ev1', 1, observation({ revision: 2, rating: 'met' }))
    await ev.onObservation('ev1', 2, observation({ revision: 1, rating: 'not_met' }))
    await ev.onObservation('ev1', 3, observation({ revision: 2, rating: 'not_met' }))
    expect(saved).toHaveLength(1)
    expect(saved[0]!.rating).toBe('met')
    await ev.onObservation('ev1', 4, observation({ revision: 3, rating: 'partial', notes: 'edit' }))
    expect(saved.at(-1)).toMatchObject({ rating: 'partial', note: 'edit', id: saved[0]!.id })
    expect(logged.filter((l) => l.kind === 'eval.observation')).toHaveLength(2)
  })

  it('applies revisions in arrival order even when they are sent together', async () => {
    const { ev, seat, saved } = setup()
    seat('ev1', 'evaluator')
    await ev.onJoin('ev1')
    await Promise.all([
      ev.onObservation('ev1', 1, observation({ revision: 1, rating: 'not_met' })),
      ev.onObservation('ev1', 2, observation({ revision: 2, rating: 'met' })),
    ])
    expect(saved.map((o) => o.rating)).toEqual(['not_met', 'met'])
  })

  it('drops a player observation and logs an anomaly', async () => {
    const { ev, seat, saved, logged } = setup()
    seat('p1', 'player')
    await ev.onObservation('p1', 9, observation())
    expect(saved).toEqual([])
    expect(logged).toHaveLength(1)
    expect(logged[0]).toMatchObject({ kind: 'anomaly' })
  })

  it('does not let one evaluator overwrite another evaluator observation with the same id', async () => {
    const { ev, seat, saved } = setup()
    seat('ev1', 'evaluator')
    seat('ev2', 'evaluator')
    await ev.onJoin('ev1')
    await ev.onJoin('ev2')
    await ev.onObservation('ev1', 1, observation({ rating: 'met' }))
    await ev.onObservation('ev2', 1, observation({ rating: 'not_met' }))
    expect(saved).toHaveLength(2)
    expect(new Set(saved.map((o) => o.id)).size).toBe(2)
  })

  it('stores a per-row expected action as a criterion, not a task', async () => {
    const { ev, seat, saved } = setup()
    seat('ev1', 'evaluator')
    await ev.onJoin('ev1')
    await ev.onObservation(
      'ev1',
      1,
      observation({ taskId: 'I-03_expected', criterionId: 'I-03:expected', mselRowId: 'I-03' }),
    )
    expect(saved[0]).toMatchObject({ criterionId: 'I-03:expected', rowId: 'I-03' })
    expect(saved[0]).not.toHaveProperty('taskId')
  })

  it('stores a general note without a task, rating not observed unless chosen', async () => {
    const { ev, seat, saved } = setup()
    seat('ev1', 'evaluator')
    await ev.onJoin('ev1')
    await ev.onObservation('ev1', 1, {
      observationId: OBS_B,
      revision: 1,
      kind: 'note',
      capability: 'planning',
      notes: 'Clear hand-offs at shift change',
      exerciseTime: '1:30',
      observedAt: Date.now(),
    })
    expect(saved[0]).toMatchObject({ kind: 'note', rating: 'not_observed', capability: 'planning' })
    expect(saved[0]).not.toHaveProperty('taskId')
  })

  it('refuses observations past the per-evaluator cap', async () => {
    const { ev, seat, saved, logged } = setup()
    seat('ev1', 'evaluator')
    await ev.onJoin('ev1')
    for (let i = 0; i < MAX_OBSERVATIONS_PER_EVALUATOR; i++) {
      await ev.onObservation('ev1', i, observation({ observationId: `${i}`.padStart(22, 'x') }))
    }
    await ev.onObservation('ev1', 9999, observation({ observationId: 'z'.repeat(22) }))
    expect(saved).toHaveLength(MAX_OBSERVATIONS_PER_EVALUATOR)
    expect(logged.at(-1)).toMatchObject({ kind: 'anomaly' })
  })

  it('replaces an observation time far from now with the controller clock', async () => {
    const { ev, seat, saved } = setup()
    seat('ev1', 'evaluator')
    await ev.onJoin('ev1')
    await ev.onObservation('ev1', 1, observation({ observedAt: 1_000 }))
    expect(Date.parse(saved[0]!.at)).toBeGreaterThan(Date.now() - 60_000)
  })
})

describe('coverage', () => {
  it('shows the latest rating per task and evaluator, and counts tasks with a real rating', async () => {
    const { ev, seat } = setup()
    seat('ev1', 'evaluator')
    seat('ev2', 'evaluator')
    await ev.onJoin('ev1')
    await ev.onJoin('ev2')
    await ev.onObservation('ev1', 1, observation({ observationId: OBS_A, rating: 'met' }))
    await ev.onObservation(
      'ev2',
      1,
      observation({ observationId: OBS_B, taskId: 'T-02', rating: 'not_observed' }),
    )
    const view = await ev.coverage()
    expect(view.tasks.map((t) => t.id)).toEqual(['T-01', 'T-02', 'I-03_expected'])
    expect(view.cells).toHaveLength(2)
    expect(view.cells.find((c) => c.taskId === 'T-01')!.rating).toBe('met')
    expect(view.covered).toBe(1)
    expect(view.observations).toBe(2)
    expect(view.evaluators.map((e) => [e.label, e.observations])).toEqual([
      ['Evaluator 1', 1],
      ['Evaluator 2', 1],
    ])
    expect(view.latest).toHaveLength(2)
  })

  it('names an evaluator only in a named session', async () => {
    const role = setup()
    role.seat('ev1', 'evaluator')
    await role.ev.onJoin('ev1')
    expect((await role.ev.coverage()).evaluators[0]).not.toHaveProperty('displayName')
    const named = setup({ attribution: 'named' })
    named.seat('ev1', 'evaluator')
    await named.ev.onJoin('ev1')
    expect((await named.ev.coverage()).evaluators[0]!.displayName).toBe('name-ev1')
  })
})
