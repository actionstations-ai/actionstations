// One detected localhost service with a one-click "Add" (model preselected).
import { useState } from 'react'
import { Badge, Button } from '../../../components/ui'
import { toast } from '../../../components/toast-store'
import { useUpsertProvider } from '../use-setup'
import {
  defaultServiceModel,
  serviceChatModels,
  type LocalService,
  type ProviderViewT,
} from '../wizard-state'

const START_HINTS: Record<string, string> = {
  'LM Studio': 'Start the local server in LM Studio (Developer → Start server), then detect again.',
  Ollama: 'Run "ollama serve", then detect again.',
  ComfyUI: 'Start ComfyUI on port 8188, then detect again.',
}

function ModelSelect(props: {
  label: string
  models: string[]
  loaded: string[]
  value: string
  onChange: (m: string) => void
}) {
  return (
    <select
      className="select wizard-service__model"
      aria-label={`${props.label} model`}
      value={props.value}
      onChange={(e) => props.onChange(e.target.value)}
    >
      {props.models.map((m) => (
        <option key={m} value={m}>
          {props.loaded.includes(m) ? `${m} (loaded)` : m}
        </option>
      ))}
    </select>
  )
}

export function LocalServiceRow(props: {
  service: LocalService
  added?: ProviderViewT
  /** Offer a model choice before adding (text services). */
  chooseModel?: boolean
  onAdded: (p: ProviderViewT) => void
}) {
  const s = props.service
  const chatModels = serviceChatModels(s)
  const loaded = s.loadedModels.filter((m) => chatModels.includes(m))
  const [model, setModel] = useState(defaultServiceModel(s) ?? '')
  const upsert = useUpsertProvider()
  const add = () =>
    upsert.mutate(
      {
        config: {
          kind: s.kind,
          label: s.label,
          baseUrl: s.baseUrl,
          ...(model && props.chooseModel ? { defaultModel: model } : {}),
          options: {},
          enabled: true,
        },
      },
      {
        onSuccess: (v) => {
          toast.success(`${v.label} added`)
          props.onAdded(v)
        },
        onError: (err) => toast.error(`Could not add ${s.label}`, err),
      },
    )
  return (
    <li className="wizard-service">
      <div className="wizard-service__text">
        <strong>{s.label}</strong> <span className="mono muted">{s.baseUrl}</span>
        <span className="muted wizard-service__status">
          {!s.reachable
            ? (START_HINTS[s.label] ?? 'Not running.')
            : props.chooseModel
              ? `${chatModels.length} chat model${chatModels.length === 1 ? '' : 's'} available` +
                (loaded.length ? ` · ${loaded.join(', ')} loaded` : '')
              : 'Running'}
        </span>
      </div>
      {s.reachable && props.chooseModel && chatModels.length > 0 && !props.added && (
        <ModelSelect
          label={s.label}
          models={chatModels}
          loaded={loaded}
          value={model}
          onChange={setModel}
        />
      )}
      {!s.reachable ? (
        <Badge>Not found</Badge>
      ) : props.added ? (
        <Badge tone="ok">Added</Badge>
      ) : (
        <Button size="sm" variant="primary" disabled={upsert.isPending} onClick={add}>
          Add {s.label}
        </Button>
      )}
    </li>
  )
}
