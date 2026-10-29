// Live play in Settings (spec 0410 FR-10): the connection a new scenario opens on, and the servers
// this computer remembers (rename, re-test, forget). A server key is shown only as "stored" or
// "not set", never its value. Nothing contacts a server except the Test button.
import { useState } from 'react'
import type { AppSettings } from '@shared/schemas'
import type { ConnectionTestResult } from '@shared/schemas/live'
import { Button, Field } from '../../components/ui'
import { toast } from '../../components/toast-store'
import { call, type IpcError } from '../../lib/api'
import { queryClient, useIpcMutation, useIpcQuery } from '../../lib/query'

type Kind = AppSettings['live']['defaultConnectionKind']

const KIND_LABEL: Record<Kind, string> = {
  lan: 'This computer',
  relay: 'Action Stations relay',
  'self-hosted': 'Your server',
}

function ServerRow(props: {
  server: {
    url: string
    name?: string | undefined
    hasKey: boolean
    fingerprintSha256?: string | undefined
    lastError?: string | undefined
    lastTestedAt?: string | undefined
  }
}) {
  const { server } = props
  const [name, setName] = useState(server.name ?? '')
  const [testing, setTesting] = useState(false)
  const [result, setResult] = useState<ConnectionTestResult | undefined>()
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['live:servers-list'] })
  const save = async () => {
    try {
      await call('live:server-save', { url: server.url, name })
      refresh()
      toast.success('Server renamed')
    } catch (err) {
      toast.error('Could not rename the server', err as IpcError)
    }
  }
  const retest = async () => {
    setTesting(true)
    try {
      setResult(
        await call('live:connection-test', {
          connection: {
            kind: 'self-hosted',
            url: server.url,
            insecureHttp: server.url.startsWith('http:'),
            ...(server.fingerprintSha256 ? { fingerprintSha256: server.fingerprintSha256 } : {}),
          },
        }),
      )
      refresh()
    } catch (err) {
      toast.error('Could not test the server', err as IpcError)
    } finally {
      setTesting(false)
    }
  }
  const forget = async () => {
    try {
      await call('live:server-forget', { url: server.url })
      refresh()
      toast.success('Server forgotten')
    } catch (err) {
      toast.error('Could not forget the server', err as IpcError)
    }
  }
  return (
    <li className="stack settings-catalog">
      <span className="mono">{server.url}</span>
      <span className="field__hint">
        Server key: {server.hasKey ? 'stored' : 'not set'}
        {server.fingerprintSha256 ? ' · certificate pinned' : ''}
      </span>
      {server.lastError && (
        <span className="field__error">Last test failed: {server.lastError}</span>
      )}
      <div className="row">
        <Field label="Name">
          {({ id }) => (
            <input
              id={id}
              className="input"
              value={name}
              maxLength={80}
              onChange={(e) => setName(e.target.value)}
            />
          )}
        </Field>
        <Button size="sm" disabled={name === (server.name ?? '')} onClick={() => void save()}>
          Save name
        </Button>
        <Button size="sm" disabled={testing} onClick={() => void retest()}>
          {testing ? 'Testing…' : 'Test'}
        </Button>
        <Button
          size="sm"
          variant="danger"
          aria-label={`Forget ${server.name ?? server.url}`}
          onClick={() => void forget()}
        >
          Forget
        </Button>
      </div>
      <div role="status" aria-live="polite">
        {result && (
          <ul aria-label="Test results">
            {result.checks.map((c) => (
              <li key={c.id}>
                {c.status === 'pass' ? 'Passed' : c.status === 'warn' ? 'Check' : 'Failed'}:{' '}
                {c.label}
                {c.detail ? `. ${c.detail}` : ''}
              </li>
            ))}
          </ul>
        )}
      </div>
    </li>
  )
}

export function LivePlaySection({ settings }: { settings: AppSettings }) {
  const servers = useIpcQuery('live:servers-list', undefined)
  const update = useIpcMutation('settings:update', { invalidates: ['settings:get'] })
  const kind = settings.live?.defaultConnectionKind ?? 'lan'
  const list = servers.data ?? []
  return (
    <section className="card stack settings-section" aria-labelledby="live-play-heading">
      <div>
        <h2 id="live-play-heading">Live play</h2>
        <p className="muted">
          How players' devices reach this computer. The choice here only pre-selects a connection
          for a scenario that has none; nothing connects until you press Test or Start on the
          Facilitate page.
        </p>
      </div>
      <Field label="Default connection">
        {({ id }) => (
          <select
            id={id}
            className="select"
            value={kind}
            onChange={(e) =>
              update.mutate(
                { live: { defaultConnectionKind: e.target.value as Kind } },
                { onError: (err) => toast.error('Could not save the setting', err) },
              )
            }
          >
            {(Object.keys(KIND_LABEL) as Kind[]).map((k) => (
              <option key={k} value={k}>
                {KIND_LABEL[k]}
              </option>
            ))}
          </select>
        )}
      </Field>
      <div>
        <h3>Remembered servers</h3>
        {list.length === 0 ? (
          <p className="muted">
            No servers remembered. A server you use for an exercise is added here.
          </p>
        ) : (
          <ul className="stack settings-catalogs" aria-label="Remembered servers">
            {list.map((s) => (
              <ServerRow key={s.url} server={s} />
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
