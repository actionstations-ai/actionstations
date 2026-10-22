// ComfyUI for photographic images and video: detect, add, and show which default workflows
// are missing custom nodes.
import { Badge } from '../../../components/ui'
import { useIpcQuery } from '../../../lib/query'
import { useLocalServices } from '../use-setup'
import type { ProviderViewT } from '../wizard-state'
import { LocalServiceRow } from './LocalServiceRow'
import { errorText } from '../../../lib/errors'

function ComfyStatus({ provider }: { provider: ProviderViewT }) {
  const status = useIpcQuery('comfy:status', { providerId: provider.id })
  if (status.isPending) return <p className="muted">Checking ComfyUI workflows…</p>
  if (status.isError)
    return (
      <p className="field__error" role="alert">
        {errorText(status.error)}
      </p>
    )
  const s = status.data
  if (!s.ok)
    return (
      <p className="muted">
        <Badge tone="warn">Unreachable</Badge> {s.message ?? 'ComfyUI did not answer.'}
      </p>
    )
  const missing = s.workflows.filter((w) => w.missingNodes.length > 0)
  if (!missing.length)
    return (
      <p>
        <Badge tone="ok">Ready</Badge> All {s.workflows.length} default workflows have the nodes
        they need.
      </p>
    )
  return (
    <div className="stack">
      <p>
        <Badge tone="warn">Missing nodes</Badge> Install these custom nodes in ComfyUI (for example
        with ComfyUI-Manager) to use the affected workflows:
      </p>
      <ul className="wizard-list" aria-label="Workflows missing nodes">
        {missing.map((w) => (
          <li key={w.id}>
            <span className="mono">{w.id}</span>: {w.missingNodes.join(', ')}
          </li>
        ))}
      </ul>
    </div>
  )
}

export function ComfySection(props: {
  providers: ProviderViewT[]
  enabled: boolean
  onEnabledChange: (on: boolean) => void
}) {
  const detect = useLocalServices()
  const service = detect.data?.find((s) => s.kind === 'comfyui')
  const comfy = props.providers.find((p) => p.kind === 'comfyui')
  return (
    <div className="card stack">
      <h3>Images and video (ComfyUI)</h3>
      <p className="muted">
        Generates photographic scenes such as a crowded terminal or a smoke-filled baggage hall.
        Documents, posts and screens with text always come from templates, never AI pixels.
      </p>
      {service && (
        <ul className="wizard-services" aria-label="ComfyUI">
          <LocalServiceRow
            service={service}
            added={comfy?.baseUrl === service.baseUrl ? comfy : undefined}
            onAdded={() => props.onEnabledChange(true)}
          />
        </ul>
      )}
      {comfy && (
        <>
          <ComfyStatus provider={comfy} />
          <label className="wizard-check">
            <input
              type="checkbox"
              checked={props.enabled}
              onChange={(e) => props.onEnabledChange(e.target.checked)}
            />
            Use {comfy.label} for images and video
          </label>
        </>
      )}
    </div>
  )
}
