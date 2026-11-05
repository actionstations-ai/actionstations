// FEMA National Flood Hazard Layer connector (spec 0454 FR-10): the effective regulatory flood
// zones for a small area, kept as a labeled regulatory dataset and never merged with a modeled
// forecast extent. Zones are not an insurance or regulatory determination in this app (NFR-5).
import { toBytes, roundedBbox } from './json'
import { queryLayer } from './arcgis-features'
import type { Connector } from './registry'

export const NFHL_ZONES_LAYER =
  'https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/28'
const MAX_SPAN_DEG = 0.5
const FIELDS = 'FLD_ZONE,ZONE_SUBTY,SFHA_TF,STATIC_BFE,DEPTH'
const SOURCE = 'The FEMA National Flood Hazard Layer'

const estimateBytes = (span: number): number =>
  span <= 0.05 ? 300_000 : span <= 0.2 ? 1_500_000 : 4_000_000

export const femaNfhlConnector: Connector = {
  id: 'fema-nfhl',
  label: 'FEMA flood zones (National Flood Hazard Layer)',
  source: 'FEMA National Flood Hazard Layer',
  terms:
    'US Government work. Effective regulatory zones for planning an exercise only; not a flood determination or an insurance rating.',
  hosts: ['hazards.fema.gov'],
  estimate(query) {
    const b = roundedBbox(query.area.bbox, MAX_SPAN_DEG, SOURCE)
    const span = Math.max(b[2] - b[0], b[3] - b[1])
    return {
      requests: 1,
      items: [
        {
          datasetId: 'nfhl-flood-zones',
          label: 'Regulatory flood zones',
          kind: 'features',
          bytes: estimateBytes(span),
        },
      ],
    }
  },
  async fetch(query, ctx) {
    const bbox = roundedBbox(query.area.bbox, MAX_SPAN_DEG, SOURCE)
    const fc = await queryLayer(
      {
        layerUrl: NFHL_ZONES_LAYER,
        bbox,
        outFields: FIELDS,
        pageSize: 1000,
        maxPages: 8,
        source: SOURCE,
      },
      ctx,
    )
    const data = {
      ...fc,
      features: fc.features.map((f) => ({
        ...f,
        properties: { ...f.properties, kind: 'regulatory_flood_zone' },
      })),
    }
    return {
      datasets: [
        {
          id: 'nfhl-flood-zones',
          kind: 'features',
          label: `Regulatory flood zones (FEMA effective NFHL), ${query.area.label || 'the area'}`,
          file: 'nfhl-flood-zones.geojson',
          area: { label: query.area.label, bbox },
        },
      ],
      files: [{ name: 'nfhl-flood-zones.geojson', data: toBytes(data) }],
      modified: `Cropped to the area; attributes limited to ${FIELDS.split(',').join(', ')}. Regulatory zones, not a modeled forecast.`,
      citation: 'FEMA, National Flood Hazard Layer (effective), hazards.fema.gov',
    }
  },
}
