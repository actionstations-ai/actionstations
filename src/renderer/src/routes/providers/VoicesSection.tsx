// Voices (ElevenLabs and OpenAI speech): which voice speaks for each role. The voice list is
// loaded from the saved provider; the choices are stored as options.voices (speaker → voice id)
// and options.voice (any other speaker).
import { useId } from 'react'
import { useIpcQuery } from '../../lib/query'
import { errorText } from '../../lib/errors'
import { useProjectRoles } from './use-project-roles'

export interface VoiceChoices {
  /** Speaker (role name) → voice id. */
  voices: Record<string, string>
  /** Voice for any speaker without a row of its own. */
  voice: string
}

function VoiceSelect(props: {
  label: string
  value: string
  options: { id: string; label: string; description?: string | undefined }[]
  onChange: (id: string) => void
}) {
  const known = props.options.some((o) => o.id === props.value)
  return (
    <select
      className="select"
      aria-label={`Voice for ${props.label}`}
      value={props.value}
      onChange={(e) => props.onChange(e.target.value)}
    >
      <option value="">Not set</option>
      {props.value && !known && <option value={props.value}>{props.value}</option>}
      {props.options.map((o) => (
        <option key={o.id} value={o.id}>
          {o.description ? `${o.label} - ${o.description}` : o.label}
        </option>
      ))}
    </select>
  )
}

export function VoicesSection(props: {
  /** The saved provider whose voices are listed; absent while adding a new one. */
  providerId: string | undefined
  value: VoiceChoices
  onChange: (next: VoiceChoices) => void
}) {
  const headingId = useId()
  const roles = useProjectRoles()
  const list = useIpcQuery(
    'providers:list-voices',
    { id: props.providerId ?? '' },
    { enabled: !!props.providerId, staleTime: 60_000 },
  )
  const rows = [...new Set([...roles, ...Object.keys(props.value.voices)])]
  const setVoice = (speaker: string, id: string) => {
    const voices = { ...props.value.voices }
    if (id) voices[speaker] = id
    else delete voices[speaker]
    props.onChange({ ...props.value, voices })
  }
  const options = list.data ?? []
  return (
    <section className="stack" aria-labelledby={headingId}>
      <h3 id={headingId}>Voices</h3>
      {!props.providerId && (
        <p className="field__hint">Save the provider first; its voices are loaded after that.</p>
      )}
      {list.isPending && props.providerId && (
        <p className="field__hint" role="status">
          Loading voices…
        </p>
      )}
      {list.isError && (
        <p className="field__error" role="alert">
          {errorText(list.error)}
        </p>
      )}
      <table className="table voices-table">
        <caption className="field__hint">
          Choose the voice each role speaks with.{' '}
          {roles.length === 0 && 'Open a project to see its roles here.'}
        </caption>
        <thead>
          <tr>
            <th scope="col">Speaker</th>
            <th scope="col">Voice</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((speaker) => (
            <tr key={speaker}>
              <th scope="row">{speaker}</th>
              <td>
                <VoiceSelect
                  label={speaker}
                  value={props.value.voices[speaker] ?? ''}
                  options={options}
                  onChange={(id) => setVoice(speaker, id)}
                />
              </td>
            </tr>
          ))}
          <tr>
            <th scope="row">Any other speaker</th>
            <td>
              <VoiceSelect
                label="any other speaker"
                value={props.value.voice}
                options={options}
                onChange={(id) => props.onChange({ ...props.value, voice: id })}
              />
            </td>
          </tr>
        </tbody>
      </table>
    </section>
  )
}
