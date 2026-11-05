// NWS forecast inundation extent connector (spec 0454 FR-10): the experimental five-day maximum
// inundation extent from the River Forecast Center forecast routed through the National Water
// Model, for a small area, where the service has coverage and the forecast reaches action
// status. Always labeled as a modeled extent and never mixed with regulatory flood zones.
import { roundedBbox, toBytes } from './json'
import { queryLayer } from './arcgis-features'
import type { Connector } from './registry'

export const NWS_FIM_LAYER =
  'https://maps.water.noaa.gov/server/rest/services/rfc/rfc_based_5day_max_inundation_extent/MapServer/0'
const MAX_SPAN_DEG = 0.5
const SOURCE = 'The NWS forecast inundation service'

export const nwsFimConnector: Connector = {
  id: 'nws-fim',
  label: 'NWS forecast inundation extent (experimental)',
  source: 'NOAA National Water Prediction Service, forecast inundation mapping',
  terms:
    'US Government work. Experimental model output: an approximation of extent for the current forecast, not a flood zone or an official determination.',
  hosts: ['maps.water.noaa.gov'],
  estimate(query) {
    roundedBbox(query.area.bbox, MAX_SPAN_DEG, SOURCE)
    return {
      requests: 1,
      items: [
        {
          datasetId: 'nwsfim-extent',
          label: 'Modeled forecast extent',
          kind: 'features',
          bytes: 2_000_000,
        },
      ],
    }
  },
  async fetch(query, ctx) {
    const bbox = roundedBbox(query.area.bbox, MAX_SPAN_DEG, SOURCE)
    const fc = await queryLayer(
      {
        layerUrl: NWS_FIM_LAYER,
        bbox,
        outFields: 'feature_id,streamflow_cfs,reference_time',
        pageSize: 1000,
        maxPages: 6,
        source: SOURCE,
      },
      ctx,
    )
    const data = {
      ...fc,
      features: fc.features.map((f) => ({
        ...f,
        properties: { ...f.properties, kind: 'modeled_forecast_extent' },
      })),
    }
    return {
      datasets: [
        {
          id: 'nwsfim-extent',
          kind: 'features',
          label: `Modeled forecast inundation extent (experimental, NWS), ${query.area.label || 'the area'}`,
          file: 'nwsfim-extent.geojson',
          area: { label: query.area.label, bbox },
        },
      ],
      files: [{ name: 'nwsfim-extent.geojson', data: toBytes(data) }],
      modified: fc.features.length
        ? 'Cropped to the area. The current forecast at retrieval, not an archive.'
        : 'No extent was returned: the area may be outside coverage or no forecast reaches action status now.',
      citation:
        'NOAA National Water Prediction Service, forecast inundation mapping (experimental)',
    }
  },
}
