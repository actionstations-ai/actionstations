// @vitest-environment happy-dom
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { FacilitatorState } from '@shared/ipc'
import { useToasts } from '../../components/toast-store'
import { unsavedItems } from '../../editors/unsaved-work'
import { FakeIpcError, PROJECT, mockTtx } from '../documents/test-utils'
import { useFacilitatorState } from './use-facilitator-state'

const EMPTY: FacilitatorState = {
  elapsedMin: 0,
  delivered: {},
  notes: {},
  generalNotes: '',
  hotwash: [],
  decisions: [],
}

function setup(failures: number) {
  let left = failures
  const ttx = mockTtx({
    'facilitator:state-get': () => EMPTY,
    'facilitator:state-save': (req: { state: FacilitatorState }) => {
      if (left-- > 0) throw new FakeIpcError('INTERNAL', 'disk full')
      return req.state
    },
  })
  const hook = renderHook(() => useFacilitatorState(PROJECT, 'scn-1'))
  const saves = () => ttx.calls('facilitator:state-save') as { state: FacilitatorState }[]
  return { hook, saves }
}

afterEach(() => {
  vi.useRealTimers()
  useToasts.setState({ toasts: [] })
})

describe('useFacilitatorState saving (#204)', () => {
  it('keeps a failed save unsaved and retries it', async () => {
    const { hook, saves } = setup(1)
    await waitFor(() => expect(hook.result.current.state).toBeTruthy())
    vi.useFakeTimers({ shouldAdvanceTime: true })
    act(() => hook.result.current.update((s) => ({ ...s, generalNotes: 'Gate B4 dark' })))
    await waitFor(() => expect(hook.result.current.saveStatus).toBe('error'))
    expect(unsavedItems()).toContain('Facilitator notes')
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3100)
    })
    await waitFor(() => expect(hook.result.current.saveStatus).toBe('saved'))
    expect(saves()).toHaveLength(2)
    expect(saves()[1]!.state.generalNotes).toBe('Gate B4 dark')
    expect(unsavedItems()).not.toContain('Facilitator notes')
    hook.unmount()
  })

  it('shows a toast when the save on leaving the page fails', async () => {
    const { hook, saves } = setup(5)
    await waitFor(() => expect(hook.result.current.state).toBeTruthy())
    act(() =>
      hook.result.current.update((s) => ({ ...s, generalNotes: 'typing' }), { debounce: true }),
    )
    hook.unmount()
    await waitFor(() => expect(saves()).toHaveLength(1))
    await waitFor(() =>
      expect(useToasts.getState().toasts.map((t) => t.title)).toContain(
        'Could not save the facilitator notes',
      ),
    )
  })
})
