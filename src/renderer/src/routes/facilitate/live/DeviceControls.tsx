// Who is connected and the controls that cut someone off (#494, spec 0417, 0406 rekey): Remove
// closes one device and moves everyone else to a new key; Replace keys does the same with no one
// removed, for a link that leaked. Devices are named by seat, never by their client id.
import { useEffect, useState } from 'react'
import type { LiveDevice } from '@shared/schemas/live'
import { call, subscribe, type IpcError } from '../../../lib/api'
import { queryClient, useIpcQuery } from '../../../lib/query'
import { Badge, Button } from '../../../components/ui'
import './device-controls.css'

const DEVICES = {
  heading: 'Devices',
  empty: 'No devices have joined yet.',
  online: 'Online',
  offline: 'Offline',
  staff: 'Staff',
  replace: 'Replace keys',
  confirmRemove:
    'Remove this device? It is disconnected and cannot rejoin with the links it has. Everyone else switches to a new key without doing anything.',
  confirmReplace:
    'Replace the keys? Links shared so far stop working for new devices. Devices already connected switch to the new key without doing anything.',
  removed: 'Device removed. The other devices moved to a new key.',
  replaced: 'Keys replaced. Share the new links with anyone who has not joined yet.',
} as const

const deviceName = (d: LiveDevice): string => (d.name ? `${d.label} (${d.name})` : d.label)

export function DeviceList(props: {
  devices: readonly LiveDevice[]
  busy: boolean
  onRemove: (d: LiveDevice) => void
}) {
  if (!props.devices.length) return <p className="muted">{DEVICES.empty}</p>
  return (
    <ul className="live-devices__list">
      {props.devices.map((d) => (
        <li key={d.clientRef} className="live-devices__row">
          <span className="live-devices__name">{deviceName(d)}</span>
          {d.staff && <Badge tone="info">{DEVICES.staff}</Badge>}
          <Badge tone={d.online ? 'ok' : 'neutral'}>
            {d.online ? DEVICES.online : DEVICES.offline}
          </Badge>
          <Button
            size="sm"
            variant="danger"
            disabled={props.busy}
            aria-label={`Remove ${deviceName(d)}`}
            onClick={() => props.onRemove(d)}
          >
            Remove
          </Button>
        </li>
      ))}
    </ul>
  )
}

export function DeviceControls(props: { projectPath: string; scenarioId: string }) {
  const req = { projectPath: props.projectPath, scenarioId: props.scenarioId }
  const devices = useIpcQuery('live:devices', req, { refetchInterval: 15_000 })
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  useEffect(
    () =>
      subscribe('live:changed', (e) => {
        if (e.reason === 'presence' || e.reason === 'started') {
          void queryClient.invalidateQueries({ queryKey: ['live:devices'] })
        }
      }),
    [],
  )
  const run = async (confirm: string, done: string, fn: () => Promise<unknown>) => {
    if (!window.confirm(confirm)) return
    setBusy(true)
    try {
      await fn()
      setMessage(done)
    } catch (err) {
      setMessage(`Could not finish: ${(err as IpcError).message}`)
    } finally {
      setBusy(false)
      void queryClient.invalidateQueries({ queryKey: ['live:devices'] })
      void queryClient.invalidateQueries({ queryKey: ['live:session-status'] })
    }
  }
  return (
    <section className="live-devices" aria-labelledby="live-devices-heading">
      <h3 id="live-devices-heading" className="live-note__title">
        {DEVICES.heading}
      </h3>
      <DeviceList
        devices={devices.data ?? []}
        busy={busy}
        onRemove={(d) =>
          void run(DEVICES.confirmRemove, DEVICES.removed, () =>
            call('live:device-remove', { ...req, clientRef: d.clientRef }),
          )
        }
      />
      <div className="row">
        <Button
          size="sm"
          disabled={busy}
          onClick={() =>
            void run(DEVICES.confirmReplace, DEVICES.replaced, () => call('live:keys-replace', req))
          }
        >
          {DEVICES.replace}
        </Button>
      </div>
      <p className="live-devices__message" aria-live="polite">
        {message}
      </p>
    </section>
  )
}
