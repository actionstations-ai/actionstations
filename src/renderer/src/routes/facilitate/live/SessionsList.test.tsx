// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import axe from 'axe-core'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { LiveSessionSummary } from '@shared/schemas/live'
import { SessionRow } from './SessionsList'

afterEach(cleanup)

const summary = (over: Partial<LiveSessionSummary> = {}): LiveSessionSummary => ({
  id: 'AAAAAAAAAAAAAAAAAAAAAA',
  name: 'FIDS failure',
  startedAt: '2026-10-29T13:00:00.000Z',
  interrupted: false,
  attribution: 'role',
  counts: {
    clients: 4,
    releases: 6,
    receipts: 10,
    surveys: 0,
    messages: 3,
    votes: 1,
    hotwashItems: 0,
    observations: 2,
  },
  ...over,
})

const handlers = () => ({
  onView: vi.fn(),
  onExport: vi.fn(),
  onClose: vi.fn(),
  onDelete: vi.fn(),
})

function row(session: LiveSessionSummary, extra: Record<string, unknown> = {}) {
  const h = handlers()
  render(
    <table>
      <tbody>
        <SessionRow session={session} {...h} {...extra} />
      </tbody>
    </table>,
  )
  return h
}

describe('SessionRow resume', () => {
  it('offers Resume next to Close as ended for an interrupted session', async () => {
    const onResume = vi.fn()
    row(summary({ interrupted: true }), { onResume })
    expect(screen.getByText('Interrupted')).toBeTruthy()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Resume FIDS failure' }))
    expect(onResume).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: 'Close FIDS failure as ended' })).toBeTruthy()
  })

  it('offers no Resume for a session that ended', () => {
    row(summary({ endedAt: '2026-10-29T14:00:00.000Z' }), { onResume: vi.fn() })
    expect(screen.queryByRole('button', { name: /Resume/ })).toBeNull()
  })

  it('has no axe violations for an interrupted session', async () => {
    row(summary({ interrupted: true }), { onResume: vi.fn() })
    const result = await axe.run(document.body, {
      rules: { 'color-contrast': { enabled: false }, region: { enabled: false } },
    })
    expect(result.violations.map((v) => v.id)).toEqual([])
  })
})
