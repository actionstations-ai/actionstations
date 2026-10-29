// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ReleaseSummary } from '@shared/schemas/live'
import type { Scenario } from '@shared/schemas/scenario'
import type { TimelineEntry } from '../Timeline'
import { LiveInjectSection } from './LiveInjectSection'
import { receiptLine, type LiveDelivery, type RowOptions } from './use-live-delivery'

const scenario = {
  roles: [
    { id: 'ops', name: 'Operations Director', team: 'Operations' },
    { id: 'ops-2', name: 'Ops Deputy', team: 'Operations' },
    { id: 'pio', name: 'PIO', team: '' },
  ],
} as unknown as Scenario

const row = (over: Record<string, unknown> = {}) =>
  ({
    id: 'I-06',
    toRoleIds: ['pio'],
    expectedAction: 'Call the duty manager',
    ...over,
  }) as TimelineEntry['row']

function entry(over: Partial<TimelineEntry> = {}): TimelineEntry {
  return { row: row(), inject: undefined, live: undefined, ...over } as TimelineEntry
}

function fakeLive(
  options: Partial<RowOptions> = {},
  devices: LiveDelivery['devices'] = [],
): LiveDelivery {
  return {
    active: true,
    devices,
    options: () => ({ sendToDevices: true, showExpected: false, ...options }),
    setOptions: vi.fn(),
    summary: () => undefined,
    unansweredMin: () => undefined,
    stage: undefined,
    release: vi.fn(async () => undefined),
    resend: vi.fn(async () => undefined),
    withdraw: vi.fn(async () => undefined),
  }
}

const SUMMARY: ReleaseSummary = {
  releaseId: 'AAAAAAAAAAAAAAAAAAAAAA',
  rowId: 'I-06',
  targets: ['role:pio'],
  withdrawn: false,
  counts: { to: 2, delivered: 2, read: 1, actioned: 0 },
  perClient: [
    {
      clientRef: 'aaaaaaaa',
      seat: 'PIO',
      delivered: Date.UTC(2026, 0, 1, 10, 0),
      read: Date.UTC(2026, 0, 1, 10, 1),
    },
    {
      clientRef: 'bbbbbbbb',
      seat: 'PIO',
      displayName: 'Dana',
      delivered: Date.UTC(2026, 0, 1, 10, 0),
    },
  ],
}

afterEach(cleanup)

describe('LiveInjectSection', () => {
  it('shows the targets computed from the MSEL row and sends to devices by default', () => {
    render(<LiveInjectSection live={fakeLive()} scenario={scenario} entry={entry()} />)
    expect(screen.getByLabelText('Send to devices')).toHaveProperty('checked', true)
    expect(screen.getByText('PIO', { selector: '.fac-live__chip' })).toBeTruthy()
  })

  it('offers each player device as a target and sends the pick by its reference', () => {
    const live = fakeLive({}, [
      { clientRef: 'aaaaaaaa', kind: 'player', label: 'PIO', staff: false, online: true },
      { clientRef: 'bbbbbbbb', kind: 'evaluator', label: 'Evaluator', staff: true, online: true },
    ])
    render(<LiveInjectSection live={live} scenario={scenario} entry={entry()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Edit targets' }))
    expect(screen.queryByLabelText('Device: Evaluator')).toBeNull()
    fireEvent.click(screen.getByLabelText('Device: PIO'))
    expect(live.setOptions).toHaveBeenCalledWith('I-06', {
      targets: ['role:pio', 'client:aaaaaaaa'],
    })
  })

  it('collapses a whole team to one chip', () => {
    render(
      <LiveInjectSection
        live={fakeLive()}
        scenario={scenario}
        entry={entry({ row: row({ toRoleIds: ['ops', 'ops-2'] }) })}
      />,
    )
    expect(screen.getByText('Team: Operations')).toBeTruthy()
    expect(screen.queryByText('Ops Deputy', { selector: '.fac-live__chip' })).toBeNull()
  })

  it('lets the facilitator keep an inject off the devices', () => {
    const live = fakeLive()
    render(<LiveInjectSection live={live} scenario={scenario} entry={entry()} />)
    fireEvent.click(screen.getByLabelText('Send to devices'))
    expect(live.setOptions).toHaveBeenCalledWith('I-06', { sendToDevices: false })
  })

  it('edits the targets with checkboxes and never leaves the list empty', () => {
    const live = fakeLive()
    render(<LiveInjectSection live={live} scenario={scenario} entry={entry()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Edit targets' }))
    fireEvent.click(screen.getByLabelText('Operations Director'))
    expect(live.setOptions).toHaveBeenCalledWith('I-06', { targets: ['role:pio', 'role:ops'] })
    fireEvent.click(screen.getByLabelText('PIO'))
    expect(live.setOptions).toHaveBeenCalledTimes(1)
  })

  it('offers expected actions to evaluators only when the row has one', () => {
    const live = fakeLive()
    const { rerender } = render(
      <LiveInjectSection live={live} scenario={scenario} entry={entry()} />,
    )
    fireEvent.click(screen.getByLabelText('Show expected actions to evaluators'))
    expect(live.setOptions).toHaveBeenCalledWith('I-06', { showExpected: true })
    rerender(
      <LiveInjectSection
        live={live}
        scenario={scenario}
        entry={entry({ row: row({ expectedAction: ' ' }) })}
      />,
    )
    expect(screen.queryByLabelText('Show expected actions to evaluators')).toBeNull()
  })

  it('lists receipts per seat once released and resends to another target', () => {
    const live = fakeLive()
    render(<LiveInjectSection live={live} scenario={scenario} entry={entry({ live: SUMMARY })} />)
    expect(screen.getByRole('status').textContent).toBe('to 2 · 2 delivered · 1 read · 0 actioned')
    const table = screen.getByRole('table')
    expect(within(table).getByText('PIO (Dana)')).toBeTruthy()
    expect(screen.getByLabelText('Send to devices')).toHaveProperty('disabled', true)
    fireEvent.change(screen.getByLabelText('Resend to'), { target: { value: 'role:ops' } })
    fireEvent.click(screen.getByRole('button', { name: 'Resend' }))
    expect(live.resend).toHaveBeenCalledWith(SUMMARY.releaseId, ['role:ops'])
  })
})

describe('receiptLine', () => {
  it('reads like the timeline badge in the spec', () => {
    expect(receiptLine(SUMMARY)).toBe('to 2 · 2 delivered · 1 read · 0 actioned')
  })
})
