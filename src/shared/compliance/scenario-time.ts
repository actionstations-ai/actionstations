// Scenario time for regulatory clocks (#426, spec 0426 FR-8): the narrative date and time of
// STARTEX plus the exercise clock. Scenario times are "floating" local times, with no time zone:
// a Date whose UTC fields are the organization's local date and time. DST is ignored on
// purpose (an exercise does not cross a real DST change).
import { MONTHS, WEEKDAYS, firstDateIn } from '../dates'

export { LocalDateTime } from '../schemas/compliance'

const MIN_MS = 60_000

export const parseLocal = (s: string): Date => new Date(`${s}:00Z`)
export const formatLocal = (d: Date): string => d.toISOString().slice(0, 16)

/** Where the STARTEX date came from: the brief, the STARTEX card, or assumed (next Monday). */
export type StartSource = 'brief' | 'startex' | 'assumed'

export interface ScenarioStart {
  /** STARTEX as a floating date-time. */
  at: Date
  source: StartSource
}

/** The Monday after `today` (a Monday gives the one a week later): the assumed STARTEX date. */
export function nextMonday(today: Date): string {
  const d = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()))
  const ahead = (8 - d.getUTCDay()) % 7 || 7
  return new Date(d.getTime() + ahead * 86_400_000).toISOString().slice(0, 10)
}

export interface StartInput {
  /** ScenarioBrief.startDate */
  startDate?: string | undefined
  /** ScenarioBrief.startWallClock ("09:00"); 09:00 when absent. */
  startWallClock?: string | undefined
  /** The STARTEX row's event text, read for a written date ("Thursday, March 12, 2026"). */
  startexText?: string | undefined
}

/** STARTEX on the narrative calendar: brief date, else the STARTEX card's date, else next Monday. */
export function scenarioStart(input: StartInput, today: Date): ScenarioStart {
  const wall = /^\d{1,2}:\d{2}$/.test(input.startWallClock ?? '')
    ? input.startWallClock!.padStart(5, '0')
    : '09:00'
  const fromCard = input.startexText ? firstDateIn(input.startexText) : undefined
  const [date, source]: [string, StartSource] = input.startDate
    ? [input.startDate, 'brief']
    : fromCard
      ? [fromCard, 'startex']
      : [nextMonday(today), 'assumed']
  return { at: parseLocal(`${date}T${wall}`), source }
}

/** The scenario's floating date-time at an exercise-clock reading (minutes since STARTEX). */
export const scenarioAt = (start: Date, exerciseMin: number): Date =>
  new Date(start.getTime() + Math.floor(exerciseMin) * MIN_MS)

/** Exercise minutes of a floating date-time (may be negative: before STARTEX). */
export const exerciseMinOf = (start: Date, at: Date): number =>
  Math.round((at.getTime() - start.getTime()) / MIN_MS)

const cap = (w: string): string => `${w[0]!.toUpperCase()}${w.slice(1, 3)}`
const pad = (n: number): string => String(n).padStart(2, '0')

/** "Fri 13 Mar 09:12" (weekday, date and time: deadlines in the clocks strip and exports). */
export function formatScenarioDate(d: Date, opts: { year?: boolean } = {}): string {
  const wd = cap(WEEKDAYS[d.getUTCDay()]!)
  const mon = cap(MONTHS[d.getUTCMonth()]!)
  const year = opts.year ? ` ${d.getUTCFullYear()}` : ''
  return `${wd} ${d.getUTCDate()} ${mon}${year} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`
}

/** "61 h 12 m", "72 h 0 m", "3 d 4 h" (over 72 h), "45 m": a span in minutes, rounded down. */
export function formatSpan(minutes: number): string {
  const m = Math.max(0, Math.floor(minutes))
  if (m > 72 * 60) {
    const d = Math.floor(m / 1440)
    return `${d} d ${Math.floor((m % 1440) / 60)} h`
  }
  if (m >= 60) return `${Math.floor(m / 60)} h ${m % 60} m`
  return `${m} m`
}
