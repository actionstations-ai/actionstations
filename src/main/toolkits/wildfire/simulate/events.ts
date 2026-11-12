// Simulated wildfire events (spec 0461 FR-10): an ellipse spread series from an ignition point
// with a wind schedule, arrival times at evacuation zones, satellite-style hotspots, a smoke
// plume downwind and an AQI series at fixed places. Parametric and deterministic. It is an
// illustration with a published length-to-breadth relation (spread.ts), not a fire behavior
// prediction, and every dataset it makes is labeled simulated (ADR-0076, NFR-5).
import { z } from 'zod'
import { IsoDateTime } from '@shared/schemas/common'
import type { GeneratedDataset, SimulatedGenerator } from '../../../case-data/generators'
import {
  areaAcres,
  centerOf,
  ellipseQ,
  ellipseRing,
  headRate,
  initialState,
  step,
  windAt,
  type EllipseState,
  type LonLat,
} from './spread'
import { aqiFromPm25, pm25At, plumeRing, type SmokeDensity } from './smoke'

const MIN_MS = 60_000
const iso = (ms: number): string => new Date(ms).toISOString().replace('.000Z', 'Z')
const r1 = (v: number): number => Math.round(v * 10) / 10
const INTERNAL_MIN = 5

const Lon = z.number().min(-180).max(180)
const Lat = z.number().min(-90).max(90)
const Point = z.object({ lon: Lon, lat: Lat })

export const FireZone = z.object({
  /** The id decisions and messages use, exactly as on the zone map. */
  id: z.string().min(1).max(40),
  name: z.string().max(100).default(''),
  lon: Lon,
  lat: Lat,
  /** Radius of the zone in km; the fire "arrives" when its edge reaches this far. */
  radiusKm: z.number().min(0).max(20).default(0.5),
  /** Minutes the zone needs to clear once an order is given. */
  clearanceMin: z.number().min(0).max(1440).default(60),
  population: z.number().int().min(0).max(1_000_000).default(0),
})

export const FireEventParams = z
  .object({
    name: z.string().min(1).max(80),
    start: IsoDateTime,
    stepMinutes: z.number().int().min(15).max(180).default(60),
    durationHours: z.number().min(2).max(72).default(24),
    ignition: Point,
    fuel: z.enum(['grass', 'shrub', 'timber']).default('shrub'),
    wind: z
      .array(
        z.object({
          hour: z.number().min(0).max(72),
          speedMph: z.number().min(0).max(80),
          fromDeg: z.number().min(0).max(360),
        }),
      )
      .min(1)
      .max(12),
    slope: z
      .object({ percent: z.number().min(0).max(100), upslopeDeg: z.number().min(0).max(360) })
      .optional(),
    suppression: z
      .object({ startHour: z.number().min(0).max(72), reduction: z.number().min(0).max(0.9) })
      .optional(),
    zones: z.array(FireZone).min(1).max(30),
    /** Places that get an AQI series (a school, a hospital, a town). */
    places: z
      .array(z.object({ name: z.string().min(1).max(80), lon: Lon, lat: Lat }))
      .max(10)
      .default([]),
  })
  .refine((p) => new Set(p.zones.map((z) => z.id)).size === p.zones.length, {
    message: 'zone ids must be unique',
  })

export type FireEventParams = z.infer<typeof FireEventParams>

export interface FireStepRecord {
  minute: number
  time: string
  state: EllipseState
  acres: number
  ring: LonLat[]
  windFromDeg: number
  windMph: number
  rateMPerMin: number
}

export interface ZoneArrival {
  id: string
  arrivalMs: number | null
  latestOrderMs: number | null
  clearanceMin: number
  population: number
}

export interface FireSimulation {
  steps: FireStepRecord[]
  arrivals: ZoneArrival[]
  /** One sample per internal step of the ellipse value at every zone, for tests. */
  startMs: number
}

/** Run the spread at 5-minute internal steps and sample at `stepMinutes`. */
export function simulateFire(p: FireEventParams): FireSimulation {
  const startMs = Date.parse(p.start)
  const totalMin = Math.round(p.durationHours * 60)
  const origin = p.ignition
  let state = initialState()
  const arrivals = new Map<string, number | null>(p.zones.map((z) => [z.id, null]))
  const lastQ = new Map<string, number>(
    p.zones.map((z) => [z.id, ellipseQ(state, origin, z, z.radiusKm * 1000)]),
  )
  for (const z of p.zones) if ((lastQ.get(z.id) ?? 2) <= 1) arrivals.set(z.id, startMs)
  const steps: FireStepRecord[] = []
  const record = (minute: number, rate: number, wind: { speedMph: number; fromDeg: number }) =>
    steps.push({
      minute,
      time: iso(startMs + minute * MIN_MS),
      state,
      acres: Math.round(areaAcres(state)),
      ring: ellipseRing(state, origin),
      windFromDeg: wind.fromDeg,
      windMph: wind.speedMph,
      rateMPerMin: r1(rate),
    })
  const w0 = windAt(p.wind, 0)
  record(0, headRate({ fuel: p.fuel, wind: w0, slope: p.slope, suppressionFactor: 1 }).rate, w0)
  for (let m = INTERNAL_MIN; m <= totalMin; m += INTERNAL_MIN) {
    const hour = (m - INTERNAL_MIN) / 60
    const wind = windAt(p.wind, hour)
    const sup = p.suppression && hour >= p.suppression.startHour ? 1 - p.suppression.reduction : 1
    const input = { fuel: p.fuel, wind, slope: p.slope, suppressionFactor: sup }
    state = step(state, input, INTERNAL_MIN)
    for (const z of p.zones) {
      const q = ellipseQ(state, origin, z, z.radiusKm * 1000)
      const prev = lastQ.get(z.id)!
      if (arrivals.get(z.id) === null && q <= 1) {
        const frac = prev === q ? 1 : (prev - 1) / (prev - q)
        arrivals.set(z.id, startMs + (m - INTERNAL_MIN + frac * INTERNAL_MIN) * MIN_MS)
      }
      lastQ.set(z.id, q)
    }
    if (m % p.stepMinutes === 0 || m === totalMin) record(m, headRate(input).rate, wind)
  }
  return {
    steps,
    startMs,
    arrivals: p.zones.map((z) => {
      const at = arrivals.get(z.id) ?? null
      return {
        id: z.id,
        arrivalMs: at,
        latestOrderMs: at === null ? null : at - z.clearanceMin * MIN_MS,
        clearanceMin: z.clearanceMin,
        population: z.population,
      }
    }),
  }
}

const ringCoords = (ring: LonLat[]): [number, number][] => {
  const pts = ring.map((p): [number, number] => [r6(p.lon), r6(p.lat)])
  return [...pts, pts[0]!]
}
const r6 = (v: number): number => Math.round(v * 1e6) / 1e6

const DENSITIES: SmokeDensity[] = ['light', 'medium', 'heavy']

/** The hotspots for one step: every third outline point, pulled slightly inside the edge. */
function hotspots(rec: FireStepRecord, origin: LonLat) {
  return rec.ring
    .filter((_, i) => i % 3 === 0)
    .map((p, i) => {
      const c = centerOf(rec.state, origin)
      return {
        type: 'Feature' as const,
        geometry: {
          type: 'Point' as const,
          coordinates: [r6(p.lon + (c.lon - p.lon) * 0.04), r6(p.lat + (c.lat - p.lat) * 0.04)],
        },
        properties: {
          id: `hot-${rec.minute}-${i}`,
          time: rec.time,
          confidence: i % 4 === 0 ? 'high' : 'nominal',
          note: 'simulated detection',
        },
      }
    })
}

export function generateFire(p: FireEventParams): GeneratedDataset[] {
  const sim = simulateFire(p)
  const origin = p.ignition
  const last = sim.steps[sim.steps.length - 1]!
  const range = { start: sim.steps[0]!.time, end: last.time }
  const lons = sim.steps.flatMap((s) => s.ring.map((r) => r.lon))
  const lats = sim.steps.flatMap((s) => s.ring.map((r) => r.lat))
  const area = {
    label: `${p.name}, simulated`,
    bbox: [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)] as [
      number,
      number,
      number,
      number,
    ],
  }
  const perimeterNote =
    'simulated spread illustration with an ellipse and a published length-to-breadth relation, not a fire behavior prediction'

  const perimeters: GeneratedDataset = {
    id: 'sim-fire-perimeters',
    label: `${p.name} perimeters, simulated illustration (not a fire behavior prediction)`,
    kind: 'features',
    range,
    area,
    unit: 'acres',
    data: {
      type: 'FeatureCollection',
      features: sim.steps.map((s) => ({
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: [ringCoords(s.ring)] },
        properties: {
          id: `perimeter-${s.minute}`,
          time: s.time,
          acres: s.acres,
          rateMPerMin: s.rateMPerMin,
          windMph: s.windMph,
          windFromDeg: s.windFromDeg,
          note: perimeterNote,
        },
      })),
    },
  }
  const hot: GeneratedDataset = {
    id: 'sim-fire-hotspots',
    label: `${p.name} hotspots, simulated detections`,
    kind: 'features',
    range,
    area,
    data: {
      type: 'FeatureCollection',
      features: sim.steps.slice(1).flatMap((s) => hotspots(s, origin)),
    },
  }
  const smoke: GeneratedDataset = {
    id: 'sim-fire-smoke',
    label: `${p.name} smoke plume, simulated (light, medium and heavy)`,
    kind: 'features',
    range,
    area,
    data: {
      type: 'FeatureCollection',
      features: sim.steps.slice(1).flatMap((s) =>
        DENSITIES.map((density) => ({
          type: 'Feature' as const,
          geometry: {
            type: 'Polygon' as const,
            coordinates: [
              ringCoords(
                plumeRing(centerOf(s.state, origin), (s.windFromDeg + 180) % 360, s.acres, density),
              ),
            ],
          },
          properties: { id: `smoke-${s.minute}-${density}`, time: s.time, density },
        })),
      ),
    },
  }
  const acres: GeneratedDataset = {
    id: 'sim-fire-acres',
    label: `${p.name} size, simulated`,
    kind: 'series',
    range,
    unit: 'acres',
    data: sim.steps.map((s) => ({ t: s.time, v: s.acres })),
  }
  const arrivalEvents: GeneratedDataset = {
    id: 'sim-fire-arrivals',
    label: `${p.name} fire arrival at each zone, simulated`,
    kind: 'reports',
    shape: 'ground-truth',
    range,
    area,
    data: [
      ...sim.arrivals.flatMap((a) =>
        a.arrivalMs === null
          ? []
          : [
              {
                id: `arrival-${a.id}`,
                time: iso(a.arrivalMs),
                area: a.id,
                kind: 'fire_arrival',
                attrs: {
                  clearanceMin: a.clearanceMin,
                  latestOrderTime: iso(a.latestOrderMs!),
                  population: a.population,
                  basis: 'simulated',
                },
              },
            ],
      ),
      ...p.wind
        .filter((w) => w.hour > 0)
        .map((w) => ({
          id: `wind-shift-${w.hour}`,
          time: iso(sim.startMs + w.hour * 60 * MIN_MS),
          kind: 'wind_shift',
          attrs: { speedMph: w.speedMph, fromDeg: w.fromDeg, basis: 'simulated' },
        })),
    ],
  }
  // Minutes past the latest order time for each zone the fire reaches: the series crosses 0 at
  // arrival less clearance, so the threshold timing metric (threshold 0, clearance 0) scores an
  // order against each zone's own deadline. A zone the fire never reaches stays below 0.
  const deadline: GeneratedDataset = {
    id: 'sim-fire-order-deadline',
    label: `${p.name} minutes past each zone's latest order time, simulated`,
    kind: 'series',
    shape: 'modeled-series',
    range,
    area,
    unit: 'minutes',
    data: sim.arrivals.map((a) => ({
      zone: a.id,
      quantity: "minutes past the zone's latest order time (arrival less clearance time)",
      points: sim.steps.map((s) => ({
        time: s.time,
        value:
          a.latestOrderMs === null
            ? -1
            : Math.round(((sim.startMs + s.minute * MIN_MS - a.latestOrderMs) / MIN_MS) * 10) / 10,
      })),
    })),
  }
  const out: GeneratedDataset[] = [perimeters, hot, smoke, acres, arrivalEvents, deadline]
  if (p.places.length) {
    const rows = sim.steps.map((s) => {
      const toward = (s.windFromDeg + 180) % 360
      const c = centerOf(s.state, origin)
      return {
        s,
        pm: Object.fromEntries(p.places.map((pl) => [pl.name, pm25At(pl, c, toward, s.acres)])),
      }
    })
    out.push({
      id: 'sim-fire-pm25',
      label: `${p.name} PM2.5 at places, simulated`,
      kind: 'series',
      range,
      unit: 'ug/m3',
      data: rows.map((r) => ({ t: r.s.time, v: r.pm })),
    })
    out.push({
      id: 'sim-fire-aqi',
      label: `${p.name} AQI at places, simulated`,
      kind: 'series',
      range,
      unit: 'AQI',
      data: rows.map((r) => ({
        t: r.s.time,
        v: Object.fromEntries(Object.entries(r.pm).map(([k, v]) => [k, aqiFromPm25(v)])),
      })),
    })
    out.push({
      id: 'sim-fire-aqi-zones',
      label: `${p.name} AQI by place, simulated (for scoring)`,
      kind: 'series',
      shape: 'modeled-series',
      range,
      unit: 'AQI',
      data: p.places.map((pl) => ({
        zone: pl.name,
        quantity: 'AQI (simulated PM2.5)',
        points: rows.map((r) => ({ time: r.s.time, value: aqiFromPm25(r.pm[pl.name]!) })),
      })),
    })
  }
  return out
}

export const wildfireEventGenerator: SimulatedGenerator<FireEventParams> = {
  id: 'wildfire-event',
  label: 'Wildfire event (simulated spread illustration)',
  params: FireEventParams,
  description:
    'A fire grows as an ellipse from an ignition point under a wind schedule, with optional slope and suppression. Writes perimeters over time, hotspots, a smoke plume, an acres series, when the fire reaches each evacuation zone and the latest time to order it, and an AQI series at the places you list. An illustration with a simple relation, not a prediction of fire behavior.',
  toolkits: ['wildfire'],
  example: {
    name: 'Cinder Creek Fire',
    start: '2026-09-12T18:42:00Z',
    stepMinutes: 60,
    durationHours: 14,
    ignition: { lon: -121.05, lat: 39.2 },
    fuel: 'shrub',
    wind: [
      { hour: 0, speedMph: 20, fromDeg: 45 },
      { hour: 5, speedMph: 32, fromDeg: 45 },
      { hour: 10, speedMph: 12, fromDeg: 270 },
    ],
    slope: { percent: 25, upslopeDeg: 225 },
    suppression: { startHour: 9, reduction: 0.5 },
    zones: [
      {
        id: 'C-1',
        name: 'Cinder Canyon Road',
        lon: -121.06313,
        lat: 39.18983,
        radiusKm: 0.5,
        clearanceMin: 45,
        population: 420,
      },
      {
        id: 'C-2',
        name: 'Upper Mill Road',
        lon: -121.07089,
        lat: 39.18071,
        radiusKm: 0.6,
        clearanceMin: 60,
        population: 310,
      },
      {
        id: 'C-3',
        name: 'Pine Hollow',
        lon: -121.08734,
        lat: 39.17572,
        radiusKm: 0.7,
        clearanceMin: 90,
        population: 640,
      },
    ],
    places: [
      { name: 'Calloway Falls Elementary', lon: -121.09127, lat: 39.15433 },
      { name: 'Calloway Regional Hospital', lon: -121.12823, lat: 39.14913 },
    ],
  } satisfies z.input<typeof FireEventParams>,
  fields: {
    name: { label: 'Fire name', help: 'Fictional name used in the labels.' },
    start: { label: 'Ignition time (UTC)' },
    stepMinutes: { label: 'Step (minutes)', help: 'Minutes between perimeters, 15 to 180.' },
    durationHours: { label: 'Length (hours)', help: '2 to 72.' },
    ignition: { label: 'Ignition point', help: 'An object with lon and lat in decimal degrees.' },
    fuel: { label: 'Fuel' },
    wind: {
      label: 'Wind schedule',
      help: 'One to twelve items: hour (from ignition), speedMph and fromDeg (the direction the wind blows from). Each holds until the next.',
    },
    slope: {
      label: 'Slope',
      help: 'Optional: percent (0 to 100) and upslopeDeg, the direction uphill faces.',
    },
    suppression: {
      label: 'Suppression',
      help: 'Optional: startHour and reduction, the share of spread removed from then on (0 to 0.9).',
    },
    zones: {
      label: 'Evacuation zones',
      help: 'Each item: id (as on the zone map), name, lon, lat, radiusKm, clearanceMin (minutes to clear once ordered) and population. Ids must be unique.',
    },
    places: {
      label: 'AQI places',
      help: 'Up to ten items: name, lon and lat of a school, hospital or town that gets an AQI series.',
    },
  },
  generate: generateFire,
}
