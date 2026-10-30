// "Locations" pages for the MSEL and the controller handbook (#500, spec 0436 FR-8): each site
// plan with numbered markers for the places the MSEL rows happen at, at most 12 markers per page,
// and a legend naming the rows. The pages are HTML drawn from project data, so every label is
// exact text. Geographic maps are not drawn here (they need a rendered basemap image).
import { MAX_MARKERS_PER_PAGE, rowsByPlace } from '@shared/maps/locations'
import type { Place, PlacePosition, ProjectMaps, Scenario } from '@shared/schemas'

export interface LocationMarkerView {
  n: number
  x: number
  y: number
  label: string
  kind: 'incident' | 'staging' | 'command' | 'info'
  rows: string
}

export interface LocationPageView {
  id: string
  heading: string
  /** Project-relative path of the plan image; the caller turns it into a URL. */
  image: string
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
export function locationPages(
  maps: ProjectMaps | undefined,
  scenario: Scenario,
  prefix = '',
): LocationPageView[] {
  if (!maps) return []
  const used = rowsByPlace(scenario.msel)
  const pages: LocationPageView[] = []
  for (const layer of maps.maps) {
    if (layer.kind !== 'site_plan') continue
    const markers = maps.places.flatMap((place): LocationMarkerView[] => {
      const at = percentOn(place, layer.id)
      const rows = used.get(place.id)
      if (!at || !rows?.length) return []
      return [
        {
          n: 0,
          x: at.x,
          y: at.y,
          label: place.label,
          kind: KIND[place.kind],
          rows: rows.join(', '),
        },
      ]
    })
    const chunks = Math.ceil(markers.length / MAX_MARKERS_PER_PAGE)
    for (let i = 0; i < chunks; i++) {
      const slice = markers.slice(i * MAX_MARKERS_PER_PAGE, (i + 1) * MAX_MARKERS_PER_PAGE)
      const part = chunks > 1 ? ` (${i + 1} of ${chunks})` : ''
      pages.push({
        id: `${prefix}loc-${layer.id}-${i + 1}`,
        heading: `Locations: ${layer.title}${part}`,
        image: layer.image,
        alt: `Site plan ${layer.title} with ${slice.length} numbered location${slice.length === 1 ? '' : 's'}`,
        markers: slice.map((m, j) => ({ ...m, n: j + 1 })),
      })
    }
  }
  return pages
}
