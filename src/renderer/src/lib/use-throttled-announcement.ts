// Throttle for screen-reader announcements of fast-changing progress text (#49).
import { useEffect, useRef, useState } from 'react'

export const ANNOUNCE_INTERVAL_MS = 5000

/** The text to announce: `text`, throttled to one change per `intervalMs` (trailing edge kept). */
export function useThrottledAnnouncement(text: string, intervalMs = ANNOUNCE_INTERVAL_MS): string {
  const [spoken, setSpoken] = useState('')
  const lastAt = useRef(0)
  useEffect(() => {
    if (text === spoken) return
    const wait = Math.max(0, lastAt.current + intervalMs - Date.now())
    const timer = setTimeout(() => {
      lastAt.current = Date.now()
      setSpoken(text)
    }, wait)
    return () => clearTimeout(timer)
  }, [text, spoken, intervalMs])
  return spoken
}
