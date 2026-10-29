// Simulated engagement for the selected social post (spec 0428 FR-10): the counts now, the next
// reply, and a button that re-renders the post with those numbers on the presentation screen.
import { useCallback, useEffect, useRef, useState } from 'react'
import { engagementAt, nextReply, repliesAt } from '@shared/facilitator/engagement'
import { exerciseMinutes } from '@shared/schemas/common'
import { toast } from '../../components/toast-store'
import { Button } from '../../components/ui'
import { call } from '../../lib/api'
import type { TimelineEntry } from './Timeline'

/** Real milliseconds between automatic renders of one inject (spec 0428 FR-10). */
const AUTO_REFRESH_MIN_GAP_MS = 20_000
const AUTO_CHOICES = [0, 5, 10] as const

function minutesSinceDelivery(entry: TimelineEntry, minutes: number): number {
  return entry.deliveredAt ? Math.max(0, minutes - exerciseMinutes(entry.deliveredAt)) : 0
}

function useRefresh(
  projectPath: string,
  scenarioId: string,
  entry: TimelineEntry,
  onShow: (entry: TimelineEntry, cachePath: string) => void,
) {
  const busy = useRef(false)
  return useCallback(
    async (since: number, refreshMin: number): Promise<boolean> => {
      if (!entry.inject || busy.current) return false
      busy.current = true
      try {
        const out = await call('render:engagement', {
          projectPath,
          scenarioId,
          injectId: entry.inject.id,
          minutes: since,
          refreshMin,
        })
        onShow(entry, out.path)
        return true
      } catch (err) {
        toast.error('Could not refresh the post', (err as Error).message)
        return false
      } finally {
        busy.current = false
      }
    },
    [projectPath, scenarioId, entry, onShow],
  )
}

export function EngagementPanel(props: {
  projectPath: string
  scenarioId: string
  entry: TimelineEntry
  minutes: number
  onShow: (entry: TimelineEntry, cachePath: string) => void
  onAnnounce: (text: string) => void
}) {
  const { entry } = props
  const plan = entry.inject?.engagement
  const [auto, setAuto] = useState<number>(0)
  const lastStep = useRef(-1)
  const lastAt = useRef(0)
  const refresh = useRefresh(props.projectPath, props.scenarioId, entry, props.onShow)
  const since = minutesSinceDelivery(entry, props.minutes)

  useEffect(() => {
    if (!auto || !plan || !entry.deliveredAt) return
    const step = Math.floor(since / auto)
    if (step === lastStep.current || Date.now() - lastAt.current < AUTO_REFRESH_MIN_GAP_MS) return
    lastStep.current = step
    lastAt.current = Date.now()
    void refresh(since, auto)
  }, [auto, plan, entry.deliveredAt, since, refresh])

  if (!plan || !entry.deliveredAt) return null
  const counts = engagementAt(plan, since)
  const next = nextReply(plan, since)
  const shown = repliesAt(plan, since).length
  return (
    <section className="fac-engagement" aria-label={`Engagement for ${entry.row.id}`}>
      <h3 className="fac-panel__subtitle">Engagement</h3>
      <dl className="fac-engagement__counts">
        {Object.entries(counts).map(([name, n]) => (
          <div key={name}>
            <dt>{name}</dt>
            <dd>{n.toLocaleString()}</dd>
          </div>
        ))}
      </dl>
      <p className="muted">
        {shown} of {plan.replies.length} replies out
        {next
          ? ` · next reply in ${Math.max(1, Math.ceil(next.atMin - since))} min (${next.handle || next.author})`
          : ''}
      </p>
      <div className="row">
        <Button
          onClick={() =>
            void refresh(since, 1).then((ok) => ok && props.onAnnounce('Post refreshed on screen'))
          }
        >
          Refresh on screen
        </Button>
        <label className="fac-engagement__auto">
          Auto-refresh{' '}
          <select
            className="select"
            value={auto}
            onChange={(e) => {
              lastStep.current = -1
              setAuto(Number(e.target.value))
            }}
          >
            {AUTO_CHOICES.map((n) => (
              <option key={n} value={n}>
                {n === 0 ? 'off' : `every ${n} min`}
              </option>
            ))}
          </select>
        </label>
      </div>
    </section>
  )
}
