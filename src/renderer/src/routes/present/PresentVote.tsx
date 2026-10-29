// The vote on the projector (spec 0414 FR-6): the question, a bar per option with its count and
// percent as text, "N of M voted", and the status. White on black in both themes; refreshed when
// main says the votes changed (ballots are batched there, four updates a second at most).
import { useEffect, useState } from 'react'
import { useParams } from 'react-router'
import { call, subscribe } from '../../lib/api'
import { queryClient, useIpcQuery } from '../../lib/query'
import { fromProjectKey } from '../../state/project'
import { TallyBars } from '../facilitate/live/TallyBars'
import './present.css'

function useSecondTick(): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])
  return now
}

const mmss = (ms: number): string => {
  const s = Math.max(0, Math.floor(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export default function PresentVote() {
  const params = useParams()
  const projectPath = fromProjectKey(params.projectKey ?? '')
  const req = { projectPath, scenarioId: params.scenarioId ?? '' }
  const votes = useIpcQuery('live:votes', req, { refetchInterval: 5000, retry: false })
  const now = useSecondTick()
  const view = votes.data?.find((v) => v.voteId === params.voteId)

  useEffect(() => {
    document.title = 'Presentation'
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') void call('facilitator:close-present')
    }
    window.addEventListener('keydown', onKey)
    const off = subscribe('live:changed', (e) => {
      if (e.reason === 'votes' || e.reason === 'stopped')
        void queryClient.invalidateQueries({ queryKey: ['live:votes'] })
    })
    return () => {
      window.removeEventListener('keydown', onKey)
      off()
    }
  }, [])

  if (!view) {
    return (
      <div className="present present-vote" data-testid="present-vote">
        <p className="present__empty">{votes.isError ? 'This vote is no longer available.' : ''}</p>
      </div>
    )
  }
  const open = view.status === 'open'
  const status = open
    ? `Open · ${mmss(now - view.openedAt)}${view.closesAt ? ` of ${mmss(view.closesAt - view.openedAt)}` : ''}`
    : view.status === 'interrupted'
      ? 'Ended early'
      : `Closed${view.closedClock ? ` at ${view.closedClock}` : ''}`
  return (
    <div className="present present-vote" data-testid="present-vote">
      <article className="present-vote__card" aria-label="Vote">
        <header className="present-vote__head">
          <span className="present-vote__kind">Decision{view.rowId ? ` ${view.rowId}` : ''}</span>
          <span className="present-vote__status" role="status">
            {status}
          </span>
        </header>
        <h1 className="present-vote__question">{view.question}</h1>
        <TallyBars view={view} large />
        <p className="present-vote__voted" data-testid="present-vote-voted">
          {view.voted} of {view.eligible} voted
        </p>
      </article>
    </div>
  )
}
