import { useEffect, useState } from 'react'
import type { ClockState } from '../../shared/live/schemas'
import { elapsedMinutes, formatClock } from '../app/clock'
import { STRINGS } from '../app/strings'

/** The exercise clock, ticking locally while it runs. */
export function Clock({ clock, offsetMs }: { clock: ClockState | undefined; offsetMs: number }) {
  const [now, setNow] = useState(() => Date.now())
  const running = clock?.runningSince !== undefined
  useEffect(() => {
    if (!running) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [running])
  const text = formatClock(elapsedMinutes(clock, now, offsetMs))
  const label = running
    ? `${STRINGS.header.clock} ${text}`
    : `${STRINGS.header.clock} ${text}, ${STRINGS.header.clockPaused}`
  return (
    <span className={`clock${running ? '' : ' clock--paused'}`} aria-label={label} role="timer">
      <span aria-hidden="true">{text}</span>
    </span>
  )
}
