// Exercise clock and timeline logic for facilitator mode. Pure functions over the persisted
// FacilitatorState so the clock survives reloads: elapsedMin is the exercise time when the
// clock was last started/paused, runningSince the wall-clock instant it was started.
import type { FacilitatorState } from '@shared/ipc'
import { exerciseMinutes, formatExerciseTime } from '@shared/schemas/common'
import type { MselRow } from '@shared/schemas/scenario'

type Clock = Pick<FacilitatorState, 'elapsedMin' | 'runningSince'>

const MS_PER_MIN = 60_000

export const isRunning = (c: Clock): boolean => !!c.runningSince

/** Exercise minutes (fractional) at `now`. */
export function clockMinutes(c: Clock, now: Date): number {
  if (!c.runningSince) return c.elapsedMin
  const since = Date.parse(c.runningSince)
  if (Number.isNaN(since)) return c.elapsedMin
  return c.elapsedMin + Math.max(0, now.getTime() - since) / MS_PER_MIN
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
