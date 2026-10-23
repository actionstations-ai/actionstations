import { QueryClient } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { affects, changeFromEvent, changeFromJob, createInvalidator } from './invalidate'

function cacheWith(keys: unknown[][]) {
  const client = new QueryClient()
  for (const key of keys) client.setQueryData(key, 1)
  const stale = () =>
    client
      .getQueryCache()
      .getAll()
      .filter((q) => q.state.isInvalidated)
      .map((q) => q.queryKey)
  return { client, stale }
}

afterEach(() => vi.useRealTimers())

describe('targeted invalidation (#198)', () => {
  const keys = [
    ['scenarios:get', { projectPath: '/p', scenarioId: 'S1' }],
    ['scenarios:get', { projectPath: '/p', scenarioId: 'S2' }],
    ['scenarios:get', { projectPath: '/q', scenarioId: 'S1' }],
    ['injects:list', { projectPath: '/p', scenarioId: 'S1' }],
    ['settings:get', null],
    ['documents:list', { projectPath: '/p' }],
    ['project:get', { path: '/p' }],
  ]

  it('a scenario save touches that scenario only, and not its inject files', () => {
    const { client, stale } = cacheWith(keys)
    const change = changeFromEvent({ path: '/p', what: 'scenario', scenarioId: 'S1' })
    void client.invalidateQueries({ predicate: (q) => affects(change, q) })
    expect(stale()).toEqual([
      ['scenarios:get', { projectPath: '/p', scenarioId: 'S1' }],
      ['project:get', { path: '/p' }],
    ])
  })

  it('a finished ingest job refreshes the project documents (trailing slash ignored)', () => {
    const { client, stale } = cacheWith(keys)
    const change = changeFromJob('ingest', { projectPath: '/p/' })
    void client.invalidateQueries({ predicate: (q) => affects(change, q) })
    expect(stale()).toEqual([
      ['documents:list', { projectPath: '/p' }],
      ['project:get', { path: '/p' }],
    ])
  })

  it('coalesces a burst into one leading and one trailing invalidation', () => {
    vi.useFakeTimers()
    const { client } = cacheWith(keys)
    const spy = vi.spyOn(client, 'invalidateQueries')
    const inv = createInvalidator(client, 250)
    const save = changeFromEvent({ path: '/p', what: 'injects', scenarioId: 'S1' })
    for (let i = 0; i < 100; i++) inv.push(save)
    expect(spy).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(250)
    expect(spy).toHaveBeenCalledTimes(2)
    vi.advanceTimersByTime(1000)
    expect(spy).toHaveBeenCalledTimes(2)
    inv.dispose()
  })
})
