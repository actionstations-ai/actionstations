import { describe, expect, it } from 'vitest'
import { dailyLimitResponse, errorResponse, isLimitError } from '../src/errors'
import { START } from './do-harness'

describe('errors', () => {
  it('recognises the runtime’s free-plan limit errors', () => {
    expect(
      isLimitError(new Error('Durable Object storage operation exceeded the daily limit')),
    ).toBe(true)
    expect(isLimitError(new Error('Too many requests'))).toBe(true)
    expect(isLimitError('quota reached')).toBe(true)
    expect(isLimitError(new TypeError('x is not a function'))).toBe(false)
    expect(isLimitError(undefined)).toBe(false)
  })

  it('answers 503 DAILY_LIMIT with a Retry-After at the next UTC midnight', async () => {
    const res = dailyLimitResponse(START)
    expect(res.status).toBe(503)
    expect(res.headers.get('Retry-After')).toBe(String(12 * 3600))
    expect(res.headers.get('Cache-Control')).toBe('no-store')
    const body = (await res.json()) as { error: { code: string } }
    expect(body.error.code).toBe('DAILY_LIMIT')
  })

  it('answers 500 INTERNAL without the error’s text for anything else', async () => {
    const res = errorResponse(new Error('ENOENT /some/internal/path'))
    expect(res.status).toBe(500)
    const text = await res.text()
    expect(text).toContain('INTERNAL')
    expect(text).not.toContain('internal/path')
  })
})
