// Sample data for the wildfire figure kinds, used by their tests and the figure template's
// previews. Everything comes from the fictional sample fire and shutoff event (samples.ts) run
// through the simulators, so the figures show what a scenario's case data would draw.
import type { GroundTruthEvent } from '@shared/schemas/metrics'
import { FireEventParams, generateFire } from './simulate/events'
import { ShutoffEventParams, generateShutoff } from './simulate/shutoff'
import { SAMPLE_FIRE, SAMPLE_SHUTOFF } from './samples'
import {
  aqiSeriesFigureData,
  circuitBoardFigureData,
  evacuationBoardFigureData,
  fireMapFigureData,
  smokeMapFigureData,
  type Collection,
} from './figure-data'

const fire = FireEventParams.parse(SAMPLE_FIRE)
const shutoff = ShutoffEventParams.parse(SAMPLE_SHUTOFF)
const TZ = 'America/Los_Angeles'
const MIN = 60_000
const iso = (ms: number): string => new Date(ms).toISOString().replace('.000Z', 'Z')

function parts() {
  const data = generateFire(fire)
  const get = <T>(id: string): T => data.find((d) => d.id === id)!.data as T
  return {
    perimeters: get<Collection>('sim-fire-perimeters'),
    hotspots: get<Collection>('sim-fire-hotspots'),
    smoke: get<Collection>('sim-fire-smoke'),
    arrivals: get<GroundTruthEvent[]>('sim-fire-arrivals').filter((e) => e.kind === 'fire_arrival'),
    aqi: get<{ t: string; v: Record<string, number> }[]>('sim-fire-aqi'),
  }
}

/** The status each zone has at `at`: orders for zones whose latest time is within `leadMin`. */
function statuses(at: number, orderLeadMin: number) {
  const { arrivals } = parts()
  const out: Record<
    string,
    { status: 'Evacuation order' | 'Evacuation warning'; orderedAt: string }
  > = {}
  for (const a of arrivals) {
    const latest = Date.parse(String(a.attrs.latestOrderTime))
    const ordered = latest - orderLeadMin * MIN
    if (ordered <= at)
      out[a.area!] = {
        status: Date.parse(a.time) - at < 3 * 3_600_000 ? 'Evacuation order' : 'Evacuation warning',
        orderedAt: iso(ordered),
      }
  }
  return out
}

const at = (hours: number): number => Date.parse(fire.start) + hours * 3_600_000

export function sampleFireMap() {
  const p = parts()
  const when = at(4)
  const st = statuses(when, 20)
  return fireMapFigureData({
    title: 'Cinder Creek Fire: perimeter and evacuation zones at hour 4',
    basis: 'simulated',
    timeZone: TZ,
    at: iso(when),
    perimeters: p.perimeters,
    hotspots: {
      features: p.hotspots.features.filter((f) => Date.parse(String(f.properties.time)) >= at(3)),
    },
    zones: fire.zones.filter((z) => z.id !== 'N-1'),
    statuses: Object.fromEntries(
      Object.entries(st).map(([z, s]) => [z, { status: s.status, since: s.orderedAt }]),
    ),
    arrivals: p.arrivals,
    shelters: [{ name: 'Calloway High School', lon: -121.12, lat: 39.15 }],
    closures: [
      {
        name: 'Canyon Road',
        status: 'Closed',
        path: [
          [-121.08, 39.18],
          [-121.1, 39.16],
          [-121.12, 39.15],
        ],
      },
    ],
  })
}

export function sampleEvacuationBoard() {
  const p = parts()
  const when = at(2.5)
  const st = statuses(when, 20)
  return evacuationBoardFigureData({
    title: 'Evacuation status at hour 2.5',
    basis: 'simulated',
    timeZone: TZ,
    asOf: iso(when),
    zones: fire.zones.filter((z) => z.id !== 'N-1'),
    arrivals: p.arrivals,
    orders: st,
  })
}

export function sampleCircuitBoard() {
  const events = generateShutoff(shutoff).find((d) => d.id === 'sim-psps-circuits')!
    .data as GroundTruthEvent[]
  const circuits = events.filter((e) => e.kind === 'circuit')
  const first = Date.parse(circuits[0]!.time)
  const statuses: Parameters<typeof circuitBoardFigureData>[0]['statuses'] = {}
  circuits.forEach((c, i) => {
    statuses[c.area!] = {
      status: i < 2 ? 'De-energized' : i === 2 ? 'Notified' : 'Scheduled',
      notifiedAt: iso(first - (30 - i) * 3_600_000),
    }
  })
  return circuitBoardFigureData({
    title: 'Power shutoff: circuits and customers (fictional)',
    timeZone: 'America/Los_Angeles',
    asOf: iso(first + 20 * MIN),
    events,
    statuses,
  })
}

export function sampleAqiSeries() {
  const { aqi } = parts()
  return aqiSeriesFigureData({
    title: 'Air Quality Index at schools and the hospital (simulated)',
    basis: 'simulated',
    series: aqi,
    thresholds: [{ value: 150, label: 'District closure trigger' }],
  })
}

export function sampleSmokeMap() {
  const p = parts()
  const when = at(8)
  const latest = aqiAt(8)
  return smokeMapFigureData({
    title: 'Smoke plume and AQI at hour 8 (simulated)',
    basis: 'simulated',
    timeZone: TZ,
    at: iso(when),
    smoke: p.smoke,
    places: fire.places.map((pl) => ({ ...pl, aqi: latest[pl.name] })),
  })
}

function aqiAt(hours: number): Record<string, number> {
  const row = parts().aqi[hours]
  return row?.v ?? {}
}

/** The sample for each wildfire figure kind, by kind id. */
export const wildfireFigureSamples = (): Record<string, unknown> => ({
  wildfire_fire_map: sampleFireMap(),
  wildfire_evacuation_board: sampleEvacuationBoard(),
  wildfire_psps_board: sampleCircuitBoard(),
  wildfire_aqi_series: sampleAqiSeries(),
  wildfire_smoke_map: sampleSmokeMap(),
})
