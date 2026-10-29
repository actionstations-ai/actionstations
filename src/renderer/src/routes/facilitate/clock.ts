// Exercise clock and timeline logic for facilitator mode. Pure functions over the persisted
// FacilitatorState so the clock survives reloads: elapsedMin is the exercise time when the
// clock was last started/paused, runningSince the wall-clock instant it was started.
import type { ClockLogEntry, FacilitatorState } from '@shared/ipc'
import { exerciseMinutes, formatExerciseTime } from '@shared/schemas/common'
import type { MselRow } from '@shared/schemas/scenario'

type Clock = Pick<FacilitatorState, 'elapsedMin' | 'runningSince' | 'rate'>

const MS_PER_MIN = 60_000

export const isRunning = (c: Clock): boolean => !!c.runningSince

export const clockRate = (c: Pick<Clock, 'rate'>): number => c.rate ?? 1

/** Exercise minutes (fractional) at `now`: real minutes since the start, times the rate. */
export function clockMinutes(c: Clock, now: Date): number {
  if (!c.runningSince) return c.elapsedMin
  const since = Date.parse(c.runningSince)
  if (Number.isNaN(since)) return c.elapsedMin
  return c.elapsedMin + (clockRate(c) * Math.max(0, now.getTime() - since)) / MS_PER_MIN
}

/** Change the speed from `now` on; time already run keeps the old rate (spec 0428 FR-2). */
export function setRate<S extends Clock>(s: S, rate: number, now: Date): S {
  const next = Math.min(60, Math.max(0.25, rate))
  if (!isRunning(s)) return { ...s, rate: next }
  return { ...s, rate: next, elapsedMin: clockMinutes(s, now), runningSince: now.toISOString() }
}

/** Move the clock by `deltaMin` minutes (negative rewinds), never below zero. */
export function nudgeClock<S extends Clock>(s: S, deltaMin: number, now: Date): S {
  return setClock(s, clockMinutes(s, now) + deltaMin, now)
}

export const CLOCK_LOG_LIMIT = 5000

/**
 * Append a clock log entry for the change from `before` to `after`, keeping the newest
 * `CLOCK_LOG_LIMIT` (spec 0428 FR-4).
 */
export function logClock<S extends Clock & Pick<FacilitatorState, 'clockLog'>>(
  before: S,
  after: S,
  kind: ClockLogEntry['kind'],
  now: Date,
  note?: string,
): S {
  const entry: ClockLogEntry = {
    at: now.toISOString(),
    kind,
    fromMin: clockMinutes(before, now),
    toMin: clockMinutes(after, now),
    rate: clockRate(after),
    ...(note ? { note } : {}),
  }
  return { ...after, clockLog: [...(before.clockLog ?? []), entry].slice(-CLOCK_LOG_LIMIT) }
}

/** Rows delivered at an exercise time later than `minutes`: what a rewind passes over. */
export function deliveriesAfter(
  state: Pick<FacilitatorState, 'delivered'>,
  minutes: number,
): string[] {
  return Object.entries(state.delivered)
    .filter(([, d]) => exerciseMinutes(d.exerciseTime) > Math.floor(minutes))
    .map(([id]) => id)
}

export function startClock<S extends Clock>(s: S, now: Date): S {
  if (isRunning(s)) return s
  return { ...s, runningSince: now.toISOString() }
}

export function pauseClock<S extends Clock>(s: S, now: Date): S {
  if (!isRunning(s)) return s
  const { runningSince: _drop, ...rest } = s
  return { ...rest, elapsedMin: clockMinutes(s, now) } as S
}

export function toggleClock<S extends Clock>(s: S, now: Date): S {
  return isRunning(s) ? pauseClock(s, now) : startClock(s, now)
}

/** Set the clock to `minutes`; a running clock keeps running from there. */
export function setClock<S extends Clock>(s: S, minutes: number, now: Date): S {
  const elapsedMin = Math.max(0, minutes)
  if (!isRunning(s)) return { ...s, elapsedMin }
  return { ...s, elapsedMin, runningSince: now.toISOString() }
}

export function resetClock<S extends Clock>(s: S): S {
  const { runningSince: _drop, ...rest } = s
  return { ...rest, elapsedMin: 0 } as S
}

/** Run `change` on the clock and log it. */
export function changeClock<S extends Clock & Pick<FacilitatorState, 'clockLog'>>(
  s: S,
  kind: ClockLogEntry['kind'],
  now: Date,
  change: (s: S) => S,
  note?: string,
): S {
  return logClock(s, change(s), kind, now, note)
}

/** "H:MM:SS" for the big clock display. */
export function formatClock(minutes: number): string {
  const totalSec = Math.max(0, Math.floor(minutes * 60))
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const sec = totalSec % 60
  return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
}

/** Parse "H:MM" or "H:MM:SS" (or plain minutes) typed by the facilitator. */
export function parseClockInput(text: string): number | undefined {
  const t = text.trim()
  if (/^\d+$/.test(t)) return Number(t)
  const m = /^(\d{1,2}):([0-5]\d)(?::([0-5]\d))?$/.exec(t)
  if (!m) return undefined
  return Number(m[1]) * 60 + Number(m[2]) + Number(m[3] ?? 0) / 60
}

/** Narrative wall clock ("09:45") for an exercise time, when the scenario has a start time. */
export function scenarioWallClock(startWallClock: string | undefined, minutes: number) {
  if (!startWallClock) return undefined
  const start = exerciseMinutes(startWallClock)
  const total = Math.floor(start + minutes) % (24 * 60)
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

/** The exercise time a delivery is stamped with. */
export const exerciseStamp = (minutes: number): string => formatExerciseTime(Math.floor(minutes))

const rowMinutes = (r: MselRow) => exerciseMinutes(r.time)

type Delivered = FacilitatorState['delivered']

/** A row is due once the clock reaches its time, until it is delivered. */
export const isDue = (row: MselRow, minutes: number, delivered: Delivered): boolean =>
  rowMinutes(row) <= minutes && !delivered[row.id]

export function dueRows(msel: MselRow[], minutes: number, delivered: Delivered): MselRow[] {
  return msel.filter((r) => isDue(r, minutes, delivered))
}

/** Next row to act on: the earliest undelivered row (due now, or the next one coming up). */
export function nextRow(msel: MselRow[], delivered: Delivered): MselRow | undefined {
  return msel.filter((r) => !delivered[r.id]).sort((a, b) => rowMinutes(a) - rowMinutes(b))[0]
}

/** Exercise minutes of the next TIME_JUMP row after the clock, if any. */
export function nextTimeJump(msel: MselRow[], minutes: number): MselRow | undefined {
  return msel
    .filter((r) => r.purposeTag === 'TIME_JUMP' && rowMinutes(r) > Math.floor(minutes))
    .sort((a, b) => rowMinutes(a) - rowMinutes(b))[0]
}

/** The rates the select offers; the Set time form takes up to 60× (spec 0428). */
export const RATES = [0.5, 1, 2, 4, 10] as const

/** A typed rate between 0.25 and 60, or undefined. */
export function parseRate(text: string): number | undefined {
  const n = Number(text.trim().replace(/[x×]$/i, ''))
  return Number.isFinite(n) && n >= 0.25 && n <= 60 ? n : undefined
}
