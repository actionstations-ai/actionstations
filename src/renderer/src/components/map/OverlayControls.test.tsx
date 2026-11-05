// @vitest-environment happy-dom
// Overlay controls (#652, NFR-3): a native checkbox for each layer, a time slider that moves with
// the arrow buttons, a legend with text for every item, the overlay data as a table, and no axe
// violations. Plan place outlines are drawn from percent points.
import { act, cleanup, fireEvent, render, renderHook, screen, within } from '@testing-library/react'
import axe from 'axe-core'
import { afterEach, describe, expect, it } from 'vitest'
import { storm } from '@shared/maps/overlays/fixtures'
import type { MapLayer } from '@shared/schemas'
import { MapView } from './MapView'
import { OverlayControls } from './OverlayControls'
import { useOverlayState } from './overlay-state'

const AXE = { rules: { 'color-contrast': { enabled: false }, region: { enabled: false } } }
const LAYERS = storm()

function Harness() {
  const state = useOverlayState(LAYERS)
  return <OverlayControls state={state} title="Harbor" />
}

afterEach(() => cleanup())

describe('overlay state', () => {
  it('starts at the first time and cuts the layers to it', () => {
    const { result } = renderHook(() => useOverlayState(LAYERS))
    expect(result.current.steps).toHaveLength(4)
    expect(result.current.index).toBe(0)
    const polygons = result.current.shown.find((l) => l.kind === 'polygon') as {
      features: unknown[]
    }
    expect(polygons.features).toHaveLength(1)
  })

  it('hides a layer that is switched off and one that starts hidden', () => {
    const start = LAYERS.map((l) => (l.id === 'reports' ? { ...l, visible: false } : l))
    const { result } = renderHook(() => useOverlayState(start))
    expect(result.current.shown.map((l) => l.id)).not.toContain('reports')
    act(() => result.current.toggle('track'))
    expect(result.current.shown.map((l) => l.id)).not.toContain('track')
    act(() => result.current.toggle('track'))
    expect(result.current.shown.map((l) => l.id)).toContain('track')
  })

  it('shows every time at once when asked, and keeps the index in range', () => {
    const { result } = renderHook(() => useOverlayState(LAYERS))
    act(() => result.current.setIndex(99))
    expect(result.current.index).toBe(3)
    act(() => result.current.setAllTimes(true))
    expect(result.current.at).toBeNull()
  })
})

describe('overlay controls', () => {
  it('lists every layer as a checkbox that toggles it', () => {
    render(<Harness />)
    const list = screen.getByRole('group', { name: 'Map layers' })
    const boxes = within(list).getAllByRole('checkbox')
    expect(boxes).toHaveLength(4)
    const track = within(list).getByRole('checkbox', { name: /Storm track/ }) as HTMLInputElement
    expect(track.checked).toBe(true)
    fireEvent.click(track)
    expect(track.checked).toBe(false)
    expect(screen.queryByText('Storm track', { selector: 'b' })).toBeNull()
  })

  it('moves the time slider with the buttons and the keyboard value, and says the time', () => {
    render(<Harness />)
    const slider = screen.getByRole('slider', { name: 'Time' }) as HTMLInputElement
    expect(slider.getAttribute('aria-valuetext')).toBe('Jun 12, 18:00 UTC')
    expect((screen.getByRole('button', { name: 'Earlier' }) as HTMLButtonElement).disabled).toBe(
      true,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Later' }))
    expect(slider.getAttribute('aria-valuetext')).toBe('Jun 12, 19:00 UTC')
    expect(screen.getByText('Tornado Warning', { selector: 'td' })).toBeTruthy()
    fireEvent.change(slider, { target: { value: '3' } })
    expect(slider.getAttribute('aria-valuetext')).toBe('Jun 12, 21:00 UTC')
    expect((screen.getByRole('button', { name: 'Later' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('shows all times, turning the slider off', () => {
    render(<Harness />)
    fireEvent.click(screen.getByRole('checkbox', { name: 'Show all times' }))
    expect((screen.getByRole('slider', { name: 'Time' }) as HTMLInputElement).disabled).toBe(true)
    expect(screen.getByText('All times', { selector: 'output' })).toBeTruthy()
    expect(screen.getByText('Wind damage', { selector: 'td' })).toBeTruthy()
  })

  it('has a legend with text for every item and a table of the overlay data', () => {
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: 'Later' }))
    const legend = screen.getByRole('list', { name: 'Overlay legend' })
    expect(within(legend).getByText('Warnings and watches')).toBeTruthy()
    expect(within(legend).getByText('Critical')).toBeTruthy()
    expect(within(legend).getByText('Watch')).toBeTruthy()
    const table = screen.getByRole('table', { name: 'Overlay data at the time shown' })
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((h) => h.textContent),
    ).toEqual(['Layer', 'Item', 'Kind', 'Time', 'Where or value'])
  })

  it('renders nothing when there are no overlays', () => {
    function Empty() {
      return <OverlayControls state={useOverlayState([])} title="x" />
    }
    const { container } = render(<Empty />)
    expect(container.textContent).toBe('')
  })

  it('has no axe violations', async () => {
    render(<Harness />)
    const result = await axe.run(document.body, AXE)
    expect(result.violations.map((v) => v.id)).toEqual([])
  })
})

describe('place outlines on a site plan', () => {
  const plan: MapLayer = {
    kind: 'site_plan',
    id: 'plan1',
    title: 'Terminal',
    source: 'maps/plan1/plan.png',
    image: 'maps/plan1/plan.png',
    width: 800,
    height: 600,
  }

  it('draws each outline as a polygon over the plan, with no axe violations', async () => {
    render(
      <MapView
        projectPath="/p"
        layer={plan}
        markers={[]}
        areas={[
          {
            placeId: 'g',
            label: 'Gate',
            kind: 'incident',
            points: [
              { x: 5, y: 5 },
              { x: 20, y: 5 },
              { x: 20, y: 20 },
            ],
          },
        ]}
      />,
    )
    const svg = screen.getByTestId('plan-areas')
    expect(svg.querySelector('polygon')?.getAttribute('points')).toBe('5,5 20,5 20,20')
    const result = await axe.run(document.body, AXE)
    expect(result.violations.map((v) => v.id)).toEqual([])
  })
})
