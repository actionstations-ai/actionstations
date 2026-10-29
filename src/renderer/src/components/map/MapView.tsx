// One map with its legend and a Locations list (#436, FR-7, NFR-3). The list mirrors the markers
// for keyboard and screen reader users, who can work from it without the map.
import type { MapLayer } from '@shared/schemas'
import type { PinStatus } from '@shared/maps/pins'
import { GeoView } from './GeoView'
import { STATUS_TEXT, type MapMarker } from './marker-model'
import { Legend } from './markers'
import { SitePlanView } from './SitePlanView'
import './map.css'

export interface MapViewProps {
  projectPath: string
  layer: MapLayer
  markers: MapMarker[]
  rowStatus?: Record<string, PinStatus>
  selectedRowId?: string | undefined
  onSelectRow?: ((rowId: string) => void) | undefined
  selectedMarkerId?: string | undefined
  onSelectMarker?: ((markerId: string) => void) | undefined
  onPick?: ((p: { x: number; y: number } | { lat: number; lon: number }) => void) | undefined
  /** The legend explains row states; the Places editor has no rows. */
  showLegend?: boolean
}

export function MapView(props: MapViewProps) {
  const { layer, markers } = props
  const rowStatus = props.rowStatus ?? {}
  const activate = (m: MapMarker) => {
    if (m.rowIds.length === 0) return props.onSelectMarker?.(m.id)
    const at = props.selectedRowId ? m.rowIds.indexOf(props.selectedRowId) : -1
    props.onSelectRow?.(m.rowIds[(at + 1) % m.rowIds.length]!)
  }
  const engine = {
    projectPath: props.projectPath,
    markers,
    rowStatus,
    selectedRowId: props.selectedRowId,
    selectedMarkerId: props.selectedMarkerId,
    onActivate: activate,
    onPick: props.onPick,
  }
  return (
    <div className="map-view">
      {layer.kind === 'site_plan' ? (
        <SitePlanView {...engine} layer={layer} />
      ) : (
        <GeoView {...engine} layer={layer} />
      )}
      {props.showLegend && <Legend />}
      <LocationsList {...props} rowStatus={rowStatus} onActivate={activate} />
    </div>
  )
}

function LocationsList(
  props: MapViewProps & {
    rowStatus: Record<string, PinStatus>
    onActivate: (m: MapMarker) => void
  },
) {
  const items = props.markers.flatMap((m) =>
    m.rowIds.length === 0
      ? [{ key: m.id, rowId: '', place: m.label, status: m.kind, marker: m }]
      : m.rowIds.map((id) => ({
          key: `${m.id}:${id}`,
          rowId: id,
          place: m.label,
          status: STATUS_TEXT[props.rowStatus[id] ?? 'upcoming'],
          marker: m,
        })),
  )
  const hasRows = items.some((i) => i.rowId)
  return (
    <details className="map-locations" open>
      <summary>Locations ({items.length})</summary>
      {items.length === 0 ? (
        <p className="muted">Nothing is placed on this map yet.</p>
      ) : (
        <table className="map-locations__table">
          <thead>
            <tr>
              {hasRows && <th scope="col">Row</th>}
              <th scope="col">Place</th>
              <th scope="col">{hasRows ? 'Status' : 'Kind'}</th>
            </tr>
          </thead>
          <tbody>
            {items.map((i) => (
              <tr key={i.key} aria-selected={i.rowId !== '' && i.rowId === props.selectedRowId}>
                {hasRows && (
                  <th scope="row">
                    <button
                      type="button"
                      className="map-locations__select"
                      aria-pressed={i.rowId === props.selectedRowId}
                      onClick={() => props.onSelectRow?.(i.rowId)}
                    >
                      {i.rowId}
                    </button>
                  </th>
                )}
                <td>
                  {hasRows ? (
                    i.place
                  ) : (
                    <button
                      type="button"
                      className="map-locations__select"
                      aria-pressed={i.marker.id === props.selectedMarkerId}
                      onClick={() => props.onSelectMarker?.(i.marker.id)}
                    >
                      {i.place}
                    </button>
                  )}
                </td>
                <td>{i.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </details>
  )
}
