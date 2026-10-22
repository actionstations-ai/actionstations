// @vitest-environment happy-dom
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LiveStatus } from './LiveStatus'

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

const spoken = () => screen.getByRole('status').textContent

describe('LiveStatus', () => {
  it('announces the first message, then at most one update per interval, ending on the latest', () => {
    const { rerender } = render(<LiveStatus text="Downloading 1%" intervalMs={1000} />)
    act(() => void vi.advanceTimersByTime(0))
    expect(spoken()).toBe('Downloading 1%')
    rerender(<LiveStatus text="Downloading 2%" intervalMs={1000} />)
    rerender(<LiveStatus text="Downloading 3%" intervalMs={1000} />)
    act(() => void vi.advanceTimersByTime(500))
    expect(spoken()).toBe('Downloading 1%')
    rerender(<LiveStatus text="Downloading 9%" intervalMs={1000} />)
    act(() => void vi.advanceTimersByTime(600))
    expect(spoken()).toBe('Downloading 9%')
  })

  it('is a polite, visually hidden status region', () => {
    render(<LiveStatus text="x" />)
    const region = screen.getByRole('status')
    expect(region.getAttribute('aria-live')).toBe('polite')
    expect(region.className).toBe('sr-only')
  })
})
