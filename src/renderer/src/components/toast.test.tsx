// @vitest-environment happy-dom
import { act, cleanup, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Toaster } from './toast'
import { TOAST_MS, toast, useToasts } from './toast-store'

beforeEach(() => {
  vi.useFakeTimers()
  useToasts.setState({ toasts: [] })
  render(
    <MemoryRouter>
      <Toaster />
    </MemoryRouter>,
  )
})
afterEach(() => {
  cleanup()
  useToasts.getState().hold(false)
  vi.useRealTimers()
})

describe('Toaster', () => {
  it('shows a human message with a next step for provider errors, never the raw text', () => {
    act(() =>
      toast.error('Generation failed', {
        code: 'PROVIDER',
        message: 'OpenAI-compatible server unreachable at http://127.0.0.1:1234: ECONNREFUSED',
      }),
    )
    const alert = screen.getByRole('alert')
    expect(alert.textContent).toMatch(/LM Studio isn't responding at http:\/\/127.0.0.1:1234/)
    expect(alert.textContent).not.toMatch(/ECONNREFUSED/)
    expect(within(alert).getByRole('link', { name: 'Open Providers' }).getAttribute('href')).toBe(
      '/providers',
    )
  })

  it('announces info politely and errors assertively, in regions that always exist', () => {
    expect(screen.getByRole('status').getAttribute('aria-live')).toBe('polite')
    expect(screen.getByRole('alert')).toBeTruthy()
    act(() => toast.success('Saved'))
    expect(within(screen.getByRole('status')).getByText('Saved')).toBeTruthy()
  })

  it('auto-dismisses info, but not while the stack is hovered or focused', () => {
    act(() => toast.info('Indexed'))
    act(() => useToasts.getState().hold(true))
    act(() => void vi.advanceTimersByTime(TOAST_MS * 2))
    expect(screen.queryByText('Indexed')).toBeTruthy()
    act(() => useToasts.getState().hold(false))
    act(() => void vi.advanceTimersByTime(TOAST_MS + 10))
    expect(screen.queryByText('Indexed')).toBeNull()
  })

  it('keeps errors until dismissed', () => {
    act(() => toast.error('Export failed', 'ENOSPC: no space left on device'))
    act(() => void vi.advanceTimersByTime(TOAST_MS * 3))
    expect(screen.getByText(/disk is full/)).toBeTruthy()
    act(() => screen.getByRole('button', { name: 'Dismiss notification: Export failed' }).click())
    expect(screen.queryByText(/disk is full/)).toBeNull()
  })
})
