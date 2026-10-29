// The Room tab (#417, spec 0417 FR-8): who is here, what has landed, who has read it, who has
// gone quiet. `RoomView` is pure (props in, markup out) so it renders for a past session too;
// `RoomPanel` wires the data and the Mark answered call.
import { useState, type ReactNode } from 'react'
import type { DashboardView } from '@shared/schemas/live'
import type { Scenario } from '@shared/schemas/scenario'
import { call } from '../../../lib/api'
import { queryClient } from '../../../lib/query'
import { toast } from '../../../components/toast-store'
import { Button, EmptyState } from '../../../components/ui'
import { LogView } from './LogView'
import {
  EvaluationSummary,
  HealthStrip,
  HotWashSummary,
  InjectsTable,
  MessagesSummary,
  RosterSummary,
  UnansweredList,
  VotesSummary,
} from './RoomParts'
import { useDashboard } from './use-dashboard'

export function RoomView(props: {
  view: DashboardView
  roleName: (id: string) => string | undefined
  onMarkAnswered: (releaseId: string) => void
  /** The hot wash summary from the hot wash feature; the default reads the log counts. */
  hotwash?: ReactNode
  log?: ReactNode
}) {
  const { view } = props
  const [showLog, setShowLog] = useState(false)
  return (
    <div className="room">
      <HealthStrip view={view} />
      {!view.live && <p className="muted">This session has ended. The Room shows its record.</p>}
      <Button size="sm" aria-pressed={showLog} onClick={() => setShowLog((v) => !v)}>
        {showLog ? 'Back to the Room' : 'Log'}
      </Button>
      {showLog ? (
        props.log
      ) : (
        <div className="room-grid">
          <RosterSummary view={view} />
          <div className="room-main">
            <InjectsTable view={view} roleName={props.roleName} />
            <UnansweredList view={view} onMarkAnswered={props.onMarkAnswered} />
            <dl className="room-summary">
              <MessagesSummary view={view} />
              <VotesSummary view={view} />
              {props.hotwash ?? <HotWashSummary view={view} />}
              <EvaluationSummary view={view} />
            </dl>
          </div>
        </div>
      )}
    </div>
  )
}

export function RoomPanel(props: { projectPath: string; scenario: Scenario; sessionId?: string }) {
  const { projectPath, scenario } = props
  const { req, view, loading, error } = useDashboard(projectPath, scenario.id, props.sessionId)
  if (loading) return <p className="muted">Loading…</p>
  if (error) {
    return (
      <p className="field__error" role="alert">
        {error}
      </p>
    )
  }
  if (!view) {
    return (
      <EmptyState
        title="No live session yet"
        body="Start a session on the Live tab. The Room shows who has joined and what has landed."
      />
    )
  }
  const markAnswered = (releaseId: string) =>
    call('live:mark-answered', { projectPath, scenarioId: scenario.id, releaseId })
      .then(() => queryClient.invalidateQueries({ queryKey: ['live:dashboard'] }))
      .catch((e: unknown) => toast.error('Could not mark the inject answered', e))
  return (
    <RoomView
      view={view}
      roleName={(id) => scenario.roles.find((r) => r.id === id)?.name}
      onMarkAnswered={(id) => void markAnswered(id)}
      log={
        <LogView
          projectPath={projectPath}
          scenarioId={scenario.id}
          sessionId={req.sessionId ?? view.sessionId}
          live={view.live}
        />
      }
    />
  )
}
