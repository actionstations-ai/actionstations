// Sample data for the weather figure kinds, used by their tests and the weather figure
// template's preview. Real data where the fixtures hold it (the sounding and the hourly
// observations are NWS data served by the Iowa Environmental Mesonet); fields that need a model
// or a satellite are analytic and marked simulated.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  packGrid,
  type MesoanalysisData,
  type ModelPanelData,
  type SatelliteData,
} from '../../render/figures/weather/grid'
import type { MeteogramData } from '../../render/figures/weather/meteogram'
import type { PlumeData } from '../../render/figures/weather/plume'

const fixture = (name: string): string =>
  readFileSync(join(__dirname, '../../../../tests/fixtures/weather', name), 'utf8')

/** Hourly observations, KILN area, 7 May 2024 12Z to 8 May 00Z (ILN, Wilmington OH). */
export function sampleMeteogram(): MeteogramData {
  const rows = fixture('ILN_20240507_asos.csv')
    .trim()
    .split('\n')
    .slice(1)
    .map((l) => l.split(','))
  const num = (s: string | undefined): number | null =>
    s === undefined || s === 'M' ? null : s === 'T' ? 0 : Number(s)
  return {
    origin: 'historical',
    station: { id: 'ILN', name: 'Wilmington OH' },
    times: rows.map((r) => `${r[1]!.replace(' ', 'T')}:00+00:00`),
    tempF: rows.map((r) => num(r[2])),
    dewpointF: rows.map((r) => num(r[3])),
    windDirDeg: rows.map((r) => num(r[4])),
    windKt: rows.map((r) => num(r[5])),
    precipIn: rows.map((r) => num(r[6])),
    pressureMb: rows.map((r) => {
      const v = num(r[7])
      return v === null ? null : Math.round(v * 33.8639 * 10) / 10
    }),
    gustKt: rows.map((r) => num(r[8])),
  }
}

const GRID = { west: -87, south: 37, east: -80, north: 42, nx: 70, ny: 50 }

/** A smooth field on the sample grid: a sum of gaussian blobs, row-major from the north. */
function blobs(
  base: number,
  spots: { lat: number; lon: number; amp: number; r: number }[],
): number[] {
  const out: number[] = []
  for (let r = 0; r < GRID.ny; r++)
    for (let c = 0; c < GRID.nx; c++) {
      const lat = GRID.north - ((r + 0.5) / GRID.ny) * (GRID.north - GRID.south)
      const lon = GRID.west + ((c + 0.5) / GRID.nx) * (GRID.east - GRID.west)
      let v = base
      for (const s of spots)
        v += s.amp * Math.exp(-((lat - s.lat) ** 2 + ((lon - s.lon) * 0.78) ** 2) / (2 * s.r * s.r))
      out.push(Math.round(v * 10) / 10)
    }
  return out
}

const OVERLAYS = {
  lines: [] as [number, number][][],
  places: [
    { name: 'Cincinnati', lat: 39.1, lon: -84.51 },
    { name: 'Columbus', lat: 39.96, lon: -83.0 },
    { name: 'Cleveland', lat: 41.5, lon: -81.69 },
  ],
  polygons: [
    {
      label: 'Exercise watch',
      kind: 'watch' as const,
      points: [
        [40.6, -84.9],
        [40.6, -82.2],
        [38.6, -82.2],
        [38.6, -84.9],
      ] as [number, number][],
    },
  ],
}
const overlays = () => ({ lines: [], places: OVERLAYS.places, polygons: OVERLAYS.polygons })

export function sampleSatellite(channel: SatelliteData['channel']): SatelliteData {
  const cloud = [
    { lat: 39.8, lon: -83.2, amp: 1, r: 0.9 },
    { lat: 40.9, lon: -85.2, amp: 0.7, r: 0.7 },
    { lat: 38.4, lon: -81.6, amp: 0.8, r: 0.6 },
  ]
  const shield = blobs(0, cloud)
  const values = shield.map((s) =>
    channel === 'visible'
      ? Math.min(100, 12 + s * 85)
      : channel === 'infrared'
        ? 22 - s * 85
        : -42 - s * 30 + (s < 0.05 ? 18 : 0),
  )
  return {
    origin: 'simulated',
    time: '2024-05-07T20:00:00+00:00',
    satellite: {
      name: 'GOES-East',
      band: channel === 'visible' ? 'Band 2' : channel === 'infrared' ? 'Band 13' : 'Band 9',
    },
    channel,
    field: packGrid(GRID, values),
    overlays: overlays(),
  }
}

export function sampleModelPanel(): ModelPanelData {
  return {
    origin: 'simulated',
    time: '2024-05-07T21:00:00+00:00',
    model: { name: 'Exercise model', run: '2024-05-07T18:00:00+00:00', forecastHour: 3 },
    parameter: { label: '2 m temperature', unit: 'C', palette: 'temperature' },
    contours: { interval: 2 },
    field: packGrid(
      GRID,
      blobs(14, [
        { lat: 38.2, lon: -85.0, amp: 11, r: 1.8 },
        { lat: 41.5, lon: -81.2, amp: -6, r: 1.6 },
      ]),
    ),
    overlays: overlays(),
  }
}

export function sampleMesoanalysis(): MesoanalysisData {
  return {
    origin: 'simulated',
    time: '2024-05-07T20:00:00+00:00',
    source: 'Exercise objective analysis',
    parameter: { label: 'Surface-based CAPE', unit: 'J/kg', palette: 'cape', threshold: 1000 },
    contours: { interval: 500, from: 500 },
    field: packGrid(
      GRID,
      blobs(150, [
        { lat: 39.0, lon: -84.2, amp: 2600, r: 1.2 },
        { lat: 40.8, lon: -82.6, amp: 1100, r: 0.9 },
      ]),
    ),
    overlays: overlays(),
  }
}

export function samplePlume(): PlumeData {
  const times = Array.from({ length: 13 }, (_, i) =>
    new Date(Date.UTC(2024, 4, 7, 12 + i)).toISOString().replace('.000Z', '+00:00'),
  )
  const members = Array.from({ length: 24 }, (_, m) => {
    const scale = 0.6 + (((m * 37) % 24) / 24) * 1.1
    const shift = ((m * 11) % 5) - 2
    return times.map(
      (_, i) =>
        Math.round(Math.max(0, (scale * 2.4) / (1 + Math.exp(-(i - 6 - shift) / 1.6))) * 100) / 100,
    )
  })
  return {
    origin: 'simulated',
    quantity: 'Storm total rainfall at Cedar Ridge',
    unit: 'in',
    system: 'Exercise ensemble',
    issued: '2024-05-07T12:00:00+00:00',
    times,
    members,
    thresholds: [{ value: 2, label: 'Flash flood guidance' }],
  }
}
