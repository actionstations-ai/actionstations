// Facilitate › Map (#436, FR-7): delivered, due and (when asked) upcoming rows at their places.
// Selecting a pin selects the row, and selecting a row highlights its pins. Upcoming rows are
// hidden by default so the screen can be shared without spoilers.
import { Link } from 'react-router'
import type { Scenario } from '@shared/schemas'
import type { FacilitatorState } from '@shared/ipc'
import { pinsFor, rowStatus, type PinStatus } from '@shared/maps/pins'
import { Button, EmptyState, Field } from '../../components/ui'
import { toast } from '../../components/toast-store'
import { call } from '../../lib/api'
import { errorText } from '../../lib/errors'
import { MapView } from '../../components/map/MapView'
import { markerFromPin } from '../../components/map/marker-model'
import { useProjectMaps } from '../../state/maps'
import { projectKey } from '../../state/project'
import type { UpdateState } from './use-delivery-actions'
import './map-tab.css'

export function MapTab(props: {
  projectPath: string
  scenario: Scenario
  state: FacilitatorState
  minutes: number
  selectedRowId: string | undefined
  onSelectRow: (rowId: string) => void
  update: UpdateState
}) {
  const { projectPath, scenario, state, minutes } = props
  const { data, isPending, error } = useProjectMaps(projectPath)
  if (isPending) return <p className="muted">Loading maps…</p>
  if (error || !data) return <p className="field__error">Could not load maps: {error?.message}</p>
  const layers = data.maps.maps
  const layer =
    layers.find((m) => m.id === (state.map?.mapId ?? data.maps.defaultMapId)) ?? layers[0]
  if (!layer)
    return (
      <EmptyState
        title="No maps yet"
        body={
          <>
            Add a site plan or a map and pin places on it in{' '}
            <Link to={`/p/${projectKey(projectPath)}/maps`}>Maps</Link>.
          </>
        }
      />
    )
  const showUpcoming = state.map?.showUpcoming ?? false
  const rows = scenario.msel.map((r) => ({
    id: r.id,
    time: r.time,
    placeIds: r.placeIds,
    toRoleIds: r.toRoleIds,
  }))
  const pins = pinsFor({
    rows,
    delivered: state.delivered,
    elapsedMin: minutes,
    places: data.maps.places,
    mapId: layer.id,
    audience: 'facilitator',
    showUpcoming,
  })
  const status: Record<string, PinStatus> = Object.fromEntries(
    rows.map((r) => [r.id, rowStatus(r, state.delivered, minutes)]),
  )
  const setMap = (patch: { mapId?: string; showUpcoming?: boolean }) =>
    props.update((s) => ({
      ...s,
      map: { showUpcoming, ...(s.map?.mapId ? { mapId: s.map.mapId } : {}), ...s.map, ...patch },
    }))
  const showOnScreen = () =>
    call('facilitator:present-map', {
      projectPath,
      scenarioId: scenario.id,
      mapId: layer.id,
    }).catch((e) => toast.error('Could not show the map', errorText(e)))
  return (
    <div className="stack" data-testid="map-tab">
      <div className="row">
        <Field label="Map">
          {(f) => (
            <select
              id={f.id}
              className="input"
              value={layer.id}
              onChange={(e) => setMap({ mapId: e.target.value })}
            >
              {layers.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.title}
                </option>
              ))}
            </select>
          )}
        </Field>
        <label className="row">
          <input
            type="checkbox"
            checked={showUpcoming}
            onChange={(e) => setMap({ showUpcoming: e.target.checked })}
          />
          Show upcoming
        </label>
        <Button onClick={() => void showOnScreen()}>Show map on screen</Button>
      </div>
      <MapView
        projectPath={projectPath}
        layer={layer}
        markers={pins.map(markerFromPin)}
        rowStatus={status}
        selectedRowId={props.selectedRowId}
        onSelectRow={props.onSelectRow}
        showLegend
      />
    </div>
  )
}
