// NOAA Hazard Mapping System smoke polygons (spec 0461 FR-8): analyst-drawn light, medium and
// heavy smoke from satellite imagery, one KML file per day. Start and end times are the imagery
// window, not an exact plume. Polygons that do not touch the chosen box are dropped, so a
// national file becomes a small one. No key is needed.
import { AppError } from '../../lib/errors'
import { roundedBbox, toBytes } from './json'
import type { Connector } from './registry'
import {
  bboxOfRing,
  boxesIntersect,
  dayStamp,
  getText,
  isoFromMs,
  type LonLat,
} from './wildfire-common'

const BASE = 'https://satepsanone.nesdis.noaa.gov/pub/FIRE/web/HMS/Smoke_Polygons/KML'
const SOURCE = 'NOAA Hazard Mapping System smoke'
const MAX_SPAN_DEG = 20
const MAX_DAYS = 14
const DAY_MS = 86_400_000

/** "2024131 1230UTC" (year, day of year, hour and minute) to epoch ms. */
export function hmsTime(text: string): number | null {
  const m = /^(\d{4})(\d{3}) (\d{2})(\d{2})UTC$/.exec(text.trim())
  if (!m) return null
  return Date.UTC(Number(m[1]), 0, Number(m[2]), Number(m[3]), Number(m[4]))
}

export interface SmokePolygon {
  start: number
  end: number
  density: 'light' | 'medium' | 'heavy'
  satellite: string
  ring: LonLat[]
}

/** The polygons of an HMS KML file; Placemarks that do not parse are left out. */
export function parseHmsKml(kml: string): SmokePolygon[] {
  const out: SmokePolygon[] = []
  for (const pm of kml.match(/<Placemark>[\s\S]*?<\/Placemark>/g) ?? []) {
    const start = hmsTime(/Start Time: ([^<]*)</.exec(pm)?.[1] ?? '')
    const end = hmsTime(/End Time: ([^<]*)</.exec(pm)?.[1] ?? '')
    const density = /Density: (\w+)/.exec(pm)?.[1]?.toLowerCase()
    const coords = /<outerBoundaryIs>[\s\S]*?<coordinates>([\s\S]*?)<\/coordinates>/.exec(pm)?.[1]
    if (start === null || end === null || !coords) continue
    if (density !== 'light' && density !== 'medium' && density !== 'heavy') continue
    const ring = coords
      .trim()
      .split(/\s+/)
      .map((t): LonLat => {
        const [lon, lat] = t.split(',').map(Number)
        return [lon!, lat!]
      })
      .filter((p) => Number.isFinite(p[0]) && Number.isFinite(p[1]))
    if (ring.length < 4) continue
    const closed =
      ring[0]![0] === ring[ring.length - 1]![0] && ring[0]![1] === ring[ring.length - 1]![1]
    out.push({
      start,
      end,
      density,
      satellite: /Satellite: ([^<]*)</.exec(pm)?.[1]?.trim() ?? '',
      ring: closed ? ring.slice(0, -1) : ring,
    })
  }
  return out
}

function days(range: { start: string; end: string }): number[] {
  const first = Math.floor(Date.parse(range.start) / DAY_MS) * DAY_MS
  const last = Math.floor(Date.parse(range.end) / DAY_MS) * DAY_MS
  const out: number[] = []
  for (let t = first; t <= last && out.length < MAX_DAYS; t += DAY_MS) out.push(t)
  return out
}

const urlFor = (day: number): string => {
  const s = dayStamp(day)
  return `${BASE}/${s.slice(0, 4)}/${s.slice(4, 6)}/hms_smoke${s}.kml`
}

export const hmsSmokeConnector: Connector = {
  id: 'hms-smoke',
  label: 'Smoke plumes (NOAA Hazard Mapping System)',
  source: 'NOAA Hazard Mapping System, smoke polygons',
  terms:
    'NOAA data are free to use; cite NOAA NESDIS. Polygons are analyst-drawn from satellite imagery; times are the imagery window.',
  hosts: ['satepsanone.nesdis.noaa.gov'],
  area: {
    bbox: 'required',
    label: 'optional',
    help: 'Draw a box around the region the smoke covers, at most 20 degrees on a side. The name is used in the dataset title.',
    example: { label: 'Example area', bbox: [-125, 32, -114, 42] },
  },
  estimate(query) {
    roundedBbox(query.area.bbox, MAX_SPAN_DEG, SOURCE)
    const n = days(query.range).length
    return {
      requests: n,
      items: [
        {
          datasetId: 'hms-smoke',
          label: 'Smoke polygons cropped to the area',
          kind: 'features',
          bytes: n * 80_000,
        },
      ],
    }
  },
  async fetch(query, ctx) {
    const box = roundedBbox(query.area.bbox, MAX_SPAN_DEG, SOURCE)
    const features: unknown[] = []
    const missing: string[] = []
    for (const day of days(query.range)) {
      let kml: string
      try {
        kml = await getText(ctx, urlFor(day))
      } catch (err) {
        if (err instanceof AppError && /HTTP 404/.test(err.message)) {
          missing.push(dayStamp(day))
          continue
        }
        throw err
      }
      for (const p of parseHmsKml(kml)) {
        if (!boxesIntersect(bboxOfRing(p.ring), box)) continue
        if (p.end < Date.parse(query.range.start) || p.start > Date.parse(query.range.end)) continue
        features.push({
          type: 'Feature',
          geometry: { type: 'Polygon', coordinates: [[...p.ring, p.ring[0]!]] },
          properties: {
            id: `smoke-${features.length}`,
            time: isoFromMs(p.start),
            end: isoFromMs(p.end),
            density: p.density,
            satellite: p.satellite,
          },
        })
      }
    }
    return {
      datasets: [
        {
          id: 'hms-smoke',
          kind: 'features',
          label: `Smoke polygons (NOAA HMS), ${query.area.label || 'the area'}`,
          file: 'hms-smoke.geojson',
          area: { label: query.area.label, bbox: box },
        },
      ],
      files: [
        { name: 'hms-smoke.geojson', data: toBytes({ type: 'FeatureCollection', features }) },
      ],
      modified:
        `Polygons that touch the box and the period kept; times are the imagery window.` +
        (missing.length ? ` No file for ${missing.join(', ')}.` : ''),
      citation: 'NOAA NESDIS Hazard Mapping System smoke analysis, ospo.noaa.gov',
    }
  },
}
