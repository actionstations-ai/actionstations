// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import axe from 'axe-core'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { LogTailEntry } from '@shared/schemas/live'
import { LogRows } from './LogView'
import { SessionRow, DELETE_CONFIRM } from './SessionsList'

afterEach(cleanup)

const entries: LogTailEntry[] = [
  {
    i: 3,
    at: '2026-10-28T13:05:00.000Z',
    ex: '1:19',
    kind: 'message',
    actor: 'PIO',
    summary: 'PIO → SimCell: Investigating',
    messageId: 'm1',
    starred: false,
  },
  {
    i: 2,
    at: '2026-10-28T13:04:00.000Z',
    kind: 'inject.release',
    actor: 'controller',
    summary: 'I-06 released to Ops',
  },
]

describe('LogRows', () => {
  it('is a captioned table with a row header per entry', () => {
    render(<LogRows entries={entries} />)
    const table = screen.getByRole('table', { name: 'Session log, newest first' })
    expect(
      within(table)
        .getAllByRole('rowheader')
        .map((h) => h.textContent),
    ).toEqual(['3', '2'])
    expect(within(table).getByText('PIO → SimCell: Investigating')).toBeTruthy()
  })

  it('offers Star only on messages and reports the new state', () => {
    const onStar = vi.fn()
    render(<LogRows entries={entries} onStar={onStar} />)
    expect(screen.getAllByRole('button')).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: 'Star message 3' }))
    expect(onStar).toHaveBeenCalledWith('m1', true)
  })
})

describe('LogRows accessibility', () => {
  it('has no axe violations', async () => {
    render(<LogRows entries={entries} onStar={vi.fn()} />)
    const result = await axe.run(document.body, {
      rules: { 'color-contrast': { enabled: false }, region: { enabled: false } },
    })
    expect(result.violations.map((v) => v.id)).toEqual([])
  })
})

describe('SessionRow', () => {
  const session = {
    id: 'AAAAAAAAAAAAAAAAAAAAAA',
    name: 'Run 1',
    startedAt: '2026-10-28T13:00:00.000Z',
    interrupted: true,
    attribution: 'role' as const,
    counts: {
      clients: 5,
      releases: 3,
      receipts: 9,
      messages: 4,
      votes: 1,
      hotwashItems: 0,
      observations: 2,
      surveys: 0,
    },
  }
  const handlers = () => ({
    onView: vi.fn(),
    onExport: vi.fn(),
    onClose: vi.fn(),
    onDelete: vi.fn(),
  })

  it('flags an interrupted session and offers Close as ended', () => {
    const h = handlers()
    render(
      <table>
        <tbody>
          <SessionRow session={session} {...h} />
        </tbody>
      </table>,
    )
    expect(screen.getByText('Interrupted')).toBeTruthy()
    expect(screen.getByText(/5 devices, 3 releases, 4 messages/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Close Run 1 as ended' }))
    expect(h.onClose).toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Export CSV of Run 1' }))
    expect(h.onExport).toHaveBeenCalledWith('csv')
  })

  it('does not offer Close as ended for an ended session', () => {
    render(
      <table>
        <tbody>
          <SessionRow
            session={{ ...session, interrupted: false, endedAt: '2026-10-28T14:00:00.000Z' }}
            {...handlers()}
          />
        </tbody>
      </table>,
    )
    expect(screen.queryByRole('button', { name: /as ended/ })).toBeNull()
    expect(screen.getByText('1 h 0 min')).toBeTruthy()
  })

  it('names what deleting removes', () => {
    expect(DELETE_CONFIRM).toMatch(/log, attachments and staged media/)
    expect(DELETE_CONFIRM).toMatch(/cannot be undone/)
  })
})
