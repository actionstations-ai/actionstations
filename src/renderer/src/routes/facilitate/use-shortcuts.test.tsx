// @vitest-environment happy-dom
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { TimelineEntry } from './Timeline'
import { deliveredMessage } from './use-delivery-actions'
import { SHORTCUTS_KEY, useShortcuts, useShortcutsEnabled } from './use-shortcuts'

const press = (key: string, target: EventTarget = window, init: KeyboardEventInit = {}) =>
  target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, ...init }))

beforeEach(() => localStorage.clear())
afterEach(() => {
  cleanup()
  document.body.innerHTML = ''
})

describe('useShortcuts', () => {
  const keys = () => ({ toggle: vi.fn(), next: vi.fn(), deliver: vi.fn() })

  it('maps Space, N and D, and ignores modified or repeated keys', () => {
    const k = keys()
    renderHook(() => useShortcuts(k, true))
    press(' ')
    press('N')
    press('d')
    press('d', window, { metaKey: true })
    press('n', window, { repeat: true })
    expect(k.toggle).toHaveBeenCalledTimes(1)
    expect(k.next).toHaveBeenCalledTimes(1)
    expect(k.deliver).toHaveBeenCalledTimes(1)
  })

  it('maps R to record, pause or resume and Shift+R to stop the recording', () => {
    const k = { ...keys(), record: vi.fn(), stopRecording: vi.fn() }
    renderHook(() => useShortcuts(k, true))
    press('r')
    press('R', window, { shiftKey: true })
    expect(k.record).toHaveBeenCalledTimes(1)
    expect(k.stopRecording).toHaveBeenCalledTimes(1)
  })

  it('ignores R when the page has no recorder', () => {
    const k = keys()
    renderHook(() => useShortcuts(k, true))
    const e = new KeyboardEvent('keydown', { key: 'r', bubbles: true, cancelable: true })
    window.dispatchEvent(e)
    expect(e.defaultPrevented).toBe(false)
  })

  it('leaves keys to text fields and Space to a focused button, and can be switched off', () => {
    const k = keys()
    const { rerender } = renderHook(({ on }) => useShortcuts(k, on), {
      initialProps: { on: true },
    })
    const input = document.body.appendChild(document.createElement('input'))
    const button = document.body.appendChild(document.createElement('button'))
    press('d', input)
    press(' ', button)
    expect(k.deliver).not.toHaveBeenCalled()
    expect(k.toggle).not.toHaveBeenCalled()
    press('n', button)
    expect(k.next).toHaveBeenCalledTimes(1)
    rerender({ on: false })
    press('n')
    expect(k.next).toHaveBeenCalledTimes(1)
  })
})

describe('useShortcutsEnabled', () => {
  it('defaults to on and keeps the choice on this computer', () => {
    const first = renderHook(() => useShortcutsEnabled())
    expect(first.result.current[0]).toBe(true)
    act(() => first.result.current[1](false))
    expect(first.result.current[0]).toBe(false)
    expect(localStorage.getItem(SHORTCUTS_KEY)).toBe('off')
    expect(renderHook(() => useShortcutsEnabled()).result.current[0]).toBe(false)
  })
})

describe('deliveredMessage', () => {
  it('says how the inject reached the room', () => {
    const entry = { row: { id: 'I-03' }, target: 'PIO' } as TimelineEntry
    expect(deliveredMessage(entry, 'hand')).toBe('I-03 delivered — print / hand to PIO')
    expect(deliveredMessage(entry, 'present')).toMatch(/showing on the presentation screen/)
    expect(deliveredMessage(entry, 'none')).toBe('I-03 delivered')
  })
})
