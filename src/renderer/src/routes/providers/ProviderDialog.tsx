// Add / edit a provider. Presets fill kind + base URL; the key is write-only.
import { useState, type FormEvent } from 'react'
import type { ProviderKind } from '@shared/schemas'
import type { CloudService } from '@shared/cloud-video-inputs'
import { canTreatAsLocal, grantedLocalHost, providerHost } from '@shared/provider-network'
import { Button, Dialog, Field } from '../../components/ui'
import { toast } from '../../components/toast-store'
import { useIpcMutation } from '../../lib/query'
import { ApiKeyField, type KeyChange } from './ApiKeyField'
import { ModelInput } from './ModelInput'
import { AdvancedSection } from './AdvancedSection'
import { VideoInputsSection } from './VideoInputsSection'
import { applyInputDrafts, inputErrors, type InputDrafts } from './video-inputs-options'
import { advancedErrors, advancedFrom, applyAdvanced, type AdvancedDraft } from './advanced-options'
import { VoicesSection } from './VoicesSection'
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
  /** Options a preset starts with (cloud marker, model-profile off, auth style…). */
  baseOptions: Record<string, unknown>
  advanced: AdvancedDraft
  /** Video model input mappings edited in this form (fal.ai, Replicate), by model id. */
  inputDrafts: InputDrafts
  modelPlaceholder: string | undefined
  /** Speaker → voice id and the voice for any other speaker (ElevenLabs, OpenAI speech). */
  voices: Record<string, string>
  voice: string
  /** ElevenLabs: lay the brief's sound note under the voice. */
  soundEffects: boolean
  /** ElevenLabs PCM sample rate; 24 kHz for plans without 44.1 kHz audio. */
  sampleRate: string
}

const VOICE_KINDS: ProviderKind[] = ['elevenlabs', 'openai-compatible']
const isOpenAiHost = (baseUrl: string): boolean =>
  /^https:\/\/api\.openai\.com(\/|$)/.test(baseUrl.trim())

function voiceDraft(options: Record<string, unknown> | undefined) {
  const o = options ?? {}
  const voices: Record<string, string> = {}
  if (o.voices && typeof o.voices === 'object')
    for (const [k, v] of Object.entries(o.voices)) if (typeof v === 'string' && v) voices[k] = v
  return {
    voices,
    voice: typeof o.voice === 'string' ? o.voice : '',
    soundEffects: o.soundEffects === true,
    sampleRate: o.sampleRate === 24000 ? '24000' : '44100',
  }
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
      baseOptions: existing.options,
      advanced: advancedFrom(existing.options),
      inputDrafts: {},
      modelPlaceholder: undefined,
      ...voiceDraft(existing.options),
    }
  const p = PRESETS[0]!
  return {
    ...fromPreset(p),
    enabled: true,
    apiKey: undefined,
    localHost: undefined,
    ...voiceDraft(undefined),
  }
}

const fromPreset = (p: Preset) => ({
  presetId: p.id,
  kind: p.kind,
  label: p.label,
  baseUrl: p.baseUrl,
  defaultModel: p.defaultModel ?? '',
  baseOptions: p.options ?? {},
  advanced: advancedFrom(undefined),
  inputDrafts: {},
  modelPlaceholder: p.modelPlaceholder,
})

/** A hosted service (set by a preset): always a cloud provider and always needs a key. */
const isHosted = (d: Pick<Draft, 'kind' | 'baseOptions'>): boolean =>
  d.kind === 'openai-compatible' && typeof d.baseOptions.preset === 'string'

const keyRequired = (d: Draft): boolean => kindRequiresKey(d.kind) || isHosted(d)

function validate(d: Draft, hasKey: boolean) {
  const errors: {
    label?: string
    baseUrl?: string
    apiKey?: string
    advanced?: ReturnType<typeof advancedErrors>
    inputs?: string
  } = {}
  if (!d.label.trim()) errors.label = 'Give the provider a name.'
  if (kindUsesBaseUrl(d.kind) && !d.baseUrl.trim()) errors.baseUrl = 'Enter the server address.'
  else if (d.baseUrl.trim() && !/^https?:\/\/\S+$/.test(d.baseUrl.trim()))
    errors.baseUrl = 'Use an http:// or https:// address.'
  const keyAfterSave = typeof d.apiKey === 'string' || (hasKey && d.apiKey !== null)
  if (keyRequired(d) && !keyAfterSave) errors.apiKey = 'This provider needs an API key.'
  const advanced = advancedErrors(d.advanced)
  if (Object.keys(advanced).length) errors.advanced = advanced
  if (
    isCloudMedia(d.kind) &&
    Object.values(d.inputDrafts).some((f) => Object.keys(inputErrors(f)).length)
  )
    errors.inputs = 'Fix the video model inputs before saving.'
  return errors
}

/** fal.ai and Replicate: cloud image and video services that share the model input table. */
const isCloudMedia = (kind: string): kind is CloudService => kind === 'fal' || kind === 'replicate'

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

/** The voice choices a draft stores; empty choices are left out. */
function voiceOptions(draft: Draft): Record<string, unknown> {
  if (!VOICE_KINDS.includes(draft.kind)) return {}
  const out: Record<string, unknown> = {}
  if (Object.keys(draft.voices).length) out.voices = draft.voices
  if (draft.voice) out.voice = draft.voice
  if (draft.kind === 'elevenlabs') {
    if (draft.soundEffects) out.soundEffects = true
    if (draft.sampleRate === '24000') out.sampleRate = 24000
  }
  return out
}

/** Options with the network choice: 'local' when ticked on a LAN host, else 'remote'. */
function optionsFor(draft: Draft): Record<string, unknown> {
  const {
    network: _old,
    localHost: _host,
    voices: _voices,
    voice: _voice,
    soundEffects: _fx,
    sampleRate: _rate,
    ...kept
  } = draft.baseOptions
  const rest: Record<string, unknown> = { ...kept, ...voiceOptions(draft) }
  const baseUrl = parsedBaseUrl(draft.baseUrl)
  const config = { kind: draft.kind, ...(baseUrl ? { baseUrl } : {}) }
  const withAdvanced = (o: Record<string, unknown>) => {
    if (isCloudMedia(draft.kind))
      return applyInputDrafts(applyAdvanced(o, draft.advanced), 'video', draft.inputDrafts)
    return draft.kind === 'openai-compatible' ? applyAdvanced(o, draft.advanced) : o
  }
  // A hosted preset is a cloud service whatever its address looks like.
  if (isHosted(draft)) return withAdvanced({ ...rest, network: 'remote' })
  if (!canTreatAsLocal(config)) return withAdvanced(rest)
  const host = providerHost(config)
  return withAdvanced(
    draft.localHost === host
      ? { ...rest, network: 'local', localHost: host }
      : { ...rest, network: 'remote' },
  )
}

/** The config providers:upsert stores for a draft (trimmed, empty optionals left out). */
function upsertRequest(draft: Draft, existing: ProviderViewT | undefined) {
  const baseUrl = draft.baseUrl.trim()
  const defaultModel = draft.defaultModel.trim()
  return {
    config: {
      ...(existing ? { id: existing.id } : {}),
      options: optionsFor(draft),
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
  const isEleven = props.draft.kind === 'elevenlabs'
  return (
    <Field
      label={isSystemVoice ? 'Default voice' : 'Default model'}
      hint={
        isSystemVoice
          ? 'Optional, e.g. Samantha (macOS) or en-gb (espeak). Each speaker gets its own voice.'
          : isEleven
            ? 'A speech model; eleven_multilingual_v2 when left empty.'
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
          placeholder={
            isSystemVoice
              ? 'System default'
              : isEleven
                ? 'eleven_multilingual_v2'
                : (props.draft.modelPlaceholder ?? 'e.g. qwen3-30b-a3b-2507')
          }
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

function ElevenLabsOptions(props: { draft: Draft; set: SetDraft }) {
  return (
    <div className="stack" style={{ gap: 'var(--space-2)' }}>
      <Field
        label="Audio quality"
        hint="Use 24 kHz if your ElevenLabs plan does not include 44.1 kHz audio."
      >
        {({ id, describedBy }) => (
          <select
            id={id}
            className="select"
            value={props.draft.sampleRate}
            aria-describedby={describedBy}
            onChange={(e) => props.set({ sampleRate: e.target.value })}
          >
            <option value="44100">44.1 kHz (Pro plan and above)</option>
            <option value="24000">24 kHz</option>
          </select>
        )}
      </Field>
      <label className="row">
        <input
          type="checkbox"
          checked={props.draft.soundEffects}
          aria-describedby="elevenlabs-fx-hint"
          onChange={(e) => props.set({ soundEffects: e.target.checked })}
        />
        Add sound effects when an inject has a sound note
      </label>
      <span id="elevenlabs-fx-hint" className="field__hint">
        Off by default. The sound note is sent to ElevenLabs and uses extra credits.
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
  const errors: Errors = submitted ? validate(draft, hasKey) : {}
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
      {draft.kind !== 'system-tts' && draft.kind !== 'elevenlabs' && (
        <BaseUrlField draft={draft} preset={preset} errors={errors} set={set} />
      )}
      {draft.kind !== 'system-tts' && draft.kind !== 'elevenlabs' && (
        <NetworkField draft={draft} set={set} />
      )}
      <DefaultModelField draft={draft} existing={existing} set={set} />
      {draft.kind === 'elevenlabs' && <ElevenLabsOptions draft={draft} set={set} />}
      {(draft.kind === 'elevenlabs' ||
        (draft.kind === 'openai-compatible' && isOpenAiHost(draft.baseUrl))) && (
        <VoicesSection
          providerId={existing?.id}
          value={{ voices: draft.voices, voice: draft.voice }}
          onChange={(v) => set(v)}
        />
      )}
      {showKey && (
        <ApiKeyField
          hasKey={hasKey}
          required={keyRequired(draft)}
          value={draft.apiKey}
          onChange={(v) => set({ apiKey: v })}
          {...(errors.apiKey ? { error: errors.apiKey } : {})}
        />
      )}
      {draft.kind === 'openai-compatible' && (
        <AdvancedSection
          value={draft.advanced}
          errors={errors.advanced ?? {}}
          onChange={(patch) => set({ advanced: { ...draft.advanced, ...patch } })}
          showApiVersion={draft.baseOptions.auth === 'api-key'}
          preset={
            typeof draft.baseOptions.preset === 'string' ? draft.baseOptions.preset : undefined
          }
        />
      )}
      {isCloudMedia(draft.kind) && (
        <>
          <VideoInputsSection
            service={draft.kind}
            savedOptions={draft.baseOptions}
            defaultModel={draft.defaultModel}
            value={draft.inputDrafts}
            error={errors.inputs}
            onChange={(inputDrafts) => set({ inputDrafts })}
          />
          <AdvancedSection
            value={draft.advanced}
            errors={errors.advanced ?? {}}
            onChange={(patch) => set({ advanced: { ...draft.advanced, ...patch } })}
            showApiVersion={false}
            mediaOnly
          />
        </>
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
