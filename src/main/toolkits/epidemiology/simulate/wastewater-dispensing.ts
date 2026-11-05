// Wastewater and dispensing models (spec 0457 FR-9).
//
// Wastewater: concentration on day t = baseline + scale x sum over k of incidence(t - k) x w(k),
// where w is a gamma-shaped shedding kernel (mean `lagDays`, normalized to sum to 1) so the
// signal peaks after the case curve by about the lag, times multiplicative lognormal noise.
// The levels scale is the designer's: each level starts at a multiple of the baseline. It is
// labeled as a simulated scale, never as the public data scale.
//
// Dispensing: a per-minute queue simulation. Arrivals are Poisson with a rate that is constant
// or front-loaded (exponentially decaying); stations serve one person at a time with lognormal
// service times; people queue first-come first-served. Output per interval: arrivals, served,
// queue length at the interval end; plus throughput in people per hour.
import { z } from 'zod'
import { makeRng } from './rng'

export const WastewaterParams = z.object({
  seed: z.number().int().default(1),
  /** Daily incidence (cases per day) the signal follows. */
  incidence: z.array(z.number().min(0)).min(2).max(730),
  lagDays: z.number().min(0).max(21).default(3),
  baseline: z.number().min(0).default(10),
  scale: z.number().min(0).default(1),
  noiseSigma: z.number().min(0).max(1).default(0.15),
  levels: z
    .array(z.object({ name: z.string().min(1).max(40), multiple: z.number().min(0) }))
    .min(2)
    .max(8)
    .default([
      { name: 'very low', multiple: 0 },
      { name: 'low', multiple: 1.5 },
      { name: 'moderate', multiple: 3 },
      { name: 'high', multiple: 6 },
      { name: 'very high', multiple: 12 },
    ]),
})
export type WastewaterParams = z.input<typeof WastewaterParams>

export interface WastewaterPoint {
  day: number
  concentration: number
  level: string
}

/** Gamma(shape 2) kernel over 0..maxLag days with the given mean, normalized to sum to 1. */
function sheddingKernel(lagDays: number): number[] {
  if (lagDays === 0) return [1]
  const theta = lagDays / 2
  const len = Math.ceil(lagDays * 4) + 1
  const w = Array.from({ length: len }, (_, k) => (k + 0.5) * Math.exp(-(k + 0.5) / theta))
  const sum = w.reduce((a, b) => a + b, 0)
  return w.map((v) => v / sum)
}

export function generateWastewater(raw: WastewaterParams): WastewaterPoint[] {
  const p = WastewaterParams.parse(raw)
  const kernel = sheddingKernel(p.lagDays)
  const rng = makeRng(p.seed)
  const levels = [...p.levels].sort((a, b) => a.multiple - b.multiple)
  return p.incidence.map((_, t) => {
    let signal = 0
    for (let k = 0; k < kernel.length; k++) {
      const j = t - k
      if (j >= 0) signal += p.incidence[j]! * kernel[k]!
    }
    const noise = p.noiseSigma === 0 ? 1 : Math.exp(p.noiseSigma * rng.normal())
    const concentration = (p.baseline + p.scale * signal) * noise
    const ratio = p.baseline > 0 ? concentration / p.baseline : 0
    let level = levels[0]!.name
    for (const l of levels) if (ratio >= l.multiple) level = l.name
    return { day: t, concentration: Math.round(concentration * 100) / 100, level }
  })
}

export const DispensingParams = z.object({
  seed: z.number().int().default(1),
  hoursOpen: z.number().min(1).max(24).default(8),
  stations: z.number().int().min(1).max(200).default(10),
  serviceMinutes: z.number().min(0.5).max(60).default(6),
  /** People arriving per hour at opening. */
  arrivalsPerHour: z.number().min(0).max(5000).default(240),
  pattern: z.enum(['constant', 'front_loaded']).default('front_loaded'),
  /** Front-loaded decay: the arrival rate halves every this many hours. */
  halfLifeHours: z.number().min(0.25).max(24).default(3),
  intervalMinutes: z.number().int().min(5).max(60).default(15),
  /** Minutes from the decision to open until the first person is served. */
  openDelayMinutes: z.number().min(0).max(600).default(90),
})
export type DispensingParams = z.input<typeof DispensingParams>

export interface DispensingInterval {
  startMin: number
  arrivals: number
  served: number
  queueEnd: number
}

export interface DispensingRun {
  intervals: DispensingInterval[]
  totalArrivals: number
  totalServed: number
  peakQueue: number
  /** People served per hour over the open period. */
  throughputPerHour: number
  /** Theoretical capacity per hour: stations x 60 / mean service minutes. */
  capacityPerHour: number
  /** Minutes from open until the queue is empty again after its peak; null if it never clears. */
  minutesToClear: number | null
  openDelayMinutes: number
}

export function runDispensing(raw: DispensingParams = {}): DispensingRun {
  const p = DispensingParams.parse(raw)
  const rng = makeRng(p.seed)
  const minutes = Math.round(p.hoursOpen * 60)
  const freeAt = new Array<number>(p.stations).fill(0)
  const queue: number[] = []
  const bins = Math.ceil(minutes / p.intervalMinutes)
  const arrivals = new Array<number>(bins).fill(0)
  const served = new Array<number>(bins).fill(0)
  const queueEnd = new Array<number>(bins).fill(0)
  let peak = 0
  let peakAt = 0
  let clearedAt: number | null = null
  let totalServed = 0
  let totalArrivals = 0
  for (let m = 0; m < minutes; m++) {
    const rate =
      p.pattern === 'constant'
        ? p.arrivalsPerHour
        : p.arrivalsPerHour * Math.pow(0.5, m / 60 / p.halfLifeHours)
    const n = rng.poisson(rate / 60)
    for (let i = 0; i < n; i++) queue.push(m)
    const bin = Math.floor(m / p.intervalMinutes)
    arrivals[bin]! += n
    totalArrivals += n
    for (let s = 0; s < p.stations; s++) {
      if (freeAt[s]! <= m && queue.length > 0) {
        queue.shift()
        freeAt[s] = m + Math.max(1, rng.lognormal(p.serviceMinutes, 0.35))
        served[bin]!++
        totalServed++
      }
    }
    if (queue.length > peak) {
      peak = queue.length
      peakAt = m
      clearedAt = null
    }
    if (clearedAt === null && queue.length === 0 && m > peakAt && peak > 0) clearedAt = m
    queueEnd[bin] = queue.length
  }
  return {
    intervals: Array.from({ length: bins }, (_, i) => ({
      startMin: i * p.intervalMinutes,
      arrivals: arrivals[i]!,
      served: served[i]!,
      queueEnd: queueEnd[i]!,
    })),
    totalArrivals,
    totalServed,
    peakQueue: peak,
    throughputPerHour: Math.round((totalServed / p.hoursOpen) * 10) / 10,
    capacityPerHour: Math.round(((p.stations * 60) / p.serviceMinutes) * 10) / 10,
    minutesToClear: clearedAt === null ? null : clearedAt,
    openDelayMinutes: p.openDelayMinutes,
  }
}
