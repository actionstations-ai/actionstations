import { describe, expect, it } from 'vitest'
import { CLOSE_CODES } from '../../shared/live/protocol'
import {
  BACKOFF_MAX_MS,
  BACKOFF_MIN_MS,
  backoffDelay,
  ReconnectScheduler,
  terminalReason,
} from './reconnect'
import { FakeTimers } from './fake-timers'

describe('backoffDelay', () => {
  it('starts between 0.25 s and 0.5 s and doubles each attempt', () => {
    expect(backoffDelay(0, () => 0)).toBe(BACKOFF_MIN_MS / 2)
    expect(backoffDelay(0, () => 1)).toBe(BACKOFF_MIN_MS)
    expect(backoffDelay(1, () => 1)).toBe(1000)
    expect(backoffDelay(3, () => 1)).toBe(4000)
  })

  it('never waits longer than 30 s', () => {
    expect(backoffDelay(20, () => 1)).toBe(BACKOFF_MAX_MS)
    expect(backoffDelay(20, () => 0)).toBe(BACKOFF_MAX_MS / 2)
  })
})

describe('terminalReason', () => {
  it('maps the server close codes that end the session for this page', () => {
    expect(terminalReason(CLOSE_CODES.VERSION)).toBe('update-required')
    expect(terminalReason(CLOSE_CODES.BAD_JOIN_TOKEN)).toBe('link-invalid')
    expect(terminalReason(CLOSE_CODES.SESSION_ENDED)).toBe('ended')
    expect(terminalReason(CLOSE_CODES.KICKED)).toBe('removed')
    expect(terminalReason(CLOSE_CODES.CLIENT_ID_IN_USE)).toBe('device-conflict')
  })

  it('treats normal, abnormal, full and rate-limited closes as retryable', () => {
    for (const code of [1000, 1001, 1006, CLOSE_CODES.SESSION_FULL, CLOSE_CODES.RATE_LIMITED])
      expect(terminalReason(code)).toBeUndefined()
  })
})

describe('ReconnectScheduler', () => {
  function make() {
    const timers = new FakeTimers()
    let attempts = 0
    const s = new ReconnectScheduler({ attempt: () => attempts++, timers, random: () => 1 })
    return { timers, s, attempts: () => attempts }
  }

  it('retries after the backoff delay and grows it on repeated failures', () => {
    const { timers, s, attempts } = make()
    expect(s.failed()).toBe(500)
    timers.advance(499)
    expect(attempts()).toBe(0)
    timers.advance(1)
    expect(attempts()).toBe(1)
    expect(s.failed()).toBe(1000)
    expect(s.failed()).toBe(2000)
    expect(timers.count).toBe(1)
  })

  it('honours a server retry-after when it is longer than the backoff', () => {
    const { s } = make()
    expect(s.failed(5000)).toBe(5000)
  })

  it('wake() retries at once when a retry is pending and does nothing otherwise', () => {
    const { timers, s, attempts } = make()
    expect(s.wake()).toBe(false)
    s.failed()
    expect(s.wake()).toBe(true)
    expect(attempts()).toBe(1)
    expect(timers.count).toBe(0)
  })

  it('connected() resets the backoff; stop() cancels and refuses further retries', () => {
    const { timers, s, attempts } = make()
    s.failed()
    s.failed()
    s.connected()
    expect(s.attempts).toBe(0)
    expect(s.failed()).toBe(500)
    s.stop()
    timers.advance(60_000)
    expect(attempts()).toBe(0)
    expect(s.failed()).toBe(-1)
    expect(s.wake()).toBe(false)
  })
})
