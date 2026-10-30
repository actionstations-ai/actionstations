// The co-controllers of a regional exercise (#440 FR-19): which partner organizations may
// release their own rows and roles in this session, whether devices have the roster, and a button
// to send it again once a partner's key has been pinned. Shown only for a regional exercise.
import { useState } from 'react'
import type { RegionalRosterView } from '@shared/schemas/live'
import { Button } from '../../../components/ui'
import { call } from '../../../lib/api'
import { queryClient, useIpcQuery } from '../../../lib/query'

function rosterStatus(view: RegionalRosterView): string {
  if (view.sent) return `Devices have roster ${view.revision ?? 1}.`
  if (view.controllers.length === 0) return 'No partner organization can be listed yet.'
  return 'Not sent to devices yet.'
}

export function CoControllersView(props: {
  view: RegionalRosterView
  busy: boolean
  onSend: () => void
}) {
  const { view } = props
  return (
    <section className="live-devices" aria-labelledby="live-cocontrollers-heading">
      <h3 id="live-cocontrollers-heading" className="live-note__title">
        Co-controllers
      </h3>
      <p role="status">{rosterStatus(view)}</p>
      {view.controllers.length > 0 && (
        <table className="table room-table">
          <caption className="sr-only">Partner organizations that may release injects</caption>
          <thead>
            <tr>
              <th scope="col">Organization</th>
              <th scope="col">Rows</th>
              <th scope="col">Roles</th>
            </tr>
          </thead>
          <tbody>
            {view.controllers.map((c) => (
              <tr key={c.id}>
                <th scope="row">{c.name}</th>
                <td>{c.rowPrefixes.join(', ') || 'None'}</td>
                <td>{c.roleCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {view.missingLiveKey.length > 0 && (
        <p className="muted">
          No live key is pinned for {view.missingLiveKey.join(', ')}. Pin it in the regional
          exercise, then send the roster again.
        </p>
      )}
      <div className="row">
        <Button size="sm" disabled={props.busy} onClick={props.onSend}>
          Send roster to devices
        </Button>
      </div>
    </section>
  )
}

export function CoControllers(props: { projectPath: string; scenarioId: string }) {
  const req = { projectPath: props.projectPath, scenarioId: props.scenarioId }
  const roster = useIpcQuery('live:regional-roster', req, { refetchInterval: 30_000 })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const view = roster.data
  if (!view || (view.controllers.length === 0 && view.missingLiveKey.length === 0)) return null
  const send = () => {
    setBusy(true)
    setError('')
    call('live:regional-roster-send', req)
      .then(() => queryClient.invalidateQueries({ queryKey: ['live:regional-roster'] }))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Could not send the roster'))
      .finally(() => setBusy(false))
  }
  return (
    <>
      <CoControllersView view={view} busy={busy} onSend={send} />
      {error && (
        <p className="field__error" role="alert">
          {error}
        </p>
      )}
    </>
  )
}
