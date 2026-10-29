import { describe, expect, it } from 'vitest'
import { nextUtcMidnight, utcDay } from '../src/env'
import { QuotaObject } from '../src/quota-object'
import { fakeEnv, START } from './do-harness'
import { FakeState } from './shim'

function quota(limit = 3) {
  const state = new FakeState()
  const clock = { now: START }
  const object = new QuotaObject(state.asState(), fakeEnv(), limit, () => clock.now)
  const take = async () =>
    (await (await object.fetch(new Request('https://quota/take', { method: 'POST' }))).json()) as {
      ok: boolean
      remaining: number
      resetAt: number
    }
  return { state, clock, object, take }
}

describe('QuotaObject', () => {
  it('hands out the day’s sessions, then refuses, and sets one alarm for midnight', async () => {
    const q = quota(3)
    expect(await q.take()).toEqual({ ok: true, remaining: 2, resetAt: nextUtcMidnight(START) })
    expect(await q.take()).toMatchObject({ ok: true, remaining: 1 })
    expect(await q.take()).toMatchObject({ ok: true, remaining: 0 })
    expect(await q.take()).toMatchObject({ ok: false, remaining: 0 })
    expect(q.state.alarm).toBe(nextUtcMidnight(START))
    expect(q.object.peek()).toMatchObject({ ok: false, remaining: 0 })
  })

  it('starts afresh on the next UTC day and forgets earlier days when the alarm fires', async () => {
    const q = quota(1)
    expect((await q.take()).ok).toBe(true)
    expect((await q.take()).ok).toBe(false)
    q.clock.now = nextUtcMidnight(START) + 1
    expect((await q.take()).ok).toBe(true)
    expect(q.state.sql.count('quota')).toBe(2)
    await q.object.alarm()
    expect(q.state.sql.count('quota')).toBe(1)
    expect(String(q.state.sql.exec(`SELECT day FROM quota`).one().day)).toBe(utcDay(q.clock.now))
  })

  it('answers 404 for anything but /take and /peek', async () => {
    const q = quota()
    expect((await q.object.fetch(new Request('https://quota/other'))).status).toBe(404)
    expect((await q.object.fetch(new Request('https://quota/peek'))).status).toBe(200)
  })

  it('keys days in UTC', () => {
    expect(utcDay(Date.UTC(2026, 0, 31, 23, 59, 59))).toBe('2026-01-31')
    expect(utcDay(Date.UTC(2026, 1, 1, 0, 0, 0))).toBe('2026-02-01')
    expect(nextUtcMidnight(Date.UTC(2026, 11, 31, 5))).toBe(Date.UTC(2027, 0, 1))
  })
})
