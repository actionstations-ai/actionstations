// Pins for the map views (#436, FR-7 and FR-8): which rows show at which place, and in what
// state. One function serves Facilitate, the presentation window, exports and devices, so the
// room and device audiences can never include a row that has not been delivered.
import type { Place, PlacePosition } from '../schemas/maps'

export type PinStatus = 'delivered' | 'due' | 'upcoming'
export type PinAudience = 'facilitator' | 'room' | 'device'

export interface PinRow {
  id: string
  /** Exercise time "H:MM". */
  time: string
  placeIds?: string[] | undefined
  toRoleIds?: string[] | undefined
}

export interface PinRowState {
  rowId: string
  status: PinStatus
}

export interface Pin {
  placeId: string
  label: string
  kind: Place['kind']
  position: PlacePosition
  rows: PinRowState[]
  /** The state the marker shows: due beats delivered beats upcoming. */
  status: PinStatus
}

export interface PinOptions {
  rows: PinRow[]
  delivered: Record<string, unknown>
  /** Exercise minutes elapsed; a row at or before this and not delivered is due. */
  elapsedMin: number
  places: Place[]
  mapId: string
  audience: PinAudience
  showUpcoming?: boolean
  /** For devices: only rows addressed to this role. */
  roleId?: string
}

const PRIORITY: Record<PinStatus, number> = { due: 2, delivered: 1, upcoming: 0 }

export function exerciseMinutes(time: string): number {
  const m = /^(\d{1,2}):([0-5]\d)$/.exec(time)
  return m ? Number(m[1]) * 60 + Number(m[2]) : Number.POSITIVE_INFINITY
}

export function rowStatus(
  row: Pick<PinRow, 'id' | 'time'>,
  delivered: Record<string, unknown>,
  elapsedMin: number,
): PinStatus {
  if (row.id in delivered) return 'delivered'
  return exerciseMinutes(row.time) <= elapsedMin ? 'due' : 'upcoming'
}

const visible = (status: PinStatus, o: PinOptions): boolean =>
  o.audience === 'facilitator'
    ? status !== 'upcoming' || o.showUpcoming === true
    : status === 'delivered'

function groupRows(o: PinOptions): Map<string, PinRowState[]> {
  const byPlace = new Map<string, PinRowState[]>()
  for (const row of o.rows) {
    if (o.roleId && !row.toRoleIds?.includes(o.roleId)) continue
    const status = rowStatus(row, o.delivered, o.elapsedMin)
    if (!visible(status, o)) continue
    for (const placeId of row.placeIds ?? []) {
      const list = byPlace.get(placeId) ?? []
      list.push({ rowId: row.id, status })
      byPlace.set(placeId, list)
    }
  }
  return byPlace
}

export function pinsFor(o: PinOptions): Pin[] {
  const byPlace = groupRows(o)
  const pins: Pin[] = []
  for (const place of o.places) {
    const rows = byPlace.get(place.id)
    const position = place.positions.find((p) => p.mapId === o.mapId)
    if (!rows || !position) continue
    const status = rows.reduce<PinStatus>(
      (best, r) => (PRIORITY[r.status] > PRIORITY[best] ? r.status : best),
      rows[0]!.status,
    )
    pins.push({ placeId: place.id, label: place.label, kind: place.kind, position, rows, status })
  }
  return pins
}

export const isPercentPosition = (p: PlacePosition): p is Extract<PlacePosition, { x: number }> =>
  'x' in p

/** Locations list for the screen reader and keyboard mirror of the map (NFR-3). */
export function locationRows(pins: Pin[]): { rowId: string; place: string; status: PinStatus }[] {
  return pins.flatMap((pin) =>
    pin.rows.map((r) => ({ rowId: r.rowId, place: pin.label, status: r.status })),
  )
}

/** A row names at most this many places. */
export const MAX_ROW_PLACES = 5

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** The place ids whose label or fact entry the event text names exactly (FR-6 rule pass). */
export function matchPlaces(event: string, places: Place[]): string[] {
  const hits: string[] = []
  for (const p of places) {
    const names = [p.label, p.factRef?.split(':')[1]].filter(
      (n): n is string => !!n && n.length > 1,
    )
    const found = names.some((n) =>
      new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRe(n)}($|[^\\p{L}\\p{N}])`, 'iu').test(event),
    )
    if (found) hits.push(p.id)
    if (hits.length === MAX_ROW_PLACES) break
  }
  return hits
}
