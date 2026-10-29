import { describe, expect, it, vi } from 'vitest'
import { branchEntriesForLive, clockKey, clockPayload, sendStaffNotice } from './live-control'

describe('clockPayload', () => {
  it('carries the clock devices follow, with the last change as the reason', () => {
    const payload = clockPayload({
      elapsedMin: 20,
      runningSince: '2026-10-29T10:00:00.000Z',
      rate: 4,
      clockLog: [{ at: '2026-10-29T10:00:00.000Z', kind: 'rate', fromMin: 20, toMin: 20, rate: 4 }],
    } as never)
    expect(payload).toEqual({
      elapsedMin: 20,
      runningSince: Date.parse('2026-10-29T10:00:00.000Z'),
      rate: 4,
      reason: 'rate',
    })
  })

  it('omits runningSince while paused and defaults the rate to 1', () => {
    expect(clockPayload({ elapsedMin: 5 } as never)).toEqual({ elapsedMin: 5, rate: 1 })
  })

  it('has the same key for the same clock whatever the reason', () => {
    const a = clockPayload({ elapsedMin: 5, rate: 1 } as never)
    expect(clockKey(a)).toBe(clockKey({ ...a, reason: 'nudge' }))
    expect(clockKey(a)).not.toBe(clockKey({ ...a, elapsedMin: 6 }))
  })
})

describe('branchEntriesForLive', () => {
  it('keeps decisions and proposals and drops releases', () => {
    const out = branchEntriesForLive([
      { kind: 'decision.open', rowId: 'I-05', data: { decisionId: 'D1' } },
      { kind: 'inject.release', rowId: 'I-05', data: {} },
      { kind: 'proposal.reject', data: { hash: 'abc' } },
    ])
    expect(out.map((e) => e.kind)).toEqual(['decision.open', 'proposal.reject'])
    expect(out[0]).toMatchObject({ actor: { kind: 'controller' }, ref: { rowId: 'I-05' } })
  })
})

describe('sendStaffNotice', () => {
  const crypto = { random: (n: number) => new Uint8Array(n).fill(1) } as never

  it('seals to the staff key for evaluators only and logs it', async () => {
    const send = vi.fn(async () => undefined)
    const append = vi.fn(async () => undefined)
    await sendStaffNotice({ send } as never, { append }, crypto, {
      text: '  Check I-07  ',
      level: 'urgent',
      rowId: 'I-07',
    })
    expect(send).toHaveBeenCalledWith(
      'controller.notice',
      'role:evaluators',
      expect.objectContaining({ text: 'Check I-07', level: 'urgent', ref: 'I-07' }),
      { key: 'staff' },
    )
    expect(append).toHaveBeenCalledWith(expect.objectContaining({ kind: 'controller.notice' }))
  })

  it('refuses an empty notice', async () => {
    await expect(
      sendStaffNotice({ send: vi.fn() } as never, { append: vi.fn() }, crypto, {
        text: '   ',
        level: 'info',
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION' })
  })
})
