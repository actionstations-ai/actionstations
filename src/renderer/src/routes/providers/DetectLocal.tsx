// "Detect local services": probe LM Studio / Ollama / ComfyUI and the system voice, and add
// one with a click.
import { useState } from 'react'
import type { ChannelResponse } from '@shared/ipc'
import { Badge, Button } from '../../components/ui'
import { toast } from '../../components/toast-store'
import { call } from '../../lib/api'
import { useIpcMutation } from '../../lib/query'
import { pickDefaultModel, type ProviderViewT } from './catalog'

type Found = ChannelResponse<'providers:detect-local'>[number]

function ServiceRow(props: { service: Found; added: boolean }) {
  const s = props.service
  const add = useIpcMutation('providers:upsert', {
    invalidates: ['providers:list', 'routing:get'],
  })
  const defaultModel = pickDefaultModel(s)
  const onAdd = () =>
    add.mutate(
      {
        config: {
          kind: s.kind,
          label: s.label,
          ...(s.baseUrl ? { baseUrl: s.baseUrl } : {}),
          ...(defaultModel ? { defaultModel } : {}),
          options: {},
          enabled: true,
        },
      },
      {
        onSuccess: (v) => toast.success(`${v.label} added`),
        onError: (err) => toast.error(`Could not add ${s.label}`, err),
      },
    )
  return (
    <li className="detect-row">
      <div>
        <strong>{s.label}</strong> <span className="mono muted">{s.baseUrl}</span>
        <div className="muted detect-row__models">
          {s.reachable
            ? s.kind === 'system-tts'
              ? `Installed${s.models.length ? `. Voices: ${s.models.slice(0, 4).join(', ')}` : ''}`
              : s.models.length
                ? `${s.models.length} model${s.models.length === 1 ? '' : 's'}: ${s.models.slice(0, 4).join(', ')}${s.models.length > 4 ? '…' : ''}`
                : 'Running'
            : 'Not running'}
        </div>
      </div>
      {s.reachable ? (
        props.added ? (
          <Badge tone="ok">Added</Badge>
        ) : (
          <Button
            size="sm"
            variant="primary"
            disabled={add.isPending}
            onClick={onAdd}
            aria-label={`Add ${s.label}`}
          >
            Add
          </Button>
        )
      ) : (
        <Badge>Not found</Badge>
      )}
    </li>
  )
}

export function DetectLocal({ providers }: { providers: ProviderViewT[] }) {
  const [found, setFound] = useState<Found[] | null>(null)
  const [busy, setBusy] = useState(false)
  const detect = async () => {
    setBusy(true)
    try {
      setFound(await call('providers:detect-local'))
    } catch (err) {
      toast.error('Detection failed', err)
    } finally {
      setBusy(false)
    }
  }
  const isAdded = (s: Found) =>
    providers.some((p) => p.kind === s.kind && (s.kind === 'system-tts' || p.baseUrl === s.baseUrl))
  return (
    <section className="card stack" aria-labelledby="detect-heading">
      <div className="row providers-section__head">
        <div>
          <h2 id="detect-heading">Local services</h2>
          <p className="muted">
            Looks for LM Studio, Ollama, ComfyUI and a system voice on this computer only.
          </p>
        </div>
        <Button onClick={() => void detect()} disabled={busy}>
          {busy ? 'Detecting…' : 'Detect local services'}
        </Button>
      </div>
      {found && (
        <ul className="detect-list" aria-label="Detected services">
          {found.map((s) => (
            <ServiceRow key={`${s.kind}:${s.baseUrl}`} service={s} added={isAdded(s)} />
          ))}
        </ul>
      )}
    </section>
  )
}
