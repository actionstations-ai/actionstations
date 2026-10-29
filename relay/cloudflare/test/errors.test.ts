import { describe, expect, it } from 'vitest'
import { dailyLimitResponse, errorResponse, isLimitError } from '../src/errors'
import { START } from './do-harness'

describe('errors', () => {
  it('recognises the runtime’s plan-limit errors and nothing else', () => {
    expect(
      isLimitError(new Error('Durable Object storage operation exceeded the daily limit')),
    ).toBe(true)
    expect(isLimitError(new Error('Daily request quota reached'))).toBe(true)
    expect(isLimitError(new Error('Rows written limit exceeded'))).toBe(true)
    expect(isLimitError(new Error('Too many requests'))).toBe(false)
    expect(isLimitError(new Error('storage failed'))).toBe(false)
    expect(isLimitError(new TypeError('limit exceeded'))).toBe(false)
    expect(isLimitError(new RangeError('Maximum call stack size exceeded, limit'))).toBe(false)
    expect(isLimitError('quota reached')).toBe(false)
    expect(isLimitError(undefined)).toBe(false)
  })

  it('answers 503 DAILY_LIMIT with a Retry-After at the next UTC midnight', async () => {
    const res = dailyLimitResponse(START)
    expect(res.status).toBe(503)
    expect(res.headers.get('Retry-After')).toBe(String(12 * 3600))
    expect(res.headers.get('Cache-Control')).toBe('no-store')
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('DAILY_LIMIT')
  })

  it('answers 500 INTERNAL without the error’s text for anything else', async () => {
    const res = errorResponse(new Error('ENOENT /some/internal/path'))
    expect(res.status).toBe(500)
    const text = await res.text()
    expect(text).toContain('INTERNAL')
    expect(text).not.toContain('internal/path')
  })
})
