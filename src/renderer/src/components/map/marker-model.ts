// Marker data for the map views (#436): what a pin is, its state text and accessible name.
import type { Place, PlacePosition } from '@shared/schemas'
import type { Pin, PinStatus } from '@shared/maps/pins'

export interface MapMarker {
  id: string
  label: string
  kind: Place['kind']
  position: PlacePosition
  /** Absent for places shown in the editor, which have no row state. */
  status?: PinStatus
  rowIds: string[]
}

export const STATUS_TEXT: Record<PinStatus, string> = {
  delivered: 'delivered',
  due: 'due',
  upcoming: 'upcoming',
}

export function markerFromPin(pin: Pin): MapMarker {
  return {
    id: pin.placeId,
    label: pin.label,
    kind: pin.kind,
    position: pin.position,
    status: pin.status,
    rowIds: pin.rows.map((r) => r.rowId),
  }
}

export function markerFromPlace(place: Place, mapId: string): MapMarker | undefined {
  const position = place.positions.find((p) => p.mapId === mapId)
  return position
    ? { id: place.id, label: place.label, kind: place.kind, position, rowIds: [] }
    : undefined
}

/** The accessible name: place, then its rows with their states. */
export function markerName(m: MapMarker, rowStatus: Record<string, PinStatus>): string {
  if (m.rowIds.length === 0) return `${m.label} (${m.kind})`
  const rows = m.rowIds.map((id) => `${id} ${STATUS_TEXT[rowStatus[id] ?? 'upcoming']}`)
  return `${m.label}: ${rows.join(', ')}`
}
