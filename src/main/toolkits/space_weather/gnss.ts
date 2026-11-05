// The GNSS and timing impact model (spec 0468 FR-9): horizontal error, satellites tracked, timing
// alarms and holdover remaining as simple functions of the Kp series and a scintillation
// duration after the peak, for a receiver class the user enters. It is an illustration for
// exercises, labeled simulated, and is not a prediction of real receiver performance.
import { z } from 'zod'
import type { ModeledSeries } from '@shared/schemas/metrics'

const HOUR_MS = 3_600_000
const STEP_MS = 15 * 60_000
const iso = (ms: number): string => new Date(ms).toISOString().replace('.000Z', 'Z')
const r1 = (v: number): number => Math.round(v * 10) / 10
const r2 = (v: number): number => Math.round(v * 100) / 100

export const RECEIVER_CLASSES = [
  'single_frequency',
  'multi_frequency',
  'disciplined_oscillator',
] as const

export const Receiver = z
  .object({
    /** The site or receiver as decisions name it. */
    name: z.string().min(1).max(80),
    class: z.enum(RECEIVER_CLASSES),
    /** Hours of holdover a GNSS-disciplined oscillator can ride through. */
    holdoverHours: z.number().min(0.5).max(240).optional(),
    /** Horizontal error above which GNSS is not usable, in meters. */
    errorLimitM: z.number().min(0.1).max(100).default(5),
  })
  .refine((r) => r.class !== 'disciplined_oscillator' || r.holdoverHours !== undefined, {
    message: 'a disciplined oscillator needs its holdover in hours',
    path: ['holdoverHours'],
  })
export type Receiver = z.infer<typeof Receiver>

/** Per class: quiet error, extra error at full disturbance, and satellites lost. */
const CLASS_MODEL = {
  single_frequency: { base: 2.5, gain: 18, loss: 5 },
  multi_frequency: { base: 0.5, gain: 6, loss: 3 },
  disciplined_oscillator: { base: 0.5, gain: 8, loss: 4 },
} as const

export interface GnssSeries {
  receiver: Receiver
  error: { t: string; v: number }[]
  satellites: { t: string; v: number }[]
  /** Holdover remaining in hours, only for a disciplined oscillator. */
  holdover: { t: string; v: number }[]
  alarms: { t: string; label: string }[]
  /** When holdover ran out, if it did. */
  holdoverExpiredAt?: string
  /** Hours of GNSS loss minus the holdover, per time: crosses 0 when holdover expires. */
  overrun: { t: string; v: number }[]
}

const kpDisturbance = (kp: number): number => Math.min(1, Math.max(0, (kp - 4) / 5))

/** Disturbance from 0 to 1: the Kp step, held up after the peak for the scintillation hours. */
function disturbanceAt(
  kp: readonly { t: string; v: number }[],
  timeMs: number,
  scintH: number,
): number {
  let current = 0
  let peak = 0
  let peakEnd = 0
  for (const p of kp) {
    const start = Date.parse(p.t)
    const d = kpDisturbance(p.v)
    if (timeMs >= start && timeMs < start + 3 * HOUR_MS) current = d
    if (d > peak) {
      peak = d
      peakEnd = start + 3 * HOUR_MS
    }
  }
  const fade = Math.max(0, 1 - (timeMs - peakEnd) / (scintH * HOUR_MS))
  return Math.max(current, timeMs > peakEnd ? peak * fade : 0)
}

export function gnssModel(
  kp: readonly { t: string; v: number }[],
  receiver: Receiver,
  scintillationHours: number,
): GnssSeries {
  const m = CLASS_MODEL[receiver.class]
  const start = Date.parse(kp[0]!.t)
  const end = Date.parse(kp.at(-1)!.t) + 3 * HOUR_MS + scintillationHours * HOUR_MS
  const out: GnssSeries = {
    receiver,
    error: [],
    satellites: [],
    holdover: [],
    alarms: [],
    overrun: [],
  }
  let lossH = 0
  for (let t = start; t <= end; t += STEP_MS) {
    const d = disturbanceAt(kp, t, scintillationHours)
    const error = r1(m.base + m.gain * d)
    const sats = Math.max(2, Math.round(10 - m.loss * 2 * d))
    const unusable = error > receiver.errorLimitM || sats < 4
    if (unusable) lossH += STEP_MS / HOUR_MS
    if (unusable && !out.alarms.length)
      out.alarms.push({ t: iso(t), label: 'First timing alarm: GNSS not usable' })
    out.error.push({ t: iso(t), v: error })
    out.satellites.push({ t: iso(t), v: sats })
    if (receiver.holdoverHours !== undefined) {
      const left = Math.max(0, receiver.holdoverHours - lossH)
      out.holdover.push({ t: iso(t), v: r2(left) })
      out.overrun.push({ t: iso(t), v: r2(lossH - receiver.holdoverHours) })
      if (left === 0 && !out.holdoverExpiredAt) {
        out.holdoverExpiredAt = iso(t)
        out.alarms.push({ t: iso(t), label: 'Holdover expired' })
      }
    }
  }
  return out
}

/** The per-site series the threshold timing metric reads: hours of loss beyond holdover. */
export function holdoverZones(series: readonly GnssSeries[]): ModeledSeries[] {
  return series
    .filter((s) => s.receiver.holdoverHours !== undefined)
    .map((s) => ({
      zone: s.receiver.name,
      quantity: 'hours of GNSS loss beyond the holdover',
      points: s.overrun.map((p) => ({ time: p.t, value: p.v })),
    }))
}
