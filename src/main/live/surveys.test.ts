import { describe, expect, it, vi } from 'vitest'
import { Survey, type SurveyResponse } from '@shared/schemas'
import type { SessionLogInput } from '@shared/schemas/live'
import { LiveSurveys, type SurveySeat } from './surveys'

const NOW = '2026-10-28T14:00:00.000Z'
const survey = Survey.parse({
  id: 'FEEDBACK',
  title: 'Participant feedback',
  kind: 'participant_feedback',
  createdAt: NOW,
  updatedAt: NOW,
  sections: [
    {
      id: 's',
      questions: [
        { id: 'r1', type: 'rating', text: 'The scenario was realistic', required: true },
        { id: 't1', type: 'text', text: 'What would you change?' },
      ],
    },
  ],
})

const seat = (clientId: string, over: Partial<SurveySeat> = {}): SurveySeat => ({
  clientId,
  kind: 'player',
  roleId: 'ops',
  label: 'Ops',
  online: true,
  ...over,
})

function setup(
  seats: SurveySeat[] = [seat('dev-a'), seat('dev-b', { roleId: 'it', teamId: 'it' })],
) {
  const sent: { type: string; to: string; payload: Record<string, unknown> }[] = []
  const logged: SessionLogInput[] = []
  const stored: SurveyResponse[] = []
  const timers: (() => void)[] = []
  const live = new LiveSurveys({
    send: async (type, to, payload) => void sent.push({ type, to, payload }),
    log: { append: async (input) => void logged.push(input) },
    load: async () => survey,
    store: async (r) => stored.push(r),
    seats: () => seats,
    channel: 'live',
    now: () => Date.parse(NOW) + 25_000,
    changed: vi.fn(),
    timers: { set: (fn) => timers.push(fn), clear: () => undefined },
  })
  return { live, sent, logged, stored, timers }
}

const answer = (deliveryId: string, rating: number) => ({
  surveyId: deliveryId,
  answers: [{ questionId: 'r1', value: rating }],
})

describe('LiveSurveys', () => {
  it('sends the survey to its targets and logs the opening', async () => {
    const { live, sent, logged } = setup()
    const view = await live.open('FEEDBACK', { targets: ['role:ops', 'team:it'] })
    expect(sent.map((s) => [s.type, s.to])).toEqual([
      ['survey.open', 'role:ops'],
      ['survey.open', 'team:it'],
    ])
    expect(sent[0]!.payload).toMatchObject({ anonymous: true, targets: ['role:ops', 'team:it'] })
    expect(view).toMatchObject({ status: 'open', responses: 0, eligible: 2 })
    expect(logged[0]).toMatchObject({ kind: 'survey.open', ref: { surveyId: view.deliveryId } })
  })

  it('opening an open survey returns the same opening', async () => {
    const { live, sent } = setup()
    const first = await live.open('FEEDBACK')
    const again = await live.open('FEEDBACK')
    expect(again.deliveryId).toBe(first.deliveryId)
    expect(sent).toHaveLength(1)
  })

  it('stores a response with no sender in the log or the response file', async () => {
    const { live, logged, stored } = setup()
    const { deliveryId } = await live.open('FEEDBACK')
    await live.onResponse('dev-a', answer(deliveryId, 4))
    const entry = logged.find((l) => l.kind === 'survey.response')!
    expect(JSON.stringify(entry)).not.toMatch(/dev-a|ops|clientRef/)
    expect(entry.actor).toEqual({ kind: 'client' })
    expect(JSON.stringify(stored[0])).not.toMatch(/dev-a|ops/)
    expect(stored[0]).toMatchObject({
      surveyId: 'FEEDBACK',
      deliveryId,
      channel: 'live',
      at: '2026-10-28T14:00:00.000Z',
      answers: { r1: 4 },
    })
  })

  it('a second answer from the same device replaces the first', async () => {
    const { live, stored } = setup()
    const { deliveryId } = await live.open('FEEDBACK')
    await live.onResponse('dev-a', answer(deliveryId, 2))
    await live.onResponse('dev-a', answer(deliveryId, 5))
    expect(stored).toHaveLength(2)
    expect(stored[1]!.id).toBe(stored[0]!.id)
    expect(live.list()[0]!.responses).toBe(1)
  })

  it('counts one answer per device against the devices that could answer', async () => {
    const { live } = setup()
    const { deliveryId } = await live.open('FEEDBACK')
    await live.onResponse('dev-a', answer(deliveryId, 3))
    await live.onResponse('dev-b', answer(deliveryId, 5))
    expect(live.list()[0]).toMatchObject({ responses: 2, eligible: 2 })
  })

  it('drops answers outside the targets, for another opening, invalid, or after close', async () => {
    const { live, stored, logged } = setup()
    const { deliveryId } = await live.open('FEEDBACK', { targets: ['role:ops'] })
    await live.onResponse('dev-b', answer(deliveryId, 3))
    await live.onResponse('dev-a', answer('AAAAAAAAAAAAAAAAAAAAAA', 3))
    await live.onResponse('dev-a', { surveyId: deliveryId, answers: 'nope' })
    await live.onResponse('unknown', answer(deliveryId, 3))
    await live.close(deliveryId)
    await live.onResponse('dev-a', answer(deliveryId, 3))
    expect(stored).toHaveLength(0)
    expect(logged.filter((l) => l.kind === 'anomaly')).toHaveLength(5)
  })

  it('close tells devices, logs the count and is idempotent', async () => {
    const { live, sent, logged } = setup()
    const { deliveryId } = await live.open('FEEDBACK')
    await live.onResponse('dev-a', answer(deliveryId, 3))
    await live.close(deliveryId)
    await live.close(deliveryId)
    expect(sent.filter((s) => s.type === 'survey.close')).toHaveLength(1)
    expect(logged.filter((l) => l.kind === 'survey.close')).toHaveLength(1)
    expect(logged.find((l) => l.kind === 'survey.close')!.data).toMatchObject({ responses: 1 })
  })

  it('closes by itself when the time is up', async () => {
    const { live, timers } = setup()
    const view = await live.open('FEEDBACK', { durationSec: 60 })
    expect(view.closesAt).toBe(Date.parse(NOW) + 25_000 + 60_000)
    timers[0]!()
    await vi.waitFor(() => expect(live.list()[0]!.status).toBe('closed'))
  })

  it('does not send an archived survey', async () => {
    const archived = Survey.parse({ ...survey, status: 'archived' })
    const live = new LiveSurveys({
      send: async () => undefined,
      log: { append: async () => undefined },
      load: async () => archived,
      store: async () => 0,
      seats: () => [],
      channel: 'qr',
      now: () => 0,
      changed: () => undefined,
    })
    await expect(live.open('FEEDBACK')).rejects.toThrow(/archived/)
  })

  it('closeAll logs the close of what is still open', async () => {
    const { live, logged } = setup()
    await live.open('FEEDBACK')
    await live.closeAll()
    expect(logged.map((l) => l.kind)).toEqual(['survey.open', 'survey.close'])
  })
})
