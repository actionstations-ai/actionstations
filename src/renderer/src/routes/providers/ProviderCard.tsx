// One configured provider: what it is, whether it answers, and quick actions.
import { useState } from 'react'
import { Badge, Button, Dialog } from '../../components/ui'
import { toast } from '../../components/toast-store'
import { useIpcMutation, useIpcQuery } from '../../lib/query'
import { KIND_LABELS, kindUsesKey, type ProviderViewT } from './catalog'

const INVALIDATES = [
  'providers:list',
  'providers:health',
  'providers:models',
  'routing:get',
] as const

function HealthBadge({ provider }: { provider: ProviderViewT }) {
  const health = useIpcQuery(
    'providers:health',
    { id: provider.id },
    { enabled: provider.enabled, staleTime: 30_000 },
  )
  if (!provider.enabled) return <Badge>Disabled</Badge>
  if (health.isPending) return <Badge>Checking…</Badge>
  if (health.isError) return <Badge tone="error">Check failed</Badge>
  const { ok, latencyMs, message } = health.data
  const ms = latencyMs !== undefined ? ` · ${Math.round(latencyMs)} ms` : ''
  return (
    <span title={message}>
      <Badge tone={ok ? 'ok' : 'error'}>{ok ? `Reachable${ms}` : 'Unreachable'}</Badge>
    </span>
  )
}

function TestResult({
  result,
}: {
  result: { ok: boolean; sample?: string; latencyMs: number; error?: string }
}) {
  return (
    <p
      className={
        result.ok ? 'provider-test provider-test--ok' : 'provider-test provider-test--error'
      }
      role="status"
    >
      {result.ok
        ? `Replied “${result.sample ?? ''}” in ${Math.round(result.latencyMs)} ms`
        : `Test failed after ${Math.round(result.latencyMs)} ms: ${result.error ?? 'unknown error'}`}
    </p>
  )
}

function RemoveDialog(props: {
  provider: ProviderViewT
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const remove = useIpcMutation('providers:remove', { invalidates: [...INVALIDATES] })
  return (
    <Dialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={`Remove ${props.provider.label}?`}
      description="Its stored API key is deleted and tasks routed to it become unassigned."
      footer={
        <>
          <Button onClick={() => props.onOpenChange(false)}>Cancel</Button>
          <Button
            variant="danger"
            onClick={() =>
              remove.mutate(
                { id: props.provider.id },
                {
                  onSuccess: () => {
                    toast.success(`${props.provider.label} removed`)
                    props.onOpenChange(false)
                  },
                  onError: (err) => toast.error('Could not remove provider', err),
                },
              )
            }
          >
            Remove
          </Button>
        </>
      }
    >
      {null}
    </Dialog>
  )
}

export function ProviderCard(props: { provider: ProviderViewT; onEdit: () => void }) {
  const p = props.provider
  const [removing, setRemoving] = useState(false)
  const test = useIpcMutation('providers:test')
  const toggle = useIpcMutation('providers:upsert', { invalidates: [...INVALIDATES] })
  const setEnabled = (enabled: boolean) => {
    const { hasKey: _hasKey, ...config } = p
    toggle.mutate(
      { config: { ...config, enabled } },
      { onError: (err) => toast.error('Could not update provider', err) },
    )
  }
  return (
    <article className="card stack provider-card" aria-label={p.label}>
      <header className="provider-card__head">
        <div>
          <h3>{p.label}</h3>
          <span className="muted">{KIND_LABELS[p.kind]}</span>
        </div>
        <HealthBadge provider={p} />
      </header>
      <dl className="provider-card__facts">
        <dt>Base URL</dt>
        <dd className="mono">{p.baseUrl ?? 'Default'}</dd>
        <dt>Default model</dt>
        <dd className="mono">{p.defaultModel ?? 'None'}</dd>
        {(kindUsesKey(p.kind) || p.hasKey) && (
          <>
            <dt>API key</dt>
            <dd>{p.hasKey ? <Badge tone="ok">Key stored</Badge> : <Badge>No key</Badge>}</dd>
          </>
        )}
      </dl>
      <label className="row">
        <input
          type="checkbox"
          checked={p.enabled}
          disabled={toggle.isPending}
          onChange={(e) => setEnabled(e.target.checked)}
        />
        Enabled
      </label>
      {test.data && <TestResult result={test.data} />}
      <div className="row provider-card__actions">
        <Button
          size="sm"
          disabled={!p.enabled || test.isPending}
          onClick={() =>
            test.mutate({ id: p.id }, { onError: (err) => toast.error('Test failed', err) })
          }
        >
          {test.isPending ? 'Testing…' : 'Test'}
        </Button>
        <Button size="sm" onClick={props.onEdit}>
          Edit
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setRemoving(true)}>
          Remove
        </Button>
      </div>
      <RemoveDialog provider={p} open={removing} onOpenChange={setRemoving} />
    </article>
  )
}
