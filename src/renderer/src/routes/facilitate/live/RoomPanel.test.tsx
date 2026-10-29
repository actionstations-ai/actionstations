// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import axe from 'axe-core'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DashboardView } from '@shared/schemas/live'
import { RoomView } from './RoomPanel'
import { clock, targetLabel } from './room-format'

afterEach(cleanup)

const view = (over: Partial<DashboardView> = {}): DashboardView => ({
  sessionId: 'AAAAAAAAAAAAAAAAAAAAAA',
  live: true,
  unansweredAfterMin: 10,
  connected: 3,
  roster: [
    {
      seat: 'ops',
      label: 'Ops Director',
      kind: 'player',
      connected: 2,
      removed: 0,
      names: [],
      empty: false,
    },
    {
      seat: 'liaison',
      label: 'Airline Liaison',
      kind: 'player',
      connected: 0,
      removed: 0,
      names: [],
      empty: true,
    },
  ],
  injects: [
    {
      releaseId: 'r6',
      rowId: 'I-06',
      targets: ['role:ops'],
      releasedAt: '2026-10-28T13:01:00.000Z',
      withdrawn: false,
      expected: 2,
      delivered: 2,
      read: 1,
      actioned: 0,
      firstReadSec: 74,
      expectsResponse: true,
      answered: 'message',
      responseSec: 79,
      ageMin: 4,
    },
    {
      releaseId: 'r7',
      rowId: 'I-07',
      targets: ['role:ops'],
      releasedAt: '2026-10-28T13:02:00.000Z',
      withdrawn: false,
      expected: 2,
      delivered: 2,
      read: 2,
      actioned: 0,
      expectsResponse: true,
      ageMin: 12,
    },
  ],
  unanswered: [{ releaseId: 'r7', rowId: 'I-07', ageMin: 12, windowMin: 10 }],
  messages: {
    threads: 3,
    waiting: [{ channel: 'role:pio', waitingMin: 4 }],
    medianReplySec: 110,
    perRole: [],
  },
  votes: {
    lastClosed: {
      voteId: 'v1',
      question: 'Close the terminal?',
      tally: [
        { label: 'Yes', count: 9 },
        { label: 'No', count: 4 },
      ],
    },
  },
  hotwash: { open: false, items: 0, plusOnes: 0, promoted: 0 },
  evaluation: { observations: 9, evaluatorsConnected: 2 },
  health: {
    dropped: [{ reason: 'REPLAY', count: 2 }],
    rejected: 1,
    protocolVersion: 1,
    lastIndex: 412,
    logBytes: 20480,
  },
  ...over,
})

const roleName = (id: string) => ({ ops: 'Ops Director' })[id]

function renderRoom(v = view(), onMark = vi.fn()) {
  render(<RoomView view={v} roleName={roleName} onMarkAnswered={onMark} />)
  return onMark
}

describe('RoomView', () => {
  it('shows tables with captions and column headers', () => {
    renderRoom()
    const seats = screen.getByRole('table', { name: 'Seats' })
    expect(
      within(seats)
        .getAllByRole('columnheader')
        .map((h) => h.textContent),
    ).toEqual(['Seat', 'Connected', 'Removed'])
    expect(screen.getByRole('table', { name: 'Released injects' })).toBeTruthy()
  })

  it('marks an empty player seat with text, not colour', () => {
    renderRoom()
    const row = screen.getByRole('row', { name: /Airline Liaison/ })
    expect(within(row).getByText('Empty')).toBeTruthy()
  })

  it('reads delivery, first read and response as text per inject', () => {
    renderRoom()
    const row = screen.getByRole('row', { name: /I-06/ })
    expect(within(row).getByText('1 of 2')).toBeTruthy()
    expect(within(row).getByText('1:14')).toBeTruthy()
    expect(within(row).getByText('message in 1:19')).toBeTruthy()
  })

  it('lists unanswered injects with age and marks one answered', () => {
    const onMark = renderRoom()
    const section = screen.getByRole('region', { name: 'Unanswered injects' })
    expect(within(section).getByText('No response · 12 min')).toBeTruthy()
    fireEvent.click(within(section).getByRole('button', { name: 'Mark I-07 answered' }))
    expect(onMark).toHaveBeenCalledWith('r7')
  })

  it('announces a newly unanswered row once in a status region', () => {
    renderRoom()
    expect(screen.getByRole('status').textContent).toBe('I-07 has had no response for 12 min.')
  })

  it('says nothing is unanswered when the list is empty', () => {
    renderRoom(view({ unanswered: [] }))
    expect(screen.getByText(/None\. A row that expects a response/)).toBeTruthy()
  })

  it('summarises messages, votes, hot wash, evaluation and health', () => {
    renderRoom()
    expect(screen.getByText(/3 threads, 1 waiting, oldest 4 min, median reply 1:50/)).toBeTruthy()
    expect(screen.getByText(/Last closed: Close the terminal\? \(Yes 9, No 4\)/)).toBeTruthy()
    expect(screen.getByText(/Not open, 0 items/)).toBeTruthy()
    expect(screen.getByText(/9 observations, 2 evaluators connected/)).toBeTruthy()
    expect(screen.getByText(/dropped frames 2 \(REPLAY 2\)/)).toBeTruthy()
  })

  it('leaves a slot for the hot wash feature to replace its summary', () => {
    render(
      <RoomView
        view={view()}
        roleName={roleName}
        onMarkAnswered={vi.fn()}
        hotwash={<div>Board open, 4 items</div>}
      />,
    )
    expect(screen.getByText('Board open, 4 items')).toBeTruthy()
  })

  it('notes that a past session is a record', () => {
    renderRoom(view({ live: false }))
    expect(screen.getByText(/This session has ended/)).toBeTruthy()
  })

  it('switches to the log view and back', () => {
    render(
      <RoomView
        view={view()}
        roleName={roleName}
        onMarkAnswered={vi.fn()}
        log={<p>log goes here</p>}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Log' }))
    expect(screen.getByText('log goes here')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Back to the Room' }))
    expect(screen.getByRole('table', { name: 'Seats' })).toBeTruthy()
  })
})

describe('accessibility', () => {
  it('has no axe violations in the Room', async () => {
    renderRoom()
    const result = await axe.run(document.body, {
      rules: { 'color-contrast': { enabled: false }, region: { enabled: false } },
    })
    expect(result.violations.map((v) => v.id)).toEqual([])
  })

  it('has no axe violations with nothing released', async () => {
    renderRoom(view({ injects: [], unanswered: [] }))
    const result = await axe.run(document.body, {
      rules: { 'color-contrast': { enabled: false }, region: { enabled: false } },
    })
    expect(result.violations.map((v) => v.id)).toEqual([])
  })
})

describe('room-format', () => {
  it('formats clocks and targets', () => {
    expect(clock(5)).toBe('0:05')
    expect(clock(74)).toBe('1:14')
    expect(targetLabel('role:ops', roleName)).toBe('Ops Director')
    expect(targetLabel('team:x', roleName)).toBe('Team x')
    expect(targetLabel('all', roleName)).toBe('Everyone')
  })
})
