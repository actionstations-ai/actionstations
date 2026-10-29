// Settings → Hazard data (#439): the opt-in switch, what is sent where, and the FIRMS map key.
// The key goes to the OS keychain through main; this screen never shows it again.
import { useState, type FormEvent } from 'react'
import { Button, Field } from '../../components/ui'
import { toast } from '../../components/toast-store'
import { call } from '../../lib/api'
import { useIpcMutation, useIpcQuery } from '../../lib/query'
import { HAZARD_HOSTS_TEXT, NOT_OPERATIONAL, WHAT_IS_SENT_HAZARDS } from '../hazards/hazard-view'

const INVALIDATES = ['hazards:settings', 'hazards:plan'] as const

function FirmsKey(props: { hasKey: boolean; canStore: boolean }) {
  const [key, setKey] = useState('')
  const [replacing, setReplacing] = useState(false)
  const setSecret = useIpcMutation('hazards:firms-key-set', { invalidates: [...INVALIDATES] })
  const remove = useIpcMutation('hazards:firms-key-remove', { invalidates: [...INVALIDATES] })
  const save = (e: FormEvent) => {
    e.preventDefault()
    setSecret.mutate(
      { key: key.trim() },
      {
        onSuccess: () => {
          setKey('')
          setReplacing(false)
          toast.success('Map key saved')
        },
        onError: (err) => toast.error('Could not save the map key', err),
      },
    )
  }
  if (props.hasKey && !replacing)
    return (
      <div className="row" role="group" aria-label="FIRMS map key">
        <span>Map key saved</span>
        <Button onClick={() => setReplacing(true)}>Replace</Button>
        <Button
          onClick={() =>
            remove.mutate(undefined, {
              onSuccess: () => toast.success('Map key removed'),
              onError: (err) => toast.error('Could not remove the map key', err),
            })
          }
        >
          Remove
        </Button>
      </div>
    )
  return (
    <form className="stack" onSubmit={save} aria-label="FIRMS map key">
      <Field
        label="NASA FIRMS map key"
        hint="Optional. A free key from NASA turns on fire detections. It is stored in your computer's keychain and sent only to firms.modaps.eosdis.nasa.gov."
      >
        {({ id, describedBy }) => (
          <input
            id={id}
            className="input"
            type="password"
            autoComplete="off"
            value={key}
            disabled={!props.canStore}
            {...(describedBy ? { 'aria-describedby': describedBy } : {})}
            onChange={(e) => setKey(e.target.value)}
          />
        )}
      </Field>
      {!props.canStore && (
        <p className="field__error" role="alert">
          This computer has no secure storage (keychain), so a map key cannot be saved.
        </p>
      )}
      <div className="row">
        <Button type="submit" variant="primary" disabled={!key.trim() || !props.canStore}>
          Save map key
        </Button>
        {replacing && <Button onClick={() => setReplacing(false)}>Cancel</Button>}
        <Button onClick={() => void call('hazards:firms-signup-open')}>Get a free map key</Button>
      </div>
    </form>
  )
}

export function HazardDataSection() {
  const settings = useIpcQuery('hazards:settings', undefined)
  const save = useIpcMutation('hazards:settings-save', { invalidates: [...INVALIDATES] })
  const data = settings.data
  const toggle = (enabled: boolean) =>
    save.mutate(
      { enabled },
      {
        onSuccess: () =>
          toast.success(enabled ? 'Hazard data turned on' : 'Hazard data turned off'),
        onError: (err) => toast.error('Could not save the setting', err),
      },
    )
  return (
    <section className="card stack settings-section" aria-labelledby="hazards-heading">
      <div>
        <h2 id="hazards-heading">Hazard data</h2>
        <p className="muted">
          Optional. Fetch public weather, earthquake, fire and disaster-declaration information for
          your organization&apos;s area, so ideas and scenarios can fit the place. After a fetch the
          data is saved in the project and works offline.
        </p>
      </div>
      {data && (
        <>
          <label className="row">
            <input
              type="checkbox"
              checked={data.enabled}
              aria-describedby="hazards-hint"
              onChange={(e) => toggle(e.target.checked)}
            />
            <span>Allow fetching public hazard data</span>
          </label>
          <div id="hazards-hint" className="field__hint stack">
            <p>{WHAT_IS_SENT_HAZARDS}</p>
            <p>Services: {HAZARD_HOSTS_TEXT} Off by default.</p>
            <p>{NOT_OPERATIONAL}</p>
          </div>
          {data.enabled && (
            <FirmsKey hasKey={data.hasFirmsKey} canStore={data.encryptionAvailable} />
          )}
        </>
      )}
    </section>
  )
}
