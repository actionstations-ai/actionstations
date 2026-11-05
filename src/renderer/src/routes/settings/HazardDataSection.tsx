// Settings → Hazard data (#439): the opt-in switch, what is sent where, and the FIRMS map key and the AirNow key.
// The key goes to the OS keychain through main; this screen never shows it again.
import { toast } from '../../components/toast-store'
import { call } from '../../lib/api'
import { useIpcMutation, useIpcQuery } from '../../lib/query'
import { ApiKey, type KeyCopy } from './ApiKeyForm'
import { HAZARD_HOSTS_TEXT, NOT_OPERATIONAL, WHAT_IS_SENT_HAZARDS } from '../hazards/hazard-view'

const INVALIDATES = ['hazards:settings', 'hazards:plan'] as const

const FIRMS_COPY: KeyCopy = {
  label: 'NASA FIRMS map key',
  group: 'FIRMS map key',
  hint: "Optional. A free key from NASA turns on fire detections. It is stored in your computer's keychain and sent only to firms.modaps.eosdis.nasa.gov.",
  noun: 'map key',
  signup: 'Get a free map key',
}

const AIRNOW_COPY: KeyCopy = {
  label: 'EPA AirNow key',
  group: 'AirNow key',
  hint: "Optional. A free key from EPA turns on air quality readings for wildfire smoke exercises. It is stored in your computer's keychain and sent only to www.airnowapi.org.",
  noun: 'AirNow key',
  signup: 'Get a free AirNow key',
}

function FirmsKey(props: { hasKey: boolean; canStore: boolean }) {
  const set = useIpcMutation('hazards:firms-key-set', { invalidates: [...INVALIDATES] })
  const remove = useIpcMutation('hazards:firms-key-remove', { invalidates: [...INVALIDATES] })
  return (
    <ApiKey
      hasKey={props.hasKey}
      canStore={props.canStore}
      copy={FIRMS_COPY}
      ops={{
        save: (key, done) => set.mutate({ key }, done),
        remove: (done) => remove.mutate(undefined, done),
        openSignup: () => void call('hazards:firms-signup-open'),
      }}
    />
  )
}

function AirnowKey(props: { hasKey: boolean; canStore: boolean }) {
  const set = useIpcMutation('hazards:airnow-key-set', { invalidates: [...INVALIDATES] })
  const remove = useIpcMutation('hazards:airnow-key-remove', { invalidates: [...INVALIDATES] })
  return (
    <ApiKey
      hasKey={props.hasKey}
      canStore={props.canStore}
      copy={AIRNOW_COPY}
      ops={{
        save: (key, done) => set.mutate({ key }, done),
        remove: (done) => remove.mutate(undefined, done),
        openSignup: () => void call('hazards:airnow-signup-open'),
      }}
    />
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
            <>
              <FirmsKey hasKey={data.hasFirmsKey} canStore={data.encryptionAvailable} />
              <AirnowKey hasKey={data.hasAirnowKey} canStore={data.encryptionAvailable} />
            </>
          )}
        </>
      )}
    </section>
  )
}
