// @vitest-environment happy-dom
// Hazard provenance on the scenario page (#506): names the dated snapshot and each source's
// credit, says so when the snapshot is gone, and shows nothing for a scenario without one.
import { cleanup, render, screen, within } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import axe from 'axe-core'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { HazardSnapshot } from '@shared/schemas'
import { queryClient } from '../../lib/query'
import { mockTtx } from '../documents/test-utils'
import { HazardProvenance } from './HazardProvenance'

afterEach(cleanup)
beforeEach(() => queryClient.clear())

const at = '2026-10-29T12:00:00.000Z'
const snapshot = HazardSnapshot.parse({
  id: 'snap1',
  label: 'Before the storm',
  fetchedAt: at,
  request: { lat: 41.88, lon: -87.63, precision: 0.01 },
  sources: [
    { id: 'nws_alerts', status: 'ok', attribution: 'National Weather Service', accessedAt: at },
    { id: 'openfema', status: 'empty', attribution: 'OpenFEMA', accessedAt: at },
  ],
})

function show(snapshotId: string | undefined, handlers: Record<string, unknown>) {
  const ttx = mockTtx(handlers)
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <HazardProvenance projectPath="/p" snapshotId={snapshotId} />
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return ttx
}

describe('HazardProvenance', () => {
  it('lists the snapshot date, place and each source with its credit', async () => {
    show('snap1', { 'hazards:get': () => snapshot })
    const table = await screen.findByRole('table', { name: 'Sources of the hazard snapshot' })
    expect(within(table).getByText('National Weather Service')).toBeTruthy()
    expect(within(table).getByText('Nothing found')).toBeTruthy()
    expect(screen.getByText(/Before the storm/)).toBeTruthy()
    expect(screen.getByText(/41\.88, -87\.63/)).toBeTruthy()
    expect(screen.getByText(/must not be used for operational decisions/)).toBeTruthy()
    const result = await axe.run(document.body, { rules: { 'color-contrast': { enabled: false } } })
    expect(result.violations.map((v) => v.id)).toEqual([])
  })

  it('says the snapshot is gone when it was deleted', async () => {
    show('gone', {
      'hazards:get': () => {
        throw new Error('NOT_FOUND')
      },
    })
    expect(await screen.findByText(/no longer in the project/)).toBeTruthy()
  })

  it('shows nothing and asks for nothing when the scenario used no snapshot', () => {
    const ttx = show(undefined, {})
    expect(screen.queryByRole('heading', { name: 'Hazard context' })).toBeNull()
    expect(ttx.calls('hazards:get')).toEqual([])
  })
})
