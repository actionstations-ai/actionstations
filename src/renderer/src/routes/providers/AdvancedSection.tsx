// Advanced settings of a provider: prices (for the cost line), the Azure api-version and the
// JSON mode override. Everything here is optional and stored in the provider's options.
import { useId, useState } from 'react'
import { Field } from '../../components/ui'
import { JSON_MODE_CHOICES, type AdvancedDraft } from './advanced-options'

type SetAdvanced = (patch: Partial<AdvancedDraft>) => void

function PriceField(props: {
  field:
    | 'inputUsdPerMTok'
    | 'outputUsdPerMTok'
    | 'mediaUsdPerCall'
    | 'imageUsdPerCall'
    | 'videoUsdPerCall'
  label: string
  hint: string
  draft: AdvancedDraft
  error: string | undefined
  set: SetAdvanced
}) {
  return (
    <Field label={props.label} hint={props.hint} {...(props.error ? { error: props.error } : {})}>
      {({ id, describedBy, invalid }) => (
        <input
          id={id}
          className="input mono"
          inputMode="decimal"
          value={props.draft[props.field]}
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
          onChange={(e) => props.set({ [props.field]: e.target.value })}
        />
      )}
    </Field>
  )
}

function ModelField(props: {
  field: 'imageModel' | 'ttsModel'
  label: string
  hint: string
  draft: AdvancedDraft
  set: SetAdvanced
}) {
  return (
    <Field label={props.label} hint={props.hint}>
      {({ id, describedBy }) => (
        <input
          id={id}
          className="input mono"
          value={props.draft[props.field]}
          aria-describedby={describedBy}
          onChange={(e) => props.set({ [props.field]: e.target.value })}
        />
      )}
    </Field>
  )
}

/** Collapsible so the common case (a preset and a key) stays short. */
export function AdvancedSection(props: {
  value: AdvancedDraft
  errors: Partial<Record<keyof AdvancedDraft, string>>
  onChange: SetAdvanced
  /** Show the Azure api-version field. */
  showApiVersion: boolean
  /** The hosted preset's id, when the provider has one. */
  preset?: string | undefined
  /** A media-only service (fal.ai): per-call prices only, no token prices or JSON mode. */
  mediaOnly?: boolean
}) {
  const [open, setOpen] = useState(
    () => Object.values(props.value).some((v) => v !== '') || Object.keys(props.errors).length > 0,
  )
  const panelId = useId()
  const { value, errors, onChange } = props
  return (
    <section className="stack" aria-label="Advanced settings">
      <button
        type="button"
        className="btn btn--ghost"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
      >
        {open ? 'Hide advanced' : 'Advanced'}
      </button>
      <div id={panelId} className="stack" hidden={!open}>
        {!props.mediaOnly && (
          <>
            <p className="muted">
              Prices are optional. With both token prices set, each run shows its estimated cost;
              without them it shows tokens only and says the price is not set. Check the service’s
              price list, as prices change.
            </p>
            <PriceField
              field="inputUsdPerMTok"
              label="Input price (US dollars per million tokens)"
              hint="What the service charges for text you send."
              draft={value}
              error={errors.inputUsdPerMTok}
              set={onChange}
            />
            <PriceField
              field="outputUsdPerMTok"
              label="Output price (US dollars per million tokens)"
              hint="What the service charges for text it writes."
              draft={value}
              error={errors.outputUsdPerMTok}
              set={onChange}
            />
          </>
        )}
        {props.mediaOnly && (
          <p className="muted">
            Prices are optional. With a price set, the app tells you the estimated cost before it
            starts a batch of media. Check the service’s price list, as prices change.
          </p>
        )}
        <PriceField
          field="mediaUsdPerCall"
          label="Price per image, voice or video call (US dollars)"
          hint="Used to estimate the cost of a batch of media before it starts."
          draft={value}
          error={errors.mediaUsdPerCall}
          set={onChange}
        />
        <PriceField
          field="imageUsdPerCall"
          label="Image call price (US dollars)"
          hint="Used for image calls instead of the price above."
          draft={value}
          error={errors.imageUsdPerCall}
          set={onChange}
        />
        <PriceField
          field="videoUsdPerCall"
          label="Video call price (US dollars)"
          hint="Used for video calls instead of the price above. Video prices depend on the model and clip length."
          draft={value}
          error={errors.videoUsdPerCall}
          set={onChange}
        />
        {props.showApiVersion && (
          <Field
            label="API version"
            hint="Leave empty for the current Azure API. Fill it in only if your base URL is a deployment URL that needs a dated version, such as 2024-10-21."
          >
            {({ id, describedBy }) => (
              <input
                id={id}
                className="input mono"
                value={value.apiVersion}
                aria-describedby={describedBy}
                onChange={(e) => onChange({ apiVersion: e.target.value })}
              />
            )}
          </Field>
        )}
        {!props.mediaOnly && (
          <>
            <ModelField
              field="imageModel"
              label="Image model"
              hint="The model that draws photographic images, such as gpt-image-1 for OpenAI. Leave empty to use the model chosen in Routing."
              draft={value}
              set={onChange}
            />
            <ModelField
              field="ttsModel"
              label="Speech model"
              hint="The model that voices audio injects. Leave empty to use the model chosen in Routing, or the default model."
              draft={value}
              set={onChange}
            />
            {props.preset === 'openai' && (
              <p className="muted" role="note">
                OpenAI’s current speech models shut down on January 6, 2027. Check OpenAI’s model
                list for their replacement before then.
              </p>
            )}
            <Field
              label="JSON mode"
              hint="How the model is asked for structured answers. Change this only if the service rejects the automatic choice."
            >
              {({ id, describedBy }) => (
                <select
                  id={id}
                  className="select"
                  value={value.jsonMode}
                  aria-describedby={describedBy}
                  onChange={(e) => onChange({ jsonMode: e.target.value })}
                >
                  {JSON_MODE_CHOICES.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              )}
            </Field>
          </>
        )}
      </div>
    </section>
  )
}
