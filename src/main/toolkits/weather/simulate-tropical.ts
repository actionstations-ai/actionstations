// A simulated tropical cyclone (spec 0449 FR-8, FR-11): a straight track with a simple intensity
// history and a parametric wind profile (linear inside the radius of maximum wind, a power-law
// decay outside). It gives the path as best-track-like fixes and, for named places, the
// sustained wind over time and the hour tropical-storm-force winds (34 kt) first arrive: the
// quantity a hurricane decision timeline is compared with. A storm name is fictional.
import { z } from 'zod'
import {
  registerGenerator,
  type GeneratedDataset,
  type SimulatedGenerator,
} from '../../case-data/generators'
import { distanceKm } from './archives'

export const TropicalParams = z
  .object({
    name: z
      .string()
      .regex(/^[A-Za-z-]{2,20}$/)
      .default('Marlena'),
    start: z.iso.datetime({ offset: true }),
    hours: z.number().int().min(12).max(120).default(72),
    track: z.object({
      startLat: z.number().min(-60).max(60),
      startLon: z.number().min(-180).max(180),
      landfallLat: z.number().min(-60).max(60),
      landfallLon: z.number().min(-180).max(180),
      /** Hours after `start` that the center reaches the landfall point. */
      landfallHour: z.number().min(6).max(120),
    }),
    intensity: z.object({
      startKt: z.number().min(25).max(150).default(45),
      peakKt: z.number().min(35).max(165).default(110),
      /** Hour of peak intensity (at or before landfall). */
      peakHour: z.number().min(0).max(120),
    }),
    rmaxKm: z.number().min(10).max(120).default(40),
    places: z
      .array(z.object({ name: z.string().min(1).max(60), lat: z.number(), lon: z.number() }))
      .min(1)
      .max(10),
  })
  .refine((p) => p.intensity.peakHour <= p.track.landfallHour, {
    message: 'the storm peaks at or before landfall',
    path: ['intensity', 'peakHour'],
  })
  .refine((p) => p.track.landfallHour < p.hours, {
    message: 'the period must run past landfall',
    path: ['hours'],
  })
export type TropicalParams = z.infer<typeof TropicalParams>

export const TS_FORCE_KT = 34

const iso = (ms: number): string => new Date(ms).toISOString()

/** Maximum sustained wind (kt) at an hour: a smooth rise to the peak, then a decay over land. */
export function maxWindKt(p: TropicalParams, hour: number): number {
  const { startKt, peakKt, peakHour } = p.intensity
  if (hour <= peakHour) {
    const f = peakHour === 0 ? 1 : hour / peakHour
    return startKt + (peakKt - startKt) * (f * f * (3 - 2 * f))
  }
  const sinceLandfall = Math.max(0, hour - p.track.landfallHour)
  return Math.max(15, peakKt * Math.exp(-0.055 * sinceLandfall))
}

export function center(p: TropicalParams, hour: number): { lat: number; lon: number } {
  const { startLat, startLon, landfallLat, landfallLon, landfallHour } = p.track
  const f = hour / landfallHour
  return {
    lat: startLat + (landfallLat - startLat) * f,
    lon: startLon + (landfallLon - startLon) * f,
  }
}

/** Sustained wind (kt) at distance `rKm` from a center with maximum wind `vmax`. */
export const windAtRadius = (vmax: number, rmaxKm: number, rKm: number): number =>
  rKm <= rmaxKm ? vmax * (rKm / rmaxKm) : vmax * Math.pow(rmaxKm / rKm, 0.6)

const status = (kt: number): string => (kt >= 64 ? 'HU' : kt >= 34 ? 'TS' : 'TD')

export function generateTropical(p: TropicalParams): GeneratedDataset[] {
  const startMs = Date.parse(p.start)
  const endMs = startMs + p.hours * 3_600_000
  const fixes = Array.from({ length: Math.floor(p.hours / 3) + 1 }, (_, i) => i * 3)
  const pts = fixes.map((h) => ({ h, ...center(p, h), kt: Math.round(maxWindKt(p, h)) }))
  const trackFeatures = [
    {
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: pts.map((q) => [Math.round(q.lon * 100) / 100, Math.round(q.lat * 100) / 100]),
      },
      properties: { name: `${p.name} simulated track` },
    },
    ...pts.map((q, i) => ({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [Math.round(q.lon * 100) / 100, Math.round(q.lat * 100) / 100],
      },
      properties: {
        name: `${p.name} ${status(q.kt)} ${q.kt} kt`,
        start: iso(startMs + q.h * 3_600_000),
        end: iso(startMs + (pts[i + 1]?.h ?? q.h) * 3_600_000),
        status: status(q.kt),
        windKt: q.kt,
      },
    })),
  ]
  const series = p.places.map((place) => ({
    zone: place.name,
    quantity: 'sustained wind (kt)',
    points: Array.from({ length: p.hours * 2 + 1 }, (_, i) => {
      const h = i / 2
      const c = center(p, h)
      const r = Math.max(1, distanceKm(place, c))
      return {
        time: iso(startMs + h * 3_600_000),
        value: Math.round(windAtRadius(maxWindKt(p, h), p.rmaxKm, r) * 10) / 10,
      }
    }),
  }))
  const events = series.flatMap((s) => {
    const first = s.points.find((q) => q.value >= TS_FORCE_KT)
    return first
      ? [
          {
            id: `ts-force-${s.zone.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
            time: first.time,
            area: s.zone,
            kind: 'tropical_storm_wind_arrival',
            attrs: { thresholdKt: TS_FORCE_KT, windKt: first.value },
          },
        ]
      : []
  })
  return [
    {
      id: `track-${p.name.toLowerCase()}-sim`,
      label: `Simulated track of ${p.name}`,
      kind: 'features',
      data: { type: 'FeatureCollection', features: trackFeatures },
      range: { start: p.start, end: iso(endMs) },
    },
    {
      id: 'wind-at-places',
      label: `Simulated sustained wind at places, ${p.name}`,
      kind: 'features',
      data: {
        type: 'FeatureCollection',
        features: p.places.map((pl) => ({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [pl.lon, pl.lat] },
          properties: { name: pl.name },
        })),
        series,
        events,
      },
      range: { start: p.start, end: iso(endMs) },
      unit: 'kt',
    },
  ]
}

export const tropicalGenerator: SimulatedGenerator<TropicalParams> = {
  id: 'weather-tropical-cyclone',
  label: 'Simulated tropical cyclone (weather toolkit)',
  params: TropicalParams,
  description:
    'A tropical cyclone on a straight track with a simple intensity history and a parametric wind field. Writes the track as best-track-like fixes and the sustained wind at each place over time, with the hour tropical-storm-force winds (34 kt) arrive.',
  toolkits: ['weather'],
  example: {
    name: 'Marlena',
    start: '2026-09-10T00:00:00Z',
    hours: 72,
    track: { startLat: 24, startLon: -90, landfallLat: 29.4, landfallLon: -89.2, landfallHour: 48 },
    intensity: { startKt: 50, peakKt: 115, peakHour: 40 },
    rmaxKm: 35,
    places: [
      { name: 'Venice, LA', lat: 29.28, lon: -89.35 },
      { name: 'New Orleans, LA', lat: 29.95, lon: -90.07 },
      { name: 'Gulfport, MS', lat: 30.37, lon: -89.09 },
    ],
  } satisfies z.input<typeof TropicalParams>,
  fields: {
    name: { label: 'Storm name', help: 'A fictional name, 2 to 20 letters.' },
    start: { label: 'Start (UTC)' },
    hours: { label: 'Hours', help: 'Length of the period, 12 to 120; must run past landfall.' },
    track: {
      label: 'Track',
      help: 'startLat and startLon, landfallLat and landfallLon in decimal degrees, and landfallHour (hours after the start).',
    },
    intensity: {
      label: 'Intensity',
      help: 'startKt and peakKt (maximum sustained wind in knots) and peakHour, at or before landfall.',
    },
    rmaxKm: { label: 'Radius of maximum wind (km)', help: '10 to 120.' },
    places: {
      label: 'Places',
      help: 'One to ten items: name, lat and lon. Each gets its wind over time and the arrival of tropical-storm-force winds.',
    },
  },
  generate: generateTropical,
}

registerGenerator(tropicalGenerator)
