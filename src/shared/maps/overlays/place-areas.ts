// Place areas as overlays (#652): a place can carry an outline (`area`) on a map. On a
// geographic map the outline becomes a polygon layer, so it is drawn with the other overlays,
// in the legend, and in snapshots and exports. On a site plan the outline is in percent of the
// picture and is returned as plain point lists for the plan view.
import type { OverlayLayer, OverlayToken, PolygonLayer } from '../../schemas/map-overlays'
import type { PercentPoint, Place, ProjectMaps } from '../../schemas/maps'

export const PLACE_AREAS_LAYER_ID = 'place-areas'

const TOKEN: Record<Place['kind'], OverlayToken> = {
  incident: 'critical',
  staging: 'info',
  command: 'ok',
  asset: 'neutral',
  public: 'water',
  other: 'neutral',
}

/** A polygon layer of the outlines places have on a geographic map, or undefined when none. */
export function placeAreaLayer(places: readonly Place[], mapId: string): PolygonLayer | undefined {
  const features: PolygonLayer['features'] = []
  for (const place of places)
    for (const pos of place.positions) {
      if (pos.mapId !== mapId || !('lat' in pos) || !pos.area || pos.area.length < 3) continue
      features.push({
        id: place.id,
        label: place.label,
        style: TOKEN[place.kind],
        ...(place.note ? { detail: place.note } : {}),
        rings: [pos.area.map((p): [number, number] => [p.lon, p.lat])],
      })
    }
  if (!features.length) return undefined
  return {
    kind: 'polygon',
    id: PLACE_AREAS_LAYER_ID,
    title: 'Place areas',
    legend: { label: 'Place areas', note: 'Outlines of places on this map' },
    visible: true,
    opacity: 0.35,
    features,
  }
}

export interface PercentArea {
  placeId: string
  label: string
  kind: Place['kind']
  points: PercentPoint[]
}

/** The outlines places have on a site plan, in percent of the picture. */
export function placeAreasPercent(places: readonly Place[], mapId: string): PercentArea[] {
  return places.flatMap((place) =>
    place.positions.flatMap((pos) =>
      pos.mapId === mapId && 'x' in pos && pos.area && pos.area.length >= 3
        ? [{ placeId: place.id, label: place.label, kind: place.kind, points: pos.area }]
        : [],
    ),
  )
}

const cache = new WeakMap<ProjectMaps, Map<string, OverlayLayer[]>>()

/**
 * The saved overlays of a map, then its place outlines. The result is remembered per maps object,
 * so a view that asks on every render gets the same array until the maps change.
 */
export function overlayLayersFor(maps: ProjectMaps, mapId: string): OverlayLayer[] {
  const byMap = cache.get(maps) ?? new Map<string, OverlayLayer[]>()
  cache.set(maps, byMap)
  const hit = byMap.get(mapId)
  if (hit) return hit
  const saved = (maps.overlays ?? []).filter((s) => s.mapId === mapId).flatMap((s) => s.layers)
  const areas = placeAreaLayer(maps.places, mapId)
  const out = areas ? [...saved, areas] : saved
  byMap.set(mapId, out)
  return out
}
