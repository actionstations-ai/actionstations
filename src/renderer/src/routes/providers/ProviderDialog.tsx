// Add / edit a provider. Presets fill kind + base URL; the key is write-only.
import { useState, type FormEvent } from 'react'
import type { ProviderKind } from '@shared/schemas'
import { canTreatAsLocal, grantedLocalHost, providerHost } from '@shared/provider-network'
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
  /**
   * "On my network, treat as local" (#433, FR-1): the host it was ticked for. A different base
   * URL host shows the box unticked again; off means remote.
   */
  localHost: string | undefined
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
      localHost: grantedLocalHost(existing),
    }
  const p = PRESETS[0]!
  return {
    ...fromPreset(p),
    defaultModel: '',
    enabled: true,
    apiKey: undefined,
    localHost: undefined,
  }
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

/** Valid URL for the network check, or undefined while the field is being typed. */
function parsedBaseUrl(raw: string): string | undefined {
  try {
    return new URL(raw.trim()).toString()
  } catch {
    return undefined
  }
}

/** Options with the network choice: 'local' when ticked on a LAN host, else 'remote'. */
function optionsFor(draft: Draft, existing: ProviderViewT | undefined): Record<string, unknown> {
  const { network: _old, localHost: _host, ...rest } = existing?.options ?? {}
  const baseUrl = parsedBaseUrl(draft.baseUrl)
  const config = { kind: draft.kind, ...(baseUrl ? { baseUrl } : {}) }
  if (!canTreatAsLocal(config)) return rest
  const host = providerHost(config)
  return draft.localHost === host
    ? { ...rest, network: 'local', localHost: host }
    : { ...rest, network: 'remote' }
}

/** The config providers:upsert stores for a draft (trimmed, empty optionals left out). */
function upsertRequest(draft: Draft, existing: ProviderViewT | undefined) {
  const baseUrl = draft.baseUrl.trim()
  const defaultModel = draft.defaultModel.trim()
  return {
    config: {
      ...(existing ? { id: existing.id } : {}),
      options: optionsFor(draft, existing),
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

/** FR-1: a LAN or other non-loopback host is remote unless the user says it is on their network. */
function NetworkField(props: { draft: Draft; set: SetDraft }) {
  const baseUrl = parsedBaseUrl(props.draft.baseUrl)
  if (!baseUrl || !canTreatAsLocal({ kind: props.draft.kind, baseUrl })) return null
  const host = providerHost({ kind: props.draft.kind, baseUrl })
  return (
    <div className="stack" style={{ gap: 'var(--space-1)' }}>
      <label className="row">
        <input
          type="checkbox"
          checked={props.draft.localHost === host}
          aria-describedby="provider-network-hint"
          onChange={(e) => props.set({ localHost: e.target.checked ? host : undefined })}
        />
        On my network, treat as local
      </label>
      <span id="provider-network-hint" className="field__hint">
        {`Requests to ${host} leave this computer, so they are treated as cloud requests: you review what is sent and names, phone numbers, emails and addresses are redacted. Tick this only if ${host} is a machine you control on your own network. Only private network addresses and .local, .lan or .internal names can be marked; those names rely on your network's DNS, so tick this only if the name resolves to your own machine.`}
      </span>
    </div>
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
      {draft.kind !== 'system-tts' && <NetworkField draft={draft} set={set} />}
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
