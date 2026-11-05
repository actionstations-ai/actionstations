// Freezer or incubator alarm series (spec 0466 FR-8): a failure (compressor, door left ajar, power
// loss), the warming curve that follows, the alarm, the call-out and its delay, optional alarm
// failure and the register of samples at risk. Parametric and seeded; the warming curve is
// Newton's law of cooling toward room temperature with a time constant the designer sets. The
// viability limit is a designer's exercise parameter, never a biology claim.
import { z } from 'zod'
import { makeRng } from '../../epidemiology/simulate/rng'

export const FAILURES = ['compressor_failure', 'door_ajar', 'power_loss'] as const
const MIN_MS = 60_000
const iso = (ms: number): string => new Date(ms).toISOString().replace('.000Z', 'Z')

export const AlarmParams = z
  .object({
    seed: z.number().int().default(1),
    unit: z.string().min(1).max(80).default('Freezer 3'),
    failure: z.enum(FAILURES).default('compressor_failure'),
    /** When the failure starts (a Saturday night by default). */
    failureAt: z.iso.datetime().default('2026-10-24T22:30:00Z'),
    durationHours: z.number().min(1).max(72).default(24),
    stepMinutes: z.number().int().min(1).max(30).default(5),
    setPointC: z.number().default(-80),
    ambientC: z.number().default(22),
    alarmThresholdC: z.number().default(-65),
    /** The designer's limit for the samples in this unit: the "alarm to loss" window ends here. */
    limitC: z.number().default(-50),
    /** Hours for the contents to close 63 percent of the gap to room temperature. */
    warmingTimeConstantHours: z.number().min(0.5).max(100).default(10),
    /** Minutes after the failure that the cause ends (door closed, power restored, unit repaired). */
    recoverAfterMin: z.number().min(1).max(4000).optional(),
    recoveryTimeConstantHours: z.number().min(0.25).max(48).default(3),
    /** The alarm does not sound or does not reach anyone. */
    alarmFails: z.boolean().default(false),
    /** Minutes from the alarm to the first call-out attempt. */
    calloutDelayMin: z.number().min(0).max(1440).default(15),
    /** Minutes from the alarm until someone acknowledges it; absent: never inside the window. */
    acknowledgeAfterMin: z.number().min(0).max(4000).optional(),
    sampleCount: z.number().int().min(1).max(60).default(24),
    irreplaceableFraction: z.number().min(0).max(1).default(0.25),
  })
  .refine((p) => p.alarmThresholdC > p.setPointC && p.limitC > p.alarmThresholdC, {
    message: 'the alarm threshold must sit above the set point and the limit above the threshold',
  })
  .refine((p) => p.ambientC > p.limitC, { message: 'room temperature must be above the limit' })
export type AlarmParams = z.infer<typeof AlarmParams>

export type AlarmEventKind =
  'failure_started' | 'alarm_sounded' | 'call_out' | 'acknowledged' | 'limit_reached' | 'restored'

export interface AlarmEvent {
  time: string
  kind: AlarmEventKind
}

export interface SampleRow {
  sample: string
  location: string
  value: 'replaceable' | 'irreplaceable'
  backup: 'none' | 'partial' | 'full'
}

export interface AlarmRun {
  points: { time: string; c: number }[]
  events: AlarmEvent[]
  samples: SampleRow[]
  /** The time the limit is first reached, if it is. */
  limitReachedAt: string | undefined
}

/** The temperature at `tMin` minutes after the failure, before noise. */
function curve(p: AlarmParams, tMin: number): number {
  const tauMin = p.warmingTimeConstantHours * 60
  const warm = (m: number): number =>
    p.ambientC + (p.setPointC - p.ambientC) * Math.exp(-m / tauMin)
  if (tMin < 0) return p.setPointC
  const recover = p.recoverAfterMin ?? (p.failure === 'door_ajar' ? 30 : undefined)
  if (recover === undefined || tMin <= recover) return warm(tMin)
  return (
    p.setPointC +
    (warm(recover) - p.setPointC) * Math.exp(-(tMin - recover) / (p.recoveryTimeConstantHours * 60))
  )
}

export function runAlarm(raw: z.input<typeof AlarmParams>): AlarmRun {
  const p = AlarmParams.parse(raw)
  const rng = makeRng(p.seed)
  const t0 = Date.parse(p.failureAt)
  const lead = 60 // an hour of normal readings before the failure
  const total = lead + p.durationHours * 60
  const points: AlarmRun['points'] = []
  const temps: number[] = []
  for (let m = -lead; m <= total - lead; m += p.stepMinutes) {
    const c =
      Math.round((curve(p, m) + (m < 0 ? rng.uniform(-0.4, 0.4) : rng.uniform(-0.15, 0.15))) * 10) /
      10
    temps.push(c)
    points.push({ time: iso(t0 + m * MIN_MS), c })
  }
  const events: AlarmEvent[] = [
    { time: p.failureAt.replace('.000Z', 'Z'), kind: 'failure_started' },
  ]
  const firstAbove = (limit: number): number | undefined => {
    const i = temps.findIndex((c, k) => points[k]!.time >= iso(t0) && c >= limit)
    return i < 0 ? undefined : Date.parse(points[i]!.time)
  }
  const alarmAt = p.alarmFails ? undefined : firstAbove(p.alarmThresholdC)
  if (alarmAt !== undefined) {
    events.push({ time: iso(alarmAt), kind: 'alarm_sounded' })
    events.push({ time: iso(alarmAt + p.calloutDelayMin * MIN_MS), kind: 'call_out' })
    if (p.acknowledgeAfterMin !== undefined)
      events.push({ time: iso(alarmAt + p.acknowledgeAfterMin * MIN_MS), kind: 'acknowledged' })
  }
  const limitAt = firstAbove(p.limitC)
  if (limitAt !== undefined) events.push({ time: iso(limitAt), kind: 'limit_reached' })
  const recover = p.recoverAfterMin ?? (p.failure === 'door_ajar' ? 30 : undefined)
  if (recover !== undefined) {
    const back = points.findIndex(
      (pt, k) => Date.parse(pt.time) > t0 + recover * MIN_MS && temps[k]! <= p.alarmThresholdC,
    )
    if (back >= 0) events.push({ time: points[back]!.time, kind: 'restored' })
  }
  events.sort((a, b) => a.time.localeCompare(b.time))
  return {
    points,
    events,
    samples: sampleRegister(p),
    limitReachedAt: limitAt === undefined ? undefined : iso(limitAt),
  }
}

/** A register of fictional samples; ids are plain lots, never named agents. */
function sampleRegister(p: AlarmParams): SampleRow[] {
  const rng = makeRng(p.seed + 101)
  const irreplaceable = Math.round(p.sampleCount * p.irreplaceableFraction)
  return Array.from({ length: p.sampleCount }, (_, i) => {
    const value = i < irreplaceable ? ('irreplaceable' as const) : ('replaceable' as const)
    const roll = rng.next()
    return {
      sample: `${p.unit.replace(/\s+/g, '')}-S${String(i + 1).padStart(3, '0')}`,
      location: `${p.unit}, rack ${1 + Math.floor(i / 8)}`,
      value,
      backup:
        roll < 0.5 ? ('none' as const) : roll < 0.8 ? ('partial' as const) : ('full' as const),
    }
  })
}
