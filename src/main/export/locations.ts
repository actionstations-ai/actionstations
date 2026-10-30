// "Locations" pages for the MSEL and the controller handbook (#500, spec 0436 FR-8): each site
// plan with numbered markers for the places the MSEL rows happen at, at most 12 markers per page,
// and a legend naming the rows. The pages are HTML drawn from project data, so every label is
// exact text. A geographic map has no rendered basemap here: its places are plotted by latitude
// and longitude on a plain frame (schematic), with their coordinates in the legend.
import { MAX_MARKERS_PER_PAGE, rowsByPlace } from '@shared/maps/locations'
import { formatLatLon, schematicPoints } from '@shared/maps/schematic'
import type { Place, PlacePosition, ProjectMaps, Scenario } from '@shared/schemas'

export interface LocationMarkerView {
  n: number
  x: number
  y: number
  label: string
  kind: 'incident' | 'staging' | 'command' | 'info'
  rows: string
  /** Latitude and longitude as text, for places on a geographic map. */
  coords?: string
}

export interface LocationPageView {
  id: string
  heading: string
  /** Project-relative path of the plan image (empty for a geographic map); the caller turns it into a URL. */
  image: string
  /** A geographic map drawn as a plain frame of plotted places, with no basemap. */
  schematic: boolean
  alt: string
  markers: LocationMarkerView[]
}

const KIND: Record<Place['kind'], LocationMarkerView['kind']> = {
  incident: 'incident',
  staging: 'staging',
  command: 'command',
  asset: 'info',
  public: 'info',
  other: 'info',
}

const percentOn = (
  place: Place,
  mapId: string,
): Extract<PlacePosition, { x: number }> | undefined =>
  place.positions.find(
    (p): p is Extract<PlacePosition, { x: number }> => p.mapId === mapId && 'x' in p,
  )

/** The pages for every site plan that has a place the MSEL uses, markers numbered from 1 per plan. */
function planMarkers(
  places: Place[],
  used: Map<string, string[]>,
  mapId: string,
): LocationMarkerView[] {
  return places.flatMap((place): LocationMarkerView[] => {
    const at = percentOn(place, mapId)
    const rows = used.get(place.id)
    if (!at || !rows?.length) return []
    return [
      { n: 0, x: at.x, y: at.y, label: place.label, kind: KIND[place.kind], rows: rows.join(', ') },
    ]
  })
}

/** Places on a geographic map; x and y are filled in per page, once the page's places are known. */
function geoMarkers(
  places: Place[],
  used: Map<string, string[]>,
  mapId: string,
): (LocationMarkerView & { lat: number; lon: number })[] {
  return places.flatMap((place) => {
    const at = place.positions.find(
      (p): p is Extract<PlacePosition, { lat: number }> => p.mapId === mapId && 'lat' in p,
    )
    const rows = used.get(place.id)
    if (!at || !rows?.length) return []
    return [
      {
        n: 0,
        x: 0,
        y: 0,
        lat: at.lat,
        lon: at.lon,
        label: place.label,
        kind: KIND[place.kind],
        rows: rows.join(', '),
        coords: formatLatLon(at),
      },
    ]
  })
}

const countText = (n: number): string => `${n} numbered location${n === 1 ? '' : 's'}`

/** The pages for every map that has a place the MSEL uses, markers numbered from 1 per page. */
export function locationPages(
  maps: ProjectMaps | undefined,
  scenario: Scenario,
  prefix = '',
): LocationPageView[] {
  if (!maps) return []
  const used = rowsByPlace(scenario.msel)
  const pages: LocationPageView[] = []
  for (const layer of maps.maps) {
    const geo = layer.kind === 'geo'
    const markers = geo
      ? geoMarkers(maps.places, used, layer.id)
      : planMarkers(maps.places, used, layer.id)
    const chunks = Math.ceil(markers.length / MAX_MARKERS_PER_PAGE)
    for (let i = 0; i < chunks; i++) {
      const slice = markers.slice(i * MAX_MARKERS_PER_PAGE, (i + 1) * MAX_MARKERS_PER_PAGE)
      const spots = geo ? schematicPoints(slice as unknown as { lat: number; lon: number }[]) : []
      const part = chunks > 1 ? ` (${i + 1} of ${chunks})` : ''
      pages.push({
        id: `${prefix}loc-${layer.id}-${i + 1}`,
        heading: `Locations: ${layer.title}${part}`,
        image: layer.kind === 'site_plan' ? layer.image : '',
        schematic: geo,
        alt: geo
          ? `Places on ${layer.title}, plotted by latitude and longitude, ${countText(slice.length)}`
          : `Site plan ${layer.title} with ${countText(slice.length)}`,
        markers: slice.map((m, j) => ({
          n: j + 1,
          x: spots[j]?.x ?? m.x,
          y: spots[j]?.y ?? m.y,
          label: m.label,
          kind: m.kind,
          rows: m.rows,
          ...(m.coords ? { coords: m.coords } : {}),
        })),
      })
    }
  }
  return pages
}
