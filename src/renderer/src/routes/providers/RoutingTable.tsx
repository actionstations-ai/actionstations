// Task → provider + model table. Global scope edits settings.defaultRouting; project scope
// shows the inherited global value per task and lets the user override it.
import { useState } from 'react'
import type { ProviderKind, ProviderRef, ProviderRouting, ProviderTask } from '@shared/schemas'
import { Button } from '../../components/ui'
import { useIpcQuery } from '../../lib/query'
import { ModelInput } from './ModelInput'
import type { ModelPurpose } from './model-suggestions'
import { TASKS, cleanRouting, type ProviderViewT, type RoutingView, type TaskInfo } from './catalog'

type Draft = Partial<Record<ProviderTask, ProviderRef>>

const CHAT_TASKS: ProviderTask[] = ['ideate', 'draft', 'critique']

/** Text tasks never get embedding suggestions; the embed task gets only those (#225). */
function modelPurpose(task: ProviderTask): ModelPurpose | undefined {
  if (CHAT_TASKS.includes(task)) return 'chat'
  return task === 'embed' ? 'embedding' : undefined
}

const purposeProp = (task: ProviderTask): { purpose?: ModelPurpose } => {
  const purpose = modelPurpose(task)
  return purpose ? { purpose } : {}
}

function describeRef(ref: ProviderRef | undefined, providers: ProviderViewT[]): string {
  if (!ref) return 'Not assigned'
  const p = providers.find((x) => x.id === ref.providerId)
  if (!p) return `Missing provider (${ref.providerId})`
  const model = ref.model ?? p.defaultModel
  return model ? `${p.label} · ${model}` : p.label
}

function ProviderSelect(props: {
  info: TaskInfo
  providers: ProviderViewT[]
  /** Provider kinds main says can serve this task (adapter capabilities); undefined while loading. */
  supported: ProviderKind[] | undefined
  value: string
  onChange: (id: string) => void
}) {
  const options = props.providers.filter(
    (p) => p.id === props.value || (p.enabled && !!props.supported?.includes(p.kind)),
  )
  return (
    <select
      className="select"
      aria-label={`${props.info.label} provider`}
      value={props.value}
      onChange={(e) => props.onChange(e.target.value)}
    >
      <option value="">Not assigned</option>
      {options.map((p) => (
        <option key={p.id} value={p.id}>
          {p.label}
          {p.enabled ? '' : ' (disabled)'}
        </option>
      ))}
    </select>
  )
}

const EMBEDDING_MODE_LABELS = {
  hash: 'Keyword hashing',
  'local-onnx': 'Local model',
  provider: 'Configured provider',
} as const

/** Embeddings row: whether Settings → Embeddings currently uses this row, with a link there. */
function EmbeddingNote() {
  const settings = useIpcQuery('settings:get', undefined)
  const mode = settings.data?.embeddings.mode
  const explicit = settings.data?.embeddings.providerId
  let status = ''
  if (mode === 'provider')
    status = explicit
      ? `In use, but Settings names provider "${explicit}" directly, which takes precedence.`
      : 'In use: Settings → Embeddings is set to "Configured provider".'
  else if (mode)
    status = `Not in use: Settings → Embeddings is set to "${EMBEDDING_MODE_LABELS[mode]}".`
  return (
    <span className="muted routing-task__purpose routing-task__note">
      {status && <span data-testid="embedding-status">{status} </span>}
      <a href="#/settings">Open Settings → Embeddings</a>
    </span>
  )
}

function RoutingRow(props: {
  info: TaskInfo
  providers: ProviderViewT[]
  supported: ProviderKind[] | undefined
  value: ProviderRef | undefined
  onChange: (ref: ProviderRef | undefined) => void
  /** Project scope only. */
  inherited?: ProviderRef | undefined
  overriding?: boolean
  onOverride?: (on: boolean) => void
}) {
  const { info, value } = props
  const projectScope = props.onOverride !== undefined
  const editable = !projectScope || props.overriding
  const provider = props.providers.find((p) => p.id === value?.providerId)
  return (
    <tr>
      <th scope="row" className="routing-task">
        <span className="routing-task__label">{info.label}</span>
        <span className="muted routing-task__purpose">{info.purpose}</span>
        {info.task === 'embed' && <EmbeddingNote />}
      </th>
      {projectScope && (
        <td>
          <label className="row">
            <input
              type="checkbox"
              aria-label={`Override ${info.label}`}
              checked={!!props.overriding}
              onChange={(e) => props.onOverride!(e.target.checked)}
            />
            Override
          </label>
        </td>
      )}
      {editable ? (
        <>
          <td>
            <ProviderSelect
              info={info}
              providers={props.providers}
              supported={props.supported}
              value={value?.providerId ?? ''}
              onChange={(id) => props.onChange(id ? { providerId: id } : undefined)}
            />
          </td>
          <td>
            <ModelInput
              label={`${info.label} model`}
              {...(value?.providerId ? { providerId: value.providerId } : {})}
              {...purposeProp(info.task)}
              value={value?.model ?? ''}
              placeholder={
                provider?.defaultModel ? `Default (${provider.defaultModel})` : 'Provider default'
              }
              onChange={(m) => value && props.onChange({ ...value, model: m })}
            />
          </td>
        </>
      ) : (
        <td colSpan={2} className="muted">
          Inherits {describeRef(props.inherited, props.providers)}
        </td>
      )}
    </tr>
  )
}

export function RoutingTable(props: {
  scope: 'global' | 'project'
  providers: ProviderViewT[]
  view: RoutingView
  saving: boolean
  onSave: (routing: ProviderRouting) => void
}) {
  const support = useIpcQuery('providers:task-support', undefined)
  const initial: Draft = (props.scope === 'global' ? props.view.global : props.view.project) ?? {}
  const [draft, setDraft] = useState<Draft>(initial)
  const [overrides, setOverrides] = useState<Set<ProviderTask>>(
    () => new Set(Object.keys(initial) as ProviderTask[]),
  )
  const next = cleanRouting(
    props.scope === 'global'
      ? draft
      : Object.fromEntries(Object.entries(draft).filter(([t]) => overrides.has(t as ProviderTask))),
  )
  const dirty = JSON.stringify(next) !== JSON.stringify(cleanRouting(initial))

  const setRow = (task: ProviderTask, ref: ProviderRef | undefined) =>
    setDraft((d) => ({ ...d, [task]: ref }))
  const setOverride = (task: ProviderTask, on: boolean) => {
    setOverrides((s) => {
      const copy = new Set(s)
      if (on) copy.add(task)
      else copy.delete(task)
      return copy
    })
    if (on && !draft[task]) setRow(task, props.view.global[task])
  }

  return (
    <div className="stack">
      <div className="routing-scroll">
        <table className="table routing-table">
          <thead>
            <tr>
              <th scope="col">Task</th>
              {props.scope === 'project' && <th scope="col">Scope</th>}
              <th scope="col">Provider</th>
              <th scope="col">Model</th>
            </tr>
          </thead>
          <tbody>
            {TASKS.map((info) => (
              <RoutingRow
                key={info.task}
                info={info}
                providers={props.providers}
                supported={support.data?.[info.task]?.kinds}
                value={draft[info.task]}
                onChange={(ref) => setRow(info.task, ref)}
                {...(props.scope === 'project'
                  ? {
                      inherited: props.view.global[info.task],
                      overriding: overrides.has(info.task),
                      onOverride: (on: boolean) => setOverride(info.task, on),
                    }
                  : {})}
              />
            ))}
          </tbody>
        </table>
      </div>
      <div className="row">
        <Button
          variant="primary"
          disabled={!dirty || props.saving}
          onClick={() => props.onSave(next)}
        >
          Save routing
        </Button>
        {dirty && <span className="muted">Unsaved changes</span>}
      </div>
    </div>
  )
}
