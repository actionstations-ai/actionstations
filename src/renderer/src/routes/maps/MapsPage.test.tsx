// @vitest-environment happy-dom
// Maps page (#436, FR-4, NFR-3): add a place, pin it by typed coordinates (the keyboard way
// beside clicking the map), list it, and pin facility facts. No axe violations.
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import axe from 'axe-core'
import { afterEach, describe, expect, it } from 'vitest'
import { ProjectMaps, type ProjectMaps as Maps } from '@shared/schemas'
import { mockTtx, projectUrl, renderAt, PROJECT } from '../documents/test-utils'
import MapsPage from './MapsPage'

const AXE = { rules: { 'color-contrast': { enabled: false }, region: { enabled: false } } }
const plan = {
  kind: 'site_plan' as const,
  id: 'plan1',
  title: 'Terminal level 1',
  source: 'maps/plan1/plan.png',
  image: 'maps/plan1/plan.png',
  width: 800,
  height: 600,
}

function open(start: Maps = ProjectMaps.parse({ maps: [plan], defaultMapId: 'plan1' })) {
  let current = start
  const ttx = mockTtx({
    'maps:get': () => ({ maps: current, revision: 'r1' }),
    'maps:save': ({ maps }: { maps: Maps }) => {
      current = ProjectMaps.parse(maps)
      return { maps: current, revision: 'r2' }
    },
    'maps:store': () => [],
    'project:facility-facts': () => ({
      path: 'facility-facts.md',
      markdown: '',
      edited: false,
      revision: 'f1',
      historyCount: 0,
      categories: [
        {
          id: 'gates',
          label: 'Gates',
          entries: ['A1', 'B2'],
          extracted: [],
          sources: {},
          linted: true,
        },
      ],
    }),
  })
  renderAt(projectUrl('maps'), '/p/:projectKey/maps', MapsPage)
  return ttx
}

afterEach(() => cleanup())

describe('Maps page', () => {
  it('shows an empty state with no maps', async () => {
    open(ProjectMaps.parse({}))
    expect(await screen.findByText('No maps yet')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Add site plan' })).toBeTruthy()
  })

  it('adds a place and pins it by typed coordinates', async () => {
    const ttx = open()
    fireEvent.change(await screen.findByLabelText('New place'), { target: { value: 'Gate A1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add place' }))
    await waitFor(() => expect(ttx.calls('maps:save')).toHaveLength(1))
    expect(await screen.findByRole('group', { name: 'Place: Gate A1' })).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Across (%)'), { target: { value: '25' } })
    fireEvent.change(screen.getByLabelText('Down (%)'), { target: { value: '40.5' } })
    fireEvent.click(screen.getByRole('button', { name: 'Set position' }))
    await waitFor(() => expect(ttx.calls('maps:save')).toHaveLength(2))
    const saved = ttx.calls('maps:save').at(-1) as {
      projectPath: string
      maps: Maps
      revision: string
    }
    expect(saved.projectPath).toBe(PROJECT)
    expect(saved.maps.places[0]).toMatchObject({
      label: 'Gate A1',
      positions: [{ mapId: 'plan1', x: 25, y: 40.5 }],
    })
    expect(await screen.findByRole('button', { name: 'Gate A1 (other)' })).toBeTruthy()
  })

  it('offers facility facts that are not placed yet, and adds one linked to its fact', async () => {
    const ttx = open()
    fireEvent.click(await screen.findByText(/Pin facility facts \(2 not placed\)/))
    fireEvent.click((await screen.findAllByRole('button', { name: 'Add as place' }))[0]!)
    await waitFor(() => expect(ttx.calls('maps:save')).toHaveLength(1))
    const saved = ttx.calls('maps:save')[0] as { maps: Maps }
    expect(saved.maps.places[0]).toMatchObject({ label: 'A1', factRef: 'gates:A1' })
  })

  it('tells the user to pick a place before clicking the map', async () => {
    open()
    expect(await screen.findByText(/No places yet/)).toBeTruthy()
  })

  it('has no axe violations', async () => {
    open(
      ProjectMaps.parse({
        maps: [plan],
        defaultMapId: 'plan1',
        places: [{ id: 'g', label: 'Gate', positions: [{ mapId: 'plan1', x: 5, y: 5 }] }],
      }),
    )
    await screen.findByRole('list', { name: 'Places in this project' })
    expect((await axe.run(document.body, AXE)).violations.map((v) => v.id)).toEqual([])
  })
})
