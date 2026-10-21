// @vitest-environment happy-dom
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { Scenario } from '@shared/schemas/scenario'
import fixture from '../../../../../tests/fixtures/scenarios/scenario-3.json'
import { MselTable } from './MselTable'
import { groupByPhase, toLabel } from './msel-utils'

const scenario = Scenario.parse(fixture)

afterEach(() => cleanup())

describe('MselTable', () => {
  it('renders every Scenario 3 row under its phase header with goal', () => {
    render(<MselTable phases={scenario.phases} rows={scenario.msel} roles={scenario.roles} />)
    const table = screen.getByRole('table', { name: 'Master Scenario Events List' })
    const rows = within(table).getAllByRole('row')
    // header + 4 phase headers + 24 events
    expect(rows).toHaveLength(1 + 4 + 24)
    expect(within(table).getByText(/Phase 1: The Glitch/)).toBeTruthy()
    expect(
      within(table).getByText(
        'Goal: To force the transition from digital tools to analog/manual procedures.',
      ),
    ).toBeTruthy()
    const headers = within(rows[0]!)
      .getAllByRole('columnheader')
      .map((h) => h.textContent)
    expect(headers).toEqual([
      'Time',
      'ID',
      'From',
      'To',
      'Event / Message',
      'Expected Action',
      'Tag',
      'Format',
      'Citations',
    ])
  })

  it('shows tag chips, format labels and citations for a row', () => {
    render(<MselTable phases={scenario.phases} rows={scenario.msel} roles={scenario.roles} />)
    const row = screen.getByText('I-05b').closest('tr')!
    const cells = within(row)
    expect(cells.getByText('1:10')).toBeTruthy()
    expect(cells.getByText('Parking')).toBeTruthy()
    expect(cells.getByText('Red herring')).toBeTruthy()
    expect(cells.getByText('Radio call')).toBeTruthy()
    const start = within(screen.getByText('START').closest('tr')!)
    expect(start.getByText('13.6 Scenario C: FIDS / BHS System Failure')).toBeTruthy()
    expect(start.getByText('STARTEX')).toBeTruthy()
  })

  it('keeps phase order and puts orphan rows last', () => {
    const rows = [...scenario.msel, { ...scenario.msel[1]!, id: 'X-1', phaseId: 'gone' }]
    const groups = groupByPhase([...scenario.phases].reverse(), rows)
    expect(groups.map((g) => g.phase?.title ?? null)).toEqual([
      'The Glitch',
      'The Crisis',
      'Manual Mode',
      'Recovery & Verification',
      null,
    ])
    expect(groups.at(-1)?.rows.map((r) => r.id)).toEqual(['X-1'])
  })

  it('derives the To column from roles when no label is stored', () => {
    const row = { ...scenario.msel[1]!, toLabel: undefined, toRoleIds: ['ops-director', 'pio'] }
    const { toLabel: _drop, ...rest } = row
    expect(toLabel(rest, scenario.roles)).toBe('IC, PIO')
  })

  it('says so when there are no rows', () => {
    render(<MselTable phases={[]} rows={[]} roles={[]} />)
    expect(screen.getByText(/no rows yet/)).toBeTruthy()
  })
})
