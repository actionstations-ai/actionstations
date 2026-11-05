// CDC/ATSDR Social Vulnerability Index connector (spec 0464 FR-8): the 2022 index by census tract
// for the scenario's area, from the public CDC OneMap feature service. Each tract comes back as
// its centroid with the overall and four theme percentile ranks and a few counts that shelter and
// outreach planning reads (people 65 and over, with a disability, with limited English, without a
// vehicle). Boundaries are not asked for. The host is fixed in code; no key is needed.
import { z } from 'zod'
import { getJson, roundedBbox, toBytes } from './json'
import type { Connector } from './registry'

export const SVI_TRACT_LAYER =
  'https://onemap.cdc.gov/OneMapServices/rest/services/SVI/CDC_ATSDR_Social_Vulnerability_Index_2022_USA/FeatureServer/2'
const SOURCE = 'The CDC/ATSDR Social Vulnerability Index service'
const MAX_SPAN_DEG = 2
/** The service answers at most 2,000 records per query; five pages cover a large metro area. */
const PAGE = 2000
const PAGES = 5
export const SVI_FIELDS = [
  'FIPS',
  'LOCATION',
  'E_TOTPOP',
  'E_AGE65',
  'E_DISABL',
  'E_LIMENG',
  'E_NOVEH',
  'RPL_THEMES',
  'RPL_THEME1',
  'RPL_THEME2',
  'RPL_THEME3',
  'RPL_THEME4',
] as const

const num = z.number().nullish()
const Response = z.looseObject({
  features: z.array(
    z.looseObject({
      attributes: z.looseObject({
        FIPS: z.string(),
        LOCATION: z.string().nullish(),
        E_TOTPOP: num,
        E_AGE65: num,
        E_DISABL: num,
        E_LIMENG: num,
        E_NOVEH: num,
        RPL_THEMES: num,
        RPL_THEME1: num,
        RPL_THEME2: num,
        RPL_THEME3: num,
        RPL_THEME4: num,
      }),
      centroid: z.looseObject({ x: z.number(), y: z.number() }).nullish(),
    }),
  ),
  exceededTransferLimit: z.boolean().optional(),
})
type Attributes = z.infer<typeof Response>['features'][number]['attributes']

/** The service writes -999 where a rank or count could not be computed; keep that as null. */
const rank = (v: number | null | undefined): number | null =>
  typeof v === 'number' && v >= 0 ? v : null
const count = (v: number | null | undefined): number | null =>
  typeof v === 'number' && v >= 0 ? v : null

function properties(a: Attributes) {
  return {
    kind: 'social_vulnerability',
    tractFips: a.FIPS,
    name: a.LOCATION ?? a.FIPS,
    population: count(a.E_TOTPOP),
    age65Plus: count(a.E_AGE65),
    disability: count(a.E_DISABL),
    limitedEnglish: count(a.E_LIMENG),
    noVehicle: count(a.E_NOVEH),
    sviOverall: rank(a.RPL_THEMES),
    sviSocioeconomic: rank(a.RPL_THEME1),
    sviHousehold: rank(a.RPL_THEME2),
    sviMinority: rank(a.RPL_THEME3),
    sviHousingTransport: rank(a.RPL_THEME4),
  }
}

const estimateBytes = (span: number): number =>
  span <= 0.25 ? 60_000 : span <= 1 ? 400_000 : 1_500_000

export const cdcSvi: Connector = {
  id: 'cdc-svi',
  label: 'CDC/ATSDR Social Vulnerability Index 2022 (census tracts)',
  source: 'CDC/ATSDR Social Vulnerability Index 2022, CDC OneMap feature service (onemap.cdc.gov)',
  terms:
    'Published by CDC/ATSDR for public use; cite the CDC/ATSDR SVI 2022 database. Estimates come from the 2018-2022 American Community Survey and carry its margins of error.',
  hosts: ['onemap.cdc.gov'],
  estimate(query) {
    const b = roundedBbox(query.area.bbox, MAX_SPAN_DEG, SOURCE)
    return {
      requests: PAGES,
      items: [
        {
          datasetId: 'svi-tracts',
          label: 'Social Vulnerability Index by census tract',
          kind: 'features',
          bytes: estimateBytes(Math.max(b[2] - b[0], b[3] - b[1])),
        },
      ],
    }
  },
  async fetch(query, ctx) {
    const bbox = roundedBbox(query.area.bbox, MAX_SPAN_DEG, SOURCE)
    const features = []
    for (let page = 0; page < PAGES; page++) {
      const url =
        `${SVI_TRACT_LAYER}/query?where=1%3D1&geometry=${bbox.join(',')}` +
        `&geometryType=esriGeometryEnvelope&inSR=4326&spatialRel=esriSpatialRelIntersects` +
        `&outFields=${SVI_FIELDS.join(',')}&returnGeometry=false&returnCentroid=true&outSR=4326` +
        `&orderByFields=FIPS&resultOffset=${page * PAGE}&resultRecordCount=${PAGE}&f=json`
      const res = await getJson(ctx, url, Response, SOURCE)
      for (const f of res.features)
        if (f.centroid)
          features.push({
            type: 'Feature' as const,
            geometry: { type: 'Point' as const, coordinates: [f.centroid.x, f.centroid.y] },
            properties: properties(f.attributes),
          })
      if (res.features.length < PAGE && !res.exceededTransferLimit) break
    }
    return {
      datasets: [
        {
          id: 'svi-tracts',
          kind: 'features',
          label: `Social Vulnerability Index 2022 by census tract, ${query.area.label || 'the area'} (CDC/ATSDR percentile ranks, 0 to 1)`,
          file: 'svi-tracts.geojson',
          area: { label: query.area.label, bbox },
        },
      ],
      files: [
        { name: 'svi-tracts.geojson', data: toBytes({ type: 'FeatureCollection', features }) },
      ],
      modified: `Tracts that touch the area; attributes limited to ${SVI_FIELDS.join(', ')}; tract centroids replace the boundaries; -999 (not computed) kept as empty.`,
      citation:
        'Centers for Disease Control and Prevention / Agency for Toxic Substances and Disease Registry / Geospatial Research, Analysis, and Services Program. CDC/ATSDR Social Vulnerability Index 2022 Database US.',
    }
  },
}
