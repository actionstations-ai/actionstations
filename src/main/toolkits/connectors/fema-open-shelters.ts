// FEMA open shelters connector (spec 0464 FR-8): a snapshot of the shelters that are open now in
// the FEMA ESF #6 shelter service (synced daily with the Red Cross database). The service keeps
// no history, so this is a capture of the present: the dataset is labeled with what it is and the
// framework records the retrieval date, and a past event can only be replayed from a capture the
// user made at the time. Street addresses are left out; a shelter is placed by its coordinates,
// city, state and ZIP. The host is fixed in code; no key is needed.
import { queryLayer } from './arcgis-features'
import { roundedBbox, toBytes } from './json'
import type { Connector } from './registry'

export const OPEN_SHELTERS_LAYER =
  'https://gis.fema.gov/arcgis/rest/services/NSS/OpenShelters/FeatureServer/0'
const MAX_SPAN_DEG = 10
const FIELDS = [
  'shelter_id',
  'shelter_name',
  'city',
  'state',
  'zip',
  'shelter_status',
  'evacuation_capacity',
  'post_impact_capacity',
  'total_population',
  'subfacility_code',
  'ada_compliant',
  'pet_accommodations_code',
  'wheelchair_accessible',
  'org_name',
]
const SOURCE = 'The FEMA open shelters service'
/** The service answers at most 2,000 records per query; two pages of 1,000 cover that. */
const PAGE = 1000
const PAGES = 2

const estimateBytes = (span: number): number =>
  span <= 1 ? 120_000 : span <= 4 ? 400_000 : 900_000

export const femaOpenShelters: Connector = {
  id: 'fema-open-shelters',
  label: 'FEMA open shelters (snapshot of now)',
  source: 'FEMA ESF #6 open shelters service (gis.fema.gov, NSS/OpenShelters)',
  terms:
    'U.S. government work, public domain. The service offers no history: the data is the shelters open when it is fetched, not a past event. Street addresses are not kept.',
  hosts: ['gis.fema.gov'],
  area: {
    bbox: 'required',
    label: 'optional',
    help: 'Draw a box around the affected region, at most 10 degrees on a side. The name is used in the dataset title.',
    example: { label: 'Example area', bbox: [-91, 29, -88, 31] },
  },
  estimate(query) {
    const b = roundedBbox(query.area.bbox, MAX_SPAN_DEG, SOURCE)
    return {
      requests: PAGES,
      items: [
        {
          datasetId: 'open-shelters',
          label: 'Open shelters (snapshot)',
          kind: 'features',
          bytes: estimateBytes(Math.max(b[2] - b[0], b[3] - b[1])),
        },
      ],
    }
  },
  async fetch(query, ctx) {
    const bbox = roundedBbox(query.area.bbox, MAX_SPAN_DEG, SOURCE)
    const fc = await queryLayer(
      {
        layerUrl: OPEN_SHELTERS_LAYER,
        bbox,
        outFields: FIELDS.join(','),
        pageSize: PAGE,
        maxPages: PAGES,
        source: SOURCE,
      },
      ctx,
    )
    const data = {
      ...fc,
      features: fc.features.map((f) => ({
        ...f,
        properties: { ...f.properties, kind: 'open_shelter' },
      })),
    }
    return {
      datasets: [
        {
          id: 'open-shelters',
          kind: 'features',
          label: `Open shelters, ${query.area.label || 'the area'} (a snapshot of the shelters open at retrieval; the service keeps no history)`,
          file: 'open-shelters.geojson',
          area: { label: query.area.label, bbox },
        },
      ],
      files: [{ name: 'open-shelters.geojson', data: toBytes(data) }],
      modified: `Cropped to the area; attributes limited to ${FIELDS.join(', ')}; street addresses left out. A snapshot of now, not a record of a past event.`,
      citation: 'FEMA, ESF #6 open shelters (National Shelter System), gis.fema.gov',
    }
  },
}
