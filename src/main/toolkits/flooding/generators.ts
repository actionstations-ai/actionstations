// The flooding generators (spec 0454 FR-11), registered with the case-data framework, which
// labels everything they make as simulated. Each turns validated parameters into datasets: gauge
// records, stage series, forecasts per issuance, an extent per time step with exposure counts,
// and for a flash flood the rain, the basin response and the warning polygon.
import { z } from 'zod'
import { IsoDateTime } from '@shared/schemas/common'
import type { CategoryTableSchema } from '../../render/figures/flood/common'
import { categoryOf } from '../../render/figures/flood/common'
import type { GeneratedDataset, SimulatedGenerator } from '../../case-data/generators'
import {
  FlashEventParams,
  RiverEventParams,
  exposureAt,
  extentSteps,
  flashSeries,
  forecastSeries,
  riverSeries,
  type SimGaugeParams,
  type SimPoint,
} from './simulate'

const closeRing = (ring: readonly [number, number][]): [number, number][] => {
  const first = ring[0]!
  const last = ring.at(-1)!
  return first[0] === last[0] && first[1] === last[1] ? [...ring] : [...ring, first]
}

const range = (pts: readonly SimPoint[]) =>
  pts.length ? { start: pts[0]!.t, end: pts.at(-1)!.t } : undefined

function gaugeDataset(
  g: { id: string; name: string; categories: z.infer<typeof CategoryTableSchema> },
  lonLat: [number, number],
): GeneratedDataset {
  const cats: Record<string, number> = {}
  for (const [k, v] of Object.entries(g.categories)) if (v !== undefined) cats[k] = v
  if (cats.flood === undefined && cats.minor !== undefined) cats.flood = cats.minor
  return {
    id: `gauge-${g.id}`,
    kind: 'features',
    label: `${g.name} (${g.id.toUpperCase()}): gauge record`,
    unit: 'ft',
    data: {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: lonLat },
          properties: {
            kind: 'flood_gauge',
            lid: g.id.toUpperCase(),
            name: g.name,
            usgsId: null,
            timeZone: null,
            unit: 'ft',
            categories: cats,
            historicCrests: [],
            upstreamLid: null,
            downstreamLid: null,
            rating: [],
          },
        },
      ],
    },
  }
}

const gaugeLonLat = (g: SimGaugeParams, i: number): [number, number] =>
  g.lonLat ?? [r4(-90 + g.mile * 0.014), r4(38 - i * 0.01)]
const r4 = (v: number): number => Math.round(v * 1e4) / 1e4

export const riverEventGenerator: SimulatedGenerator<z.infer<typeof RiverEventParams>> = {
  id: 'flood-river-event',
  label: 'Simulated river flood (rise and fall, forecasts, extent)',
  params: RiverEventParams,
  generate(p) {
    const out: GeneratedDataset[] = []
    const truth = riverSeries(p)
    p.gauges.forEach((g, i) => {
      out.push(gaugeDataset(g, gaugeLonLat(g, i)))
      const s = truth.find((t) => t.gaugeId === g.id)!
      out.push({
        id: `stage-${g.id}`,
        kind: 'series',
        label: `${g.name} (${g.id.toUpperCase()}): stage, simulated`,
        data: s.points,
        unit: 'ft',
        ...(range(s.points) ? { range: range(s.points)! } : {}),
      })
    })
    for (const f of forecastSeries(p)) {
      const g = p.gauges.find((x) => x.id === f.gaugeId)!
      out.push({
        id: `forecast-${f.gaugeId}-${f.n}`,
        kind: 'series',
        label: `${g.name}: forecast ${f.n} issued ${f.issuedAt}, simulated`,
        data: f.points,
        unit: 'ft',
        ...(range(f.points) ? { range: range(f.points)! } : {}),
      })
    }
    const steps = extentSteps(p, truth[0])
    if (steps.length) {
      const exposure = steps.map((s) => ({ s, e: exposureAt(p.assets, s.stage) }))
      out.push({
        id: 'inundation-extent',
        kind: 'features',
        label: `Flood extent along ${p.river}, simulated illustration (not a hazard map)`,
        data: {
          type: 'FeatureCollection',
          features: exposure
            .filter(({ s }) => s.ring)
            .map(({ s, e }, i, all) => ({
              type: 'Feature',
              geometry: { type: 'Polygon', coordinates: [closeRing(s.ring!)] },
              properties: {
                kind: 'simulated_extent',
                start: s.t,
                end: all[i + 1]?.s.t ?? s.t,
                stage: s.stage,
                level: s.level,
                exposure: e,
              },
            })),
        },
      })
      out.push({
        id: 'exposure',
        kind: 'series',
        label: `Exposure by time at the reference gauge, simulated`,
        data: exposure.map(({ s, e }) => ({
          t: s.t,
          v: {
            structures: e.structure,
            roads: e.road,
            facilities: e.facility,
            population: e.population,
          },
        })),
        unit: 'count',
      })
    }
    return out
  },
}

export const flashEventGenerator: SimulatedGenerator<z.infer<typeof FlashEventParams>> = {
  id: 'flood-flash-event',
  label: 'Simulated flash flood (rain, small-basin response, warning polygon)',
  params: FlashEventParams,
  generate(p) {
    const { rain, stage } = flashSeries(p)
    const g = p.gauge
    const out: GeneratedDataset[] = [
      gaugeDataset(g, g.lonLat ?? [-90, 38]),
      {
        id: `rain-${g.id}`,
        kind: 'series',
        label: `${p.basin}: rainfall per period, simulated`,
        data: rain,
        unit: 'in',
        range: range(rain)!,
      },
      {
        id: `stage-${g.id}`,
        kind: 'series',
        label: `${g.name} (${g.id.toUpperCase()}): stage, simulated`,
        data: stage,
        unit: 'ft',
        range: range(stage)!,
      },
    ]
    if (p.warning) {
      const t0 = Date.parse(p.start)
      const issued = new Date(t0 + p.warning.issuedAtHour * 3_600_000)
        .toISOString()
        .replace('.000Z', 'Z')
      const expires = new Date(t0 + (p.warning.issuedAtHour + p.warning.validHours) * 3_600_000)
        .toISOString()
        .replace('.000Z', 'Z')
      out.push({
        id: 'flash-flood-warning',
        kind: 'features',
        label: `Flash flood warning polygon, ${p.basin}, simulated`,
        data: {
          type: 'FeatureCollection',
          features: [
            {
              type: 'Feature',
              geometry: { type: 'Polygon', coordinates: [closeRing(p.warning.ring)] },
              properties: {
                kind: 'flash_flood_warning',
                tag: p.warning.tag,
                start: issued,
                end: expires,
                peakCategory: categoryOf(g.categories, g.peakStage),
              },
            },
          ],
        },
      })
    }
    return out
  },
}

const ReplayParams = z.object({
  gauge: z.object({
    id: z
      .string()
      .regex(/^[A-Za-z0-9]{3,10}$/)
      .transform((s) => s.toLowerCase()),
    name: z.string().min(1).max(80),
  }),
  /** The observed series of the real event, oldest first. */
  observed: z
    .array(z.object({ t: IsoDateTime, v: z.number().finite() }))
    .min(3)
    .max(1500),
  issuances: z
    .array(
      z.object({
        /** Hours after the first observation. */
        atHour: z.number().min(0),
        /** Feet the forecast crest is off by (negative: too low). The error fades after the crest. */
        crestBiasFt: z.number().min(-30).max(30).default(0),
      }),
    )
    .min(1)
    .max(8),
})
export type ReplayParams = z.infer<typeof ReplayParams>

/** A value of the observed series at a time, linearly interpolated, clamped at the ends. */
function at(obs: readonly { t: number; v: number }[], t: number): number {
  if (t <= obs[0]!.t) return obs[0]!.v
  const last = obs.at(-1)!
  if (t >= last.t) return last.v
  const j = obs.findIndex((o) => o.t >= t)
  const a = obs[j - 1]!
  const b = obs[j]!
  return a.v + ((b.v - a.v) * (t - a.t)) / (b.t - a.t)
}

/** Forecasts for a replayed real event built from its observed rise (the real forecasts are not archived). */
export function replayForecasts(
  p: ReplayParams,
): { n: number; issuedAt: string; points: SimPoint[] }[] {
  const obs = [...p.observed].map((o) => ({ t: Date.parse(o.t), v: o.v })).sort((a, b) => a.t - b.t)
  const crest = obs.reduce((a, b) => (b.v > a.v ? b : a))
  const end = obs.at(-1)!.t
  return p.issuances.map((iss, i) => {
    const t0 = obs[0]!.t + iss.atHour * 3_600_000
    const points: SimPoint[] = []
    for (let t = t0; t <= Math.min(end, crest.t + 48 * 3_600_000) + 1; t += 6 * 3_600_000) {
      const toCrest = Math.max(crest.t - t0, 1)
      const w =
        t <= crest.t
          ? Math.min(1, (t - t0) / toCrest)
          : Math.max(0, 1 - (t - crest.t) / (48 * 3_600_000))
      points.push({
        t: new Date(t).toISOString().replace('.000Z', 'Z'),
        v: Math.round((at(obs, t) + iss.crestBiasFt * w) * 100) / 100,
      })
    }
    return { n: i + 1, issuedAt: new Date(t0).toISOString().replace('.000Z', 'Z'), points }
  })
}

export const replayForecastGenerator: SimulatedGenerator<ReplayParams> = {
  id: 'flood-replay-forecast',
  label: 'Simulated forecasts for a replayed event (built from its observed rise)',
  params: ReplayParams,
  generate(p) {
    return replayForecasts(p).map((f) => ({
      id: `forecast-${p.gauge.id}-${f.n}`,
      kind: 'series' as const,
      label: `${p.gauge.name}: simulated forecast ${f.n} issued ${f.issuedAt}`,
      data: f.points,
      unit: 'ft',
      ...(range(f.points) ? { range: range(f.points)! } : {}),
    }))
  },
}
