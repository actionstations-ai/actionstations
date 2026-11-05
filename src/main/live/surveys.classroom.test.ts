// Classroom on survey prompts (#724, #739, ADR-0090): a reflection says it is not anonymous and
// reaches the classroom hook; a student with extra time keeps answering after the shared close
// while everyone else is closed on time.
import { describe, expect, it, vi } from 'vitest'
import { Survey, type SurveyResponse } from '@shared/schemas'
import { LiveSurveys, type SurveySeat } from './surveys'

const NOW = '2026-10-28T14:00:00.000Z'
const base = {
  id: 'REFLECT',
  title: 'Reflection',
  kind: 'custom' as const,
  createdAt: NOW,
  updatedAt: NOW,
  sections: [{ id: 's', questions: [{ id: 't1', type: 'text', text: 'What would you change?' }] }],
}
const seat = (clientId: string): SurveySeat => ({
  clientId,
  kind: 'player',
  roleId: clientId,
  label: clientId,
  online: true,
  displayName: clientId,
})

function setup(survey: Survey, multipliers: Record<string, number>) {
  let clock = Date.parse(NOW)
  const sent: { type: string; to: string; payload: Record<string, unknown> }[] = []
  const timers: Array<{ fn: () => void; ms: number }> = []
  const stored: SurveyResponse[] = []
  const reflections: string[] = []
  const live = new LiveSurveys({
    send: async (type, to, payload) => void sent.push({ type, to, payload }),
    log: { append: async () => undefined },
    load: async () => survey,
    store: async (r) => stored.push(r),
    seats: () => [seat('ada'), seat('bo')],
    channel: 'live',
    classroom: {
      multiplier: async (s) => multipliers[s.clientId] ?? 1,
      reflection: async (s) => void reflections.push(s.clientId),
    },
    now: () => clock,
    changed: vi.fn(),
    timers: { set: (fn, ms) => timers.push({ fn, ms }) as never, clear: () => undefined },
  })
  return { live, sent, timers, stored, reflections, advance: (ms: number) => void (clock += ms) }
}

const answer = (deliveryId: string) => ({
  surveyId: deliveryId,
  answers: [{ questionId: 't1', value: 'Ask earlier' }],
})

describe('classroom reflection', () => {
  it('is not announced as anonymous and reaches the hook once per answer', async () => {
    const { live, sent, reflections } = setup(
      Survey.parse({ ...base, classroomReflection: true }),
      {},
    )
    const view = await live.open('REFLECT')
    expect(sent[0]!.payload).toMatchObject({ anonymous: false })
    await live.onResponse('ada', answer(view.deliveryId))
    expect(reflections).toEqual(['ada'])
  })

  it('stays anonymous and skips the hook for an ordinary survey', async () => {
    const { live, sent, reflections } = setup(Survey.parse(base), {})
    const view = await live.open('REFLECT')
    expect(sent[0]!.payload).toMatchObject({ anonymous: true })
    await live.onResponse('ada', answer(view.deliveryId))
    expect(reflections).toEqual([])
  })
})

describe('extended time', () => {
  it('gives the student a later closesAt and closes everyone else on time', async () => {
    const { live, sent, timers, stored, advance } = setup(Survey.parse(base), { ada: 1.5 })
    const view = await live.open('REFLECT', { durationSec: 100 })
    const opens = sent.filter((s) => s.type === 'survey.open')
    expect(opens).toHaveLength(2) // the shared frame and Ada's own
    const own = opens.find((o) => o.to === 'client:ada')!
    const shared = opens.find((o) => o.to === 'all')!
    expect((own.payload.closesAt as number) - (shared.payload.closesAt as number)).toBe(50_000)

    advance(100_000)
    timers[0]!.fn() // the shared time ends
    await new Promise((r) => setTimeout(r))
    const closes = sent.filter((s) => s.type === 'survey.close')
    expect(closes.map((c) => c.to)).toEqual(['client:bo']) // Ada is not closed yet

    await live.onResponse('bo', answer(view.deliveryId))
    expect(stored).toHaveLength(0) // Bo is past the shared time
    await live.onResponse('ada', answer(view.deliveryId))
    expect(stored).toHaveLength(1) // Ada still has her extra time

    advance(50_001)
    timers[1]!.fn() // her time ends
    await new Promise((r) => setTimeout(r))
    expect(sent.filter((s) => s.type === 'survey.close').map((c) => c.to)).toContain('all')
    await live.onResponse('ada', answer(view.deliveryId))
    expect(stored).toHaveLength(1)
  })

  it('closes at the shared time when nobody has extra time', async () => {
    const { live, sent, timers } = setup(Survey.parse(base), {})
    await live.open('REFLECT', { durationSec: 100 })
    timers[0]!.fn()
    await new Promise((r) => setTimeout(r))
    expect(sent.filter((s) => s.type === 'survey.close').map((c) => c.to)).toEqual(['all'])
  })
})
