// Proposed changes to other organizations’ rows (spec 0440 FR-13).
import { useState } from 'react'
import type { Proposal, RegionalState } from '@shared/schemas/regional'
import { Badge, Field } from '../../components/ui'
import { toast } from '../../components/toast-store'
import { call } from '../../lib/api'
import { errorText } from '../../lib/errors'
import { queryClient } from '../../lib/query'

const FIELDS: Proposal['field'][] = ['event', 'expectedAction', 'time', 'from', 'toLabel']

const refresh = (): Promise<void> =>
  queryClient.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith('regional:') })

export function ProposalsPanel(props: {
  projectPath: string
  scenarioId: string
  state: RegionalState
}) {
  const { projectPath, scenarioId, state } = props
  const [rowId, setRowId] = useState('')
  const [field, setField] = useState<Proposal['field']>('event')
  const [suggested, setSuggested] = useState('')
  const [reason, setReason] = useState('')
  const run = async (fn: () => Promise<unknown>, title: string) => {
    try {
      await fn()
      await refresh()
    } catch (e) {
      toast.error(title, errorText(e))
    }
  }
  const send = () =>
    run(async () => {
      await call('regional:propose', { projectPath, scenarioId, rowId, field, suggested, reason })
      setRowId('')
      setSuggested('')
      setReason('')
    }, 'Could not record the proposal')
  const answer = (id: string, accept: boolean) =>
    run(
      () => call('regional:proposal-resolve', { projectPath, scenarioId, id, accept }),
      'Could not answer',
    )
  return (
    <section className="card stack" aria-labelledby="regional-prop-title">
      <h2 id="regional-prop-title" className="section-title">
        Proposed changes
      </h2>
      {state.proposals.length === 0 ? (
        <p className="muted">No proposals yet.</p>
      ) : (
        <ul className="regional-list">
          {state.proposals.map((p) => (
            <li key={p.id}>
              {p.fromOrg.toUpperCase()} proposes to change {p.field} of {p.rowId} to “
              {Array.isArray(p.suggested) ? p.suggested.join(', ') : p.suggested}” because{' '}
              {p.reason}{' '}
              <Badge
                tone={p.status === 'open' ? 'warn' : p.status === 'accepted' ? 'ok' : 'neutral'}
              >
                {p.status === 'open' ? 'Open' : p.status === 'accepted' ? 'Accepted' : 'Declined'}
              </Badge>{' '}
              {p.status === 'open' && p.toOrg === state.thisOrg && (
                <span className="row">
                  <button
                    type="button"
                    className="btn btn--sm"
                    onClick={() => void answer(p.id, true)}
                  >
                    Accept
                  </button>
                  <button
                    type="button"
                    className="btn btn--sm"
                    onClick={() => void answer(p.id, false)}
                  >
                    Decline
                  </button>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      <h3>Propose a change to another organization’s row</h3>
      <div className="regional-form">
        <Field label="Row id">
          {({ id }) => (
            <input
              id={id}
              className="input"
              value={rowId}
              onChange={(e) => setRowId(e.target.value)}
            />
          )}
        </Field>
        <Field label="Field">
          {({ id }) => (
            <select
              id={id}
              className="select"
              value={field}
              onChange={(e) => setField(e.target.value as Proposal['field'])}
            >
              {FIELDS.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label="Suggested value">
          {({ id }) => (
            <input
              id={id}
              className="input"
              value={suggested}
              onChange={(e) => setSuggested(e.target.value)}
            />
          )}
        </Field>
        <Field label="Reason">
          {({ id }) => (
            <input
              id={id}
              className="input"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          )}
        </Field>
      </div>
      <div className="row">
        <button
          type="button"
          className="btn"
          disabled={!rowId || !suggested || !reason}
          onClick={() => void send()}
        >
          Record proposal
        </button>
      </div>
    </section>
  )
}
