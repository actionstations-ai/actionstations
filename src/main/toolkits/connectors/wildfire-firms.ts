// NASA FIRMS satellite hotspots (spec 0461 FR-8): VIIRS detections for a small box and a few
// days. The free map key is the one hazard data already uses (stored in the OS keychain under
// "firms"); it is part of the request path, so it is checked against a strict pattern, kept out
// of every message and never logged. Recent days use the near real time product, older days the
// standard product. Detections are points at overpass times, labeled as satellite detections.
import { AppError } from '../../lib/errors'
import { getSecret } from '../../secrets'
import { csvRecords } from '../../hazards/sources/csv'
import { isValidMapKey } from '../../hazards/sources/firms'
import { toBytes, roundedBbox } from './json'
import type { Connector } from './registry'
import { getText } from './wildfire-common'

const BASE = 'https://firms.modaps.eosdis.nasa.gov/api/area/csv'
const SOURCE = 'NASA FIRMS'
const MAX_SPAN_DEG = 1
const MAX_DAYS = 5
const RECENT_MS = 7 * 86_400_000
/** The keychain entry hazard data uses for the FIRMS map key (ipc/handlers/hazards.ts). */
export const FIRMS_KEY_ID = 'firms'

export interface FirmsDeps {
  getKey: () => Promise<string | undefined>
  now: () => number
}

const isoDay = (ms: number): string => new Date(ms).toISOString().slice(0, 10)

export function createFirmsConnector(
  deps: FirmsDeps = { getKey: () => getSecret(FIRMS_KEY_ID), now: () => Date.now() },
): Connector {
  return {
    id: 'firms-hotspots',
    label: 'Satellite hotspots (NASA FIRMS, VIIRS)',
    source: 'NASA FIRMS (Fire Information for Resource Management System)',
    terms:
      'NASA data are free to use; cite NASA FIRMS. Needs the free FIRMS map key you saved in Settings. Detections are satellite overpasses, not a continuous record.',
    hosts: ['firms.modaps.eosdis.nasa.gov'],
    estimate(query) {
      roundedBbox(query.area.bbox, MAX_SPAN_DEG, SOURCE)
      return {
        requests: 1,
        items: [
          {
            datasetId: 'firms-hotspots',
            label: 'Satellite hotspots',
            kind: 'features',
            bytes: 200_000,
          },
        ],
      }
    },
    async fetch(query, ctx) {
      const key = await deps.getKey()
      if (!key)
        throw new AppError(
          'FORBIDDEN',
          'FIRMS needs a free map key. Save one in Settings under hazard data, then try again.',
        )
      if (!isValidMapKey(key))
        throw new AppError('VALIDATION', 'The saved FIRMS map key is not valid.')
      const bbox = roundedBbox(query.area.bbox, MAX_SPAN_DEG, SOURCE)
      const start = Date.parse(query.range.start)
      const end = Date.parse(query.range.end)
      const days = Math.min(MAX_DAYS, Math.max(1, Math.ceil((end - start) / 86_400_000)))
      const product = deps.now() - end <= RECENT_MS ? 'VIIRS_SNPP_NRT' : 'VIIRS_SNPP_SP'
      const url = `${BASE}/${key}/${product}/${bbox.join(',')}/${days}/${isoDay(start)}`
      const text = (await getText(ctx, url, key)).trim()
      if (text !== '' && !/^latitude,/i.test(text))
        throw new AppError(
          'PROVIDER',
          `${SOURCE} did not return detection data; check the map key.`,
        )
      const features = csvRecords(text).flatMap((r) => {
        const lat = Number(r.latitude)
        const lon = Number(r.longitude)
        const hhmm = (r.acq_time ?? '').padStart(4, '0')
        const time = `${r.acq_date}T${hhmm.slice(0, 2)}:${hhmm.slice(2)}:00Z`
        if (!Number.isFinite(lat) || !Number.isFinite(lon) || Number.isNaN(Date.parse(time)))
          return []
        if (Date.parse(time) < start || Date.parse(time) > end) return []
        const frp = Number(r.frp)
        return [
          {
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [lon, lat] },
            properties: {
              id: `hot-${r.acq_date}-${hhmm}-${lat}-${lon}`,
              time,
              confidence: r.confidence ?? '',
              satellite: r.satellite ?? '',
              daynight: r.daynight ?? '',
              ...(Number.isFinite(frp) && r.frp !== '' ? { frp } : {}),
            },
          },
        ]
      })
      return {
        datasets: [
          {
            id: 'firms-hotspots',
            kind: 'features',
            label: `Satellite hotspots (NASA FIRMS ${product}), ${query.area.label || 'the area'}`,
            file: 'firms-hotspots.geojson',
            area: { label: query.area.label, bbox },
          },
        ],
        files: [
          {
            name: 'firms-hotspots.geojson',
            data: toBytes({ type: 'FeatureCollection', features }),
          },
        ],
        modified: `Cropped to the box and period; columns limited to time, confidence, satellite, day or night and fire radiative power. Product ${product}.`,
        citation: 'NASA FIRMS, firms.modaps.eosdis.nasa.gov (VIIRS 375 m active fire detections)',
      }
    },
  }
}

export const firmsHotspotsConnector = createFirmsConnector()
