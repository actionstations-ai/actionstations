// Simulated spread between premises (spec 0460 FR-7). Each day every infectious premises can
// infect another by a distance kernel (up to a maximum distance) or along a movement link
// (a feed truck, a crew, a shared hauler). Controls from a stated day cut the movement
// probability. Detection comes a few days after infection becomes infectious, and a detected
// premises is depopulated and drops out. The run is seeded, so the same parameters give the same
// outbreak, and every output is labeled simulated: it is a teaching model, never a forecast.
import { z } from 'zod'
import { DAY_MS } from '@shared/epidemiology/arithmetic'
import { makeRng } from '../../epidemiology/simulate/rng'
import { haversineKm } from '../geo'
import type { Premises } from './premises'

export const SpreadParams = z.object({
  seed: z.number().int().default(11),
  startDate: z.iso.datetime().default('2026-10-19T00:00:00Z'),
  days: z.number().int().min(5).max(120).default(40),
  /** Premises ids infected on day 0. */
  index: z.array(z.string().min(1).max(20)).min(1).max(5),
  /** Chance per infectious premises and day of infecting a premises at distance zero. */
  baseDailyProb: z.number().min(0).max(1).default(0.03),
  kernelScaleKm: z.number().positive().max(100).default(3),
  maxKernelKm: z.number().positive().max(200).default(12),
  /** Movement links per premises (mean), and the daily chance along one. */
  linksPerPremises: z.number().min(0).max(10).default(1.2),
  movementDailyProb: z.number().min(0).max(1).default(0.02),
  latentDays: z.number().int().min(0).max(14).default(2),
  detectionDelayDays: z.tuple([z.number().int().min(0), z.number().int().min(0)]).default([2, 5]),
  depopulationDelayDays: z.number().int().min(0).max(14).default(1),
  /** From this day movement links carry less (permits, standstill), by `controlEffect`. */
  controlsFromDay: z.number().int().min(0).default(6),
  controlEffect: z.number().min(0).max(1).default(0.2),
})
export type SpreadParams = z.input<typeof SpreadParams>

export interface Infection {
  premisesId: string
  infectedDay: number
  source: string | null
  via: 'index' | 'kernel' | 'movement'
  /** Day the premises is detected and classified a presumptive positive. */
  detectedDay: number
  /** Day depopulation is complete (the premises leaves the simulation). */
  removedDay: number
  distanceKm: number | null
}

export interface MovementLink {
  a: string
  b: string
}

export interface SpreadRun {
  params: z.output<typeof SpreadParams>
  infections: Infection[]
  links: MovementLink[]
  /** Per day: premises infected that day, detected that day, and detected so far. */
  daily: { day: number; newInfected: number; newConfirmed: number; cumulativeConfirmed: number }[]
}

function makeLinks(
  premises: readonly Premises[],
  mean: number,
  rng: ReturnType<typeof makeRng>,
): MovementLink[] {
  const links: MovementLink[] = []
  const seen = new Set<string>()
  for (const p of premises) {
    for (let k = rng.poisson(mean); k > 0; k--) {
      const q = rng.pick(premises)
      if (q.id === p.id) continue
      const key = [p.id, q.id].sort().join('|')
      if (seen.has(key)) continue
      seen.add(key)
      links.push({ a: p.id, b: q.id })
    }
  }
  return links
}

export function runSpread(premises: readonly Premises[], raw: SpreadParams): SpreadRun {
  const p = SpreadParams.parse(raw)
  const rng = makeRng(p.seed)
  const byId = new Map(premises.map((q) => [q.id, q]))
  for (const id of p.index) if (!byId.has(id)) throw new Error(`Unknown index premises ${id}`)
  const links = makeLinks(premises, p.linksPerPremises, rng)
  const linked = new Map<string, Set<string>>()
  for (const l of links) {
    linked.set(l.a, (linked.get(l.a) ?? new Set()).add(l.b))
    linked.set(l.b, (linked.get(l.b) ?? new Set()).add(l.a))
  }
  const [lo, hi] = p.detectionDelayDays
  const detection = (): number => lo + rng.int(Math.max(0, hi - lo) + 1)
  const infections = new Map<string, Infection>()
  const infect = (
    id: string,
    day: number,
    source: string | null,
    via: Infection['via'],
    d: number | null,
  ): void => {
    const detectedDay = day + p.latentDays + detection()
    infections.set(id, {
      premisesId: id,
      infectedDay: day,
      source,
      via,
      detectedDay,
      removedDay: detectedDay + p.depopulationDelayDays,
      distanceKm: d,
    })
  }
  for (const id of p.index) infect(id, 0, null, 'index', null)
  for (let day = 0; day < p.days; day++) {
    const fresh: [string, string, Infection['via'], number | null][] = []
    for (const src of [...infections.values()]) {
      if (day < src.infectedDay + p.latentDays || day >= src.removedDay) continue
      const from = byId.get(src.premisesId)!
      for (const target of premises) {
        if (infections.has(target.id) || fresh.some((f) => f[0] === target.id)) continue
        const d = haversineKm(from, target)
        const kernel = d <= p.maxKernelKm ? p.baseDailyProb * Math.exp(-d / p.kernelScaleKm) : 0
        if (kernel > 0 && rng.chance(kernel)) {
          fresh.push([target.id, src.premisesId, 'kernel', d])
          continue
        }
        if (linked.get(src.premisesId)?.has(target.id)) {
          const eff = day >= p.controlsFromDay ? p.controlEffect : 1
          if (rng.chance(p.movementDailyProb * eff))
            fresh.push([target.id, src.premisesId, 'movement', d])
        }
      }
    }
    for (const [id, source, via, d] of fresh) infect(id, day + 1, source, via, d)
  }
  const all = [...infections.values()].filter((i) => i.infectedDay <= p.days)
  const daily = Array.from({ length: p.days }, (_, day) => ({
    day,
    newInfected: all.filter((i) => i.infectedDay === day).length,
    newConfirmed: all.filter((i) => i.detectedDay === day).length,
    cumulativeConfirmed: all.filter((i) => i.detectedDay <= day).length,
  }))
  return {
    params: p,
    infections: all.sort(
      (x, y) => x.infectedDay - y.infectedDay || x.premisesId.localeCompare(y.premisesId),
    ),
    links,
    daily,
  }
}

/** Presumptive positive time for an infection: mid-afternoon of its detected day. */
export const presumptiveMs = (startDate: string, i: Infection): number =>
  Date.parse(startDate) + i.detectedDay * DAY_MS + 15 * 3_600_000
