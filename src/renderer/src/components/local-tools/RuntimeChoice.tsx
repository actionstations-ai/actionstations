// "How do you want to run models?" (ADR-0021, #334): Cloud APIs only, local tools, or a mix.
// Choosing never installs anything; it only decides which setup rows are shown.
import type { SetupMode } from '@shared/schemas/setup'

const MODE_OPTIONS: { value: SetupMode; label: string; hint: string }[] = [
  {
    value: 'cloud',
    label: 'Cloud APIs only',
    hint: 'Add an API key (for example Anthropic). Nothing is installed on this computer.',
  },
  {
    value: 'local',
    label: 'Local tools',
    hint: 'LM Studio or Ollama for text, ComfyUI for images and video, local voice. Documents never leave this computer.',
  },
  {
    value: 'mix',
    label: 'A mix',
    hint: 'Some tasks on a cloud API, others on local tools. You choose per task in Providers.',
  },
]

export function RuntimeChoice(props: {
  value: SetupMode | undefined
  onChange: (mode: SetupMode) => void
  disabled?: boolean
  /** Distinguishes the radio group when the choice appears twice on a page. */
  name?: string
}) {
  const name = props.name ?? 'runtime-mode'
  return (
    <fieldset className="lt-choice" disabled={props.disabled}>
      <legend className="lt-choice__legend">How do you want to run models?</legend>
      {MODE_OPTIONS.map((o) => (
        <label key={o.value} className="lt-choice__option">
          <input
            type="radio"
            name={name}
            value={o.value}
            checked={props.value === o.value}
            aria-describedby={`${name}-${o.value}-hint`}
            onChange={() => props.onChange(o.value)}
          />
          <span className="lt-choice__body">
            <strong>{o.label}</strong>
            <span id={`${name}-${o.value}-hint`} className="muted">
              {o.hint}
            </span>
          </span>
        </label>
      ))}
    </fieldset>
  )
}
