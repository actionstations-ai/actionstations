// Times in a hot wash recording (#425): recording time as H:MM:SS, and the wall clock of a
// recording second, counting the pauses before it.
import type { HotwashRecording } from './schemas/hotwash'

/** 0:01:12 from seconds. */
export function recordingClock(sec: number): string {
  const s = Math.max(0, Math.floor(sec))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  return `${h}:${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

/** Wall-clock time of a recording second; undefined when the start time is unreadable. */
export function wallTimeAt(
  rec: Pick<HotwashRecording, 'startedAt' | 'pauses'>,
  sec: number,
): Date | undefined {
  const start = Date.parse(rec.startedAt)
  if (Number.isNaN(start)) return undefined
  let pausedMs = 0
  for (const p of rec.pauses) {
    if (p.atSec > sec) break
    if (p.pausedAt && p.resumedAt)
      pausedMs += Math.max(0, Date.parse(p.resumedAt) - Date.parse(p.pausedAt))
  }
  return new Date(start + sec * 1000 + pausedMs)
}

/** 14:06 in the computer's time zone. */
export const hhmm = (d: Date): string =>
  `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
