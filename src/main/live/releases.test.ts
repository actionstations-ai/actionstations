import { describe, expect, it } from 'vitest'
import type { InjectReleasePayload } from '@shared/live/schemas'
import { Delivery, type DeliverySeat } from './releases'

const RELEASE_ID = 'AAAAAAAAAAAAAAAAAAAAAA'
const ids = {
  ops: 'opsopsopsopsopsopsops',
  pio: 'piopiopiopiopiopiopio',
  eva: 'evaevaevaevaevaevaeva',
}

const seats: DeliverySeat[] = [
  { clientId: ids.ops, kind: 'player', roleId: 'ops', teamId: 'operations', label: 'Operations' },
  { clientId: ids.pio, kind: 'player', roleId: 'pio', label: 'PIO' },
  { clientId: ids.eva, kind: 'evaluator', label: 'Evaluator' },
]

function release(over: Partial<InjectReleasePayload> = {}): InjectReleasePayload {
  return {
    releaseId: RELEASE_ID,
    mselRowId: 'I-06',
    title: 'FIDS board',
    injectType: 'FIDS board',
    deliveryMode: 'hand_to_role',
    text: { body: 'Board: Departures', altText: 'FIDS board' },
    exerciseTime: '1:15',
    targets: ['role:ops'],
    media: [],
    ...over,
  }
}

function setup() {
  const sent: { type: string; to: string; payload: Record<string, unknown>; key: string }[] = []
  const logged: { kind: string; data: Record<string, unknown>; ref?: unknown }[] = []
  let changes = 0
  const delivery = new Delivery({
    send: async (type, to, payload, key) => void sent.push({ type, to, payload, key }),
    log: { append: async (e) => void logged.push(e) },
    seats: () => seats,
    clientRef: async (id) => id.slice(0, 3).padEnd(8, '0'),
    now: () => 5_000,
    changed: () => void changes++,
  })
  return { delivery, sent, logged, changes: () => changes }
}

describe('Delivery.release', () => {
  it('sends to each target and gives evaluators and observers a copy', async () => {
    const { delivery, sent, logged } = setup()
    await delivery.release(release({ targets: ['role:ops', 'team:it'] }))
    expect(sent.map((s) => s.to)).toEqual([
      'role:ops',
      'team:it',
      'role:evaluators',
      'role:observers',
    ])
    expect(sent.every((s) => s.type === 'inject.release')).toBe(true)
    expect(logged[0]).toMatchObject({ kind: 'inject.release', ref: { releaseId: RELEASE_ID } })
    expect(logged[0]!.data.textSha256).toMatch(/^[a-f0-9]{64}$/)
  })

  it('never puts the expected action in a players-key frame', async () => {
    const { delivery, sent } = setup()
    await delivery.release(release(), { expectedAction: 'Call the duty manager' })
    const withAction = sent.filter((s) => s.payload.expectedAction)
    expect(withAction).toHaveLength(1)
    expect(withAction[0]).toMatchObject({ to: 'role:evaluators', key: 'staff' })
    expect(
      sent.filter((s) => s.key === 'players').every((s) => !('expectedAction' in s.payload)),
    ).toBe(true)
  })

  it('does not release the same row twice while it is out', async () => {
    const { delivery } = setup()
    await delivery.release(release())
    expect(delivery.activeFor('I-06')).toBe(RELEASE_ID)
  })
})

describe('Delivery receipts', () => {
  it('counts delivered, read and actioned for the devices the release was for', async () => {
    const { delivery } = setup()
    await delivery.release(release())
    await delivery.onReceipt(ids.ops, 1, { releaseId: RELEASE_ID, status: 'delivered', at: 1 })
    await delivery.onReceipt(ids.ops, 2, { releaseId: RELEASE_ID, status: 'read', at: 2 })
    const s = await delivery.summary(RELEASE_ID)
    expect(s.counts).toEqual({ to: 1, delivered: 1, read: 1, actioned: 0 })
    expect(s.perClient).toEqual([
      expect.objectContaining({ seat: 'Operations', delivered: 5_000, read: 5_000 }),
    ])
  })

  it('ignores a repeated receipt and logs it once', async () => {
    const { delivery, logged } = setup()
    await delivery.release(release())
    const r = { releaseId: RELEASE_ID, status: 'read' as const, at: 1 }
    await delivery.onReceipt(ids.ops, 1, r)
    await delivery.onReceipt(ids.ops, 2, r)
    expect(logged.filter((e) => e.kind === 'inject.receipt')).toHaveLength(1)
  })

  it('rejects a receipt from a seat the release was not for, and logs an anomaly', async () => {
    const { delivery, logged } = setup()
    await delivery.release(release())
    const ok = await delivery.onReceipt(ids.pio, 1, {
      releaseId: RELEASE_ID,
      status: 'read',
      at: 1,
    })
    expect(ok).toBe(false)
    expect(logged.at(-1)).toMatchObject({ kind: 'anomaly', data: { what: 'receipt rejected' } })
    expect((await delivery.summary(RELEASE_ID)).counts.read).toBe(0)
  })

  it('accepts an evaluator receipt without counting it as a target', async () => {
    const { delivery } = setup()
    await delivery.release(release())
    expect(
      await delivery.onReceipt(ids.eva, 1, { releaseId: RELEASE_ID, status: 'read', at: 1 }),
    ).toBe(true)
    expect((await delivery.summary(RELEASE_ID)).counts).toMatchObject({ to: 1, read: 0 })
  })

  it('rejects a receipt for an unknown release', async () => {
    const { delivery } = setup()
    expect(
      await delivery.onReceipt(ids.ops, 1, { releaseId: RELEASE_ID, status: 'read', at: 1 }),
    ).toBe(false)
  })
})

describe('Delivery resend and retract', () => {
  it('resends the same release id to a new target and adds it to the counts', async () => {
    const { delivery, sent } = setup()
    await delivery.release(release())
    sent.length = 0
    const s = await delivery.resend(RELEASE_ID, ['role:pio'])
    expect(sent.map((x) => x.to)).toEqual(['role:pio'])
    expect(sent[0]!.payload.releaseId).toBe(RELEASE_ID)
    expect(s.counts.to).toBe(2)
    expect(
      await delivery.onReceipt(ids.pio, 1, { releaseId: RELEASE_ID, status: 'delivered', at: 1 }),
    ).toBe(true)
  })

  it('recalls to every target and the staff copies, then allows delivering again', async () => {
    const { delivery, sent, logged } = setup()
    await delivery.release(release())
    sent.length = 0
    await delivery.retract(RELEASE_ID)
    expect(sent.map((x) => x.to)).toEqual(['role:ops', 'role:evaluators', 'role:observers'])
    expect(sent[0]).toMatchObject({
      type: 'inject.recall',
      payload: { releaseId: RELEASE_ID, reason: 'withdrawn', text: 'Withdrawn by the facilitator' },
    })
    expect(logged.at(-1)).toMatchObject({ kind: 'inject.retract' })
    expect(delivery.activeFor('I-06')).toBeUndefined()
    await expect(delivery.resend(RELEASE_ID, ['role:pio'])).rejects.toThrow(/withdrawn/)
  })
})
