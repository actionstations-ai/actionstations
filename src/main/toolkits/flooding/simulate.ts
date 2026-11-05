// Simulated flood events (spec 0454 FR-11). Parametric, deterministic and simple on purpose:
// a rise-and-fall shape for stage, a kinematic travel time between gauges, forecast issuances
// that can change category, a stage-to-extent step relation over a drawn floodplain and a rain
// response for a flash flood basin. It is not a hydrologic or hydraulic model, and every dataset
// it makes is labeled simulated by the framework (ADR-0076).
import { z } from 'zod'
import { IsoDateTime } from '@shared/schemas/common'
import { CategoryTableSchema } from '../../render/figures/flood/common'
import { categoryAtStage } from './lint'

const HOUR_MS = 3_600_000
const iso = (ms: number): string => new Date(ms).toISOString().replace('.000Z', 'Z')
const r2 = (v: number): number => Math.round(v * 100) / 100
const LonLat = z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)])
const GaugeId = z
  .string()
  .regex(/^[A-Za-z0-9]{3,10}$/, 'A gauge id is 3 to 10 letters and digits')
  .transform((s) => s.toLowerCase())

// ---- the stage shape --------------------------------------------------------------------------

/** Cosine rise from 0 to 1 over `riseH` hours, then a cosine recession to 0 over `fallH`. */
export function hydrographShape(t: number, riseH: number, fallH: number): number {
  if (t <= 0) return 0
  if (t <= riseH) return (1 - Math.cos((Math.PI * t) / riseH)) / 2
  const y = (t - riseH) / fallH
  return y >= 1 ? 0 : (1 + Math.cos(Math.PI * y)) / 2
}

// ---- river event ------------------------------------------------------------------------------

const SimGauge = z.object({
  id: GaugeId,
  name: z.string().min(1).max(80),
  /** Miles downstream of the first gauge (0 for the first). */
  mile: z.number().min(0).max(2000),
  baseStage: z.number().finite(),
  crestStage: z.number().finite(),
  categories: CategoryTableSchema.default({}),
  lonLat: LonLat.optional(),
})

const Issuance = z.object({
  /** Hours after `start` when this forecast is issued. */
  atHour: z.number().min(0),
  /** Forecast crest at the first gauge; other gauges scale it. Defaults to the true crest. */
  crestStage: z.number().finite().optional(),
  /** Hours after `start` at which the first gauge is forecast to crest. Defaults to the true time. */
  crestAtHour: z.number().min(0).optional(),
})

const FloodplainLevel = z.object({
  /** Stage at the reference gauge at which this extent is reached. */
  stage: z.number().finite(),
  ring: z.array(LonLat).min(3).max(2000),
})
const Asset = z.object({
  id: z.string().min(1).max(40),
  name: z.string().min(1).max(100),
  kind: z.enum(['structure', 'road', 'facility', 'population']),
  /** Stage at the reference gauge at which the asset floods. */
  floodsAtStage: z.number().finite(),
  /** How many it stands for (people for population, 1 otherwise). */
  count: z.number().int().min(1).max(1_000_000).default(1),
})

export const RiverEventParams = z
  .object({
    river: z.string().min(1).max(80),
    start: IsoDateTime,
    stepMinutes: z.number().int().min(15).max(360).default(60),
    durationHours: z.number().min(24).max(480).default(120),
    /** Hours from `start` to the crest at the first gauge. */
    crestAtHour: z.number().positive().max(400),
    recessionHours: z.number().positive().max(400).default(72),
    /** Flood wave speed in miles per hour (kinematic travel time between gauges). */
    waveSpeedMph: z.number().min(0.5).max(15).default(3),
    gauges: z.array(SimGauge).min(1).max(6),
    issuances: z.array(Issuance).max(8).default([]),
    floodplain: z.array(FloodplainLevel).max(12).default([]),
    assets: z.array(Asset).max(200).default([]),
    extentEveryHours: z.number().min(1).max(48).default(6),
  })
  .refine((p) => p.gauges.every((g) => g.crestStage >= g.baseStage), {
    message: 'each gauge crest must be at or above its base stage',
  })
  .refine((p) => p.gauges.every((g, i) => i === 0 || g.mile >= p.gauges[i - 1]!.mile), {
    message: 'list gauges from upstream to downstream (miles must not decrease)',
  })
  .refine((p) => new Set(p.gauges.map((g) => g.id)).size === p.gauges.length, {
    message: 'gauge ids must be unique',
  })
  .refine((p) => p.floodplain.every((l, i) => i === 0 || l.stage > p.floodplain[i - 1]!.stage), {
    message: 'floodplain levels must rise',
  })
export type RiverEventParams = z.infer<typeof RiverEventParams>
export type SimGaugeParams = z.infer<typeof SimGauge>

export interface SimPoint {
  t: string
  v: number
}
export interface SimSeries {
  gaugeId: string
  points: SimPoint[]
}

/** Hours of travel from the first gauge to this one. */
export const lagHours = (p: RiverEventParams, g: SimGaugeParams): number =>
  (g.mile - p.gauges[0]!.mile) / p.waveSpeedMph

function stageSeries(
  p: RiverEventParams,
  g: SimGaugeParams,
  crestAtHour: number,
  crest: number,
  fromHour: number,
  stepH: number,
  toHour: number,
  startValue?: number,
): SimPoint[] {
  const t0 = Date.parse(p.start)
  const lag = lagHours(p, g)
  const out: SimPoint[] = []
  for (let h = fromHour; h <= toHour + 1e-9; h += stepH) {
    const shape = hydrographShape(h - lag, crestAtHour, p.recessionHours)
    out.push({ t: iso(t0 + h * HOUR_MS), v: r2(g.baseStage + (crest - g.baseStage) * shape) })
  }
  if (startValue !== undefined && out.length) out[0] = { ...out[0]!, v: startValue }
  return out
}

/** The true stage at each gauge, oldest first; the first gauge crests at crestStage on schedule. */
export function riverSeries(p: RiverEventParams): SimSeries[] {
  const stepH = p.stepMinutes / 60
  return p.gauges.map((g) => ({
    gaugeId: g.id,
    points: stageSeries(p, g, p.crestAtHour, g.crestStage, 0, stepH, p.durationHours),
  }))
}

/** The hour at which a gauge's true stage is highest (the crest time, with travel time). */
export const crestHour = (p: RiverEventParams, g: SimGaugeParams): number =>
  p.crestAtHour + lagHours(p, g)

/** Forecasts issued during the event: for each issuance and gauge, a series from the issue time. */
export function forecastSeries(
  p: RiverEventParams,
): { gaugeId: string; n: number; issuedAt: string; points: SimPoint[] }[] {
  const out: { gaugeId: string; n: number; issuedAt: string; points: SimPoint[] }[] = []
  const truth = riverSeries(p)
  const first = p.gauges[0]!
  const trueRise = first.crestStage - first.baseStage
  p.issuances.forEach((iss, i) => {
    const crestAt = iss.crestAtHour ?? p.crestAtHour
    const ratio =
      trueRise === 0 ? 1 : ((iss.crestStage ?? first.crestStage) - first.baseStage) / trueRise
    for (const g of p.gauges) {
      const crest = g.baseStage + (g.crestStage - g.baseStage) * ratio
      const observedNow = truth
        .find((s) => s.gaugeId === g.id)!
        .points.find((pt) => pt.t === iso(Date.parse(p.start) + iss.atHour * HOUR_MS))?.v
      const to = Math.min(p.durationHours, crestAt + lagHours(p, g) + p.recessionHours * 0.5)
      const raw = forecastPoints(p, g, iss.atHour, crestAt, crest, to, observedNow)
      out.push({
        gaugeId: g.id,
        n: i + 1,
        issuedAt: iso(Date.parse(p.start) + iss.atHour * HOUR_MS),
        points: raw,
      })
    }
  })
  return out
}

/** Six-hourly forecast points: a blend from the reading at issuance up to the forecast shape. */
function forecastPoints(
  p: RiverEventParams,
  g: SimGaugeParams,
  atHour: number,
  crestAt: number,
  crest: number,
  toHour: number,
  observedNow: number | undefined,
): SimPoint[] {
  const t0 = Date.parse(p.start)
  const lag = lagHours(p, g)
  const pts: SimPoint[] = []
  for (let h = atHour; h <= toHour + 1e-9; h += 6) {
    const shape = hydrographShape(h - lag, crestAt, p.recessionHours)
    pts.push({ t: iso(t0 + h * HOUR_MS), v: r2(g.baseStage + (crest - g.baseStage) * shape) })
  }
  if (observedNow !== undefined && pts.length) {
    // The forecast starts from what was observed; the gap closes by the crest.
    const gap = observedNow - pts[0]!.v
    const span = Math.max(crestAt + lag - atHour, 1)
    pts.forEach((pt, k) => {
      const h = atHour + k * 6
      const w = Math.max(0, 1 - (h - atHour) / span)
      pts[k] = { ...pt, v: r2(pt.v + gap * w) }
    })
  }
  return pts
}

// ---- stage to extent and exposure ------------------------------------------------------------

export interface ExtentStep {
  t: string
  stage: number
  /** The floodplain level reached, if any. */
  level: number | undefined
  ring: [number, number][] | undefined
}

/** The extent at each step: the highest floodplain level whose stage the reference gauge reached. */
export function extentSteps(p: RiverEventParams, reference?: SimSeries): ExtentStep[] {
  if (!p.floodplain.length) return []
  const series = reference ?? riverSeries(p)[0]!
  const every = Math.max(1, Math.round((p.extentEveryHours * 60) / p.stepMinutes))
  return series.points
    .filter((_, i) => i % every === 0)
    .map((pt) => {
      const reached = [...p.floodplain].reverse().find((l) => l.stage <= pt.v)
      return { t: pt.t, stage: pt.v, level: reached?.stage, ring: reached?.ring }
    })
}

export interface Exposure {
  structure: number
  road: number
  facility: number
  population: number
}

/** What is flooded at a stage of the reference gauge. */
export function exposureAt(assets: readonly z.infer<typeof Asset>[], stage: number): Exposure {
  const out: Exposure = { structure: 0, road: 0, facility: 0, population: 0 }
  for (const a of assets) if (a.floodsAtStage <= stage) out[a.kind] += a.count
  return out
}

/** The category at a stage for a gauge's own table (re-exported for callers building labels). */
export const categoryFor = (g: SimGaugeParams, stage: number) =>
  categoryAtStage(g.categories, stage)

// ---- flash flood ------------------------------------------------------------------------------

export const FlashEventParams = z.object({
  basin: z.string().min(1).max(80),
  gauge: z.object({
    id: GaugeId,
    name: z.string().min(1).max(80),
    baseStage: z.number().finite(),
    peakStage: z.number().finite(),
    categories: CategoryTableSchema.default({}),
    lonLat: LonLat.optional(),
  }),
  start: IsoDateTime,
  stepMinutes: z.number().int().min(5).max(60).default(15),
  durationHours: z.number().min(2).max(48).default(12),
  /** Hours after `start` at which the heaviest rain falls. */
  rainPeakHour: z.number().min(0).max(40),
  rainDurationHours: z.number().min(0.5).max(24),
  rainTotalInches: z.number().positive().max(40),
  /** Minutes from the rain peak to the stage peak: small basins respond in under an hour. */
  responseLagMinutes: z.number().min(10).max(360).default(60),
  warning: z
    .object({
      issuedAtHour: z.number().min(0).max(40),
      validHours: z.number().positive().max(6).default(2),
      tag: z.enum(['base', 'considerable', 'catastrophic']).default('base'),
      ring: z.array(LonLat).min(3).max(2000),
    })
    .optional(),
})
export type FlashEventParams = z.infer<typeof FlashEventParams>

export function flashSeries(p: FlashEventParams): { rain: SimPoint[]; stage: SimPoint[] } {
  const t0 = Date.parse(p.start)
  const stepH = p.stepMinutes / 60
  const n = Math.floor(p.durationHours / stepH)
  const half = p.rainDurationHours / 2
  // Triangular rain over the duration, scaled to the total; rain per step in inches.
  const weights = Array.from({ length: n + 1 }, (_, i) => {
    const d = Math.abs(i * stepH - p.rainPeakHour)
    return d >= half ? 0 : 1 - d / half
  })
  const sum = weights.reduce((a, b) => a + b, 0) || 1
  const rain = weights.map((w, i) => ({
    t: iso(t0 + i * stepH * HOUR_MS),
    v: r2((w / sum) * p.rainTotalInches),
  }))
  // Stage: rain run through an exponential kernel whose time constant is the response lag.
  const tau = p.responseLagMinutes / 60
  let state = 0
  const raw = rain.map((r) => {
    state = state * Math.exp(-stepH / tau) + r.v
    return state
  })
  const peak = Math.max(...raw) || 1
  const stage = raw.map((s, i) => ({
    t: rain[i]!.t,
    v: r2(p.gauge.baseStage + ((p.gauge.peakStage - p.gauge.baseStage) * s) / peak),
  }))
  return { rain, stage }
}
