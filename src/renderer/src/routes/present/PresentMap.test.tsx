// @vitest-environment happy-dom
// The map on the projector (#500): only delivered rows are drawn, the map follows the Facilitate
// choice, and the page has no axe violations.
import { cleanup, screen } from '@testing-library/react'
import axe from 'axe-core'
import { afterEach, describe, expect, it } from 'vitest'
import { FacilitatorState } from '@shared/ipc'
import { ProjectMaps, type Scenario } from '@shared/schemas'
import { mockTtx, PROJECT, renderAt } from '../documents/test-utils'
import { projectKey } from '../../state/project'
import PresentMap from './PresentMap'

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
  id: 's1',
  msel: [
    { id: 'I-01', time: '0:00', placeIds: ['gate'], toRoleIds: [] },
    { id: 'I-02', time: '0:10', placeIds: ['eoc'], toRoleIds: [] },
  ],
}

afterEach(() => cleanup())

function show(state: FacilitatorState) {
  mockTtx({
    'maps:get': () => ({ maps, revision: 'r1' }),
    'scenarios:get': () => scenario as unknown as Scenario,
    'facilitator:state-get': () => state,
  })
  renderAt(
    `/present/${projectKey(PROJECT)}/s1/map/plan1`,
    '/present/:projectKey/:scenarioId/map/:mapId',
    () => <PresentMap />,
  )
}

describe('PresentMap', () => {
  it('draws delivered rows only, even when later rows are due', async () => {
    show(FacilitatorState.parse({ delivered: { 'I-01': { at: 'x', exerciseTime: '0:00' } } }))
    expect(await screen.findByRole('button', { name: 'Gate A1: I-01 delivered' })).toBeTruthy()
    expect(screen.queryByText(/I-02/)).toBeNull()
    expect(screen.queryByText('EOC')).toBeNull()
    const result = await axe.run(document.body, {
      rules: { 'color-contrast': { enabled: false }, region: { enabled: false } },
    })
    expect(result.violations.map((v) => v.id)).toEqual([])
  })

  it('shows an empty map before anything is delivered', async () => {
    show(FacilitatorState.parse({}))
    expect(await screen.findByTestId('present-map')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /delivered/ })).toBeNull()
  })
})
