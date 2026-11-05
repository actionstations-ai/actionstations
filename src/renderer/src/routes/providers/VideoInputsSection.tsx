// "Video model inputs" (fal.ai, later Replicate): the input names a cloud video model uses for the
// app's prompt, duration and starting image. Prefilled for the models the app knows; edit them
// for any other model. Everything is optional: a model left alone uses the table.
import { useId, useState } from 'react'
import { suggestedModels } from '@shared/cloud-video-inputs'
import { Field } from '../../components/ui'
import { ModelInput } from './ModelInput'
import {
  fieldsFor,
  inputErrors,
  isKnownModel,
  normalize,
  savedModels,
  type InputDrafts,
  type InputFieldKey,
  type InputFields,
} from './video-inputs-options'

const FIELDS: { key: InputFieldKey; label: string; hint: string }[] = [
  { key: 'prompt', label: 'Prompt input', hint: 'The input that takes the video description.' },
  {
    key: 'negativePrompt',
    label: 'Negative prompt input',
    hint: 'What to avoid. Leave empty if the model has no such input.',
  },
  {
    key: 'image',
    label: 'Starting image input',
    hint: 'The input that takes the scene image the clip starts from. Leave empty for text-only models.',
  },
  {
    key: 'duration',
    label: 'Duration input',
    hint: 'The input that takes the clip length in seconds. Leave empty to use the model’s own length.',
  },
  {
    key: 'durationAllowed',
    label: 'Lengths the model accepts (seconds)',
    hint: 'Separated by commas, such as 5, 10. The clip length is rounded to the nearest one. Leave empty to send any whole second.',
  },
  {
    key: 'aspectRatio',
    label: 'Aspect ratio input',
    hint: 'The input that takes 16:9, 9:16 or 1:1. Leave empty if the model takes its shape from the image.',
  },
]

export function VideoInputsSection(props: {
  /** The provider's saved options, to find mappings stored earlier. */
  savedOptions: Record<string, unknown>
  /** The model typed in the Default model field, offered first. */
  defaultModel: string
  value: InputDrafts
  /** Shown when the form cannot be saved because of a mapping. */
  error?: string | undefined
  onChange: (next: InputDrafts) => void
}) {
  const saved = savedModels(props.savedOptions)
  const suggestions = [...new Set([...saved, ...suggestedModels('video').map((m) => m.id)])]
  const [open, setOpen] = useState(() => saved.length > 0)
  const [model, setModel] = useState(() => props.defaultModel.trim() || saved[0] || '')
  const panelId = useId()
  const key = normalize(model)
  const fields: InputFields =
    props.value[key] ?? fieldsFor('video', model, props.savedOptions.inputMap)
  const errors = inputErrors(fields)
  const edit = (k: InputFieldKey, v: string) =>
    props.onChange({ ...props.value, [key]: { ...fields, [k]: v } })

  return (
    <section className="stack" aria-label="Video model inputs">
      <button
        type="button"
        className="btn btn--ghost"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
      >
        {open ? 'Hide video model inputs' : 'Video model inputs'}
      </button>
      <div id={panelId} className="stack" hidden={!open}>
        <p className="muted">
          Each video model names its inputs differently. For the models listed here the names are
          filled in. For another model, type its id and enter the input names from its page on the
          service; inputs left empty are not sent.
        </p>
        <Field
          label="Model"
          hint={
            model.trim() && !isKnownModel(model)
              ? 'Not in the app’s list: only the prompt is sent unless you fill in the inputs below.'
              : 'Pick a model to see or change its inputs.'
          }
        >
          {({ id, describedBy }) => (
            <ModelInput
              id={id}
              {...(describedBy ? { describedBy } : {})}
              suggestions={suggestions}
              value={model}
              placeholder="e.g. fal-ai/kling-video/v2.5-turbo/pro/image-to-video"
              onChange={setModel}
            />
          )}
        </Field>
        {props.error && (
          <p role="alert" className="field__error">
            {props.error}
          </p>
        )}
        {model.trim() &&
          FIELDS.map((f) => (
            <Field
              key={f.key}
              label={f.label}
              hint={f.hint}
              {...(errors[f.key] ? { error: errors[f.key]! } : {})}
            >
              {({ id, describedBy, invalid }) => (
                <input
                  id={id}
                  className="input mono"
                  value={fields[f.key]}
                  aria-describedby={describedBy}
                  aria-invalid={invalid || undefined}
                  autoComplete="off"
                  spellCheck={false}
                  onChange={(e) => edit(f.key, e.target.value)}
                />
              )}
            </Field>
          ))}
      </div>
    </section>
  )
}
