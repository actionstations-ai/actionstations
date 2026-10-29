import { describe, expect, it } from 'vitest'
import { nextUtcMidnight, utcDay } from '../src/env'
import { QuotaObject } from '../src/quota-object'
import { fakeEnv, START } from './do-harness'
import { FakeState } from './shim'

function quota(perDay = 4, perAddress = 2) {
  const state = new FakeState()
  const clock = { now: START }
  const object = new QuotaObject(
    state.asState(),
    fakeEnv(),
    { perDay, perAddress },
    () => clock.now,
  )
  const take = async (address = '203.0.113.1') =>
    (await (
      await object.fetch(
        new Request('https://quota/take', { method: 'POST', body: JSON.stringify({ address }) }),
      )
    ).json()) as { ok: boolean; reason?: string; remaining: number; resetAt: number }
  return { state, clock, object, take }
}

describe('QuotaObject', () => {
  it('counts the day for the account and for each address, and sets one alarm for midnight', async () => {
    const q = quota(4, 2)
    expect(await q.take('203.0.113.1')).toEqual({
      ok: true,
      remaining: 3,
      resetAt: nextUtcMidnight(START),
    })
    expect(await q.take('203.0.113.1')).toMatchObject({ ok: true, remaining: 2 })
    expect(await q.take('203.0.113.1')).toMatchObject({
      ok: false,
      reason: 'address',
      remaining: 2,
    })
    expect(await q.take('2001:db8:1:2::1')).toMatchObject({ ok: true, remaining: 1 })
    expect(await q.take('2001:db8:1:2::9')).toMatchObject({ ok: true, remaining: 0 })
    expect(await q.take('2001:db8:1:2::a')).toMatchObject({ ok: false, reason: 'day' })
    expect(await q.take('203.0.113.9')).toMatchObject({ ok: false, reason: 'day' })
    expect(q.state.alarm).toBe(nextUtcMidnight(START))
    expect(q.object.peek()).toMatchObject({ ok: false, remaining: 0 })
  })

  it('starts afresh on the next UTC day and forgets earlier days when the alarm fires', async () => {
    const q = quota(1, 1)
    expect((await q.take()).ok).toBe(true)
    expect((await q.take()).ok).toBe(false)
    q.clock.now = nextUtcMidnight(START) + 1
    expect((await q.take()).ok).toBe(true)
    expect(q.state.sql.count('quota')).toBe(4)
    await q.object.alarm()
    expect(q.state.sql.count('quota')).toBe(2)
    expect(String(q.state.sql.exec(`SELECT DISTINCT day FROM quota`).one().day)).toBe(
      utcDay(q.clock.now),
    )
  })

  it('answers 404 for anything but /take and /peek, and takes a bodiless request as an unknown address', async () => {
    const q = quota()
    expect((await q.object.fetch(new Request('https://quota/other'))).status).toBe(404)
    expect((await q.object.fetch(new Request('https://quota/peek'))).status).toBe(200)
    expect(
      (await q.object.fetch(new Request('https://quota/take', { method: 'POST' }))).status,
    ).toBe(200)
  })

  it('keys days in UTC', () => {
    expect(utcDay(Date.UTC(2026, 0, 31, 23, 59, 59))).toBe('2026-01-31')
    expect(utcDay(Date.UTC(2026, 1, 1, 0, 0, 0))).toBe('2026-02-01')
    expect(nextUtcMidnight(Date.UTC(2026, 11, 31, 5))).toBe(Date.UTC(2027, 0, 1))
  })
})
