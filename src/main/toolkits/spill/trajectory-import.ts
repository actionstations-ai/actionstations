// Import of a trajectory computed outside the app (spec 0455 FR-6, #771): a GeoJSON of particle
// or position points by time, such as the output of PyGNOME's GeoJSON outputter or a file exported
// from WebGNOME. The file is parsed as data only (JSON, size and point limits) and becomes case
// data: for each time a best-estimate cloud, an uncertainty cloud and a centroid, active from
// that time to the next, plus the track of the centroids. Nothing here runs a model, and the data
// is labeled with the model, the run date and the inputs the person typed.
//
// Accepted shapes: a FeatureCollection; an array of FeatureCollections (one per output step, as
// PyGNOME writes them); features with Point or MultiPoint geometry. The time of a point is
// `properties.current_time` (PyGNOME, seconds since the epoch), or `time`, `timestamp`, `datetime`
// or `t` (an ISO string or an epoch number). `spill_type: "UNCERTAIN"` (or `uncertain: true`)
// marks a point of the uncertainty cloud; every other point is the best estimate.
import { z } from 'zod'
import { AppError } from '../../lib/errors'
import type { GeneratedDataset, SimulatedGenerator } from '../../case-data/generators'
import { distanceM, type LatLon } from './simulate'

export const MAX_IMPORT_CHARS = 8_000_000
export const MAX_POINTS = 200_000
export const MAX_STEPS = 1_000

export const TrajectoryImportParams = z.object({
  /** The text of the file. */
  content: z.string().min(2).max(MAX_IMPORT_CHARS),
  /** The model that made it ("WebGNOME", "PyGNOME 1.1"). */
  model: z.string().trim().min(1).max(60).default('Trajectory model'),
  /** When the model was run (YYYY-MM-DD). */
  runDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /** The winds, currents and release the run used, in the person's words. */
  inputs: z.string().trim().max(400).default(''),
  /** The dataset id; a second import into the same scenario needs another. */
  id: z
    .string()
    .regex(/^[a-z0-9][a-z0-9-]{0,40}$/)
    .default('trajectory'),
})
export type TrajectoryImportParams = z.infer<typeof TrajectoryImportParams>

interface Particle {
  ms: number
  at: LatLon
  uncertain: boolean
}

const TIME_KEYS = ['current_time', 'time', 'timestamp', 'datetime', 't'] as const

/** A time from a property: an ISO string, or a number of seconds (or milliseconds) since the epoch. */
export function timeOf(props: Record<string, unknown> | null | undefined): number | undefined {
  for (const k of TIME_KEYS) {
    const v = props?.[k]
    if (typeof v === 'number' && Number.isFinite(v)) return v > 1e11 ? v : v * 1000
    if (typeof v === 'string' && v.trim()) {
      const n = Number(v)
      if (Number.isFinite(n) && /^\d+(\.\d+)?$/.test(v.trim())) return n > 1e11 ? n : n * 1000
      const ms = Date.parse(v)
      if (!Number.isNaN(ms)) return ms
    }
  }
  return undefined
}

const isUncertain = (p: Record<string, unknown> | null | undefined): boolean =>
  p?.uncertain === true || String(p?.spill_type ?? '').toUpperCase() === 'UNCERTAIN'

const validLonLat = (c: unknown): c is [number, number] =>
  Array.isArray(c) &&
  typeof c[0] === 'number' &&
  typeof c[1] === 'number' &&
  Math.abs(c[0]) <= 180 &&
  Math.abs(c[1]) <= 90

interface RawFeature {
  geometry?: { type?: string; coordinates?: unknown } | null
  properties?: Record<string, unknown> | null
}

function featuresOf(root: unknown): RawFeature[] {
  const collect = (x: unknown): RawFeature[] => {
    if (Array.isArray(x)) return x.flatMap(collect)
    const o = x as { type?: string; features?: unknown } | null
    if (o && o.type === 'FeatureCollection' && Array.isArray(o.features))
      return o.features as RawFeature[]
    if (o && o.type === 'Feature') return [o as RawFeature]
    return []
  }
  return collect(root)
}

/** The particles in the file, each with its time; refuses a file with none or too many. */
export function readParticles(content: string): Particle[] {
  let root: unknown
  try {
    root = JSON.parse(content)
  } catch {
    throw new AppError('VALIDATION', 'The trajectory file is not valid JSON or GeoJSON')
  }
  const out: Particle[] = []
  for (const f of featuresOf(root)) {
    const ms = timeOf(f.properties)
    if (ms === undefined) continue
    const g = f.geometry
    const coords =
      g?.type === 'Point'
        ? [g.coordinates]
        : g?.type === 'MultiPoint'
          ? (g.coordinates as unknown[])
          : []
    const uncertain = isUncertain(f.properties)
    for (const c of Array.isArray(coords) ? coords : [])
      if (validLonLat(c)) {
        out.push({ ms, at: { lat: c[1], lon: c[0] }, uncertain })
        if (out.length > MAX_POINTS)
          throw new AppError('VALIDATION', `The trajectory file has more than ${MAX_POINTS} points`)
      }
  }
  if (!out.length)
    throw new AppError(
      'VALIDATION',
      'The trajectory file has no points with a time. Each point needs a time property such as current_time.',
    )
  return out
}

function hull(points: LatLon[]): LatLon[] {
  const pts = [...new Map(points.map((p) => [`${p.lon},${p.lat}`, p])).values()].sort(
    (a, b) => a.lon - b.lon || a.lat - b.lat,
  )
  if (pts.length < 3) return pts
  const cross = (o: LatLon, a: LatLon, b: LatLon) =>
    (a.lon - o.lon) * (b.lat - o.lat) - (a.lat - o.lat) * (b.lon - o.lon)
  const build = (list: LatLon[]) => {
    const h: LatLon[] = []
    for (const p of list) {
      while (h.length >= 2 && cross(h[h.length - 2]!, h[h.length - 1]!, p) <= 0) h.pop()
      h.push(p)
    }
    h.pop()
    return h
  }
  return [...build(pts), ...build([...pts].reverse())]
}

const centroid = (pts: LatLon[]): LatLon => ({
  lat: pts.reduce((a, p) => a + p.lat, 0) / pts.length,
  lon: pts.reduce((a, p) => a + p.lon, 0) / pts.length,
})
const r5 = (n: number): number => Math.round(n * 1e5) / 1e5
const ring = (pts: LatLon[]): number[][][] => {
  const h = hull(pts)
  const r = h.map((p) => [r5(p.lon), r5(p.lat)])
  return [[...r, r[0]!]]
}

interface Step {
  ms: number
  best: LatLon[]
  all: LatLon[]
}

/** Group the particles by time; a time with only uncertain particles uses them as its estimate. */
function stepsOf(particles: Particle[]): Step[] {
  const byTime = new Map<number, Step>()
  for (const p of particles) {
    const s = byTime.get(p.ms) ?? { ms: p.ms, best: [], all: [] }
    if (!p.uncertain) s.best.push(p.at)
    s.all.push(p.at)
    byTime.set(p.ms, s)
  }
  const steps = [...byTime.values()].sort((a, b) => a.ms - b.ms)
  if (steps.length > MAX_STEPS)
    throw new AppError('VALIDATION', `The trajectory file has more than ${MAX_STEPS} output times`)
  return steps.map((s) => (s.best.length ? s : { ...s, best: s.all }))
}

const iso = (ms: number): string => new Date(ms).toISOString()

/** The case datasets for an imported trajectory: the clouds by time and a note of what it is. */
export function importTrajectory(params: TrajectoryImportParams): GeneratedDataset[] {
  const steps = stepsOf(readParticles(params.content))
  const gap =
    steps.length > 1 ? steps[steps.length - 1]!.ms - steps[steps.length - 2]!.ms : 3_600_000
  const features: unknown[] = []
  steps.forEach((s, i) => {
    const start = iso(s.ms)
    const end = iso(steps[i + 1]?.ms ?? s.ms + gap)
    const c = centroid(s.best)
    const radiusM = Math.round(Math.max(...s.best.map((p) => distanceM(c, p))))
    features.push({
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: ring(s.best) },
      properties: {
        name: 'Best estimate',
        kind: 'best_estimate',
        start,
        end,
        particles: s.best.length,
        radiusM,
      },
    })
    if (s.all.length > s.best.length)
      features.push({
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: ring(s.all) },
        properties: {
          name: 'Uncertainty',
          kind: 'uncertainty',
          start,
          end,
          particles: s.all.length,
        },
      })
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [r5(c.lon), r5(c.lat)] },
      properties: { name: 'Center of the oil', kind: 'centroid', start, end },
    })
  })
  features.push({
    type: 'Feature',
    geometry: {
      type: 'LineString',
      coordinates: steps.map((s) => {
        const c = centroid(s.best)
        return [r5(c.lon), r5(c.lat)]
      }),
    },
    properties: { name: 'Track of the center', kind: 'track' },
  })
  const everyPoint = steps.flatMap((s) => s.all)
  const lons = everyPoint.map((p) => p.lon)
  const lats = everyPoint.map((p) => p.lat)
  const start = iso(steps[0]!.ms)
  const end = iso(steps[steps.length - 1]!.ms)
  const label = `${params.model} trajectory, run ${params.runDate}`.slice(0, 120)
  return [
    {
      id: params.id,
      label,
      kind: 'features',
      data: { type: 'FeatureCollection', features },
      range: { start, end },
      area: {
        label: 'Trajectory extent',
        bbox: [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)],
      },
    },
    {
      id: `${params.id}-run`,
      label: `${params.model} run details`.slice(0, 120),
      kind: 'text',
      data: [
        {
          t: start,
          title: `${params.model} trajectory, run ${params.runDate}`,
          text:
            `Imported from a file made outside Action Stations; this app did not compute it.\n` +
            `Model: ${params.model}\nRun date: ${params.runDate}\n` +
            `Inputs: ${params.inputs || 'not stated'}\n` +
            `Output times: ${steps.length}, from ${start} to ${end}.`,
        },
      ],
      range: { start, end },
    },
  ]
}

export const trajectoryImportGenerator: SimulatedGenerator<TrajectoryImportParams> = {
  id: 'trajectory-import',
  label: 'Imported trajectory (a model run made outside the app)',
  params: TrajectoryImportParams,
  description:
    'Imports a trajectory computed outside the app, such as a GeoJSON from PyGNOME or WebGNOME. Writes, for each output time, the best-estimate and uncertainty outlines and the center of the oil, the track of the centers and a note that the app did not compute it.',
  toolkits: ['spill_plume'],
  example: {
    content: JSON.stringify({
      type: 'FeatureCollection',
      features: [0, 1].flatMap((step) =>
        [
          [-88.1, 30.3],
          [-88.097, 30.301],
          [-88.102, 30.303],
          [-88.099, 30.297],
        ].map(([lon, lat], i) => ({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [lon! + step * 0.02, lat! + step * 0.01] },
          properties: {
            current_time: 1793793600 + step * 3600,
            spill_type: i === 3 ? 'UNCERTAIN' : 'FORECAST',
          },
        })),
      ),
    }),
    model: 'WebGNOME',
    runDate: '2026-11-03',
    inputs: 'Wind from 135 degrees at 6 m/s; 4,200 bbl diesel over 4 hours',
    id: 'trajectory',
  } satisfies z.input<typeof TrajectoryImportParams>,
  fields: {
    content: {
      label: 'Trajectory file',
      help: 'The text of a GeoJSON file: a FeatureCollection or an array of them, with Point or MultiPoint features timed by current_time, time, timestamp, datetime or t. spill_type UNCERTAIN marks the uncertainty cloud.',
    },
    model: {
      label: 'Model',
      help: 'The model that made the file, such as WebGNOME or PyGNOME 1.1.',
    },
    runDate: { label: 'Run date', help: 'When the model was run, YYYY-MM-DD.' },
    inputs: {
      label: 'Model inputs',
      help: 'The winds, currents and release the run used, in your words (up to 400 characters).',
    },
    id: {
      label: 'Dataset name',
      help: 'Lowercase letters, digits and hyphens; a second import into the same scenario needs another name.',
    },
  },
  generate: importTrajectory,
}
