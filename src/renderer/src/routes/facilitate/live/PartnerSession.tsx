// This computer as a partner organization's controller in another organization's live session
// (#517, spec 0440 FR-19, FR-20): paste the host's invite, see what the host allows, release your
// own rows to your own roles, and watch the receipts the host forwards (by role, never by device).
import { useId, useState } from 'react'
import type { PartnerStatus, ReleaseSummary } from '@shared/schemas/live'
import { Button } from '../../../components/ui'
import { call } from '../../../lib/api'
import { queryClient, useIpcQuery } from '../../../lib/query'
import { mineOf, type RowView } from './partner-model'
import { PARTNER } from './partner-strings'
import './partner.css'

function stateLine(status: PartnerStatus): string {
  if (status.state === 'connecting') return PARTNER.stateConnecting
  if (status.state === 'ended') return PARTNER.stateEnded
  if (status.state === 'error') return status.message ?? PARTNER.stateError
  return status.scope
    ? PARTNER.stateJoined(status.orgName ?? 'your organization')
    : PARTNER.waitingRoster
}

function receiptText(r: ReleaseSummary | undefined): string {
  if (!r || r.withdrawn) return ''
  return PARTNER.receiptLine(r.counts.read, r.counts.to)
}

export function PartnerRows(props: {
  rows: readonly RowView[]
  status: PartnerStatus
  busy: boolean
  onRelease: (rowId: string) => void
}) {
  const mine = mineOf(props.rows, props.status)
  const mayRelease = props.status.state === 'joined' && props.status.scope !== undefined
  if (mine.length === 0) return <p className="muted">{PARTNER.rowsNone}</p>
  return (
    <table className="partner-rows">
      <caption className="sr-only">{PARTNER.rowsHeading}</caption>
      <thead>
        <tr>
          <th scope="col">{PARTNER.rowId}</th>
          <th scope="col">{PARTNER.rowEvent}</th>
          <th scope="col">{PARTNER.rowTo}</th>
          <th scope="col">{PARTNER.rowState}</th>
        </tr>
      </thead>
      <tbody>
        {mine.map((row) => {
          const release = props.status.releases.find((r) => r.rowId === row.id && !r.withdrawn)
          return (
            <tr key={row.id}>
              <th scope="row">{row.id}</th>
              <td className="partner-rows__event">{row.event}</td>
              <td>{row.toLabel || row.toRoleIds.join(', ')}</td>
              <td>
                {release ? (
                  <span role="status">
                    {PARTNER.released}. {receiptText(release)}
                  </span>
                ) : (
                  <Button
                    size="sm"
                    disabled={props.busy || !mayRelease}
                    aria-label={PARTNER.releaseRow(row.id)}
                    onClick={() => props.onRelease(row.id)}
                  >
                    {PARTNER.release}
                  </Button>
                )}
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

export function PartnerJoinForm(props: {
  busy: boolean
  error: string
  onJoin: (invite: string) => void
}) {
  const id = useId()
  const [text, setText] = useState('')
  return (
    <form
      className="partner-box"
      aria-labelledby={`${id}-h`}
      onSubmit={(e) => {
        e.preventDefault()
        props.onJoin(text.trim())
      }}
    >
      <h3 id={`${id}-h`} className="live-note__title">
        {PARTNER.joinHeading}
      </h3>
      <p className="muted">{PARTNER.joinIntro}</p>
      <label className="field__label" htmlFor={`${id}-invite`}>
        {PARTNER.joinLabel}
      </label>
      <textarea
        id={`${id}-invite`}
        className="field__input partner-box__secret"
        value={text}
        autoComplete="off"
        spellCheck={false}
        aria-describedby={`${id}-hint`}
        onChange={(e) => setText(e.target.value)}
      />
      <span id={`${id}-hint`} className="field__hint">
        {PARTNER.joinHint}
      </span>
      {props.error && (
        <p className="field__error" role="alert">
          {props.error}
        </p>
      )}
      <div className="partner-box__actions">
        <Button type="submit" variant="primary" disabled={props.busy || text.trim() === ''}>
          {props.busy ? PARTNER.joining : PARTNER.joinButton}
        </Button>
      </div>
    </form>
  )
}

export function PartnerSession(props: {
  projectPath: string
  scenarioId: string
  rows: readonly RowView[]
}) {
  const req = { projectPath: props.projectPath, scenarioId: props.scenarioId }
  // Only an exercise that is regional can have a partner seat.
  const regional = useIpcQuery('regional:state', req)
  const query = useIpcQuery('live:partner-status', req, { refetchInterval: 3_000 })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const status = query.data
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['live:partner-status'] })
  const run = (task: Promise<unknown>, failure: string) => {
    setBusy(true)
    setError('')
    task
      .then(refresh)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : failure))
      .finally(() => setBusy(false))
  }
  if (!regional.data || !status) return null
  if (status.state === 'off') {
    return (
      <PartnerJoinForm
        busy={busy}
        error={error}
        onJoin={(invite) => run(call('live:partner-join', { ...req, invite }), PARTNER.joinError)}
      />
    )
  }
  return (
    <section className="partner-box" aria-label={PARTNER.joinHeading}>
      <h3 className="live-note__title">{status.orgName}</h3>
      <p role="status">{stateLine(status)}</p>
      {status.clock && <p className="muted">{PARTNER.clock(status.clock)}</p>}
      {status.scope && (
        <p className="muted">
          {PARTNER.scopeLine(status.scope.rowPrefixes.join(', '), status.scope.roleIds.length)}
        </p>
      )}
      <PartnerRows
        rows={props.rows}
        status={status}
        busy={busy}
        onRelease={(rowId) =>
          run(call('live:partner-release', { ...req, rowId }), PARTNER.releaseError)
        }
      />
      {error && (
        <p className="field__error" role="alert">
          {error}
        </p>
      )}
      <div className="partner-box__actions">
        <Button
          size="sm"
          disabled={busy}
          onClick={() => run(call('live:partner-leave', req), PARTNER.joinError)}
        >
          {PARTNER.leave}
        </Button>
      </div>
    </section>
  )
}
