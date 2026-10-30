// The Inject panel's live part (#412): who the inject goes to, the send-to-devices switch,
// and, once released, who has received and read it, with Resend.
import { useId, useMemo, useState } from 'react'
import { isCallInject } from '@shared/live/call-types'
import type { Destination } from '@shared/live/schemas/envelope'
import { resolveTargets } from '@shared/live/targets'
import type { Scenario } from '@shared/schemas/scenario'
import { Button } from '../../../components/ui'
import { toast } from '../../../components/toast-store'
import type { TimelineEntry } from '../Timeline'
import { destinationChoices, deviceChoices, type Choice } from './destinations'
import { receiptLine, type LiveDelivery } from './use-live-delivery'

const labelFor = (choices: Choice[], d: string): string =>
  choices.find((c) => c.value === d)?.label ?? d.replace(/^(role|team|client):/, '')

function TargetEditor({
  choices,
  value,
  onChange,
}: {
  choices: Choice[]
  value: Destination[]
  onChange: (next: Destination[]) => void
}) {
  const toggle = (d: Destination) => {
    const next = value.includes(d) ? value.filter((x) => x !== d) : [...value, d]
    if (next.length) onChange(next)
  }
  return (
    <fieldset className="fac-live__targets">
      <legend className="sr-only">Send to</legend>
      {choices.map((c) => (
        <label key={c.value} className="fac-live__check">
          <input
            type="checkbox"
            checked={value.includes(c.value)}
            onChange={() => toggle(c.value)}
          />
          {c.label}
        </label>
      ))}
    </fieldset>
  )
}

function Receipts({
  live,
  entry,
  choices,
}: {
  live: LiveDelivery
  entry: TimelineEntry
  choices: Choice[]
}) {
  const summary = entry.live
  const [resendTo, setResendTo] = useState('')
  const id = useId()
  if (!summary) return null
  const more = choices.filter((c) => !summary.targets.includes(c.value) && c.value !== 'all')
  const time = (ms?: number) =>
    ms === undefined
      ? '—'
      : new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  const resend = () =>
    live
      .resend(summary.releaseId, [resendTo as Destination])
      .catch((e: Error) => toast.error('Could not resend', e.message))
  return (
    <section className="fac-live__receipts" aria-label="Device receipts">
      <p role="status">{receiptLine(summary)}</p>
      {summary.perClient.length > 0 && (
        <table className="fac-live__table">
          <thead>
            <tr>
              <th scope="col">Seat</th>
              <th scope="col">Delivered</th>
              <th scope="col">Read</th>
              <th scope="col">Actioned</th>
            </tr>
          </thead>
          <tbody>
            {summary.perClient.map((r) => (
              <tr key={r.clientRef}>
                <th scope="row">
                  {r.seat}
                  {r.displayName ? ` (${r.displayName})` : ''}
                </th>
                <td>{time(r.delivered)}</td>
                <td>{time(r.read)}</td>
                <td>{time(r.actioned)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {more.length > 0 && (
        <div className="row">
          <label htmlFor={id} className="sr-only">
            Resend to
          </label>
          <select
            id={id}
            className="select"
            value={resendTo}
            onChange={(e) => setResendTo(e.target.value)}
          >
            <option value="">Resend to…</option>
            {more.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
          <Button size="sm" disabled={!resendTo} onClick={resend}>
            Resend
          </Button>
        </div>
      )}
    </section>
  )
}

export function LiveInjectSection({
  live,
  scenario,
  entry,
}: {
  live: LiveDelivery
  scenario: Scenario
  entry: TimelineEntry
}) {
  const rowId = entry.row.id
  const o = live.options(rowId)
  const [editing, setEditing] = useState(false)
  const choices = useMemo(
    () => [...destinationChoices(scenario.roles), ...deviceChoices(live.devices)],
    [scenario.roles, live.devices],
  )
  const computed = useMemo(
    () => resolveTargets(entry.row, entry.inject?.deliveryMode, scenario.roles),
    [entry.row, entry.inject?.deliveryMode, scenario.roles],
  )
  const targets = entry.live ? (entry.live.targets as Destination[]) : (o.targets ?? computed)
  const released = !!entry.live
  return (
    <section className="fac-live" aria-label="Devices">
      <label className="fac-live__check">
        <input
          type="checkbox"
          checked={o.sendToDevices}
          disabled={released}
          onChange={(e) => live.setOptions(rowId, { sendToDevices: e.target.checked })}
        />
        Send to devices
      </label>
      <p className="fac-live__chips">
        <span>To devices:</span>{' '}
        {targets.map((t) => (
          <span key={t} className="fac-live__chip">
            {labelFor(choices, t)}
          </span>
        ))}{' '}
        {!released && o.sendToDevices && (
          <Button size="sm" aria-expanded={editing} onClick={() => setEditing((v) => !v)}>
            Edit targets
          </Button>
        )}
      </p>
      {editing && !released && (
        <TargetEditor
          choices={choices}
          value={targets}
          onChange={(t) => live.setOptions(rowId, { targets: t })}
        />
      )}
      {!released && isCallInject(entry.inject) && (
        <div className="row">
          <Button
            size="sm"
            onClick={() =>
              live
                .ringAsCall(rowId)
                .then(() => toast.success('The call is ringing on the devices'))
                .catch((e: Error) => toast.error('Could not ring the call', e.message))
            }
          >
            Ring players as a call
          </Button>
        </div>
      )}
      {!released && o.sendToDevices && entry.row.expectedAction.trim() !== '' && (
        <label className="fac-live__check">
          <input
            type="checkbox"
            checked={o.showExpected}
            onChange={(e) => live.setOptions(rowId, { showExpected: e.target.checked })}
          />
          Show expected actions to evaluators
        </label>
      )}
      <Receipts live={live} entry={entry} choices={choices} />
    </section>
  )
}
