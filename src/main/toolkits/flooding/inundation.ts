// Inundation map layers from flood datasets (spec 0454 FR-6). Case data holds GeoJSON for
// simulated extents (a polygon per time step with exposure counts), modeled forecast extents and
// regulatory flood zones; this turns each into a map overlay layer with a legend entry and a
// time range, and lists the exposed assets in a table. The three kinds are never merged into one
// layer: each has its own legend wording, so a regulatory zone cannot pass as a forecast.
import type { OverlayLayer } from '@shared/schemas/map-overlays'
import { MAX_FEATURES, MAX_RING_POINTS } from '@shared/schemas/map-overlays'

type Ring = [number, number][]

interface GeoFeature {
  geometry: { type: string; coordinates?: unknown } | null
  properties: Record<string, unknown> | null
}
export interface FeatureCollectionLike {
  features: GeoFeature[]
}

export interface ExposureCounts {
  structure?: number
  road?: number
  facility?: number
  population?: number
}

const KIND_LEGEND: Record<string, { id: string; title: string; legend: string; note: string }> = {
  simulated_extent: {
    id: 'flood-extent-simulated',
    title: 'Flood extent (simulated)',
    legend: 'Simulated flood extent',
    note: 'An illustration from a simple stage relation, not a hazard map.',
  },
  modeled_forecast_extent: {
    id: 'flood-extent-modeled',
    title: 'Modeled forecast extent (experimental)',
    legend: 'Modeled forecast extent',
    note: 'Experimental National Weather Service model output for the current forecast; not a flood zone.',
  },
  regulatory_flood_zone: {
    id: 'flood-zones-regulatory',
    title: 'Regulatory flood zones (FEMA)',
    legend: 'Regulatory flood zone',
    note: 'Effective FEMA zones for planning an exercise; not a flood determination or insurance rating.',
  },
}

export interface InundationResult {
  layers: OverlayLayer[]
  /** Features left out: not a polygon, or too many points to draw. */
  skipped: number
}

const isRing = (r: unknown): r is Ring =>
  Array.isArray(r) &&
  r.length >= 3 &&
  r.every((p) => Array.isArray(p) && typeof p[0] === 'number' && typeof p[1] === 'number')

/** The polygons of a geometry as lists of rings (outer first). */
function polygonsOf(g: GeoFeature['geometry']): Ring[][] {
  if (!g || !Array.isArray(g.coordinates)) return []
  if (g.type === 'Polygon')
    return [g.coordinates as unknown[]].map((rs) => rs.filter(isRing) as Ring[])
  if (g.type === 'MultiPolygon')
    return (g.coordinates as unknown[][][]).map((p) => p.filter(isRing) as Ring[])
  return []
}

const str = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined)
const num = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) ? v : undefined

function exposureText(e: ExposureCounts | undefined): string {
  if (!e) return ''
  const parts = [
    e.road ? `${e.road} road${e.road === 1 ? '' : 's'}` : '',
    e.structure ? `${e.structure} structure${e.structure === 1 ? '' : 's'}` : '',
    e.facility ? `${e.facility} critical facilit${e.facility === 1 ? 'y' : 'ies'}` : '',
    e.population ? `${e.population} people` : '',
  ].filter(Boolean)
  return parts.length ? `Exposed: ${parts.join(', ')}.` : 'No assets exposed.'
}

function zoneStyle(zone: string | undefined, sfha: string | undefined) {
  const special = sfha === 'T' || /^(A|V)/.test(zone ?? '')
  return {
    style: special ? ('warning' as const) : ('muted' as const),
    legendLabel: special
      ? `Zone ${zone ?? 'A'} (special flood hazard area)`
      : `Zone ${zone ?? 'other'}`,
  }
}

/** One polygon layer per kind of flood dataset in `collections` (kind read from the features). */
export function inundationLayers(collections: readonly FeatureCollectionLike[]): InundationResult {
  const byKind = new Map<string, OverlayLayer & { kind: 'polygon' }>()
  let skipped = 0
  for (const fc of collections)
    for (const [i, f] of fc.features.entries()) {
      const props = f.properties ?? {}
      const kind = str(props.kind)
      const meta = kind ? KIND_LEGEND[kind] : undefined
      if (!kind || !meta) {
        skipped++
        continue
      }
      let layer = byKind.get(kind)
      if (!layer) {
        layer = {
          kind: 'polygon',
          id: meta.id,
          title: meta.title,
          legend: { label: meta.legend, note: meta.note },
          visible: true,
          opacity: 0.55,
          source: meta.title,
          features: [],
        }
        byKind.set(kind, layer)
      }
      const polys = polygonsOf(f.geometry)
      if (!polys.length) skipped++
      for (const [j, rings] of polys.entries()) {
        if (
          !rings.length ||
          rings.some((r) => r.length > MAX_RING_POINTS) ||
          layer.features.length >= MAX_FEATURES
        ) {
          skipped++
          continue
        }
        const start = str(props.start)
        const end = str(props.end)
        const stage = num(props.stage)
        const zone = str(props.FLD_ZONE)
        const exposure = props.exposure as ExposureCounts | undefined
        const cfs = num(props.streamflow_cfs)
        const zs =
          kind === 'regulatory_flood_zone' ? zoneStyle(zone, str(props.SFHA_TF)) : undefined
        layer.features.push({
          id: `${meta.id}-${i}-${j}`,
          label:
            kind === 'regulatory_flood_zone'
              ? `Zone ${zone ?? 'unknown'}`
              : stage !== undefined
                ? `Extent at ${stage} ft`
                : 'Extent',
          detail:
            [
              stage !== undefined ? `Stage ${stage} ft.` : '',
              cfs !== undefined ? `Modeled flow ${Math.round(cfs)} cfs.` : '',
              exposureText(exposure),
            ]
              .filter(Boolean)
              .join(' ') || undefined,
          style: zs?.style ?? 'water',
          ...(zs ? { legendLabel: zs.legendLabel } : {}),
          rings,
          ...(start || end
            ? { time: { ...(start ? { start } : {}), ...(end ? { end } : {}) } }
            : {}),
        })
      }
    }
  return { layers: [...byKind.values()].filter((l) => l.features.length), skipped }
}

/** Gauge points from gauge records, with the latest reading when one is given. */
export function gaugePointLayer(
  collections: readonly FeatureCollectionLike[],
  latest: Record<string, number> = {},
): OverlayLayer | undefined {
  const features = collections.flatMap((fc) =>
    fc.features.flatMap((f) => {
      const p = f.properties ?? {}
      const c = (f.geometry as { coordinates?: unknown } | null)?.coordinates
      if (
        p.kind !== 'flood_gauge' ||
        !Array.isArray(c) ||
        typeof c[0] !== 'number' ||
        typeof c[1] !== 'number'
      )
        return []
      const lid = str(p.lid) ?? 'gauge'
      const value = latest[lid.toLowerCase()]
      return [
        {
          id: `gauge-${lid.toLowerCase()}`,
          label: `${str(p.name) ?? lid} (${lid})`,
          style: 'info' as const,
          at: [c[0], c[1]] as [number, number],
          ...(value !== undefined ? { value, unit: 'ft' } : {}),
        },
      ]
    }),
  )
  if (!features.length) return undefined
  return {
    kind: 'point',
    id: 'flood-gauges',
    title: 'River gauges',
    legend: { label: 'River gauge' },
    visible: true,
    opacity: 0.9,
    features,
  }
}

export interface ExposureRow {
  time: string
  stage: string
  road: number
  structure: number
  facility: number
  population: number
}

/** The exposure at each time step of simulated extents, for the table beside the map (NFR-3). */
export function exposureRows(extents: FeatureCollectionLike): ExposureRow[] {
  return extents.features
    .filter((f) => f.properties?.kind === 'simulated_extent')
    .map((f) => {
      const p = f.properties!
      const e = (p.exposure ?? {}) as ExposureCounts
      return {
        time: str(p.start) ?? '',
        stage: num(p.stage) === undefined ? '' : `${num(p.stage)} ft`,
        road: e.road ?? 0,
        structure: e.structure ?? 0,
        facility: e.facility ?? 0,
        population: e.population ?? 0,
      }
    })
    .sort((a, b) => Date.parse(a.time) - Date.parse(b.time))
}
