// SimCell helper devices (#518): one switch that lets staff devices in the SimCell helper seat
// receive the drafted replies and approve, edit or discard them. Off by default; while it is off
// nothing leaves this computer and any decision a device sends is refused.
import { useId, useState } from 'react'
import type { SimcellHelpersView } from '@shared/schemas/live'
import { call } from '../../../lib/api'
import { queryClient, useIpcQuery } from '../../../lib/query'
import { PARTNER } from './partner-strings'
import './partner.css'

export function SimcellHelpersCard(props: {
  view: SimcellHelpersView
  busy: boolean
  error: string
  onChange: (enabled: boolean) => void
}) {
  const id = useId()
  const { view } = props
  return (
    <section className="partner-box" aria-labelledby={`${id}-h`}>
      <h3 id={`${id}-h`} className="live-note__title">
        {PARTNER.helpersHeading}
      </h3>
      <p className="muted">{PARTNER.helpersIntro}</p>
      <label className="partner-switch">
        <input
          type="checkbox"
          checked={view.enabled}
          disabled={props.busy}
          onChange={(e) => props.onChange(e.target.checked)}
        />
        {PARTNER.helpersSwitch}
      </label>
      <p role="status">
        {!view.enabled
          ? PARTNER.helpersOff
          : view.devices === 0
            ? PARTNER.helpersNone
            : PARTNER.helpersSome(view.devices)}
      </p>
      {props.error && (
        <p className="field__error" role="alert">
          {props.error}
        </p>
      )}
    </section>
  )
}

export function SimcellHelpers(props: { projectPath: string; scenarioId: string }) {
  const req = { projectPath: props.projectPath, scenarioId: props.scenarioId }
  const query = useIpcQuery('live:simcell-helpers', req, { refetchInterval: 5_000 })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  if (!query.data) return null
  const change = (enabled: boolean) => {
    setBusy(true)
    setError('')
    call('live:simcell-helpers-set', { ...req, enabled })
      .then(() => queryClient.invalidateQueries({ queryKey: ['live:simcell-helpers'] }))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : PARTNER.helpersError))
      .finally(() => setBusy(false))
  }
  return <SimcellHelpersCard view={query.data} busy={busy} error={error} onChange={change} />
}
