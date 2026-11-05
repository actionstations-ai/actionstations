// Interagency fire perimeters (spec 0461 FR-8, FR-9): the National Interagency Fire Center's
// public ArcGIS services. Fires from 2000 to 2019 come from the GeoMAC history (many mapped
// perimeters per fire, one per mapping flight or pass); 2020 and later from the WFIGS perimeter
// layer; and the current layer holds the fires burning now. A perimeter is a mapped polygon at a
// time, so the data is labeled historical and dated, and a replay animates between perimeters
// and says so (interpolation). The request carries a fire name, a year and a time range, never
// plan content. Geometry is generalized to about 50 meters.
import { z } from 'zod'
import { AppError } from '../../lib/errors'
import { getJson, toBytes } from './json'
import type { Connector, FetchContext } from './registry'
import { isoFromMs, outerRing, safeName, sqlTimestamp } from './wildfire-common'

export const NIFC_SERVICES = 'https://services3.arcgis.com/T4QMspbfLg3qTGWY/arcgis/rest/services'
const SOURCE = 'NIFC interagency fire perimeters'
const OFFSET_DEG = 0.0005
const PAGE = 200
const MAX_PAGES = 3
const FIRST_GEOMAC = 2000
const LAST_GEOMAC = 2019

interface LayerFields {
  url: string
  name: string
  time: string
  acres: string
  state: string
  uniqueId: string
  method: string
}

const GEOMAC = (year: number): LayerFields => ({
  url: `${NIFC_SERVICES}/Historic_Geomac_Perimeters_${year}/FeatureServer/0`,
  name: 'incidentname',
  time: 'perimeterdatetime',
  acres: 'gisacres',
  state: 'state',
  uniqueId: 'uniquefireidentifier',
  method: 'mapmethod',
})
const WFIGS = (path: string): LayerFields => ({
  url: `${NIFC_SERVICES}/${path}/FeatureServer/0`,
  name: 'poly_IncidentName',
  time: 'poly_PolygonDateTime',
  acres: 'poly_GISAcres',
  state: 'attr_POOState',
  uniqueId: 'attr_UniqueFireIdentifier',
  method: 'poly_MapMethod',
})

/** The layer that holds a year's perimeters, or the current layer. */
export function layerFor(year: number | 'current'): LayerFields {
  if (year === 'current') return WFIGS('WFIGS_Interagency_Perimeters_Current')
  if (year >= FIRST_GEOMAC && year <= LAST_GEOMAC) return GEOMAC(year)
  return WFIGS('WFIGS_Interagency_Perimeters')
}

const Collection = z.looseObject({
  type: z.literal('FeatureCollection'),
  features: z.array(
    z.looseObject({
      geometry: z.looseObject({ type: z.string() }).nullable(),
      properties: z.record(z.string(), z.unknown()).nullable(),
    }),
  ),
})

function yearOf(options: Record<string, string | number | boolean>): number | 'current' {
  if (options.source === 'current') return 'current'
  const y = Number(options.year)
  if (!Number.isInteger(y) || y < FIRST_GEOMAC || y > new Date().getUTCFullYear() + 1)
    throw new AppError('VALIDATION', `${SOURCE}: give the fire's year (2000 or later).`)
  return y
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '')
const num = (v: unknown): number | undefined => (typeof v === 'number' ? v : undefined)

function whereFor(
  layer: LayerFields,
  name: string,
  range?: { start: string; end: string },
): string {
  const parts = [`UPPER(${layer.name})='${name}'`]
  if (range)
    parts.push(
      `${layer.time} >= timestamp '${sqlTimestamp(range.start)}'`,
      `${layer.time} <= timestamp '${sqlTimestamp(range.end)}'`,
    )
  return encodeURIComponent(parts.join(' AND '))
}

const FIELDS = (l: LayerFields): string =>
  [l.name, l.time, l.acres, l.state, l.uniqueId, l.method].join(',')

export interface FoundFire {
  name: string
  state: string
  uniqueFireId: string
  firstTime: string
  lastTime: string
  maxAcres: number
  perimeters: number
}

/** Fires with this name in a year, from the attribute table only (no geometry), newest first. */
export async function findFires(
  ctx: FetchContext,
  q: { name: string; year: number | 'current' },
): Promise<FoundFire[]> {
  const layer = layerFor(q.year)
  const where = whereFor(layer, safeName(q.name, SOURCE))
  const url =
    `${layer.url}/query?where=${where}&outFields=${encodeURIComponent(FIELDS(layer))}` +
    `&returnGeometry=false&orderByFields=${layer.time}&resultRecordCount=500&f=geojson`
  const fc = await getJson(ctx, url, Collection, SOURCE)
  const byId = new Map<string, FoundFire>()
  for (const f of fc.features) {
    const p = f.properties ?? {}
    const t = num(p[layer.time])
    if (t === undefined) continue
    const id = str(p[layer.uniqueId]) || `${str(p[layer.name])}-${str(p[layer.state])}`
    const cur = byId.get(id)
    const acres = num(p[layer.acres]) ?? 0
    if (!cur)
      byId.set(id, {
        name: str(p[layer.name]),
        state: str(p[layer.state]),
        uniqueFireId: id,
        firstTime: isoFromMs(t),
        lastTime: isoFromMs(t),
        maxAcres: acres,
        perimeters: 1,
      })
    else {
      cur.lastTime = isoFromMs(Math.max(t, Date.parse(cur.lastTime)))
      cur.firstTime = isoFromMs(Math.min(t, Date.parse(cur.firstTime)))
      cur.maxAcres = Math.max(cur.maxAcres, acres)
      cur.perimeters++
    }
  }
  return [...byId.values()].sort((a, b) => b.maxAcres - a.maxAcres)
}

export const wfigsPerimetersConnector: Connector = {
  id: 'wfigs-perimeters',
  label: 'Fire perimeters over time (NIFC interagency perimeters)',
  source: 'National Interagency Fire Center (GeoMAC history and WFIGS perimeters)',
  terms:
    'Public interagency fire perimeter data from the National Interagency Fire Center. Perimeters are mapped polygons at a time, not a continuous record of the fire. Cite the NIFC and the retrieval date.',
  hosts: ['services3.arcgis.com'],
  estimate(query) {
    yearOf(query.options)
    safeName(query.options.name, SOURCE)
    return {
      requests: 1,
      items: [
        {
          datasetId: 'wfigs-perimeters',
          label: 'Mapped perimeters of the fire, generalized',
          kind: 'features',
          bytes: 1_500_000,
        },
      ],
    }
  },
  async fetch(query, ctx) {
    const year = yearOf(query.options)
    const layer = layerFor(year)
    const name = safeName(query.options.name, SOURCE)
    const features: unknown[] = []
    for (let page = 0; page < MAX_PAGES; page++) {
      const url =
        `${layer.url}/query?where=${whereFor(layer, name, query.range)}` +
        `&outFields=${encodeURIComponent(FIELDS(layer))}&returnGeometry=true&outSR=4326` +
        `&maxAllowableOffset=${OFFSET_DEG}&orderByFields=${layer.time}` +
        `&resultOffset=${page * PAGE}&resultRecordCount=${PAGE}&f=geojson`
      const fc = await getJson(ctx, url, Collection, SOURCE)
      for (const f of fc.features) {
        const p = f.properties ?? {}
        const t = num(p[layer.time])
        const ring = outerRing(f.geometry)
        if (t === undefined || !ring) continue
        features.push({
          type: 'Feature',
          geometry: { type: 'Polygon', coordinates: [[...ring, ring[0]!]] },
          properties: {
            id: `perimeter-${features.length}`,
            time: isoFromMs(t),
            acres: num(p[layer.acres]),
            name: str(p[layer.name]),
            state: str(p[layer.state]),
            uniqueFireId: str(p[layer.uniqueId]),
            mapMethod: str(p[layer.method]),
          },
        })
      }
      if (fc.features.length < PAGE) break
    }
    if (!features.length)
      throw new AppError(
        'NOT_FOUND',
        `${SOURCE}: no perimeters for that fire name, year and period.`,
      )
    const label = `${query.options.name} perimeters (NIFC, historical)`
    return {
      datasets: [
        {
          id: 'wfigs-perimeters',
          kind: 'features',
          label,
          file: 'wfigs-perimeters.geojson',
          area: { label: query.area.label },
        },
      ],
      files: [
        {
          name: 'wfigs-perimeters.geojson',
          data: toBytes({ type: 'FeatureCollection', features }),
        },
      ],
      modified:
        'Geometry generalized to about 50 meters; the outer ring of the largest part kept; attributes limited to name, time, acres, state, fire id and mapping method. Mapped perimeters at the times shown, not a continuous record.',
      citation:
        'National Interagency Fire Center, interagency fire perimeters (GeoMAC history and WFIGS)',
    }
  },
}
