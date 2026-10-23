// @vitest-environment happy-dom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Inject } from '@shared/schemas/inject'
import { useToasts } from '../../components/toast-store'
import { FakeIpcError, mockTtx, PROJECT } from '../../routes/documents/test-utils'
import { draftKey, draftOf, useDrafts } from './draft'
import { useBusy, useInjectActions, type ActionContext } from './use-inject-actions'
import { useRegenWatch } from './use-regen-watch'

const stored = Inject.parse({
  id: 'inj1',
  mselRowId: 'I-01',
  type: 'tweet',
  title: 'Before',
  fields: { text: 'old text' },
})
const ids = { projectPath: PROJECT, scenarioId: 'S1', injectId: 'inj1' }
const ctx = (over: Partial<ActionContext> = {}): ActionContext => ({
  ...ids,
  draft: { ...draftOf(stored), title: 'After' },
  dirty: true,
  track: vi.fn(),
  ...over,
})
const titles = () => useToasts.getState().toasts.map((t) => t.title)

beforeEach(() => {
  useDrafts.setState({ drafts: {} })
  useToasts.setState({ toasts: [] })
})
afterEach(() => cleanup())

describe('useBusy', () => {
  it('names the running action and clears it when the action settles, even on failure', async () => {
    const { result } = renderHook(() => useBusy())
    let finish!: () => void
    let run!: Promise<unknown>
    act(() => {
      run = result.current.during('save', () => new Promise<void>((r) => (finish = r)))
    })
    expect(result.current.busy).toBe('save')
    await act(async () => {
      finish()
      await run
    })
    expect(result.current.busy).toBeNull()
    await act(async () => {
      await result.current.during('render', () => Promise.reject(new Error('x'))).catch(() => 0)
    })
    expect(result.current.busy).toBeNull()
  })
})

describe('useInjectActions', () => {
  it('saves the draft onto the latest stored inject and drops the draft', async () => {
    const ttx = mockTtx({
      'injects:get': () => stored,
      'injects:save': (req: { inject: Inject }) => req.inject,
    })
    useDrafts.getState().put(draftKey('S1', 'inj1'), ctx().draft)
    const { result } = renderHook(() => useInjectActions(ctx()))
    let ok = false
    await act(async () => {
      ok = await result.current.save()
    })
    expect(ok).toBe(true)
    expect((ttx.calls('injects:save')[0] as { inject: Inject }).inject.title).toBe('After')
    expect(useDrafts.getState().drafts[draftKey('S1', 'inj1')]).toBeUndefined()
    expect(titles()).toContain('Inject saved')
  })

  it('queues a save behind a running job and retries it after job:done', async () => {
    let conflict = true
    mockTtx({
      'injects:get': () => stored,
      'injects:save': (req: { inject: Inject }) => {
        if (conflict) throw new FakeIpcError('CONFLICT', 'job running')
        return req.inject
      },
    })
    const { result } = renderHook(() => useInjectActions(ctx()))
    await act(async () => {
      expect(await result.current.save()).toBe(false)
    })
    expect(result.current.pendingSave).toBe(true)
    expect(titles()).not.toContain('Save failed')
    conflict = false
    act(() => result.current.retryPending())
    await waitFor(() => expect(result.current.pendingSave).toBe(false))
    expect(titles()).toContain('Inject saved')
  })

  it('does not render when the save before it fails', async () => {
    const ttx = mockTtx({
      'injects:get': () => stored,
      'injects:save': () => {
        throw new Error('disk full')
      },
      'render:inject': () => [],
    })
    const { result } = renderHook(() => useInjectActions(ctx()))
    await act(async () => {
      expect(await result.current.render()).toBeNull()
    })
    expect(ttx.calls('render:inject')).toHaveLength(0)
    expect(titles()).toContain('Save failed')
  })

  it('tracks a started job and reports a conflict when another job runs', async () => {
    const track = vi.fn()
    let busy = false
    const ttx = mockTtx({
      'injects:regenerate-text': () => {
        if (busy) throw new FakeIpcError('CONFLICT', 'busy')
        return { jobId: 'J1' }
      },
    })
    const { result } = renderHook(() => useInjectActions(ctx({ track })))
    await act(async () => {
      expect(await result.current.regenerateText('  shorter  ')).toBe('J1')
    })
    expect(track).toHaveBeenCalledWith('J1', 'generate-injects')
    expect(ttx.calls('injects:regenerate-text')[0]).toEqual({ ...ids, instructions: 'shorter' })
    busy = true
    await act(async () => {
      expect(await result.current.regenerateText('')).toBeNull()
    })
    expect(titles()).toContain('Another generation job is running for this scenario')
  })
})

describe('useRegenWatch', () => {
  it('diffs the stored inject against the text before the watched job only', async () => {
    mockTtx({ 'injects:get': () => ({ ...stored, title: 'Regenerated' }) })
    const { result } = renderHook(() => useRegenWatch(PROJECT, 'S1', 'inj1'))
    act(() => result.current.start('J1', { title: 'Before', type: 'tweet', fields: stored.fields }))
    act(() => result.current.onJobDone({ jobId: 'OTHER', status: 'done' } as never))
    expect(result.current.changes).toBeNull()
    act(() => result.current.onJobDone({ jobId: 'J1', status: 'done' } as never))
    await waitFor(() => expect(result.current.changes).not.toBeNull())
    expect(result.current.changes!.length).toBe(1)
    act(() => result.current.dismiss())
    expect(result.current.changes).toBeNull()
  })
})
