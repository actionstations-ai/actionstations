// Calm screen-reader announcements for job progress. Visible progress text can change many
// times a second (download percentages, chunk counters); announcing each change floods a
// screen reader. LiveStatus keeps a visually hidden polite region that speaks the first
// message at once, then at most one update per interval, and always the latest message once
// things settle (#49).
import { useThrottledAnnouncement } from '../lib/use-throttled-announcement'

export function LiveStatus({ text, intervalMs }: { text: string; intervalMs?: number }) {
  const spoken = useThrottledAnnouncement(text, intervalMs)
  return (
    <span className="sr-only" role="status" aria-live="polite">
      {spoken}
    </span>
  )
}
