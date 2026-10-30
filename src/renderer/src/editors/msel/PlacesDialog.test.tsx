// @vitest-environment happy-dom
// The MSEL row places picker (#500): starts from the row's places, saves the ticked ones, stops at
// five, says so when the project has no places, and has no axe violations.
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClientProvider } from '@tanstack/react-query'
import axe from 'axe-core'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Place } from '@shared/schemas'
import { MselRow } from '@shared/schemas/scenario'
import { queryClient } from '../../lib/query'
import { mockTtx } from '../../routes/documents/test-utils'
import { PlacesDialog } from './PlacesDialog'

const row = MselRow.parse({
  id: 'I-07',
  phaseId: 'P1',
  time: '1:00',
  from: 'SimCell',
  event: 'Smoke in the BHS room',
  expectedAction: '',
  purposeTag: 'CORE_NARRATIVE',
  placeIds: ['bhs'],
})

const places = ['bhs', 'aoc', 'gate', 'apron', 'tower', 'fuel', 'cargo'].map((id) =>
  Place.parse({ id, label: id.toUpperCase() }),
)

afterEach(() => cleanup())
beforeEach(() => queryClient.clear())

function show(list: Place[], onSave = vi.fn()) {
  mockTtx({
    'maps:get': () => ({ maps: { formatVersion: 1, maps: [], places: list }, revision: 'r' }),
  })
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <PlacesDialog projectPath="/p" row={row} onCancel={() => undefined} onSave={onSave} />
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return onSave
}

describe('PlacesDialog', () => {
  it('starts from the row places and saves the ticked ones', async () => {
    const onSave = show(places)
    const user = userEvent.setup()
    const bhs = await screen.findByRole('checkbox', { name: 'BHS' })
    expect((bhs as HTMLInputElement).checked).toBe(true)
    await user.click(screen.getByRole('checkbox', { name: 'AOC' }))
    await user.click(bhs)
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSave).toHaveBeenCalledWith(['aoc'])
  })

  it('has no axe violations', async () => {
    show(places)
    await screen.findByRole('checkbox', { name: 'BHS' })
    // aria-hidden-focus flags Radix's focus guards in happy-dom; e2e checks the real dialog.
    const result = await axe.run(document.body, {
      rules: { 'color-contrast': { enabled: false }, 'aria-hidden-focus': { enabled: false } },
    })
    expect(result.violations.map((v) => v.id)).toEqual([])
  })

  it('stops offering more places at five', async () => {
    show(places)
    const user = userEvent.setup()
    for (const name of ['AOC', 'GATE', 'APRON', 'TOWER'])
      await user.click(await screen.findByRole('checkbox', { name }))
    expect((screen.getByRole('checkbox', { name: 'FUEL' }) as HTMLInputElement).disabled).toBe(true)
    expect(screen.getByText(/up to 5 places/)).toBeTruthy()
  })

  it('points to the Maps page when the project has no places', async () => {
    show([])
    expect(await screen.findByText(/no places yet/)).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Maps page' })).toBeTruthy()
  })
})
