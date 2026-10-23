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
  if (d.kind !== 'anthropic' && d.kind !== 'mock' && !d.baseUrl.trim())
    errors.baseUrl = 'Enter the server address.'
  else if (d.baseUrl.trim() && !/^https?:\/\/\S+$/.test(d.baseUrl.trim()))
    errors.baseUrl = 'Use an http:// or https:// address.'
  const keyAfterSave = typeof d.apiKey === 'string' || (hasKey && d.apiKey !== null)
  if (kindRequiresKey(d.kind) && !keyAfterSave) errors.apiKey = 'This provider needs an API key.'
  return errors
}

function ProviderForm(props: { existing?: ProviderViewT; onDone: () => void }) {
  const [draft, setDraft] = useState<Draft>(() => draftFrom(props.existing))
  const [submitted, setSubmitted] = useState(false)
  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }))
  const preset = PRESETS.find((p) => p.id === draft.presetId)
  const hasKey = props.existing?.hasKey ?? false
  const showKey = preset ? preset.usesKey : kindUsesKey(draft.kind) || hasKey
  const errors = submitted ? validate(draft, hasKey) : {}
  const upsert = useIpcMutation('providers:upsert', {
    invalidates: ['providers:list', 'providers:health', 'providers:models', 'routing:get'],
  })

  const submit = (e: FormEvent) => {
    e.preventDefault()
    setSubmitted(true)
    if (Object.keys(validate(draft, hasKey)).length) return
    const baseUrl = draft.baseUrl.trim()
    const defaultModel = draft.defaultModel.trim()
    upsert.mutate(
      {
        config: {
          ...(props.existing ? { id: props.existing.id, options: props.existing.options } : {}),
          kind: draft.kind,
          label: draft.label.trim(),
          ...(baseUrl ? { baseUrl } : {}),
          ...(defaultModel ? { defaultModel } : {}),
          enabled: draft.enabled,
        },
        ...(draft.apiKey !== undefined ? { apiKey: draft.apiKey } : {}),
      },
      {
        onSuccess: (v) => {
          toast.success(`${v.label} saved`)
          props.onDone()
        },
        onError: (err) => toast.error('Could not save provider', err),
      },
    )
  }

  return (
    <form className="stack" onSubmit={submit} noValidate>
      {!props.existing && (
        <Field label="Type" hint={preset?.hint}>
          {({ id, describedBy }) => (
            <select
              id={id}
              className="select"
              value={draft.presetId}
              aria-describedby={describedBy}
              onChange={(e) => {
                const p = PRESETS.find((x) => x.id === e.target.value)!
                set({ ...fromPreset(p), apiKey: undefined })
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
      )}
      {props.existing && <p className="muted">Type: {KIND_LABELS[draft.kind]}</p>}
      <Field label="Name" {...(errors.label ? { error: errors.label } : {})}>
        {({ id, describedBy, invalid }) => (
          <input
            id={id}
            className="input"
            value={draft.label}
            aria-describedby={describedBy}
            aria-invalid={invalid || undefined}
            onChange={(e) => set({ label: e.target.value })}
          />
        )}
      </Field>
      <Field label="Base URL" {...(errors.baseUrl ? { error: errors.baseUrl } : {})}>
        {({ id, describedBy, invalid }) => (
          <input
            id={id}
            className="input mono"
            value={draft.baseUrl}
            readOnly={preset ? !preset.baseUrlEditable : false}
            placeholder="http://127.0.0.1:8000/v1"
            aria-describedby={describedBy}
            aria-invalid={invalid || undefined}
            onChange={(e) => set({ baseUrl: e.target.value })}
          />
        )}
      </Field>
      <Field label="Default model" hint="Used when a task does not name a model.">
        {({ id, describedBy }) => (
          <ModelInput
            id={id}
            {...(props.existing ? { providerId: props.existing.id } : {})}
            {...(describedBy ? { describedBy } : {})}
            purpose="chat"
            value={draft.defaultModel}
            placeholder="e.g. qwen3-30b-a3b-2507"
            onChange={(v) => set({ defaultModel: v })}
          />
        )}
      </Field>
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
        <Button type="submit" variant="primary" disabled={upsert.isPending}>
          {props.existing ? 'Save provider' : 'Add provider'}
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
