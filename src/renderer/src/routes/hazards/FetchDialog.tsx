// The consent dialog for a hazard fetch (#439 FR-4): every source with its host, what is sent
// and what comes back, each behind a checkbox. Nothing is requested until Fetch is pressed.
import { useState } from 'react'
import type { HazardFetchOptions } from '@shared/ipc/hazards'
import type { HazardSnapshot, HazardSourceId } from '@shared/schemas'
import { Button, Dialog, Field } from '../../components/ui'
import { toast } from '../../components/toast-store'
import { call } from '../../lib/api'
import { errorText } from '../../lib/errors'
import { queryClient, useIpcQuery } from '../../lib/query'
import { WHAT_IS_SENT_HAZARDS } from './hazard-view'

const DEFAULTS: HazardFetchOptions = {
  firmsDays: 3,
  recentRadiusKm: 250,
  recentMinMagnitude: 2.5,
  historicalRadiusKm: 150,
  historicalMinMagnitude: 4.5,
}

function NumberField(props: {
  label: string
  value: number
  min: number
  max: number
  step?: number
  onChange: (n: number) => void
}) {
  return (
    <Field label={props.label}>
      {({ id }) => (
        <input
          id={id}
          className="input"
          type="number"
          min={props.min}
          max={props.max}
          step={props.step ?? 1}
          value={props.value}
          onChange={(e) => {
            const n = Number(e.target.value)
            if (Number.isFinite(n)) props.onChange(Math.min(props.max, Math.max(props.min, n)))
          }}
        />
      )}
    </Field>
  )
}

export function FetchDialog(props: {
  projectPath: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onDone: (snapshot: HazardSnapshot) => void
}) {
  const { projectPath } = props
  const [options, setOptions] = useState<HazardFetchOptions>(DEFAULTS)
  const [unticked, setUnticked] = useState<Set<HazardSourceId>>(new Set())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const plan = useIpcQuery('hazards:plan', { projectPath, options }, { enabled: props.open })
  const items = plan.data?.items ?? []
  const usable = items.filter((i) => i.available)
  // Every source that can run is ticked until the user unticks it.
  const selected = usable.filter((i) => !unticked.has(i.id)).map((i) => i.id)
  const toggle = (id: HazardSourceId, on: boolean) =>
    setUnticked((u) => {
      const next = new Set(u)
      if (on) next.delete(id)
      else next.add(id)
      return next
    })
  const run = async () => {
    setBusy(true)
    setError(undefined)
    try {
      const snapshot = await call('hazards:fetch', { projectPath, sources: selected, options })
      await queryClient.invalidateQueries({ queryKey: ['hazards:list'] })
      props.onDone(snapshot)
      props.onOpenChange(false)
    } catch (err) {
      setError(errorText(err))
      toast.error('Could not fetch hazard data', err)
    } finally {
      setBusy(false)
    }
  }
  return (
    <Dialog
      open={props.open}
      onOpenChange={(o) => !busy && props.onOpenChange(o)}
      title="Fetch hazard data"
      description={WHAT_IS_SENT_HAZARDS}
      className="hazard-dialog"
      footer={
        <>
          <Button onClick={() => props.onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={busy || selected.length === 0}
            onClick={() => void run()}
          >
            {busy ? 'Fetching…' : 'Fetch'}
          </Button>
        </>
      }
    >
      {plan.isPending && <p className="muted">Working out what would be sent…</p>}
      <form className="stack" onSubmit={(e) => e.preventDefault()} aria-label="Hazard sources">
        <fieldset className="form-section">
          <legend>Sources</legend>
          <ul className="hazard-sources">
            {items.map((i) => {
              const id = `hz-src-${i.id}`
              return (
                <li key={i.id} className="hazard-source">
                  <div className="row">
                    <input
                      id={id}
                      type="checkbox"
                      disabled={!i.available || busy}
                      checked={selected.includes(i.id)}
                      aria-describedby={`${id}-info`}
                      onChange={(e) => toggle(i.id, e.target.checked)}
                    />
                    <label htmlFor={id}>{i.label}</label>
                  </div>
                  <p id={`${id}-info`} className="muted">
                    Host: {i.host}. Sends: {i.sends}. Returns: {i.returns}.
                    {i.reason ? ` Not available: ${i.reason}` : ''}
                  </p>
                </li>
              )
            })}
          </ul>
        </fieldset>
        <fieldset className="form-section">
          <legend>Options</legend>
          <div className="form-grid">
            <NumberField
              label="Recent quakes: radius (km)"
              value={options.recentRadiusKm}
              min={10}
              max={500}
              onChange={(n) => setOptions({ ...options, recentRadiusKm: n })}
            />
            <NumberField
              label="Recent quakes: minimum magnitude"
              value={options.recentMinMagnitude}
              min={0}
              max={9}
              step={0.1}
              onChange={(n) => setOptions({ ...options, recentMinMagnitude: n })}
            />
            <NumberField
              label="Historical quakes: radius (km)"
              value={options.historicalRadiusKm}
              min={10}
              max={500}
              onChange={(n) => setOptions({ ...options, historicalRadiusKm: n })}
            />
            <NumberField
              label="Historical quakes: minimum magnitude"
              value={options.historicalMinMagnitude}
              min={0}
              max={9}
              step={0.1}
              onChange={(n) => setOptions({ ...options, historicalMinMagnitude: n })}
            />
            <NumberField
              label="Fire detections: days (1 to 5)"
              value={options.firmsDays}
              min={1}
              max={5}
              onChange={(n) => setOptions({ ...options, firmsDays: n })}
            />
          </div>
        </fieldset>
      </form>
      <p role="status" aria-live="polite" className="muted">
        {busy ? 'Fetching. This can take up to a minute.' : ''}
      </p>
      {error && (
        <p className="field__error" role="alert">
          {error}
        </p>
      )}
    </Dialog>
  )
}
