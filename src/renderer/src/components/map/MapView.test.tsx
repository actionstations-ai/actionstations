// @vitest-environment happy-dom
// Map view (#436, FR-7, NFR-3): pins by state with text as well as colour, selecting a pin
// selects its row and the reverse, the Locations list mirrors the map, the site plan has
// labelled controls, and the screen has no axe violations. The geographic engine is not drawn
// here (it needs WebGL); its off and missing messages are.
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import axe from 'axe-core'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router'
import type { MapLayer, Place } from '@shared/schemas'
import { pinsFor } from '@shared/maps/pins'
import { queryClient } from '../../lib/query'
import { mockTtx } from '../../routes/documents/test-utils'
import { markerFromPin } from './marker-model'
import { MapView } from './MapView'

const PLAN: MapLayer = {
  kind: 'site_plan',
  id: 'plan1',
  title: 'Terminal level 1',
  source: 'maps/plan1/plan.png',
  image: 'maps/plan1/plan.png',
  width: 800,
  height: 600,
}
const place = (id: string, label: string, x: number, y: number, kind: Place['kind'] = 'other') => ({
  id,
  label,
  kind,
  note: '',
  positions: [{ mapId: 'plan1', x, y }],
})
const places: Place[] = [place('gate', 'Gate A1', 20, 30), place('eoc', 'EOC', 70, 60, 'command')]
const rows = [
  { id: 'I-01', time: '0:00', placeIds: ['gate'] },
  { id: 'I-02', time: '0:10', placeIds: ['gate', 'eoc'] },
  { id: 'I-03', time: '2:00', placeIds: ['eoc'] },
]
const AXE = { rules: { 'color-contrast': { enabled: false }, region: { enabled: false } } }

function setup(
  over: { showUpcoming?: boolean; onSelectRow?: (id: string) => void; selectedRowId?: string } = {},
) {
  const pins = pinsFor({
    rows,
    places,
    mapId: 'plan1',
    delivered: { 'I-01': {} },
    elapsedMin: 15,
    audience: 'facilitator',
    showUpcoming: over.showUpcoming ?? false,
  })
  const status = { 'I-01': 'delivered', 'I-02': 'due', 'I-03': 'upcoming' } as const
  return render(
    <MapView
      projectPath="/p"
      layer={PLAN}
      markers={pins.map(markerFromPin)}
      rowStatus={status}
      selectedRowId={over.selectedRowId}
      onSelectRow={over.onSelectRow}
      showLegend
    />,
  )
}

afterEach(() => cleanup())

describe('site plan map', () => {
  it('names each pin with its place and row states, and hides upcoming rows by default', () => {
    setup()
    expect(screen.getByRole('button', { name: 'Gate A1: I-01 delivered, I-02 due' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'EOC: I-02 due' })).toBeTruthy()
    expect(screen.queryByText(/I-03/)).toBeNull()
  })

  it('draws an upcoming row only when the caller asks for it', () => {
    setup({ showUpcoming: true })
    expect(screen.getByRole('button', { name: 'EOC: I-02 due, I-03 upcoming' })).toBeTruthy()
  })

  it('selects the next row at a place when its pin is activated', () => {
    const onSelectRow = vi.fn()
    setup({ onSelectRow, selectedRowId: 'I-01' })
    fireEvent.click(screen.getByRole('button', { name: 'Gate A1: I-01 delivered, I-02 due' }))
    expect(onSelectRow).toHaveBeenCalledWith('I-02')
  })

  it('marks the pins of the selected row as pressed', () => {
    setup({ selectedRowId: 'I-02' })
    expect(screen.getByRole('button', { name: 'EOC: I-02 due' }).getAttribute('aria-pressed')).toBe(
      'true',
    )
  })

  it('mirrors the pins in a Locations list that selects rows', () => {
    const onSelectRow = vi.fn()
    setup({ onSelectRow })
    expect(screen.getByText('Locations (3)')).toBeTruthy()
    fireEvent.click(screen.getAllByRole('button', { name: 'I-02' })[0]!)
    expect(onSelectRow).toHaveBeenCalledWith('I-02')
    expect(
      screen
        .getAllByRole('row')
        .some((r) => /Gate A1/.test(r.textContent ?? '') && /delivered/.test(r.textContent ?? '')),
    ).toBe(true)
  })

  it('has labelled controls, a legend, and no axe violations', async () => {
    setup()
    for (const name of ['Zoom in', 'Zoom out', 'Fit the whole plan'])
      expect(screen.getByRole('button', { name })).toBeTruthy()
    expect(screen.getByRole('list', { name: 'Legend' })).toBeTruthy()
    const result = await axe.run(document.body, AXE)
    expect(result.violations.map((v) => v.id)).toEqual([])
  })

  it('zooms with the keyboard and the buttons without throwing', () => {
    setup()
    const frame = screen.getByTestId('site-plan')
    fireEvent.keyDown(frame, { key: '+' })
    fireEvent.keyDown(frame, { key: 'ArrowLeft' })
    fireEvent.keyDown(frame, { key: '0' })
    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }))
    expect(frame).toBeTruthy()
  })
})

describe('geographic map messages', () => {
  const GEO: MapLayer = {
    kind: 'geo',
    id: 'geo1',
    title: 'County',
    basemap: { kind: 'online', provider: 'openfreemap' },
    style: 'light',
  }
  const view = () =>
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <MapView projectPath="/p" layer={GEO} markers={[]} />
        </MemoryRouter>
      </QueryClientProvider>,
    )

  it('says online maps are off and where to turn them on', async () => {
    queryClient.clear()
    mockTtx({
      'maps:basemap': () => ({
        mode: 'offline-off',
        message: 'Online maps are off. Turn them on in Settings › Maps or choose offline map data.',
      }),
    })
    view()
    expect(await screen.findByText(/Online maps are off/)).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Open map settings' })).toBeTruthy()
    expect(await axe.run(document.body, AXE).then((r) => r.violations.map((v) => v.id))).toEqual([])
  })

  it('says when the map data for a state is not on this computer', async () => {
    queryClient.clear()
    mockTtx({
      'maps:basemap': () => ({
        mode: 'missing',
        message: 'Map data for us-oh is not on this computer.',
        catalogIds: ['us-oh'],
      }),
    })
    view()
    expect(await screen.findByText(/us-oh is not on this computer/)).toBeTruthy()
  })
})
