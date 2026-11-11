// Simulated space weather events (spec 0468 FR-8). Parametric, deterministic and simple on
// purpose: a flare with a fast rise and slow decay, a proton event rise and decay, a solar wind
// step at CME arrival, a Kp trajectory by three-hour interval that peaks at the stated G level, a
// magnetometer disturbance, a GIC series from one stated relation, and the SWPC message sequence
// in order (watch, warning, alert, summary). It is not a physical model; the framework labels
// everything it makes as simulated (ADR-0076) and the labels here say so as well.
import { z } from 'zod'
import { IsoDateTime } from '@shared/schemas/common'
import { gnssModel, Receiver, type GnssSeries } from './gnss'

const HOUR_MS = 3_600_000
const MIN_MS = 60_000
const AU_KM = 149_600_000
const iso = (ms: number): string => new Date(ms).toISOString().replace('.000Z', 'Z')
const r2 = (v: number): number => Math.round(v * 100) / 100

/** Kp at the peak of each G level. */
export const PEAK_KP_FOR_G = [0, 5, 6, 7, 8, 9] as const

export const SpaceEventParams = z.object({
  /** Time of the flare (the eruption); everything else follows from it. */
  flareTime: IsoDateTime,
  /** Peak GOES X-ray class of the flare, such as M5 or X2.1. */
  flareClass: z.string().regex(/^[MX]\d{1,2}(\.\d)?$/, 'A class like M5 or X2.1'),
  /** Peak S level of the radiation storm, 0 for none. */
  peakS: z.number().int().min(0).max(5).default(0),
  /** Peak G level of the geomagnetic storm, 0 for none. */
  peakG: z.number().int().min(0).max(5),
  /** CME speed in km/s; the transit time follows from it. */
  cmeSpeedKmS: z.number().min(300).max(3500).default(1400),
  /** The arrival window is plus or minus this many hours around the stated arrival. */
  arrivalUncertaintyHours: z.number().min(1).max(24).default(6),
  /** Hours the storm takes to fall from its peak to the quiet level. */
  stormDurationHours: z.number().min(6).max(72).default(24),
  /** Kp at which the operating procedure's condition is met. */
  conditionKp: z.number().int().min(4).max(9).default(7),
  /** Ground conductivity factor for the GIC relation (1 is the reference). */
  groundConductivityFactor: z.number().min(0.1).max(5).default(1),
  /** The monitored transformer or substation. */
  site: z.string().min(1).max(80).default('Harbor 345 kV T2'),
  /** GNSS receivers to run the impact model for. */
  receivers: z.array(Receiver).max(8).default([]),
  /** Hours the ionosphere stays disturbed after the Kp peak (days at G4 and above). */
  scintillationHours: z.number().min(0).max(240).optional(),
})
export type SpaceEventParams = z.infer<typeof SpaceEventParams>

export interface TimedValue {
  t: string
  v: number
}

/** Geometry of an event: the clock times everything is built from. */
export function eventClock(p: SpaceEventParams) {
  const flare = Date.parse(p.flareTime)
  const transitH = AU_KM / p.cmeSpeedKmS / 3600
  const arrival = Math.round((flare + transitH * HOUR_MS) / MIN_MS) * MIN_MS
  const peak = arrival + 6 * HOUR_MS
  return { flare, transitH, arrival, peak, end: peak + p.stormDurationHours * HOUR_MS }
}

function flareBase(cls: string): number {
  return (cls[0] === 'X' ? 1e-4 : 1e-5) * Number(cls.slice(1))
}

/** X-ray flux in W/m2 every 5 minutes from two hours before to 12 hours after the flare. */
export function xraySeries(p: SpaceEventParams): TimedValue[] {
  const { flare } = eventClock(p)
  const peak = flareBase(p.flareClass)
  const out: TimedValue[] = []
  for (let m = -120; m <= 720; m += 5) {
    const background = 3e-6 + 4e-7 * Math.sin(m / 45)
    const x = m < 0 ? 0 : m < 18 ? peak * (m / 18) : peak * Math.exp(-(m - 18) / 55)
    out.push({ t: iso(flare + m * MIN_MS), v: Number((background + x).toPrecision(4)) })
  }
  return out
}

/** The highest 10 MeV proton flux of an S level: S1 starts at 10 pfu, each level ten times more. */
const peakFluxForS = (s: number): number => (s === 0 ? 3 : 10 ** s * 1.8)

/** Proton flux in pfu hourly for 72 hours from the flare: rise over about 14 hours, then decay. */
export function protonSeries(p: SpaceEventParams): TimedValue[] {
  const { flare } = eventClock(p)
  const peak = peakFluxForS(p.peakS)
  const out: TimedValue[] = []
  for (let h = 0; h <= 72; h++) {
    const v =
      h < 14
        ? 0.4 + (peak - 0.4) * (Math.max(0, h - 1) / 13) ** 1.6
        : peak * Math.exp(-(h - 14) / 12)
    out.push({ t: iso(flare + h * HOUR_MS), v: r2(Math.max(0.3, v)) })
  }
  return out
}

/** Solar wind speed in km/s every 10 minutes around the arrival: quiet, a step, then slow decay. */
export function solarWindSeries(p: SpaceEventParams): TimedValue[] {
  const { arrival } = eventClock(p)
  const out: TimedValue[] = []
  for (let m = -360; m <= 1080; m += 10) {
    const quiet = 410 + 12 * Math.sin(m / 70)
    const step = m < 0 ? 0 : (p.cmeSpeedKmS - 420) * 0.55 * Math.exp(-Math.max(0, m - 60) / 420)
    out.push({ t: iso(arrival + m * MIN_MS), v: Math.round(quiet + step) })
  }
  return out
}

/** The storm envelope: 0 before arrival, a rise over three hours to 1 at the peak, then decay. */
export function stormEnvelope(p: SpaceEventParams, timeMs: number): number {
  const { arrival, peak } = eventClock(p)
  if (timeMs < arrival) return 0
  if (timeMs < peak) return ((timeMs - arrival) / (peak - arrival)) ** 0.7
  return Math.exp(-((timeMs - peak) / HOUR_MS) / (p.stormDurationHours / 2.5))
}

const toThirds = (v: number): number => Math.round(v * 3) / 3

/**
 * Kp by three-hour UTC interval, from six hours before arrival until the storm has fallen.
 * The interval that holds the peak is set to the peak Kp of the stated G level, so the
 * trajectory and the stated level agree; no interval goes above it.
 */
export function kpSeries(p: SpaceEventParams): TimedValue[] {
  const { arrival, peak, end } = eventClock(p)
  const peakKp = PEAK_KP_FOR_G[p.peakG] ?? 0
  const base = 2
  const start = Math.floor((arrival - 6 * HOUR_MS) / (3 * HOUR_MS)) * 3 * HOUR_MS
  const peakStart = Math.floor(peak / (3 * HOUR_MS)) * 3 * HOUR_MS
  const out: TimedValue[] = []
  for (let t = start; t <= end + 3 * HOUR_MS; t += 3 * HOUR_MS) {
    const mid = t + 1.5 * HOUR_MS
    const level = base + (Math.max(peakKp, base) - base) * stormEnvelope(p, mid)
    const kp = t === peakStart ? peakKp : Math.min(toThirds(level), Math.max(peakKp - 1 / 3, base))
    out.push({ t: iso(t), v: Number(Math.max(0, Math.min(9, kp)).toFixed(2)) })
  }
  return out
}

/** H component deviation in nT every 10 minutes: scale grows with G, with fast fluctuations. */
export function magnetometerSeries(p: SpaceEventParams): TimedValue[] {
  const { arrival, end } = eventClock(p)
  const scale = -[0, 100, 180, 300, 520, 900][p.peakG]!
  const out: TimedValue[] = []
  for (let t = arrival - 2 * HOUR_MS; t <= end; t += 10 * MIN_MS) {
    const k = (t - arrival) / (10 * MIN_MS)
    const e = stormEnvelope(p, t)
    const wobble = 0.55 + 0.45 * Math.sin(k / 2.2) + 0.2 * Math.sin(k / 0.9)
    out.push({ t: iso(t), v: r2(scale * e * wobble + 4 * Math.sin(k / 3)) })
  }
  return out
}

/** nT per minute at the reference ground conductivity to amperes of neutral current. */
export const GIC_AMPS_PER_NT_MIN = 3

/**
 * Neutral current in amperes from the rate of change of the magnetometer series: one stated
 * relation, GIC = 3 A per (nT/min) x ground conductivity factor, for exercise consistency.
 * It is not a power flow calculation and not the current at any real transformer.
 */
export function gicSeries(p: SpaceEventParams, mag: readonly TimedValue[]): TimedValue[] {
  return mag.map((pt, i) => {
    const prev = mag[Math.max(0, i - 1)]!
    const dtMin = Math.max(1, (Date.parse(pt.t) - Date.parse(prev.t)) / MIN_MS)
    const rate = Math.abs(pt.v - prev.v) / dtMin
    return { t: pt.t, v: r2(1.5 + rate * GIC_AMPS_PER_NT_MIN * p.groundConductivityFactor) }
  })
}

export interface SimMessage {
  time: string
  code: string
  kind: 'WATCH' | 'WARNING' | 'ALERT' | 'SUMMARY'
  headline: string
}

/** The first time the Kp series reaches a value, or undefined. */
export function firstKpAtLeast(kp: readonly TimedValue[], value: number): string | undefined {
  return kp.find((x) => x.v >= value)?.t
}

/** The SWPC geomagnetic watch code and headline for a predicted G level (WATA99 is G4 or greater). */
export function watchForG(g: number): { code: string; headline: string } {
  if (g >= 4)
    return { code: 'WATA99', headline: 'Geomagnetic Storm Category G4 or Greater Predicted' }
  const code = ['WATA20', 'WATA30', 'WATA50'][Math.max(1, g) - 1]!
  return { code, headline: `Geomagnetic Storm Category G${Math.max(1, g)} Predicted` }
}

/**
 * The SWPC message sequence in the right order with plausible lead times, using the codes and
 * titles of the SWPC product list: a watch for the predicted G level about a day ahead of
 * arrival (never before the eruption is seen), a sudden impulse warning an hour before the
 * shock and its summary when it arrives, a K-index warning (WARK04 to WARK07, the last meaning
 * 7 or greater), and an alert for each K-index from 5 to 9 when it is first reached. The text is
 * a headline only; the template writes the product.
 */
export function messageSequence(p: SpaceEventParams, kp: readonly TimedValue[]): SimMessage[] {
  if (p.peakG === 0) return []
  const { flare, arrival } = eventClock(p)
  const peakKp = PEAK_KP_FOR_G[p.peakG]!
  const warnK = Math.min(7, Math.max(4, peakKp))
  const watch = watchForG(p.peakG)
  const out: SimMessage[] = [
    {
      time: iso(
        Math.min(arrival - 2 * HOUR_MS, Math.max(flare + 3 * HOUR_MS, arrival - 24 * HOUR_MS)),
      ),
      code: watch.code,
      kind: 'WATCH',
      headline: watch.headline,
    },
    {
      time: iso(arrival - HOUR_MS),
      code: 'WARSUD',
      kind: 'WARNING',
      headline: 'Geomagnetic Sudden Impulse expected',
    },
    {
      time: iso(arrival - 30 * MIN_MS),
      code: `WARK0${warnK}`,
      kind: 'WARNING',
      headline: `Geomagnetic K-index of ${warnK}${warnK === 7 ? ' or greater' : ''} expected`,
    },
    {
      time: iso(arrival + 15 * MIN_MS),
      code: 'SUMSUD',
      kind: 'SUMMARY',
      headline: 'Geomagnetic Sudden Impulse',
    },
  ]
  for (let k = 5; k <= peakKp; k++) {
    const at = firstKpAtLeast(kp, k)
    if (at)
      out.push({
        time: at,
        code: `ALTK0${k}`,
        kind: 'ALERT',
        headline: `Geomagnetic K-index of ${k}`,
      })
  }
  return out.sort((a, b) => Date.parse(a.time) - Date.parse(b.time))
}

export interface SimulatedEvent {
  clock: ReturnType<typeof eventClock>
  xray: TimedValue[]
  proton: TimedValue[]
  wind: TimedValue[]
  kp: TimedValue[]
  magnetometer: TimedValue[]
  gic: TimedValue[]
  messages: SimMessage[]
  gnss: GnssSeries[]
}

export function simulateEvent(p: SpaceEventParams): SimulatedEvent {
  const kp = kpSeries(p)
  const magnetometer = magnetometerSeries(p)
  const clock = eventClock(p)
  const scint = p.scintillationHours ?? (p.peakG >= 4 ? 48 : p.peakG >= 2 ? 12 : 3)
  return {
    clock,
    xray: xraySeries(p),
    proton: protonSeries(p),
    wind: solarWindSeries(p),
    kp,
    magnetometer,
    gic: gicSeries(p, magnetometer),
    messages: messageSequence(p, kp),
    gnss: p.receivers.map((r) => gnssModel(kp, r, scint)),
  }
}
