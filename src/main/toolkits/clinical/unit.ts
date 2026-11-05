// A simple unit model for tabletop play (spec 0452 FR-8): beds, acuity, nurses on duty, arrivals
// per hour and supplies keep the census, the staffing grid and the backlog consistent from one
// inject to the next. The facilitator can see every parameter and change it (`applyChange`).
// Rule-based and deterministic given a seed: arrivals are the planned rate with seeded variation,
// discharges free beds on a fixed share, patients that find no bed wait in a backlog, and a nurse
// can safely carry a number of acuity points, so ratios follow the patients' acuity.
import { z } from 'zod'
import { rng } from './patient'

export const UnitParams = z.object({
  name: z.string().min(1).max(80).default('4 West'),
  beds: z.number().int().min(1).max(60),
  /** Patients on the unit at hour 0. */
  startCensus: z.number().int().min(0),
  /** Planned arrivals per hour (a surge raises it). */
  arrivalsPerHour: z.number().min(0).max(40),
  /** Share of the census discharged or transferred out each hour, 0 to 0.5. */
  dischargeShare: z.number().min(0).max(0.5).default(0.05),
  /** Mean acuity of patients, 1 (stable) to 4 (critical). */
  meanAcuity: z.number().min(1).max(4).default(2),
  /** Acuity points one nurse can carry safely (five stable patients at 1, fewer when sicker). */
  pointsPerNurse: z.number().min(2).max(20).default(10),
  /** Nurses on duty by hour; the last value holds. */
  nursesByHour: z.array(z.number().int().min(0).max(60)).min(1).max(72),
  /** Supply units on hand and used per patient-hour. */
  supplies: z.number().min(0).default(400),
  suppliesPerPatientHour: z.number().min(0).default(1),
  /** Target patients per nurse, for the ratio exceedance flag. */
  targetRatio: z.number().min(1).max(12).default(5),
  seed: z.number().int().default(1),
})
export type UnitParams = z.infer<typeof UnitParams>

export interface UnitRow {
  hour: number
  arrivals: number
  discharges: number
  /** Patients in beds at the end of the hour. */
  census: number
  /** Arrivals waiting for a bed at the end of the hour. */
  backlog: number
  nursesOnDuty: number
  /** Nurses the census needs at the unit's points per nurse. */
  nursesNeeded: number
  patientsPerNurse: number | null
  ratioExceeded: boolean
  suppliesLeft: number
}

const nursesAt = (p: UnitParams, hour: number): number =>
  p.nursesByHour[Math.min(hour, p.nursesByHour.length - 1)]!

/** The unit over `hours` hours. Census never exceeds beds; every arrival is in a bed or the backlog. */
export function simulateUnit(raw: UnitParams, hours: number): UnitRow[] {
  const p = UnitParams.parse(raw)
  const r = rng(p.seed)
  let census = Math.min(p.beds, p.startCensus)
  let backlog = 0
  let supplies = p.supplies
  const rows: UnitRow[] = []
  for (let hour = 1; hour <= hours; hour++) {
    const arrivals = Math.max(
      0,
      Math.round(p.arrivalsPerHour + (r() - 0.5) * Math.max(1, p.arrivalsPerHour * 0.5)),
    )
    const discharges = Math.min(census, Math.round(census * p.dischargeShare + r() * 0.6))
    census -= discharges
    const waiting = backlog + arrivals
    const admitted = Math.min(waiting, p.beds - census)
    census += admitted
    backlog = waiting - admitted
    supplies = Math.max(0, supplies - census * p.suppliesPerPatientHour)
    const nurses = nursesAt(p, hour - 1)
    const needed = Math.ceil((census * p.meanAcuity) / p.pointsPerNurse)
    const ratio = nurses > 0 ? Math.round((census / nurses) * 10) / 10 : null
    rows.push({
      hour,
      arrivals,
      discharges,
      census,
      backlog,
      nursesOnDuty: nurses,
      nursesNeeded: needed,
      patientsPerNurse: ratio,
      ratioExceeded: ratio === null ? census > 0 : ratio > p.targetRatio,
      suppliesLeft: Math.round(supplies),
    })
  }
  return rows
}

/** A facilitator's change to the parameters from an hour on (nurses called out, a surge begins). */
export type UnitChange =
  | { kind: 'arrivals'; perHour: number }
  | { kind: 'nurses'; fromHour: number; count: number }
  | { kind: 'beds'; count: number }
  | { kind: 'supplies'; add: number }

export function applyChange(p: UnitParams, change: UnitChange): UnitParams {
  switch (change.kind) {
    case 'arrivals':
      return { ...p, arrivalsPerHour: change.perHour }
    case 'beds':
      return { ...p, beds: change.count }
    case 'supplies':
      return { ...p, supplies: p.supplies + change.add }
    case 'nurses': {
      const by = [...p.nursesByHour]
      while (by.length <= change.fromHour) by.push(by[by.length - 1]!)
      for (let h = change.fromHour; h < by.length; h++) by[h] = change.count
      return { ...p, nursesByHour: by }
    }
  }
}

/** Data for the staffing_vs_demand figure. */
export const toStaffingData = (name: string, rows: UnitRow[]) => ({
  title: `${name}: nurses needed and on duty`,
  unit: name,
  xLabel: 'Hour',
  hours: rows.map((r) => ({ x: r.hour, needed: r.nursesNeeded, onDuty: r.nursesOnDuty })),
})

/** Data for the unit_census figure at an hour: occupied beds first, then empty ones. */
export function toCensusData(name: string, p: UnitParams, row: UnitRow, isolation = 0) {
  const beds = Array.from({ length: p.beds }, (_, i) => ({
    bed: String(i + 1),
    state:
      i < isolation
        ? ('isolation' as const)
        : i < row.census
          ? ('occupied' as const)
          : ('empty' as const),
  }))
  return {
    title: `${name} bed board, hour ${row.hour}`,
    unit: name,
    nursesOnDuty: row.nursesOnDuty,
    beds,
  }
}
