// Micro-drills on devices (#437, FR-17): who may answer, what leaves the controller (questions
// only), what comes back to one device, and what the log keeps.
import { describe, expect, it } from 'vitest'
import type { MicroDrill, MicroDrillRun } from '@shared/schemas'
import { LiveDrills, MAX_CHECKS_PER_DEVICE, type DrillRuns } from './live'

const CITATION = { documentId: 'd', documentTitle: 'Plan', headingPath: 'Plan › 4', chunkId: 1 }
const DRILL = {
  id: 'drill-1',
  title: 'Notify the duty manager',
  status: 'ready',
  situation: 'A drone is reported near the north runway.',
  durationMin: 15,
  steps: [
    {
      id: 's1',
      prompt: 'Who do you notify first?',
      expectedPoints: [
        { id: 'p1', text: 'Call the duty manager', citation: CITATION },
        { id: 'p2', text: 'Log the time', citation: CITATION },
      ],
      hints: [
        { level: 1, text: 'Think about the chain of command.' },
        { level: 2, text: 'See section 4.', citation: CITATION },
        { level: 3, text: 'Quote.', citation: CITATION, quote: 'Call the duty manager.' },
      ],
      modelAnswer: 'Call the duty manager and log the time.',
    },
  ],
} as unknown as MicroDrill

const clientA = 'A'.repeat(22)
const clientB = 'B'.repeat(22)
const clientEval = 'E'.repeat(22)

function setup(assessment: 'model' | 'checklist' = 'model') {
  const sent: { type: string; to: string; payload: Record<string, unknown> }[] = []
  const logged: { kind: string; data?: unknown }[] = []
  const runs = new Map<string, MicroDrillRun>()
  const started: string[] = []
  const finished: string[] = []
  let reported = 0
  const fake: DrillRuns = {
    getDrill: async () => DRILL,
    mode: async () => ({ assessment }),
    start: async (_id, label) => {
      const run = {
        id: `run-${runs.size + 1}`,
        assessment,
        participants: [{ label }],
        steps: [{ stepId: 's1', attempts: [], hintsUsed: [], score: 0 }],
      } as unknown as MicroDrillRun
      runs.set(run.id, run)
      started.push(label)
      return run
    },
    answer: async (input) => {
      const run = runs.get(input.runId)!
      const covered = (input.ticked ?? ['p1']).filter((id) => id === 'p1')
      const attempt = {
        participantLabel: input.participantLabel,
        text: input.text,
        at: 'now',
        covered,
        partial: [],
        missing: ['p2'],
        followUp: 'What do you write down?',
      }
      const next = { ...run, steps: [{ ...run.steps[0]!, attempts: [attempt] }] } as MicroDrillRun
      runs.set(run.id, next)
      return { run: next, hintOffer: 1 }
    },
    hint: async (runId) => {
      const run = runs.get(runId)!
      const next = { ...run, steps: [{ ...run.steps[0]!, hintsUsed: [1] }] } as MicroDrillRun
      runs.set(runId, next)
      return { run: next, hint: { level: 1, text: 'Think about the chain of command.' } }
    },
    finish: async (runId) => {
      finished.push(runId)
      return runs.get(runId)!
    },
    report: async () => void reported++,
  }
  const seats = [
    { clientId: clientA, kind: 'player' as const, label: 'Ops', online: true },
    { clientId: clientB, kind: 'player' as const, label: 'Ops', online: true },
    { clientId: clientEval, kind: 'evaluator' as const, label: 'Evaluator', online: true },
  ]
  const drills = new LiveDrills({
    send: async (type, to, payload) => void sent.push({ type, to, payload }),
    log: { append: async (input) => void logged.push(input) },
    runs: fake,
    seats: () => seats,
    now: () => 1000,
    changed: () => undefined,
  })
  return { drills, sent, logged, started, finished, reported: () => reported }
}

const answer = (drillId: string, extra: Record<string, unknown> = {}) =>
  ({ drillId, stepId: 's1', ask: 'check', text: 'I call the duty manager.', ...extra }) as never

describe('LiveDrills', () => {
  it('sends the situation and questions only, never expected points or hints', async () => {
    const { drills, sent } = setup()
    const view = await drills.open('drill-1')
    const open = sent.find((m) => m.type === 'drill.open')!
    expect(open.payload.steps).toEqual([{ id: 's1', prompt: 'Who do you notify first?' }])
    const text = JSON.stringify(open.payload)
    expect(text).not.toContain('Call the duty manager')
    expect(text).not.toContain('chain of command')
    expect(text).not.toContain('Log the time')
    expect(view.status).toBe('open')
    expect(view.participants).toEqual([])
  })

  it('refuses a drill that is not Ready', async () => {
    const s = setup()
    s.drills = new LiveDrills({
      send: async () => undefined,
      log: { append: async () => undefined },
      runs: {
        ...({} as DrillRuns),
        getDrill: async () => ({ ...DRILL, status: 'draft' }) as MicroDrill,
        mode: async () => ({ assessment: 'model' }),
      },
      seats: () => [],
      now: () => 0,
      changed: () => undefined,
    })
    await expect(s.drills.open('drill-1')).rejects.toThrow(/Ready/)
  })

  it('opening an open drill again returns the open one', async () => {
    const { drills, sent } = setup()
    const a = await drills.open('drill-1')
    const b = await drills.open('drill-1')
    expect(b.liveId).toBe(a.liveId)
    expect(sent.filter((m) => m.type === 'drill.open')).toHaveLength(1)
  })

  it('gives each device its own run and answers only that device', async () => {
    const { drills, sent, started } = setup()
    const { liveId } = await drills.open('drill-1')
    await drills.onAnswer(clientA, answer(liveId))
    await drills.onAnswer(clientB, answer(liveId))
    await drills.onAnswer(clientA, answer(liveId))
    expect(started).toEqual(['Participant 1', 'Participant 2'])
    const replies = sent.filter((m) => m.type === 'drill.feedback')
    expect(replies.map((r) => r.to)).toEqual([
      `client:${clientA}`,
      `client:${clientB}`,
      `client:${clientA}`,
    ])
    expect(replies[0]!.payload).toMatchObject({
      kind: 'result',
      covered: ['Call the duty manager'],
      left: 1,
      followUp: 'What do you write down?',
      hintOffer: 1,
    })
  })

  it('hands out the next prewritten hint on request', async () => {
    const { drills, sent } = setup()
    const { liveId } = await drills.open('drill-1')
    await drills.onAnswer(clientA, { drillId: liveId, stepId: 's1', ask: 'hint' } as never)
    const reply = sent.filter((m) => m.type === 'drill.feedback').at(-1)!
    expect(reply.payload).toMatchObject({
      kind: 'hint',
      hint: { level: 1, text: 'Think about the chain of command.' },
    })
  })

  it('ignores a device that is not a player, a closed drill, and an unknown question', async () => {
    const { drills, sent, logged } = setup()
    const { liveId } = await drills.open('drill-1')
    await drills.onAnswer(clientEval, answer(liveId))
    await drills.onAnswer(clientA, answer(liveId, { stepId: 'nope' }))
    await drills.close(liveId)
    await drills.onAnswer(clientA, answer(liveId))
    expect(sent.filter((m) => m.type === 'drill.feedback')).toHaveLength(0)
    expect(logged.filter((l) => l.kind === 'anomaly')).toHaveLength(3)
  })

  it('asks for an answer before checking, and caps checks per device', async () => {
    const { drills, sent } = setup()
    const { liveId } = await drills.open('drill-1')
    await drills.onAnswer(clientA, answer(liveId, { text: '   ' }))
    expect(sent.at(-1)!.payload).toMatchObject({ kind: 'error', message: 'Write an answer first.' })
    for (let i = 0; i < MAX_CHECKS_PER_DEVICE; i++) await drills.onAnswer(clientA, answer(liveId))
    await drills.onAnswer(clientA, answer(liveId))
    expect(sent.at(-1)!.payload).toMatchObject({ kind: 'error' })
  })

  it('in checklist mode returns the points to tick, then records the ticked ones', async () => {
    const { drills, sent } = setup('checklist')
    const { liveId } = await drills.open('drill-1')
    await drills.onAnswer(clientA, answer(liveId))
    expect(sent.at(-1)!.payload).toMatchObject({
      kind: 'checklist',
      points: [
        { id: 'p1', text: 'Call the duty manager' },
        { id: 'p2', text: 'Log the time' },
      ],
      modelAnswer: 'Call the duty manager and log the time.',
    })
    await drills.onAnswer(clientA, answer(liveId, { ticked: ['p1'] }))
    expect(sent.at(-1)!.payload).toMatchObject({ kind: 'result', left: 1 })
  })

  it('shows progress by label and counts, and keeps answer text out of the log', async () => {
    const { drills, logged } = setup()
    const { liveId } = await drills.open('drill-1')
    await drills.onAnswer(clientA, answer(liveId, { text: 'secret wording' }))
    await drills.onAnswer(clientA, { drillId: liveId, stepId: 's1', ask: 'hint' } as never)
    const [view] = drills.list()
    expect(view!.participants).toEqual([
      { label: 'Participant 1', online: true, answered: 1, hints: 1, runId: 'run-1' },
    ])
    expect(JSON.stringify(logged)).not.toContain('secret wording')
  })

  it('closing finishes every run once, reports to the program and tells devices', async () => {
    const { drills, sent, finished, reported } = setup()
    const { liveId } = await drills.open('drill-1')
    await drills.onAnswer(clientA, answer(liveId))
    await drills.onAnswer(clientB, answer(liveId))
    const closed = await drills.close(liveId)
    await drills.close(liveId)
    expect(closed.status).toBe('closed')
    expect(finished).toEqual(['run-1', 'run-2'])
    expect(reported()).toBe(1)
    expect(sent.filter((m) => m.type === 'drill.close')).toHaveLength(1)
  })
})
