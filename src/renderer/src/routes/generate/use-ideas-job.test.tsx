// @vitest-environment happy-dom
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { FakeIpcError, mockTtx, PROJECT } from '../documents/test-utils'
import { useIdeasJob } from './use-ideas-job'

afterEach(() => cleanup())

describe('useIdeasJob', () => {
  it('clamps the count to 1–12 (default 6), trims the focus and follows the started job', async () => {
    let n = 0
    const ttx = mockTtx({ 'generate:ideas': () => ({ jobId: `IDEAS${++n}` }) })
    const { result } = renderHook(() => useIdeasJob(PROJECT))
    expect(result.current.jobId).toBeNull()
    await act(() => result.current.request('  insider threat ', '40'))
    await act(() => result.current.request('', 'lots'))
    expect(ttx.calls('generate:ideas')).toEqual([
      { projectPath: PROJECT, brief: { userPrompt: 'insider threat' }, count: 12 },
      { projectPath: PROJECT, brief: {}, count: 6 },
    ])
    expect(result.current.jobId).toBe('IDEAS2')
    expect(result.current.running).toBe(true)
  })

  it('reports a job that cannot start', async () => {
    mockTtx({
      'generate:ideas': () => {
        throw new FakeIpcError('NO_PROVIDER', 'No text provider')
      },
    })
    const { result } = renderHook(() => useIdeasJob(PROJECT))
    await act(() => result.current.request('', '3'))
    expect(result.current.error).toMatchObject({ code: 'NO_PROVIDER' })
    expect(result.current.jobId).toBeNull()
  })
})
