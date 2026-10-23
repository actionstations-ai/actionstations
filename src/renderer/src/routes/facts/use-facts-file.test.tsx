// @vitest-environment happy-dom
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { FacilityFactsFile } from '@shared/ipc/project'
import { setEntry } from './facts-draft'
import { useFactsDraft, useSaveShortcut } from './use-facts-file'

const file = (revision: string, entries = ['5/23']): FacilityFactsFile => ({
  path: 'facility-facts.md',
  markdown: '# Facility facts',
  edited: false,
  revision,
  historyCount: 0,
  categories: [
    { id: 'runways', label: 'Runways', entries, extracted: entries, sources: {}, linted: true },
  ],
})

afterEach(() => cleanup())

describe('useFactsDraft', () => {
  it('takes a fresh read while clean and flags it as stale under unsaved edits', () => {
    const { result, rerender } = renderHook(({ data }) => useFactsDraft(data), {
      initialProps: { data: file('rev1') },
    })
    expect(result.current.dirty).toBe(false)
    rerender({ data: file('rev2', ['5/23', '1/19']) })
    expect(result.current.base?.revision).toBe('rev2')
    expect(result.current.draft[0]!.entries).toHaveLength(2)

    const key = result.current.draft[0]!.entries[0]!.key
    act(() => result.current.setDraft((d) => setEntry(d, 'runways', key, '9/27')))
    expect(result.current.dirty).toBe(true)
    rerender({ data: file('rev3') })
    expect(result.current.base?.revision).toBe('rev2')
    expect(result.current.stale).toBe(true)

    act(() => result.current.adopt(file('rev3')))
    expect(result.current.dirty).toBe(false)
    expect(result.current.stale).toBe(false)
  })
})

describe('useSaveShortcut', () => {
  it('runs on Ctrl+S and Cmd+S only', () => {
    const onSave = vi.fn()
    renderHook(() => useSaveShortcut(onSave))
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true }))
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'S', metaKey: true }))
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 's' }))
    expect(onSave).toHaveBeenCalledTimes(2)
  })
})
