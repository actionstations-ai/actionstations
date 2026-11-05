// Case data to wildfire figure data (spec 0461 FR-7, FR-9): pure functions that turn the
// datasets the simulator (or a connector) writes into the data the wildfire figure kinds take.
// Zone geometry in examples is fictional (a circle around a zone's center): real zone geometry
// is held by counties and is not in the public fire services.
import type { GroundTruthEvent } from '@shared/schemas/metrics'
import type { z } from 'zod'
import type { EvacuationBoardData } from '../../render/figures/fire/evacuation-board'
import type { FireMapData } from '../../render/figures/fire/fire-map'
import type { CircuitBoardData } from '../../render/figures/fire/circuit-board'
import type { AqiSeriesData } from '../../render/figures/fire/aqi-series'
import type { SmokeMapData } from '../../render/figures/fire/smoke-map'
import type { Basis, ZoneStatus } from '../../render/figures/fire/common'

type Pt = [number, number]
interface Feature {
  geometry: { type: string; coordinates: unknown }
  properties: Record<string, unknown>
}
export interface Collection {
  features: Feature[]
}

export interface ZoneGeometry {
  id: string
  name?: string
  lon: number
  lat: number
  radiusKm?: number
  clearanceMin?: number
  population?: number
  special?: string
}

const M_PER_DEG_LAT = 111_195

/** A circle as a 24-point ring in GeoJSON order (lon, lat). */
export function circleRing(lon: number, lat: number, radiusKm: number): Pt[] {
  const k = Math.cos((lat * Math.PI) / 180)
  return Array.from({ length: 24 }, (_, i): Pt => {
    const t = (2 * Math.PI * i) / 24
    return [
      Math.round((lon + (radiusKm * 1000 * Math.sin(t)) / (M_PER_DEG_LAT * k)) * 1e6) / 1e6,
      Math.round((lat + (radiusKm * 1000 * Math.cos(t)) / M_PER_DEG_LAT) * 1e6) / 1e6,
    ]
  })
}

const outerRing = (f: Feature): Pt[] => {
  const rings = f.geometry.coordinates as Pt[][]
  const ring = rings[0] ?? []
  return ring.length > 3 && ring[0]![0] === ring[ring.length - 1]![0] ? ring.slice(0, -1) : ring
}
const str = (v: unknown): string => (typeof v === 'string' ? v : '')
const num = (v: unknown): number | undefined => (typeof v === 'number' ? v : undefined)

export interface FireMapInput {
  title?: string
  basis: Basis
  timeZone?: string
  at?: string
  perimeters: Collection
  hotspots?: Collection
  zones: ZoneGeometry[]
  /** Status of each zone at the moment shown; zones without one are "No status". */
  statuses?: Record<string, { status: ZoneStatus; since?: string }>
  arrivals?: readonly GroundTruthEvent[]
  shelters?: { name: string; lon: number; lat: number }[]
  closures?: FireMapData['closures']
  projectionHours?: Record<number, Collection['features'][number]>
}

export function fireMapFigureData(i: FireMapInput): z.input<typeof FireMapData> {
  const arrival = new Map((i.arrivals ?? []).map((a) => [a.area ?? '', a.time]))
  return {
    ...(i.title ? { title: i.title } : {}),
    basis: i.basis,
    timeZone: i.timeZone ?? 'UTC',
    ...(i.at ? { at: i.at } : {}),
    perimeters: i.perimeters.features.map((f) => ({
      time: str(f.properties.time),
      ...(num(f.properties.acres) !== undefined ? { acres: num(f.properties.acres)! } : {}),
      ring: outerRing(f),
    })),
    hotspots: (i.hotspots?.features ?? []).map((f) => ({
      time: str(f.properties.time),
      at: f.geometry.coordinates as Pt,
    })),
    zones: i.zones.map((z) => {
      const s = i.statuses?.[z.id]
      const a = arrival.get(z.id)
      return {
        zone: z.id,
        status: s?.status ?? ('No status' as const),
        ring: circleRing(z.lon, z.lat, z.radiusKm ?? 0.5),
        ...(s?.since ? { since: s.since } : {}),
        ...(a ? { arrival: a } : {}),
      }
    }),
    shelters: (i.shelters ?? []).map((s) => ({ name: s.name, at: [s.lon, s.lat] as Pt })),
    closures: i.closures ?? [],
  }
}

export interface EvacuationBoardInput {
  title?: string
  basis: Basis
  timeZone?: string
  asOf?: string
  zones: ZoneGeometry[]
  arrivals: readonly GroundTruthEvent[]
  orders?: Record<string, { status: ZoneStatus; orderedAt?: string }>
}

export function evacuationBoardFigureData(i: EvacuationBoardInput): EvacuationBoardData {
  const arrival = new Map(i.arrivals.map((a) => [a.area ?? '', a]))
  return {
    ...(i.title ? { title: i.title } : {}),
    ...(i.asOf ? { asOf: i.asOf } : {}),
    timeZone: i.timeZone ?? 'UTC',
    basis: i.basis,
    rows: i.zones.map((z) => {
      const o = i.orders?.[z.id]
      const a = arrival.get(z.id)
      return {
        zone: z.id,
        ...(z.name ? { area: z.name } : {}),
        status: o?.status ?? 'No status',
        ...(o?.orderedAt ? { orderedAt: o.orderedAt } : {}),
        ...(z.population !== undefined ? { people: z.population } : {}),
        ...(z.special ? { special: z.special } : {}),
        ...(z.clearanceMin !== undefined ? { clearanceMin: z.clearanceMin } : {}),
        ...(a ? { arrivalAt: a.time } : {}),
      }
    }),
  }
}

export interface CircuitBoardInput {
  title?: string
  timeZone?: string
  asOf?: string
  /** The `sim-psps-circuits` ground-truth events. */
  events: readonly GroundTruthEvent[]
  statuses?: Record<
    string,
    { status: CircuitBoardData['rows'][number]['status']; notifiedAt?: string }
  >
}

export function circuitBoardFigureData(i: CircuitBoardInput): z.input<typeof CircuitBoardData> {
  const circuits = i.events.filter((e) => e.kind === 'circuit')
  return {
    ...(i.title ? { title: i.title } : {}),
    ...(i.asOf ? { asOf: i.asOf } : {}),
    timeZone: i.timeZone ?? 'UTC',
    rows: circuits.map((e) => {
      const s = i.statuses?.[e.area ?? '']
      const a = e.attrs
      return {
        circuit: e.area ?? e.id,
        ...(str(a.area) ? { area: str(a.area) } : {}),
        customers: num(a.customers) ?? 0,
        medicalBaseline: num(a.medicalBaseline) ?? 0,
        critical: Array.isArray(a.critical) ? (a.critical as string[]) : [],
        status: s?.status ?? ('Watch' as const),
        ...(s?.notifiedAt ? { notifiedAt: s.notifiedAt } : {}),
      }
    }),
  }
}

export interface AqiSeriesInput {
  title?: string
  basis: AqiSeriesData['basis']
  /** The `sim-fire-aqi` series: one record of AQI by place per time. */
  series: readonly { t: string; v: number | Record<string, number> }[]
  thresholds?: AqiSeriesData['thresholds']
  places?: readonly string[]
}

export function aqiSeriesFigureData(i: AqiSeriesInput): AqiSeriesData {
  const names = i.places ?? [
    ...new Set(i.series.flatMap((p) => (typeof p.v === 'object' ? Object.keys(p.v) : []))),
  ]
  return {
    ...(i.title ? { title: i.title } : {}),
    basis: i.basis,
    series: names.slice(0, 4).map((name) => ({
      name,
      points: i.series.flatMap((p) =>
        typeof p.v === 'object' && p.v[name] !== undefined ? [{ x: p.t, aqi: p.v[name]! }] : [],
      ),
    })),
    thresholds: i.thresholds ?? [],
  }
}

export interface SmokeMapInput {
  title?: string
  basis: Basis
  timeZone?: string
  at?: string
  smoke: Collection
  perimeter?: Pt[]
  places: { name: string; lon: number; lat: number; aqi?: number }[]
}

export function smokeMapFigureData(i: SmokeMapInput): z.input<typeof SmokeMapData> {
  return {
    ...(i.title ? { title: i.title } : {}),
    basis: i.basis,
    timeZone: i.timeZone ?? 'UTC',
    ...(i.at ? { at: i.at } : {}),
    smoke: i.smoke.features.map((f) => ({
      time: str(f.properties.time),
      density: str(f.properties.density) as 'light' | 'medium' | 'heavy',
      ring: outerRing(f),
      hours: 1,
    })),
    ...(i.perimeter ? { perimeter: i.perimeter } : {}),
    places: i.places.map((p) => ({
      name: p.name,
      at: [p.lon, p.lat] as Pt,
      ...(p.aqi !== undefined ? { aqi: p.aqi } : {}),
    })),
  }
}
