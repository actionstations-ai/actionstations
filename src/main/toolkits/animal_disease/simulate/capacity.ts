// Capacity models (spec 0460 FR-8): depopulation crews and disposal sites as a queue, and
// vaccination teams with cold chain and chain-of-custody checkpoints. Simple, deterministic
// queue arithmetic with worked examples in the tests; the output is labeled simulated and the
// numbers are the designer's, never a statement about any real crew or site.
import { z } from 'zod'
import { HPAI_DEPOPULATION_GOAL_HOURS } from '@shared/animal-disease/plan-rules'

const HOUR_MS = 3_600_000
const DAY_MS = 24 * HOUR_MS

export const DepopMethod = z.object({
  id: z.string().min(1).max(60),
  /** Species the plan allows this method for. */
  species: z.array(z.string().min(1).max(40)).min(1).max(12),
  /** Head one crew depopulates per working hour. */
  headPerCrewHour: z.number().positive().max(100_000),
})
export type DepopMethod = z.infer<typeof DepopMethod>

export const DisposalSite = z.object({
  id: z.string().min(1).max(60),
  capacityHeadPerDay: z.number().positive().max(10_000_000),
  /** Hours from a premises to the site by road. */
  travelHours: z.number().min(0).max(48),
})
export type DisposalSite = z.infer<typeof DisposalSite>

export const DepopParams = z.object({
  premises: z
    .array(
      z.object({
        id: z.string().min(1).max(20),
        species: z.string().min(1).max(40),
        head: z.number().int().positive(),
        /** The presumptive positive time: crews cannot start before it. */
        presumptiveAt: z.iso.datetime(),
      }),
    )
    .min(1)
    .max(300),
  crews: z.number().int().min(1).max(200),
  methods: z.array(DepopMethod).min(1).max(10),
  disposalSites: z.array(DisposalSite).min(1).max(10),
  /** Hours from a presumptive positive until crews can start work on that premises. */
  mobilizationHours: z.number().min(0).max(72).default(4),
  /** The daily working window in hours of the day (UTC): crews work from `workStartHour` for `workHoursPerDay`. */
  workStartHour: z.number().min(0).max(23).default(6),
  workHoursPerDay: z.number().min(1).max(24).default(16),
  /** Order of work: given by the team, or first come first served. */
  order: z.array(z.string()).default([]),
})
export type DepopParams = z.input<typeof DepopParams>

export interface DepopResult {
  id: string
  method: string
  startMs: number
  completeMs: number
  disposalSite: string
  disposalCompleteMs: number
  hoursFromPresumptive: number
  withinGoal: boolean
}

export interface DepopRun {
  results: DepopResult[]
  /** Premises with no allowed method for their species. */
  unscheduled: { id: string; reason: string }[]
  /** Head waiting for depopulation at the start of each hour from the first presumptive result. */
  backlog: { timeMs: number; head: number }[]
}

/** The end time when `hours` of work starts at `fromMs`, working only inside the daily window. */
export function workEnd(fromMs: number, hours: number, startHour: number, perDay: number): number {
  let t = fromMs
  let left = hours
  for (let guard = 0; guard < 10_000 && left > 1e-9; guard++) {
    const dayStart = Math.floor(t / DAY_MS) * DAY_MS
    const open = dayStart + startHour * HOUR_MS
    const close = open + perDay * HOUR_MS
    if (t < open) t = open
    if (t >= close) {
      t = dayStart + DAY_MS + startHour * HOUR_MS
      continue
    }
    const used = Math.min(left, (close - t) / HOUR_MS)
    t += used * HOUR_MS
    left -= used
  }
  return t
}

export function runDepopulation(raw: DepopParams): DepopRun {
  const p = DepopParams.parse(raw)
  const unscheduled: DepopRun['unscheduled'] = []
  const rank = (id: string): number => {
    const i = p.order.indexOf(id)
    return i < 0 ? Infinity : i
  }
  const queue = p.premises
    .map((q) => ({ ...q, at: Date.parse(q.presumptiveAt) }))
    .sort((a, b) => rank(a.id) - rank(b.id) || a.at - b.at || a.id.localeCompare(b.id))
  const siteFree = new Map(p.disposalSites.map((s) => [s.id, 0]))
  const results: DepopResult[] = []
  let crewFree = 0
  const jobs: { id: string; head: number; at: number; start: number; end: number }[] = []
  for (const q of queue) {
    const method = p.methods.find((m) => m.species.includes(q.species))
    if (!method) {
      unscheduled.push({ id: q.id, reason: `No approved method for ${q.species}.` })
      continue
    }
    const ready = q.at + p.mobilizationHours * HOUR_MS
    const start = Math.max(ready, crewFree)
    const hours = q.head / (p.crews * method.headPerCrewHour)
    const end = workEnd(start, hours, p.workStartHour, p.workHoursPerDay)
    crewFree = end
    jobs.push({ id: q.id, head: q.head, at: q.at, start, end })
    let best = p.disposalSites[0]!
    let bestDone = Infinity
    for (const s of p.disposalSites) {
      const arrive = end + s.travelHours * HOUR_MS
      const begin = Math.max(arrive, siteFree.get(s.id)!)
      const done = begin + (q.head / s.capacityHeadPerDay) * DAY_MS
      if (done < bestDone) {
        best = s
        bestDone = done
      }
    }
    const begin = Math.max(end + best.travelHours * HOUR_MS, siteFree.get(best.id)!)
    siteFree.set(best.id, begin + (q.head / best.capacityHeadPerDay) * DAY_MS)
    const hoursFromPresumptive = (end - q.at) / HOUR_MS
    results.push({
      id: q.id,
      method: method.id,
      startMs: start,
      completeMs: end,
      disposalSite: best.id,
      disposalCompleteMs: bestDone,
      hoursFromPresumptive: Math.round(hoursFromPresumptive * 10) / 10,
      withinGoal: hoursFromPresumptive <= HPAI_DEPOPULATION_GOAL_HOURS,
    })
  }
  const first = Math.min(...jobs.map((j) => j.at))
  const last = Math.max(...jobs.map((j) => j.end))
  const backlog: DepopRun['backlog'] = []
  if (jobs.length)
    for (let t = Math.floor(first / HOUR_MS) * HOUR_MS; t <= last; t += HOUR_MS)
      backlog.push({
        timeMs: t,
        head: jobs.reduce((n, j) => (j.at <= t && j.end > t ? n + j.head : n), 0),
      })
  return { results, unscheduled, backlog }
}

// ---- vaccination -------------------------------------------------------------------------

export const VaccinationParams = z.object({
  startAt: z.iso.datetime(),
  premises: z
    .array(z.object({ id: z.string().min(1).max(20), head: z.number().int().positive() }))
    .min(1)
    .max(300),
  teams: z.number().int().min(1).max(200),
  /** Doses one team gives in a working day with no checkpoints. */
  dosesPerTeamDay: z.number().positive().max(100_000),
  workHoursPerDay: z.number().min(1).max(24).default(10),
  vaccineStock: z.number().int().min(0),
  /** Days the cold chain keeps stock usable from the start. */
  coldChainDays: z.number().min(0.5).max(60).default(14),
  /** A chain-of-custody check after this many doses, taking this many minutes. */
  checkpointEveryDoses: z.number().int().positive().default(500),
  checkpointMinutes: z.number().min(0).default(10),
})
export type VaccinationParams = z.input<typeof VaccinationParams>

export interface VaccinationRun {
  dosesPerDay: number
  daily: { day: number; given: number; cumulative: number }[]
  premises: { id: string; completeMs: number | null; given: number }[]
  /** Doses never given because stock ran out. */
  shortfall: number
  /** Doses needed and in stock that were not given before the cold chain window ended. */
  wasted: number
}

export function runVaccination(raw: VaccinationParams): VaccinationRun {
  const p = VaccinationParams.parse(raw)
  const perHour = p.dosesPerTeamDay / p.workHoursPerDay
  const hoursPerDose = 1 / perHour + p.checkpointMinutes / 60 / p.checkpointEveryDoses
  const dosesPerDay = Math.floor((p.teams * p.workHoursPerDay) / hoursPerDose)
  const t0 = Date.parse(p.startAt)
  const need = p.premises.reduce((n, q) => n + q.head, 0)
  let stock = p.vaccineStock
  let cumulative = 0
  const daily: VaccinationRun['daily'] = []
  const premises: VaccinationRun['premises'] = p.premises.map((q) => ({
    id: q.id,
    completeMs: null,
    given: 0,
  }))
  let idx = 0
  const days = Math.ceil(p.coldChainDays)
  for (let day = 0; day < days && idx < premises.length && stock > 0; day++) {
    let room = Math.min(dosesPerDay, stock)
    let given = 0
    while (room > 0 && idx < premises.length) {
      const q = p.premises[idx]!
      const row = premises[idx]!
      const take = Math.min(room, q.head - row.given)
      row.given += take
      room -= take
      given += take
      if (row.given >= q.head) {
        row.completeMs =
          t0 + day * DAY_MS + (given / Math.max(1, dosesPerDay)) * p.workHoursPerDay * HOUR_MS
        idx++
      }
    }
    stock -= given
    cumulative += given
    daily.push({ day: day + 1, given, cumulative })
  }
  const planned = Math.min(need, p.vaccineStock)
  return {
    dosesPerDay,
    daily,
    premises,
    shortfall: Math.max(0, need - p.vaccineStock),
    wasted: Math.max(0, planned - cumulative),
  }
}
