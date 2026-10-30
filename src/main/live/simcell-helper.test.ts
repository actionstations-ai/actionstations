import { describe, expect, it } from 'vitest'
import type { SimcellDraft } from '@shared/schemas'
import { LiveSimcellHelpers, MAX_OFFERED, type HelperSeat } from './simcell-helper'

const draft = (id: string, over: Partial<SimcellDraft> = {}): SimcellDraft =>
  ({
    id,
    personaId: 'reporter',
    threadId: 'role:ops',
    trigger: 'player_message',
    text: `Reply ${id}`,
    inReplyToText: 'Is the terminal closed?',
    flags: [{ code: 'reveals_early', message: 'Mentions the closure' }],
    status: 'queued',
    ...over,
  }) as SimcellDraft

const HELPER = 'helper-0000000000000a'
const OTHER_HELPER = 'helper-0000000000000b'

function setup(initial: SimcellDraft[] = []) {
  const queue = { drafts: initial }
  const seats = new Map<string, HelperSeat>([
    [HELPER, { clientId: HELPER, kind: 'simcell', staff: true, online: true }],
    [
      'player-00000000000000',
      { clientId: 'player-00000000000000', kind: 'player', staff: false, online: true },
    ],
    [
      'eval-00000000000000000',
      { clientId: 'eval-00000000000000000', kind: 'evaluator', staff: true, online: true },
    ],
    [
      'fake-0000000000000000',
      { clientId: 'fake-0000000000000000', kind: 'simcell', staff: false, online: true },
    ],
  ])
  const sent: { to: string; payload: Record<string, unknown> }[] = []
  const resolved: Record<string, unknown>[] = []
  const logs: { kind: string; data?: Record<string, unknown> }[] = []
  const helpers = new LiveSimcellHelpers({
    send: async (to, payload) => void sent.push({ to, payload }),
    log: { append: async (input) => void logs.push(input as never) },
    seats: () => [...seats.values()],
    seatOf: (id) => seats.get(id),
    clientRef: async () => 'aaaaaaaa',
    queued: async () =>
      queue.drafts.map((d) => ({ draft: d, persona: 'Reporter', threadLabel: 'Reporter and Ops' })),
    resolve: async (req) => void resolved.push(req),
    changed: () => undefined,
  })
  return { helpers, queue, seats, sent, resolved, logs }
}

const wireIdOf = (sent: { payload: Record<string, unknown> }[]) =>
  sent[0]!.payload.draftId as string

describe('SimCell helper devices', () => {
  it('sends nothing while helper devices are off', async () => {
    const t = setup([draft('d1')])
    await t.helpers.sync()
    expect(t.sent).toEqual([])
  })

  it('offers a draft only to proven, online SimCell seats, sealed per device', async () => {
    const t = setup([draft('d1')])
    await t.helpers.setEnabled(true)
    expect(t.sent.map((s) => s.to)).toEqual([`client:${HELPER}`])
    expect(t.sent[0]!.payload).toMatchObject({
      revision: 1,
      status: 'queued',
      persona: 'Reporter',
      threadLabel: 'Reporter and Ops',
      playerMessage: 'Is the terminal closed?',
      text: 'Reply d1',
    })
    expect(t.sent[0]!.payload.draftId).not.toBe('d1')
  })

  it('does not offer a draft with no thread yet or a voice-call turn', async () => {
    const t = setup([
      draft('d1', { threadId: 'unassigned' }),
      draft('d2', { callId: 'call-1' }),
      draft('d3'),
    ])
    await t.helpers.setEnabled(true)
    expect(t.sent).toHaveLength(1)
    expect(t.sent[0]!.payload.text).toBe('Reply d3')
  })

  it('offers each draft once per device, and the waiting ones to a device that joins later', async () => {
    const t = setup([draft('d1')])
    await t.helpers.setEnabled(true)
    await t.helpers.sync()
    expect(t.sent).toHaveLength(1)
    t.seats.set(OTHER_HELPER, {
      clientId: OTHER_HELPER,
      kind: 'simcell',
      staff: true,
      online: true,
    })
    await t.helpers.onJoin()
    expect(t.sent.map((s) => s.to)).toEqual([`client:${HELPER}`, `client:${OTHER_HELPER}`])
  })

  it('caps how many drafts a helper holds', async () => {
    const many = Array.from({ length: MAX_OFFERED + 5 }, (_, i) => draft(`d${i}`))
    const t = setup(many)
    await t.helpers.setEnabled(true)
    expect(t.sent).toHaveLength(MAX_OFFERED)
  })

  it('applies an approve once, as the facilitator’s own send, and logs it', async () => {
    const t = setup([draft('d1')])
    await t.helpers.setEnabled(true)
    const wire = wireIdOf(t.sent)
    const action = { draftId: wire, revision: 1, action: 'approve' as const }
    expect(await t.helpers.onAction(HELPER, 1, action)).toBe(true)
    expect(t.resolved).toEqual([{ draftId: 'd1', action: 'send' }])
    expect(t.logs.at(-1)).toMatchObject({
      kind: 'simcell.draft',
      data: { event: 'helper_action', action: 'approve', draftId: 'd1' },
    })
    // A replay of the same frame finds nothing to act on.
    expect(await t.helpers.onAction(HELPER, 2, action)).toBe(false)
    expect(t.resolved).toHaveLength(1)
  })

  it('passes an edit’s text on and a discard as a discard', async () => {
    const t = setup([draft('d1'), draft('d2')])
    await t.helpers.setEnabled(true)
    const [a, b] = t.sent.map((s) => s.payload.draftId as string)
    await t.helpers.onAction(HELPER, 1, {
      draftId: a!,
      revision: 1,
      action: 'edit',
      text: 'New text',
    })
    await t.helpers.onAction(HELPER, 2, { draftId: b!, revision: 1, action: 'discard' })
    expect(t.resolved).toEqual([
      { draftId: 'd1', action: 'edit', text: 'New text' },
      { draftId: 'd2', action: 'discard' },
    ])
  })

  it.each([
    ['a player device', 'player-00000000000000'],
    ['an evaluator', 'eval-00000000000000000'],
    ['a SimCell claim without the staff key', 'fake-0000000000000000'],
    ['an unknown device', 'nobody-000000000000000'],
  ])('refuses an action from %s and logs it', async (_name, from) => {
    const t = setup([draft('d1')])
    await t.helpers.setEnabled(true)
    const action = { draftId: wireIdOf(t.sent), revision: 1, action: 'approve' as const }
    expect(await t.helpers.onAction(from, 1, action)).toBe(false)
    expect(t.resolved).toEqual([])
    expect(t.logs.at(-1)).toMatchObject({
      kind: 'anomaly',
      data: { what: 'simcell action rejected' },
    })
  })

  it('refuses a device the draft was not offered to, a stale revision and an invented id', async () => {
    const t = setup([draft('d1')])
    await t.helpers.setEnabled(true)
    t.seats.set(OTHER_HELPER, {
      clientId: OTHER_HELPER,
      kind: 'simcell',
      staff: true,
      online: true,
    })
    const wire = wireIdOf(t.sent)
    expect(
      await t.helpers.onAction(OTHER_HELPER, 1, { draftId: wire, revision: 1, action: 'approve' }),
    ).toBe(false)
    expect(
      await t.helpers.onAction(HELPER, 2, { draftId: wire, revision: 7, action: 'approve' }),
    ).toBe(false)
    expect(
      await t.helpers.onAction(HELPER, 3, { draftId: 'd1', revision: 1, action: 'approve' }),
    ).toBe(false)
    expect(t.resolved).toEqual([])
  })

  it('refuses actions after the facilitator turns helper devices off', async () => {
    const t = setup([draft('d1')])
    await t.helpers.setEnabled(true)
    const wire = wireIdOf(t.sent)
    await t.helpers.setEnabled(false)
    expect(
      await t.helpers.onAction(HELPER, 1, { draftId: wire, revision: 1, action: 'approve' }),
    ).toBe(false)
    expect(t.resolved).toEqual([])
  })

  it('withdraws a draft the facilitator settled first, with a higher revision', async () => {
    const t = setup([draft('d1')])
    await t.helpers.setEnabled(true)
    const wire = wireIdOf(t.sent)
    t.queue.drafts = []
    await t.helpers.sync()
    expect(t.sent.at(-1)).toMatchObject({
      to: `client:${HELPER}`,
      payload: { draftId: wire, revision: 2, status: 'withdrawn' },
    })
    expect(
      await t.helpers.onAction(HELPER, 1, { draftId: wire, revision: 1, action: 'approve' }),
    ).toBe(false)
  })
})
