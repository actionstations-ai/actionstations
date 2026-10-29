// The promoted hot wash board on the projector (spec 0415 FR-8): strengths and improvements in
// two columns, other promoted items below, large type. No roles, no names, no +1 counts: the
// facilitator curates this list. Refreshes when main says the hot wash changed.
import { useEffect } from 'react'
import { useParams } from 'react-router'
import type { BoardView } from '@shared/schemas/live'
import { call, subscribe } from '../../lib/api'
import { queryClient, useIpcQuery } from '../../lib/query'
import { fromProjectKey } from '../../state/project'
import { promotedLines } from '../facilitate/live/hotwash-model'
import './present.css'

export function HotwashColumns({ board }: { board: BoardView }) {
  const lines = promotedLines(board)
  const of = (kind: string) => lines.filter((l) => l.kind === kind)
  const column = (title: string, kind: string) => (
    <section className="present-hw__col" aria-labelledby={`present-hw-${kind}`}>
      <h2 id={`present-hw-${kind}`}>{title}</h2>
      <ul>
        {of(kind).map((l, i) => (
          <li key={i}>{l.text}</li>
        ))}
      </ul>
    </section>
  )
  const other = of('other')
  return (
    <>
      <div className="present-hw__columns">
        {column('Strengths', 'strength')}
        {column('Improvements', 'improvement')}
      </div>
      {other.length > 0 && (
        <section className="present-hw__other" aria-labelledby="present-hw-other">
          <h2 id="present-hw-other">Other</h2>
          <ul>
            {other.map((l, i) => (
              <li key={i}>{l.text}</li>
            ))}
          </ul>
        </section>
      )}
    </>
  )
}

export default function PresentHotwash() {
  const params = useParams()
  const projectPath = fromProjectKey(params.projectKey ?? '')
  const req = { projectPath, scenarioId: params.scenarioId ?? '' }
  const board = useIpcQuery('live:hotwash-board', req, { refetchInterval: 10_000, retry: false })

  useEffect(() => {
    document.title = 'Presentation'
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') void call('facilitator:close-present')
    }
    window.addEventListener('keydown', onKey)
    const off = subscribe('live:changed', (e) => {
      if (e.reason === 'hotwash' || e.reason === 'stopped')
        void queryClient.invalidateQueries({ queryKey: ['live:hotwash-board'] })
    })
    return () => {
      window.removeEventListener('keydown', onKey)
      off()
    }
  }, [])

  const lines = board.data ? promotedLines(board.data) : []
  return (
    <div className="present present-hw" data-testid="present-hotwash">
      <h1 className="present-hw__title">Hot wash</h1>
      {board.data && lines.length > 0 ? (
        <HotwashColumns board={board.data} />
      ) : (
        <p className="present__empty">
          {board.isError ? 'The hot wash is no longer available.' : 'Nothing promoted yet.'}
        </p>
      )}
    </div>
  )
}
