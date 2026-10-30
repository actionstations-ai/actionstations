// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import axe from 'axe-core'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { RegionalRosterView } from '@shared/schemas/live'
import { CoControllersView } from './CoControllers'

afterEach(cleanup)

const view = (over: Partial<RegionalRosterView> = {}): RegionalRosterView => ({
  sent: true,
  revision: 2,
  controllers: [{ id: 'AIR', name: 'Airport', rowPrefixes: ['AIR'], roleCount: 3 }],
  missingLiveKey: [],
  ...over,
})

describe('CoControllersView', () => {
  it('lists each partner with its rows and role count, and says what devices have', () => {
    render(<CoControllersView view={view()} busy={false} onSend={vi.fn()} />)
    const table = screen.getByRole('table', {
      name: 'Partner organizations that may release injects',
    })
    const row = within(table).getByRole('row', { name: /Airport/ })
    expect(within(row).getByText('AIR')).toBeTruthy()
    expect(within(row).getByText('3')).toBeTruthy()
    expect(screen.getByRole('status').textContent).toBe('Devices have roster 2.')
  })

  it('names organizations that cannot be listed because no live key is pinned', () => {
    render(
      <CoControllersView
        view={view({ sent: false, controllers: [], missingLiveKey: ['CITY'] })}
        busy={false}
        onSend={vi.fn()}
      />,
    )
    expect(screen.getByText(/No live key is pinned for CITY/)).toBeTruthy()
    expect(screen.getByRole('status').textContent).toBe(
      'No partner organization can be listed yet.',
    )
  })

  it('sends the roster on request and stops the button while busy', () => {
    const onSend = vi.fn()
    const { rerender } = render(<CoControllersView view={view()} busy={false} onSend={onSend} />)
    fireEvent.click(screen.getByRole('button', { name: 'Send roster to devices' }))
    expect(onSend).toHaveBeenCalledTimes(1)
    rerender(<CoControllersView view={view()} busy onSend={onSend} />)
    expect(screen.getByRole('button', { name: 'Send roster to devices' })).toHaveProperty(
      'disabled',
      true,
    )
  })

  it('reports an unsent roster in words', () => {
    render(<CoControllersView view={view({ sent: false })} busy={false} onSend={vi.fn()} />)
    expect(screen.getByRole('status').textContent).toBe('Not sent to devices yet.')
  })

  it('has no axe violations', async () => {
    render(
      <CoControllersView view={view({ missingLiveKey: ['CITY'] })} busy={false} onSend={vi.fn()} />,
    )
    const result = await axe.run(document.body, {
      rules: { 'color-contrast': { enabled: false }, region: { enabled: false } },
    })
    expect(result.violations.map((v) => v.id)).toEqual([])
  })
})
