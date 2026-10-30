// @vitest-environment happy-dom
// Facilitate › Map (#436, FR-7): delivered and due rows at their places, upcoming rows only on
// request, selection shared with the timeline, and a way to the Maps page when there are none.
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FacilitatorState } from '@shared/ipc'
import type { LiveSessionStatus } from '@shared/schemas/live'
import { ProjectMaps, type Scenario } from '@shared/schemas'
import { mockTtx, PROJECT, renderAt } from '../documents/test-utils'
import { projectKey } from '../../state/project'
import { MapTab } from './MapTab'

const maps = ProjectMaps.parse({
  defaultMapId: 'plan1',
  maps: [
    {
      kind: 'site_plan',
      id: 'plan1',
      title: 'Terminal',
      source: 'maps/plan1/plan.png',
      image: 'maps/plan1/plan.png',
      width: 800,
      height: 600,
    },
  ],
  places: [
    { id: 'gate', label: 'Gate A1', positions: [{ mapId: 'plan1', x: 20, y: 30 }] },
    { id: 'eoc', label: 'EOC', kind: 'command', positions: [{ mapId: 'plan1', x: 60, y: 60 }] },
  ],
})
const scenario = {
  id: 'scenario-3',
  msel: [
    { id: 'I-01', time: '0:00', placeIds: ['gate'], toRoleIds: [] },
    { id: 'I-02', time: '0:10', placeIds: ['eoc'], toRoleIds: [] },
    { id: 'I-03', time: '3:00', placeIds: ['eoc'], toRoleIds: [] },
  ],
} as unknown as Scenario

function show(over: Partial<FacilitatorState> = {}, onSelectRow = vi.fn(), update = vi.fn()) {
  const state = FacilitatorState.parse({
    delivered: { 'I-01': { at: 'x', exerciseTime: '0:00' } },
    ...over,
  })
  mockTtx({ 'maps:get': () => ({ maps, revision: 'r1' }) })
  renderAt(`/p/${projectKey(PROJECT)}/x`, '/p/:projectKey/x', () => (
    <MapTab
      projectPath={PROJECT}
      scenario={scenario}
      state={state}
      minutes={15}
      selectedRowId="I-02"
      onSelectRow={onSelectRow}
      update={update}
    />
  ))
  return { onSelectRow, update }
}

afterEach(() => cleanup())

describe('Facilitate Map tab', () => {
  it('draws delivered and due rows and keeps upcoming ones off the screen', async () => {
    show()
    expect(await screen.findByRole('button', { name: 'Gate A1: I-01 delivered' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'EOC: I-02 due' }).getAttribute('aria-pressed')).toBe(
      'true',
    )
    expect(screen.queryByText(/I-03/)).toBeNull()
  })

  it('shows upcoming rows when Show upcoming is on, and saves the choice', async () => {
    const { update } = show({ map: { showUpcoming: true } })
    expect(await screen.findByRole('button', { name: 'EOC: I-02 due, I-03 upcoming' })).toBeTruthy()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Show upcoming' }))
    await waitFor(() => expect(update).toHaveBeenCalled())
    const next = update.mock.calls[0]![0](FacilitatorState.parse({ map: { showUpcoming: true } }))
    expect(next.map).toMatchObject({ showUpcoming: false })
  })

  it('selects the row when its pin is clicked', async () => {
    const { onSelectRow } = show()
    fireEvent.click(await screen.findByRole('button', { name: 'Gate A1: I-01 delivered' }))
    expect(onSelectRow).toHaveBeenCalledWith('I-01')
  })

  it('points to the Maps page when the project has no maps', async () => {
    mockTtx({ 'maps:get': () => ({ maps: ProjectMaps.parse({}), revision: 'none' }) })
    renderAt(`/p/${projectKey(PROJECT)}/x`, '/p/:projectKey/x', () => (
      <MapTab
        projectPath={PROJECT}
        scenario={scenario}
        state={FacilitatorState.parse({})}
        minutes={0}
        selectedRowId={undefined}
        onSelectRow={() => undefined}
        update={vi.fn()}
      />
    ))
    expect(await screen.findByRole('link', { name: 'Maps' })).toBeTruthy()
  })

  it('sends the map to the presentation window', async () => {
    const ttx = mockTtx({
      'maps:get': () => ({ maps, revision: 'r1' }),
      'facilitator:present-map': () => undefined,
    })
    renderAt(`/p/${projectKey(PROJECT)}/x`, '/p/:projectKey/x', () => (
      <MapTab
        projectPath={PROJECT}
        scenario={scenario}
        state={FacilitatorState.parse({})}
        minutes={0}
        selectedRowId={undefined}
        onSelectRow={vi.fn()}
        update={vi.fn()}
      />
    ))
    fireEvent.click(await screen.findByRole('button', { name: 'Show map on screen' }))
    await waitFor(() => expect(ttx.calls('facilitator:present-map')).toHaveLength(1))
    expect(ttx.calls('facilitator:present-map')[0]).toMatchObject({
      scenarioId: 'scenario-3',
      mapId: 'plan1',
    })
  })

  it('offers Map on devices only while a live session runs, and shares the shown map', async () => {
    const running = { session: { id: 's1' }, connected: 2 } as unknown as LiveSessionStatus
    const ttx = mockTtx({
      'maps:get': () => ({ maps, revision: 'r1' }),
      'live:session-status': () => running,
      'live:map-shared': () => ({}),
      'live:map-share': () => ({ mapId: 'plan1' }),
    })
    renderAt(`/p/${projectKey(PROJECT)}/x`, '/p/:projectKey/x', () => (
      <MapTab
        projectPath={PROJECT}
        scenario={scenario}
        state={FacilitatorState.parse({})}
        minutes={0}
        selectedRowId={undefined}
        onSelectRow={vi.fn()}
        update={vi.fn()}
      />
    ))
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Map on devices' }))
    await waitFor(() => expect(ttx.calls('live:map-share')).toHaveLength(1))
    expect(ttx.calls('live:map-share')[0]).toMatchObject({ mapId: 'plan1' })
  })

  it('has no Map on devices control without a live session', async () => {
    show()
    await screen.findByRole('button', { name: 'Gate A1: I-01 delivered' })
    expect(screen.queryByRole('checkbox', { name: 'Map on devices' })).toBeNull()
  })
})
