/**
 * The exercise clock as players see it: `clock.state` gives elapsed minutes and, while
 * running, the wall time it started running from; the page ticks locally. `serverOffsetMs`
 * corrects the device's clock against the controller's (from `welcome`'s `ts`).
 */
import type { ClockState } from '../../shared/live/schemas'

/** Elapsed exercise minutes at wall time `now` (ms). */
export function elapsedMinutes(clock: ClockState | undefined, now: number, offsetMs = 0): number {
  if (!clock) return 0
  if (clock.runningSince === undefined) return clock.elapsedMin
  const runningMs = Math.max(0, now + offsetMs - clock.runningSince)
  return clock.elapsedMin + (runningMs / 60_000) * (clock.rate ?? 1)
}

/** `H:MM` as the facilitator's MSEL shows it ("1:15"). */
export function formatClock(minutes: number): string {
  const whole = Math.max(0, Math.floor(minutes))
  const h = Math.floor(whole / 60)
  const m = whole % 60
  return `${h}:${String(m).padStart(2, '0')}`
}

/** Minutes from an `H:MM` exercise time; undefined when it does not parse. */
export function parseExerciseTime(text: string | undefined): number | undefined {
  if (!text) return undefined
  const m = /^(\d{1,2}):([0-5]\d)$/.exec(text)
  if (!m) return undefined
  return Number(m[1]) * 60 + Number(m[2])
}
