// hosp_outbreak_curve (spec 0470 FR-6): cases of acute gastroenteritis on a voyage by day, with
// the cumulative percentage of passengers and of crew drawn against the 2 percent special report
// level and the 3 percent outbreak level. Cumulative, so the lines never fall; the day a level is
// crossed is stated in words in the summary and in the table.
import { z } from 'zod'
import { fmt } from '../svg'
import { timeSeriesKind, type TimeSeriesData } from '../time-series'
import type { FigureKind, FigureResult } from '../types'

export const HospOutbreakCurveData = z.object({
  title: z.string().max(200).optional(),
  passengersOnBoard: z.number().int().min(1).max(20_000),
  crewOnBoard: z.number().int().min(1).max(10_000),
  /** New reportable cases by voyage day, in day order starting at day 1. */
  days: z
    .array(
      z.object({
        day: z.number().int().min(1).max(60),
        passengers: z.number().int().min(0).max(20_000),
        crew: z.number().int().min(0).max(10_000),
      }),
    )
    .min(2)
    .max(60),
})
export type HospOutbreakCurveData = z.infer<typeof HospOutbreakCurveData>

const pct = (cases: number, on: number): number => Math.round((cases / on) * 1000) / 10

export interface CurveRow {
  day: number
  newPassengers: number
  newCrew: number
  passengerCases: number
  crewCases: number
  passengerPercent: number
  crewPercent: number
}

/** Cumulative counts and percentages by day. */
export function cumulativeRows(d: HospOutbreakCurveData): CurveRow[] {
  let p = 0
  let c = 0
  return [...d.days]
    .sort((a, b) => a.day - b.day)
    .map((r) => {
      p += r.passengers
      c += r.crew
      return {
        day: r.day,
        newPassengers: r.passengers,
        newCrew: r.crew,
        passengerCases: p,
        crewCases: c,
        passengerPercent: pct(p, d.passengersOnBoard),
        crewPercent: pct(c, d.crewOnBoard),
      }
    })
}

/** The first day a group reaches a level, or undefined. */
export function firstDayAt(rows: readonly CurveRow[], group: 'passenger' | 'crew', level: number) {
  return rows.find((r) => (group === 'passenger' ? r.passengerPercent : r.crewPercent) >= level)
    ?.day
}

function render(d: HospOutbreakCurveData, o: { width: number; height: number }): FigureResult {
  const rows = cumulativeRows(d)
  const title = d.title ?? 'Gastroenteritis cases against the 2 and 3 percent levels'
  const ts: TimeSeriesData = {
    title,
    xLabel: 'Day of voyage',
    yLabel: 'Cumulative cases as percent of persons on board',
    unit: '%',
    series: [
      {
        name: 'Passengers, cumulative percent',
        points: rows.map((r) => ({ x: r.day, y: r.passengerPercent })),
      },
      {
        name: 'Crew, cumulative percent',
        points: rows.map((r) => ({ x: r.day, y: r.crewPercent })),
      },
    ],
    thresholds: [
      { value: 2, label: '2 percent: special report' },
      { value: 3, label: '3 percent: outbreak' },
    ],
    annotations: [],
  }
  const base = timeSeriesKind.render(ts, o)
  const said = (g: 'passenger' | 'crew', level: number): string => {
    const day = firstDayAt(rows, g, level)
    return day === undefined
      ? `${g === 'passenger' ? 'passengers' : 'crew'} have not reached ${level} percent`
      : `${g === 'passenger' ? 'passengers' : 'crew'} reach ${level} percent on day ${day}`
  }
  const last = rows[rows.length - 1]!
  const summary =
    `${title}: ${fmt(d.passengersOnBoard)} passengers and ${fmt(d.crewOnBoard)} crew on board. ` +
    `By day ${last.day} there are ${last.passengerCases} passenger cases (${last.passengerPercent} percent) ` +
    `and ${last.crewCases} crew cases (${last.crewPercent} percent). ` +
    `At 2 percent: ${said('passenger', 2)}; ${said('crew', 2)}. ` +
    `At 3 percent: ${said('passenger', 3)}; ${said('crew', 3)}.`
  return {
    svg: base.svg,
    summary,
    table: {
      caption: title,
      columns: [
        'Day',
        'New passenger cases',
        'New crew cases',
        'Passenger cases',
        'Passenger percent',
        'Crew cases',
        'Crew percent',
        'Level reached',
      ],
      rows: rows.map((r) => [
        String(r.day),
        String(r.newPassengers),
        String(r.newCrew),
        String(r.passengerCases),
        `${r.passengerPercent}%`,
        String(r.crewCases),
        `${r.crewPercent}%`,
        r.passengerPercent >= 3 || r.crewPercent >= 3
          ? '3 percent or more'
          : r.passengerPercent >= 2 || r.crewPercent >= 2
            ? '2 percent or more'
            : 'Below 2 percent',
      ]),
    },
  }
}

export const hospOutbreakCurveKind: FigureKind<HospOutbreakCurveData> = {
  kind: 'hosp_outbreak_curve',
  schema: HospOutbreakCurveData,
  render,
}
