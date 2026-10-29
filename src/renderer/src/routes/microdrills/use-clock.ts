// The run clock of a micro-drill (#437, FR-14): counts up against the planned duration, can be
// paused, and never stops the drill when it runs over (WCAG 2.2.1). It only updates the visible
// text once a second; it is not a live region, so a screen reader is not interrupted.
import { useCallback, useEffect, useState } from 'react'

export interface Clock {
  elapsedSec: number
  paused: boolean
  toggle: () => void
  /** Seconds spent paused so far, for the finished run. */
  pausedSec: () => number
}

interface Pause {
  /** Milliseconds paused before the current pause. */
  total: number
  /** When the current pause began, or null while running. */
  since: number | null
}

export function useClock(startedAtIso: string): Clock {
  const [now, setNow] = useState(() => Date.now())
  const [pause, setPause] = useState<Pause>({ total: 0, since: null })
  const start = Date.parse(startedAtIso)

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  const toggle = useCallback(() => {
    const t = Date.now()
    setNow(t)
    setPause((p) =>
      p.since === null ? { ...p, since: t } : { total: p.total + (t - p.since), since: null },
    )
  }, [])
  const pausedSec = useCallback(
    () => Math.round((pause.total + (pause.since === null ? 0 : Date.now() - pause.since)) / 1000),
    [pause],
  )

  const pausedMs = pause.total + (pause.since === null ? 0 : Math.max(0, now - pause.since))
  const elapsedSec = Math.max(0, Math.floor((now - start - pausedMs) / 1000))
  return { elapsedSec, paused: pause.since !== null, toggle, pausedSec }
}

export const clockText = (sec: number): string =>
  `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`
