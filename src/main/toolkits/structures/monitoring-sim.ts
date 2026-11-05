// A simulated structural monitoring series (spec 0471 FR-7): a baseline with slow drift and
// noise, a failure that begins at a chosen time with a linear, accelerating or step shape,
// optional sensor dropouts, and the alarm and action crossings that follow. Parametric and
// deterministic on purpose; it is not a structural model. The ground truth it writes (the failure
// onset and each crossing) is what the warning-to-action metric compares decisions with.
import { z } from 'zod'
import { IsoDateTime } from '@shared/schemas/common'
import { SENSOR_TYPES } from '../../render/figures/structures/monitoring'
import { createStructuresRng } from './rng'

const MIN_MS = 60_000
const iso = (ms: number): string => new Date(ms).toISOString().replace('.000Z', 'Z')
const r2 = (v: number): number => Math.round(v * 100) / 100

export const MonitoringParams = z
  .object({
    sensorId: z.string().min(1).max(40).default('LC-14'),
    sensorType: z.enum(SENSOR_TYPES).default('shoring_load'),
    unit: z.string().min(1).max(20).default('kN'),
    location: z.string().min(1).max(120).default('level 8, east bay'),
    start: IsoDateTime,
    stepMinutes: z.number().int().min(1).max(60).default(10),
    durationHours: z.number().min(1).max(72).default(6),
    baseline: z.number().finite().default(120),
    /** Slow change per hour before the failure (curing, temperature, loading). */
    driftPerHour: z.number().finite().default(1),
    /** Standard deviation of the noise, in the unit. */
    noise: z.number().min(0).default(2),
    /** Hours after `start` that the failure begins; omit for a series with no failure. */
    failureOnsetHour: z.number().min(0).optional(),
    failureShape: z.enum(['linear', 'accelerating', 'step']).default('accelerating'),
    /** How far above the pre-failure level the reading is at the end of the series. */
    failureMagnitude: z.number().positive().default(190),
    /** Periods the sensor reports nothing (hours after `start`). */
    dropouts: z
      .array(z.object({ fromHour: z.number().min(0), toHour: z.number().positive() }))
      .max(6)
      .default([]),
    alarmLevel: z.number().finite().default(150),
    actionLevel: z.number().finite().default(180),
    seed: z
      .number()
      .int()
      .min(0)
      .max(2 ** 31)
      .default(7),
  })
  .refine((p) => p.actionLevel >= p.alarmLevel, {
    message: 'the action level is below the alarm level',
  })
  .refine((p) => p.dropouts.every((d) => d.toHour > d.fromHour), {
    message: 'a dropout ends before it starts',
  })
export type MonitoringParams = z.infer<typeof MonitoringParams>

export interface MonitoringSample {
  t: string
  /** Null during a dropout. */
  v: number | null
  /** What the sensor measured, kept even when a dropout hides it from the players. */
  raw: number
}

export interface MonitoringResult {
  samples: MonitoringSample[]
  onsetAt?: string
  alarmAt?: string
  actionAt?: string
  dropouts: { start: string; end: string }[]
}

/** The share of the failure magnitude reached `x` of the way from onset to the end (0..1). */
function failureShare(shape: MonitoringParams['failureShape'], x: number): number {
  if (x <= 0) return 0
  if (shape === 'step') return 1
  if (shape === 'linear') return Math.min(x, 1)
  return Math.min(x * x, 1)
}

export function simulateMonitoring(p: MonitoringParams): MonitoringResult {
  const rng = createStructuresRng(p.seed)
  const t0 = Date.parse(p.start)
  const steps = Math.floor((p.durationHours * 60) / p.stepMinutes)
  const onsetMs =
    p.failureOnsetHour === undefined ? undefined : t0 + p.failureOnsetHour * 60 * MIN_MS
  const endMs = t0 + steps * p.stepMinutes * MIN_MS
  const samples: MonitoringSample[] = []
  let alarmAt: string | undefined
  let actionAt: string | undefined
  for (let i = 0; i <= steps; i++) {
    const ms = t0 + i * p.stepMinutes * MIN_MS
    const hours = (ms - t0) / (60 * MIN_MS)
    const share =
      onsetMs === undefined
        ? 0
        : failureShare(p.failureShape, (ms - onsetMs) / Math.max(endMs - onsetMs, 1))
    const base = p.baseline + p.driftPerHour * hours
    const noise = p.noise * rng.normal()
    const value = r2(base + share * p.failureMagnitude + noise)
    const dropped = p.dropouts.some((d) => hours >= d.fromHour && hours < d.toHour)
    samples.push({ t: iso(ms), v: dropped ? null : value, raw: value })
    // The truth crossings use the sensor's own value, even if a dropout hides it from players.
    if (alarmAt === undefined && value >= p.alarmLevel) alarmAt = iso(ms)
    if (actionAt === undefined && value >= p.actionLevel) actionAt = iso(ms)
  }
  return {
    samples,
    ...(onsetMs === undefined ? {} : { onsetAt: iso(onsetMs) }),
    ...(alarmAt ? { alarmAt } : {}),
    ...(actionAt ? { actionAt } : {}),
    dropouts: p.dropouts.map((d) => ({
      start: iso(t0 + d.fromHour * 60 * MIN_MS),
      end: iso(t0 + d.toHour * 60 * MIN_MS),
    })),
  }
}
