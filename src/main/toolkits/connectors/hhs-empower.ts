// HHS emPOWER connector (spec 0464 FR-8): aggregate counts of Medicare beneficiaries who rely on
// electricity-dependent equipment, by county, from the public emPOWER REST service. The counts
// are de-identified aggregates; the person-level file is restricted to public health authorities
// and is never touched. One request returns a state's counties with their centroids, which the
// shelter map draws as an overlay. The host is fixed in code; no key is needed.
import { z } from 'zod'
import { AppError } from '../../lib/errors'
import { getJson, toBytes } from './json'
import type { Connector, ConnectorQuery } from './registry'

export const EMPOWER_COUNTY_LAYER =
  'https://services2.arcgis.com/ZQ4jTQn6k7VPXEwO/arcgis/rest/services/HHS_emPOWER_REST_Service_Public/FeatureServer/2'
const SOURCE = 'The HHS emPOWER REST service'
const FIELDS = 'NAME,State,County_FIPS_Code,Medicare_Benes,Power_Dependent_Devices_DME'
const STATE = /^[A-Z]{2}$/

const Response = z.looseObject({
  features: z.array(
    z.looseObject({
      attributes: z.looseObject({
        NAME: z.string(),
        State: z.string(),
        County_FIPS_Code: z.string().nullish(),
        Medicare_Benes: z.number().nullish(),
        Power_Dependent_Devices_DME: z.number().nullish(),
      }),
      centroid: z.looseObject({ x: z.number(), y: z.number() }).nullish(),
    }),
  ),
})

/** The two-letter state or territory code named in the options, checked against a fixed shape. */
export function stateOf(q: ConnectorQuery): string {
  const s = String(q.options.state ?? '').toUpperCase()
  if (!STATE.test(s))
    throw new AppError(
      'VALIDATION',
      'Name the state or territory by its two-letter code (for example OH)',
    )
  return s
}

export const hhsEmpower: Connector = {
  id: 'hhs-empower',
  label: 'HHS emPOWER electricity-dependent Medicare beneficiaries (counties)',
  source: 'HHS emPOWER Program REST service (ArcGIS, services2.arcgis.com)',
  terms:
    'U.S. government data, de-identified and aggregated by county. Counts are Medicare beneficiaries only and are updated monthly; the person-level file is restricted and is not used.',
  hosts: ['services2.arcgis.com'],
  options: [
    {
      key: 'state',
      label: 'State or territory',
      type: 'text',
      required: true,
      help: 'Two-letter state or territory code, such as OH or PR.',
      example: 'OH',
    },
  ],
  area: {
    label: 'optional',
    help: 'The place the counts stand for; the state code is used when left empty.',
    example: { label: 'Ohio' },
  },
  estimate(query) {
    stateOf(query)
    return {
      requests: 1,
      items: [
        {
          datasetId: 'empower-counties',
          label: 'Electricity-dependent Medicare beneficiaries by county',
          kind: 'features',
          bytes: 120_000,
        },
      ],
    }
  },
  async fetch(query, ctx) {
    const state = stateOf(query)
    const url =
      `${EMPOWER_COUNTY_LAYER}/query?where=${encodeURIComponent(`State='${state}'`)}` +
      `&outFields=${encodeURIComponent(FIELDS)}&returnCentroid=true&returnGeometry=false` +
      `&outSR=4326&orderByFields=NAME&resultRecordCount=2000&f=json`
    const res = await getJson(ctx, url, Response, SOURCE)
    const features = res.features.flatMap((f) =>
      f.centroid
        ? [
            {
              type: 'Feature' as const,
              geometry: { type: 'Point' as const, coordinates: [f.centroid.x, f.centroid.y] },
              properties: {
                kind: 'electricity_dependent',
                name: f.attributes.NAME,
                state: f.attributes.State,
                countyFips: f.attributes.County_FIPS_Code ?? '',
                medicareBeneficiaries: f.attributes.Medicare_Benes ?? 0,
                electricityDependent: f.attributes.Power_Dependent_Devices_DME ?? 0,
              },
            },
          ]
        : [],
    )
    return {
      datasets: [
        {
          id: 'empower-counties',
          kind: 'features',
          label: `Electricity-dependent Medicare beneficiaries by county, ${state} (HHS emPOWER aggregate counts)`,
          file: 'empower-counties.geojson',
          area: { label: query.area.label || state },
        },
      ],
      files: [
        {
          name: 'empower-counties.geojson',
          data: toBytes({ type: 'FeatureCollection', features }),
        },
      ],
      modified: `Counties of ${state} only; attributes limited to ${FIELDS}; county centroids replace the boundaries. De-identified aggregate counts.`,
      citation:
        'U.S. Department of Health and Human Services, emPOWER Program, REST service (public)',
    }
  },
}
