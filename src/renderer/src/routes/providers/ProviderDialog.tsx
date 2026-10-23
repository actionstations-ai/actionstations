// Add / edit a provider. Presets fill kind + base URL; the key is write-only.
import { useState, type FormEvent } from 'react'
import type { ProviderKind } from '@shared/schemas'
import { Button, Dialog, Field } from '../../components/ui'
import { toast } from '../../components/toast-store'
import { useIpcMutation } from '../../lib/query'
import { ApiKeyField, type KeyChange } from './ApiKeyField'
import { ModelInput } from './ModelInput'
import {
  KIND_LABELS,
  PRESETS,
  kindRequiresKey,
  kindUsesBaseUrl,
  kindUsesKey,
  type Preset,
  type ProviderViewT,
} from './catalog'

interface Draft {
  presetId: string
  kind: ProviderKind
  label: string
  baseUrl: string
  defaultModel: string
  enabled: boolean
  apiKey: KeyChange
}

function draftFrom(existing: ProviderViewT | undefined): Draft {
  if (existing)
    return {
      presetId: '',
      kind: existing.kind,
      label: existing.label,
      baseUrl: existing.baseUrl ?? '',
      defaultModel: existing.defaultModel ?? '',
      enabled: existing.enabled,
      apiKey: undefined,
    }
  const p = PRESETS[0]!
  return { ...fromPreset(p), defaultModel: '', enabled: true, apiKey: undefined }
}

const fromPreset = (p: Preset) => ({
  presetId: p.id,
  kind: p.kind,
  label: p.label,
  baseUrl: p.baseUrl,
})

function validate(d: Draft, hasKey: boolean) {
  const errors: { label?: string; baseUrl?: string; apiKey?: string } = {}
  if (!d.label.trim()) errors.label = 'Give the provider a name.'
  if (kindUsesBaseUrl(d.kind) && !d.baseUrl.trim()) errors.baseUrl = 'Enter the server address.'
  else if (d.baseUrl.trim() && !/^https?:\/\/\S+$/.test(d.baseUrl.trim()))
    errors.baseUrl = 'Use an http:// or https:// address.'
  const keyAfterSave = typeof d.apiKey === 'string' || (hasKey && d.apiKey !== null)
  if (kindRequiresKey(d.kind) && !keyAfterSave) errors.apiKey = 'This provider needs an API key.'
  return errors
}

type Errors = ReturnType<typeof validate>
type SetDraft = (patch: Partial<Draft>) => void

/** The config providers:upsert stores for a draft (trimmed, empty optionals left out). */
function upsertRequest(draft: Draft, existing: ProviderViewT | undefined) {
  const baseUrl = draft.baseUrl.trim()
  const defaultModel = draft.defaultModel.trim()
  return {
    config: {
      ...(existing ? { id: existing.id, options: existing.options } : {}),
      kind: draft.kind,
      label: draft.label.trim(),
      ...(baseUrl ? { baseUrl } : {}),
      ...(defaultModel ? { defaultModel } : {}),
      enabled: draft.enabled,
    },
    ...(draft.apiKey !== undefined ? { apiKey: draft.apiKey } : {}),
  }
}

function useSaveProvider(existing: ProviderViewT | undefined, onDone: () => void) {
  const upsert = useIpcMutation('providers:upsert', {
    invalidates: ['providers:list', 'providers:health', 'providers:models', 'routing:get'],
  })
  const save = (draft: Draft) =>
    upsert.mutate(upsertRequest(draft, existing), {
      onSuccess: (v) => {
        toast.success(`${v.label} saved`)
        onDone()
      },
      onError: (err) => toast.error('Could not save provider', err),
    })
  return { save, pending: upsert.isPending }
}

function PresetField(props: { draft: Draft; preset: Preset | undefined; set: SetDraft }) {
  return (
    <Field label="Type" hint={props.preset?.hint}>
      {({ id, describedBy }) => (
        <select
          id={id}
          className="select"
          value={props.draft.presetId}
          aria-describedby={describedBy}
          onChange={(e) => {
            const p = PRESETS.find((x) => x.id === e.target.value)!
            props.set({ ...fromPreset(p), apiKey: undefined })
          }}
        >
          {PRESETS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      )}
    </Field>
  )
}

function NameField(props: { draft: Draft; errors: Errors; set: SetDraft }) {
  const { errors } = props
  return (
    <Field label="Name" {...(errors.label ? { error: errors.label } : {})}>
      {({ id, describedBy, invalid }) => (
        <input
          id={id}
          className="input"
          value={props.draft.label}
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
          onChange={(e) => props.set({ label: e.target.value })}
        />
      )}
    </Field>
  )
}

function BaseUrlField(props: {
  draft: Draft
  preset: Preset | undefined
  errors: Errors
  set: SetDraft
}) {
  const { errors, preset } = props
  return (
    <Field label="Base URL" {...(errors.baseUrl ? { error: errors.baseUrl } : {})}>
      {({ id, describedBy, invalid }) => (
        <input
          id={id}
          className="input mono"
          value={props.draft.baseUrl}
          readOnly={preset ? !preset.baseUrlEditable : false}
          placeholder="http://127.0.0.1:8000/v1"
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
          onChange={(e) => props.set({ baseUrl: e.target.value })}
        />
      )}
    </Field>
  )
}

function DefaultModelField(props: {
  draft: Draft
  existing: ProviderViewT | undefined
  set: SetDraft
}) {
  const isSystemVoice = props.draft.kind === 'system-tts'
  return (
    <Field
      label={isSystemVoice ? 'Default voice' : 'Default model'}
      hint={
        isSystemVoice
          ? 'Optional, e.g. Samantha (macOS) or en-gb (espeak). Each speaker gets its own voice.'
          : 'Used when a task does not name a model.'
      }
    >
      {({ id, describedBy }) => (
        <ModelInput
          id={id}
          {...(props.existing ? { providerId: props.existing.id } : {})}
          {...(describedBy ? { describedBy } : {})}
          purpose="chat"
          value={props.draft.defaultModel}
          placeholder={isSystemVoice ? 'System default' : 'e.g. qwen3-30b-a3b-2507'}
          onChange={(v) => props.set({ defaultModel: v })}
        />
      )}
    </Field>
  )
}

function ProviderForm(props: { existing?: ProviderViewT; onDone: () => void }) {
  const { existing } = props
  const [draft, setDraft] = useState<Draft>(() => draftFrom(existing))
  const [submitted, setSubmitted] = useState(false)
  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }))
  const preset = PRESETS.find((p) => p.id === draft.presetId)
  const hasKey = existing?.hasKey ?? false
  const showKey = preset ? preset.usesKey : kindUsesKey(draft.kind) || hasKey
  const errors = submitted ? validate(draft, hasKey) : {}
  const { save, pending } = useSaveProvider(existing, props.onDone)

  const submit = (e: FormEvent) => {
    e.preventDefault()
    setSubmitted(true)
    if (!Object.keys(validate(draft, hasKey)).length) save(draft)
  }

  return (
    <form className="stack" onSubmit={submit} noValidate>
      {!existing && <PresetField draft={draft} preset={preset} set={set} />}
      {existing && <p className="muted">Type: {KIND_LABELS[draft.kind]}</p>}
      <NameField draft={draft} errors={errors} set={set} />
      {draft.kind !== 'system-tts' && (
        <BaseUrlField draft={draft} preset={preset} errors={errors} set={set} />
      )}
      <DefaultModelField draft={draft} existing={existing} set={set} />
      {showKey && (
        <ApiKeyField
          hasKey={hasKey}
          required={kindRequiresKey(draft.kind)}
          value={draft.apiKey}
          onChange={(v) => set({ apiKey: v })}
          {...(errors.apiKey ? { error: errors.apiKey } : {})}
        />
      )}
      <label className="row">
        <input
          type="checkbox"
          checked={draft.enabled}
          onChange={(e) => set({ enabled: e.target.checked })}
        />
        Enabled
      </label>
      <div className="dialog__footer">
        <Button onClick={props.onDone}>Cancel</Button>
        <Button type="submit" variant="primary" disabled={pending}>
          {existing ? 'Save provider' : 'Add provider'}
        </Button>
      </div>
    </form>
  )
}

export function ProviderDialog(props: {
  open: boolean
  onOpenChange: (open: boolean) => void
  existing?: ProviderViewT
}) {
  return (
    <Dialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={props.existing ? `Edit ${props.existing.label}` : 'Add provider'}
    >
      {props.open && (
        <ProviderForm
          key={props.existing?.id ?? 'new'}
          {...(props.existing ? { existing: props.existing } : {})}
          onDone={() => props.onOpenChange(false)}
        />
      )}
    </Dialog>
  )
}
