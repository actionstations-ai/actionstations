// Simulated gastroenteritis outbreak on a voyage (spec 0470 FR-7). Parametric, not a disease
// model: each ill person gets an onset time drawn around a peak day (crew a half day later),
// cases after isolation starts are thinned by the isolation effect, and the cumulative counts,
// threshold crossings and the reports a ship would send are read off the sorted onset times.
// Everything is a pure function of the parameters and the seed. Persons are codes, never names.
import { z } from 'zod'
import { makeRng } from '../../epidemiology/simulate/rng'

const HOUR_MS = 3_600_000
const DAY_MS = 24 * HOUR_MS

export const OutbreakAtSeaParams = z
  .object({
    seed: z.number().int().default(1),
    /** Voyage start (embarkation), ISO time. */
    startDate: z.iso.datetime().default('2026-11-01T17:00:00Z'),
    voyageDays: z.number().int().min(3).max(14).default(7),
    passengers: z.number().int().min(100).max(10_000).default(2410),
    crew: z.number().int().min(20).max(4_000).default(980),
    /** Fraction of each group ill by the end of the voyage before isolation takes effect. */
    passengerAttackRate: z.number().min(0).max(0.3).default(0.04),
    crewAttackRate: z.number().min(0).max(0.3).default(0.022),
    /** Voyage day (from 0) of peak onset for passengers; crew peak half a day later. */
    peakDay: z.number().min(0.5).max(12).default(4),
    spreadDays: z.number().min(0.3).max(4).default(1.3),
    /** Voyage day isolation and cleaning take effect, and the fraction of later cases they prevent. */
    isolationStartDay: z.number().min(0).max(14).default(4.5),
    isolationEffect: z.number().min(0).max(0.95).default(0.4),
  })
  .refine((p) => p.isolationStartDay < p.voyageDays, {
    message: 'isolation must start before the voyage ends',
    path: ['isolationStartDay'],
  })
export type OutbreakAtSeaParams = z.input<typeof OutbreakAtSeaParams>

export type Group = 'passengers' | 'crew'

export interface SimCase {
  /** Role code, never a name: P-0001 for a passenger, C-001 for crew. */
  code: string
  group: Group
  onsetMs: number
  deck: number
}

export interface Crossing {
  level: 2 | 3
  group: Group
  timeMs: number
  cases: number
  percent: number
}

export interface SimReport {
  type:
    | '24-hour report'
    | '4-hour update report'
    | 'Special report, 2 percent'
    | 'Special report, 3 percent'
  timeMs: number
  hoursBeforeArrival: number
  passengerCases: number
  crewCases: number
  passengerPercent: number
  crewPercent: number
}

export interface SimOutbreak {
  params: z.output<typeof OutbreakAtSeaParams>
  startMs: number
  arrivalMs: number
  cases: SimCase[]
  crossings: Crossing[]
  reports: SimReport[]
}

const pct = (cases: number, on: number): number => Math.round((cases / on) * 1000) / 10

function draw(
  p: z.output<typeof OutbreakAtSeaParams>,
  group: Group,
  startMs: number,
  seedSalt: number,
): SimCase[] {
  const pop = group === 'passengers' ? p.passengers : p.crew
  const rate = group === 'passengers' ? p.passengerAttackRate : p.crewAttackRate
  const peak = p.peakDay + (group === 'crew' ? 0.5 : 0)
  const rng = makeRng((p.seed ^ seedSalt) >>> 0)
  const target = Math.round(pop * rate)
  const out: SimCase[] = []
  let guard = 0
  while (out.length < target && guard++ < target * 40) {
    const day = peak + p.spreadDays * rng.normal()
    if (day < 0.1 || day > p.voyageDays - 0.05) continue
    if (day > p.isolationStartDay && rng.chance(p.isolationEffect)) continue
    out.push({
      code: '',
      group,
      onsetMs: startMs + Math.round(day * DAY_MS),
      deck: 2 + rng.int(11),
    })
  }
  out.sort((a, b) => a.onsetMs - b.onsetMs)
  return out.map((c, i) => ({
    ...c,
    code:
      group === 'passengers'
        ? `P-${String(i + 1).padStart(4, '0')}`
        : `C-${String(i + 1).padStart(3, '0')}`,
  }))
}

/** Cases of one group with onset at or before `timeMs`. */
export const casesBy = (cases: readonly SimCase[], group: Group, timeMs: number): number =>
  cases.filter((c) => c.group === group && c.onsetMs <= timeMs).length

function crossingsOf(
  cases: readonly SimCase[],
  p: z.output<typeof OutbreakAtSeaParams>,
): Crossing[] {
  const out: Crossing[] = []
  for (const group of ['passengers', 'crew'] as const) {
    const pop = group === 'passengers' ? p.passengers : p.crew
    const mine = cases.filter((c) => c.group === group)
    for (const level of [2, 3] as const) {
      const need = Math.ceil((level / 100) * pop)
      const hit = mine[need - 1]
      if (hit) out.push({ level, group, timeMs: hit.onsetMs, cases: need, percent: pct(need, pop) })
    }
  }
  return out.sort((a, b) => a.timeMs - b.timeMs || a.level - b.level)
}

export function simulateOutbreak(raw: OutbreakAtSeaParams = {}): SimOutbreak {
  const p = OutbreakAtSeaParams.parse(raw)
  const startMs = Date.parse(p.startDate)
  const arrivalMs = startMs + p.voyageDays * DAY_MS
  const cases = [
    ...draw(p, 'passengers', startMs, 0x51ed),
    ...draw(p, 'crew', startMs, 0xc4e7),
  ].sort((a, b) => a.onsetMs - b.onsetMs || a.code.localeCompare(b.code))
  const crossings = crossingsOf(cases, p)
  const at = (timeMs: number, type: SimReport['type']): SimReport => {
    const pc = casesBy(cases, 'passengers', timeMs)
    const cc = casesBy(cases, 'crew', timeMs)
    return {
      type,
      timeMs,
      hoursBeforeArrival: Math.round(((arrivalMs - timeMs) / HOUR_MS) * 10) / 10,
      passengerCases: pc,
      crewCases: cc,
      passengerPercent: pct(pc, p.passengers),
      crewPercent: pct(cc, p.crew),
    }
  }
  const reports: SimReport[] = [
    at(arrivalMs - 24 * HOUR_MS, '24-hour report'),
    at(arrivalMs - 4 * HOUR_MS, '4-hour update report'),
    ...crossings.map((c) =>
      at(c.timeMs, c.level === 2 ? 'Special report, 2 percent' : 'Special report, 3 percent'),
    ),
  ].sort((a, b) => a.timeMs - b.timeMs)
  return { params: p, startMs, arrivalMs, cases, crossings, reports }
}

/** New cases per voyage day (day 1 is the first 24 hours), for the outbreak curve figure. */
export function dailyRows(sim: SimOutbreak): { day: number; passengers: number; crew: number }[] {
  const days = sim.params.voyageDays
  return Array.from({ length: days }, (_, i) => {
    const lo = sim.startMs + i * DAY_MS
    const hi = lo + DAY_MS
    const inDay = (g: Group): number =>
      sim.cases.filter((c) => c.group === g && c.onsetMs >= lo && c.onsetMs < hi).length
    return { day: i + 1, passengers: inDay('passengers'), crew: inDay('crew') }
  })
}
