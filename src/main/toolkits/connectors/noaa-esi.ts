// NOAA Environmental Sensitivity Index (ESI) shoreline connector (spec 0455 FR-6): the shoreline
// classes of one ESI region cropped to the scenario's area, as GeoJSON lines. The data are NOAA
// Office of Response and Restoration's, served by the NOAA GeoPlatform on ArcGIS Online (one
// fixed host, only the NOAA organization's folder of services). The layer of ESI shoreline lines
// is found by name because its number differs between regions. Only the shoreline class and
// shore type are kept. No key.
import { AppError } from '../../lib/errors'
import { stringOption } from './noaa-common'
import type { Connector, ConnectorQuery, ConnectorResult, FetchContext } from './registry'

const HOST = 'services2.arcgis.com'
/** NOAA GeoPlatform's organization id on ArcGIS Online; every URL built here starts with it. */
const ORG = 'C8EMgrsFcRFL6LrL'
const BASE = `https://${HOST}/${ORG}/ArcGIS/rest/services`
const PAGE = 2000
const MAX_PAGES = 8
const MAX_AREA_DEG2 = 0.5
const MAX_SIDE_DEG = 1
/** Measured: about 23 MB of response per square degree of ESI shoreline in Mobile Bay. */
const BYTES_PER_DEG2 = 25_000_000
const OVERHEAD_BYTES = 20_000

/** ESI regions whose service was checked to carry a layer of ESI shoreline lines. */
export const ESI_REGIONS = {
  alabama: ['Alabama (2007)', 'Alabama_ESI_2007_test'],
  mississippi: ['Mississippi (2010)', 'Mississippi_ESI_2010_test'],
  upper_texas_coast: ['Upper Texas coast (2013)', 'Upper_Coast_of_Texas_ESI_2013_test'],
  florida_panhandle: ['Florida Panhandle (2012)', 'Florida_Panhandle_ESI_2012_1'],
  south_florida: ['South Florida (2013)', 'South_Florida_ESI_2013_test'],
  delaware_bay: ['Delaware Bay (2014)', 'Delaware_Bay_ESI_2014'],
  maine_new_hampshire: ['Maine and New Hampshire (2016)', 'Maine_and_New_Hampshire_ESI_2016'],
  north_carolina: ['North Carolina (2016)', 'North_Carolina_ESI___2016'],
  puerto_rico: ['Puerto Rico (2000)', 'Puerto_Rico_ESI_2000_test'],
  virgin_islands: ['Virgin Islands (2000)', 'Virgin_Islands_ESI_2000_test'],
  central_california: ['Central California (2006)', 'Central_California_ESI_2006_test'],
  northern_california: ['Northern California (2008)', 'Northern_California_ESI_2008_test'],
  san_francisco: ['San Francisco Bay (1998)', 'San_Francisco_ESI_1998_test'],
  columbia_river: ['Columbia River (2004)', 'Columbia_River_ESI_2004_test'],
  puget_sound: [
    'Puget Sound and Strait of Juan de Fuca (2006)',
    'Washington_Puget_Sound_and_Strait_of_Juan_de_Fuca_ESI_2006',
  ],
  hawaii: ['Hawaii (2001)', 'Hawaii_ESI_2001_test'],
  guam: ['Guam (2005)', 'Guam_ESI_2005_test'],
  american_samoa: ['American Samoa', 'American_Samoa_ESI_test2'],
  cook_inlet: ['Cook Inlet, Alaska (2002)', 'Cook_Inlet_Alaska_ESI_2002'],
  southeast_alaska: ['Southeast Alaska (2001)', 'Southeast_Alaska_ESI_2001'],
  prince_william_sound: ['Prince William Sound (2000)', 'Prince_William_Sound_ESI_2000_test'],
  bristol_bay: ['Bristol Bay (2004)', 'Bristol_Bay_ESI_2004_test'],
  western_alaska: ['Western Alaska (2003)', 'Western_Alaska_ESI_2003_test'],
  northwest_arctic: ['Northwest Arctic (2002)', 'Northwest_Arctic_ESI_2002_test'],
  north_slope: ['North Slope (2005)', 'North_Slope_ESI_2005_test'],
} as const satisfies Record<string, readonly [string, string]>
export type EsiRegion = keyof typeof ESI_REGIONS

const KEEP_FIELDS = [
  'ESI',
  'MOSTSENSIT',
  'Landward_shoretype',
  'Seaward_shoretype1',
  'Seaward_shoretype2',
]
const LAYER_NAME = /^esi\s*lines?$/i

const isRegion = (r: string): r is EsiRegion => Object.hasOwn(ESI_REGIONS, r)

function plan(q: ConnectorQuery) {
  const region = stringOption(q, 'region', /^[a-z_]{3,40}$/)
  if (!isRegion(region))
    throw new AppError(
      'VALIDATION',
      `Unknown ESI region "${region}". Choose one of: ${Object.keys(ESI_REGIONS).join(', ')}`,
    )
  const bbox = q.area.bbox
  if (!bbox) throw new AppError('VALIDATION', 'Draw or enter the area to crop the shoreline to')
  const [w, s, e, n] = bbox
  const width = e - w
  const height = n - s
  if (!(width > 0 && height > 0)) throw new AppError('VALIDATION', 'The area has no size')
  if (width > MAX_SIDE_DEG || height > MAX_SIDE_DEG || width * height > MAX_AREA_DEG2)
    throw new AppError(
      'VALIDATION',
      `That area is too large: keep it under ${MAX_AREA_DEG2} square degrees and ${MAX_SIDE_DEG} degree on a side.`,
    )
  return { region, bbox, area: width * height, service: ESI_REGIONS[region][1] }
}

const serviceUrl = (service: string): string =>
  `${BASE}/${encodeURIComponent(service)}/FeatureServer`

interface LayerList {
  layers?: { id: number; name: string }[]
  error?: { message?: string }
}
interface LayerInfo {
  fields?: { name: string }[]
  error?: { message?: string }
}
interface Page {
  type?: string
  features?: {
    type: 'Feature'
    geometry: { type: string; coordinates: unknown }
    properties?: Record<string, unknown> | null
  }[]
  properties?: { exceededTransferLimit?: boolean }
  error?: { message?: string }
}

async function json<T>(ctx: FetchContext, url: string): Promise<T> {
  const res = await ctx.get(url)
  try {
    return JSON.parse(Buffer.from(res.data).toString('utf8')) as T
  } catch {
    throw new AppError('PROVIDER', 'The ESI service sent an answer this app could not read')
  }
}

const round5 = (c: unknown): unknown =>
  Array.isArray(c)
    ? typeof c[0] === 'number'
      ? [Math.round((c[0] as number) * 1e5) / 1e5, Math.round((c[1] as number) * 1e5) / 1e5]
      : c.map(round5)
    : c

/** The shore class code of a feature: the first of the known fields that has a value. */
export function esiCode(p: Record<string, unknown> | null | undefined): string {
  for (const k of ['ESI', 'MOSTSENSIT']) {
    const v = p?.[k]
    if (typeof v === 'string' && v.trim()) return v.trim()
  }
  return ''
}

export const noaaEsi: Connector = {
  id: 'noaa-esi',
  label: 'NOAA ESI shoreline classes',
  source: 'NOAA Office of Response and Restoration, Environmental Sensitivity Index',
  terms:
    'NOAA ESI data are a U.S. government work. Say where they came from and that they were cropped to your area; do not present changed data as the original.',
  hosts: [HOST],
  options: [
    {
      key: 'region',
      label: 'ESI region',
      type: 'choice',
      required: true,
      help: 'The NOAA Environmental Sensitivity Index atlas that covers the coastline.',
      choices: Object.entries(ESI_REGIONS).map(([value, [label]]) => ({ value, label })),
      example: 'upper_texas_coast',
    },
  ],
  area: {
    bbox: 'required',
    label: 'optional',
    help: 'Draw a box around the stretch of shoreline, at most 1 degree on a side and half a square degree in all.',
    example: { label: 'Galveston Bay', bbox: [-95.0, 29.3, -94.6, 29.6] },
  },

  estimate(q) {
    const { region, area } = plan(q)
    return {
      items: [
        {
          datasetId: `noaa-esi-${region.replaceAll('_', '-')}`,
          label: `ESI shoreline, ${ESI_REGIONS[region][0]}`,
          kind: 'features',
          bytes: Math.ceil(area * BYTES_PER_DEG2) + OVERHEAD_BYTES,
        },
      ],
      requests: 2 + Math.max(1, Math.ceil((area * 25_000) / PAGE)),
    }
  },

  async fetch(q, ctx): Promise<ConnectorResult> {
    const { region, bbox, service } = plan(q)
    const base = serviceUrl(service)
    const list = await json<LayerList>(ctx, `${base}?f=json`)
    const layer = list.layers?.find((l) => LAYER_NAME.test(l.name.trim()))
    if (!layer)
      throw new AppError(
        'NOT_FOUND',
        `The ${ESI_REGIONS[region][0]} service has no layer of ESI shoreline lines`,
      )
    const info = await json<LayerInfo>(ctx, `${base}/${layer.id}?f=json`)
    const names = new Set((info.fields ?? []).map((f) => f.name))
    const fields = KEEP_FIELDS.filter((f) => names.has(f))
    const features: unknown[] = []
    let more = true
    for (let page = 0; more && page < MAX_PAGES; page++) {
      const params = new URLSearchParams({
        where: '1=1',
        geometry: bbox.join(','),
        geometryType: 'esriGeometryEnvelope',
        inSR: '4326',
        spatialRel: 'esriSpatialRelIntersects',
        outFields: fields.length ? fields.join(',') : '*',
        outSR: '4326',
        returnGeometry: 'true',
        resultOffset: String(page * PAGE),
        resultRecordCount: String(PAGE),
        f: 'geojson',
      })
      const body = await json<Page>(ctx, `${base}/${layer.id}/query?${params.toString()}`)
      if (body.error)
        throw new AppError('PROVIDER', `ESI service: ${body.error.message ?? 'error'}`)
      for (const f of body.features ?? []) {
        const code = esiCode(f.properties)
        features.push({
          type: 'Feature',
          geometry: { type: f.geometry.type, coordinates: round5(f.geometry.coordinates) },
          properties: {
            name: code ? `ESI ${code}` : 'Shoreline',
            esi: code,
            shoretype: String(f.properties?.Landward_shoretype ?? '') || undefined,
          },
        })
      }
      more = body.properties?.exceededTransferLimit === true
    }
    if (!features.length)
      throw new AppError(
        'NOT_FOUND',
        'The ESI service has no shoreline in that area. Check the region and the area.',
      )
    const id = `noaa-esi-${region.replaceAll('_', '-')}`
    const file = `${id}.geojson`
    return {
      datasets: [
        {
          id,
          kind: 'features',
          label: `ESI shoreline, ${ESI_REGIONS[region][0]}`.slice(0, 120),
          file,
          area: { label: q.area.label, bbox },
        },
      ],
      files: [{ name: file, data: JSON.stringify({ type: 'FeatureCollection', features }) }],
      modified: `Cropped to the area you chose; only the shoreline class and shore type kept${more ? '; the service had more shoreline than this app fetches, so the edge of the area may be missing' : ''}.`,
      citation: `NOAA Office of Response and Restoration, Environmental Sensitivity Index, ${ESI_REGIONS[region][0]}, shoreline classification, via the NOAA GeoPlatform.`,
    }
  },
}
