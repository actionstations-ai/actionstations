// Setup for the relay and for "Your server" (spec 0410 FR-3, FR-4, FR-7): the option's own fields,
// the Test button and its checklist, the consent step and Start. Nothing here contacts a server
// until the facilitator presses Test or Start.
import { useState } from 'react'
import { RELAY_HOST } from '@shared/live/servers'
import type { LiveConnectionInput } from '@shared/schemas/live'
import { Button, Field } from '../../../components/ui'
import { toast } from '../../../components/toast-store'
import { call, type IpcError } from '../../../lib/api'
import { queryClient, useIpcQuery } from '../../../lib/query'
import { ConsentNotice } from './ConsentNotice'
import { FingerprintView } from './FingerprintView'
import { CONNECTION, LIVE } from './strings'
import { TestBlock } from './TestResults'
import { useConnectionTest } from './use-connection-test'
import type { LiveBusy } from './use-live-session'

type Attribution = 'role' | 'named'

function AttributionFields(props: { value: Attribution; onChange: (a: Attribution) => void }) {
  return (
    <fieldset className="live-fieldset">
      <legend className="field__label">{LIVE.attributionLegend}</legend>
      {(['role', 'named'] as const).map((a) => (
        <label key={a} className="live-radio">
          <input
            type="radio"
            name="live-remote-attr"
            checked={props.value === a}
            onChange={() => props.onChange(a)}
          />
          <span>{a === 'role' ? LIVE.attributionRole : LIVE.attributionNamed}</span>
        </label>
      ))}
    </fieldset>
  )
}

interface ServerState {
  url: string
  insecureHttp: boolean
  key: string
  pin: string | undefined
}

const emptyServer: ServerState = { url: '', insecureHttp: false, key: '', pin: undefined }

function ServerFields(props: {
  value: ServerState
  onChange: (next: ServerState) => void
  keyStored: boolean
}) {
  const servers = useIpcQuery('live:servers-list', undefined)
  const s = props.value
  const set = (patch: Partial<ServerState>) => props.onChange({ ...s, ...patch })
  const list = servers.data ?? []
  return (
    <div className="stack">
      {list.length > 0 && (
        <Field label={CONNECTION.selfHosted.remembered}>
          {({ id }) => (
            <select
              id={id}
              className="select"
              value={list.some((e) => e.url === s.url) ? s.url : ''}
              onChange={(e) => {
                const found = list.find((x) => x.url === e.target.value)
                props.onChange(
                  found
                    ? {
                        url: found.url,
                        insecureHttp: found.url.startsWith('http:'),
                        key: '',
                        pin: found.fingerprintSha256,
                      }
                    : emptyServer,
                )
              }}
            >
              <option value="">{CONNECTION.selfHosted.none}</option>
              {list.map((e) => (
                <option key={e.url} value={e.url}>
                  {e.name ? `${e.name} (${e.url})` : e.url}
                </option>
              ))}
            </select>
          )}
        </Field>
      )}
      <Field label={CONNECTION.selfHosted.url} hint={CONNECTION.selfHosted.urlHint}>
        {({ id, describedBy }) => (
          <input
            id={id}
            className="input"
            type="url"
            autoComplete="off"
            spellCheck={false}
            value={s.url}
            aria-describedby={describedBy}
            onChange={(e) => set({ url: e.target.value, pin: undefined })}
          />
        )}
      </Field>
      <label className="live-radio">
        <input
          type="checkbox"
          checked={s.insecureHttp}
          onChange={(e) => set({ insecureHttp: e.target.checked })}
        />
        <span>
          {CONNECTION.selfHosted.noTls}
          {s.insecureHttp && (
            <span className="live-warning live-radio__help" role="note">
              {CONNECTION.selfHosted.noTlsWarning}
            </span>
          )}
        </span>
      </label>
      <Field
        label={CONNECTION.selfHosted.key}
        hint={props.keyStored ? CONNECTION.selfHosted.keyStored : CONNECTION.selfHosted.keyHint}
      >
        {({ id, describedBy }) => (
          <input
            id={id}
            className="input"
            type="password"
            autoComplete="off"
            value={s.key}
            aria-describedby={describedBy}
            onChange={(e) => set({ key: e.target.value })}
          />
        )}
      </Field>
      {s.pin && (
        <div className="live-note">
          <p>{CONNECTION.selfHosted.pinned}</p>
          <FingerprintView value={s.pin} />
        </div>
      )}
    </div>
  )
}

export function RemoteSetup(props: {
  kind: 'relay' | 'self-hosted'
  projectPath: string
  scenarioId: string
  consented: boolean
  busy: LiveBusy
  onStart: (connection: LiveConnectionInput, attribution: Attribution) => void
}) {
  const relay = props.kind === 'relay'
  const [server, setServer] = useState<ServerState>(emptyServer)
  const [attribution, setAttribution] = useState<Attribution>('role')
  const [consenting, setConsenting] = useState(false)
  const test = useConnectionTest(props.projectPath)
  const servers = useIpcQuery('live:servers-list', undefined)
  const keyStored = (servers.data ?? []).some((e) => e.url === server.url && e.hasKey)

  const connection = (): LiveConnectionInput =>
    relay
      ? { kind: 'relay' }
      : {
          kind: 'self-hosted',
          url: server.url.trim(),
          insecureHttp: server.insecureHttp,
          ...(server.pin ? { fingerprintSha256: server.pin } : {}),
        }
  const fingerprint = test.result?.server?.fingerprintSha256
  const untrusted = test.result?.server?.untrusted === true && !server.pin
  const valid = relay || server.url.trim() !== ''

  const confirm = async () => {
    if (!fingerprint) return
    try {
      await call('live:server-save', { url: server.url.trim(), fingerprintSha256: fingerprint })
      setServer({ ...server, pin: fingerprint })
      test.clear()
      void queryClient.invalidateQueries({ queryKey: ['live:servers-list'] })
      toast.success('Fingerprint confirmed. Test the connection again.')
    } catch (err) {
      toast.error('Could not save the fingerprint', err as IpcError)
    }
  }
  const consent = async () => {
    setConsenting(true)
    try {
      await call('live:consent', {
        projectPath: props.projectPath,
        scenarioId: props.scenarioId,
        kind: props.kind,
      })
      void queryClient.invalidateQueries({ queryKey: ['facilitator:state-get'] })
    } catch (err) {
      toast.error('Could not save your confirmation', err as IpcError)
    } finally {
      setConsenting(false)
    }
  }
  const start = async () => {
    if (!relay && server.key) {
      try {
        await call('live:server-save', {
          url: server.url.trim(),
          serverKey: server.key,
          ...(server.pin ? { fingerprintSha256: server.pin } : {}),
        })
      } catch (err) {
        return toast.error('Could not store the server key', err as IpcError)
      }
    }
    props.onStart(connection(), attribution)
  }

  return (
    <form
      className="live-setup"
      onSubmit={(e) => {
        e.preventDefault()
        void start()
      }}
    >
      {relay ? (
        <div className="live-note">
          <p>
            <span className="field__label">{CONNECTION.relay.host}</span> <code>{RELAY_HOST}</code>
          </p>
          <p>{CONNECTION.relay.limits}</p>
        </div>
      ) : (
        <ServerFields value={server} onChange={setServer} keyStored={keyStored} />
      )}
      <AttributionFields value={attribution} onChange={setAttribution} />
      <TestBlock
        testing={test.testing}
        result={test.result}
        error={test.error}
        disabled={!valid || !props.consented}
        onTest={() => void test.run(connection(), server.key || undefined)}
      />
      {!props.consented && (
        <ConsentNotice kind={props.kind} busy={consenting} onContinue={() => void consent()} />
      )}
      {untrusted && fingerprint && (
        <div className="live-note">
          <p>{CONNECTION.selfHosted.fingerprintHelp}</p>
          <FingerprintView value={fingerprint} />
          <Button type="button" onClick={() => void confirm()}>
            {CONNECTION.selfHosted.confirmFingerprint}
          </Button>
        </div>
      )}
      <Button
        type="submit"
        variant="primary"
        disabled={!valid || !props.consented || untrusted || props.busy !== 'idle'}
      >
        {props.busy === 'starting' ? CONNECTION.starting : CONNECTION.start}
      </Button>
    </form>
  )
}
