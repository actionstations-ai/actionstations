// A stage run keeps every token the provider bills (#1144): the prompt-cache reads and writes
// are recorded beside inputTokens, and a retry's tokens and cost are added to the run it repeats.
import { describe, expect, it } from 'vitest'
import type { StageRun } from '@shared/schemas'
import { addCacheTokens, sumTokens } from './stage'

const base = (over: Partial<StageRun> = {}): StageRun => ({
  stage: 'rubric',
  startedAt: '2026-01-01T00:00:00.000Z',
  status: 'ok',
  repairAttempts: 0,
  inputTokens: 100,
  outputTokens: 20,
  costUsd: 0.5,
  ...over,
})

describe('stage run tokens', () => {
  it('records cache reads and writes, and leaves them out when none are reported', () => {
    const run = base()
    addCacheTokens(run, {})
    expect(run).not.toHaveProperty('cacheReadTokens')
    addCacheTokens(run, { cacheReadTokens: 8000, cacheWriteTokens: 2000 })
    addCacheTokens(run, { cacheReadTokens: 1000 })
    expect(run).toMatchObject({ cacheReadTokens: 9000, cacheWriteTokens: 2000 })
  })

  it('adds a retry to the run it repeats, cache tokens and cost included', () => {
    const into = base({ cacheReadTokens: 500 })
    sumTokens(into, base({ cacheWriteTokens: 4000, costUsd: 0.25 }))
    expect(into).toMatchObject({
      inputTokens: 200,
      outputTokens: 40,
      cacheReadTokens: 500,
      cacheWriteTokens: 4000,
      costUsd: 0.75,
    })
  })
})
