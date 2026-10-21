// Model picker: suggestions from providers:models (or a given list), free text always allowed.
import { useId } from 'react'
import { useIpcQuery } from '../../lib/query'

export function ModelInput(props: {
  id?: string
  providerId?: string
  /** Extra suggestions (e.g. from local detection before the provider exists). */
  suggestions?: string[]
  value: string
  placeholder?: string
  label?: string
  describedBy?: string
  onChange: (v: string) => void
}) {
  const listId = useId()
  const models = useIpcQuery(
    'providers:models',
    { id: props.providerId ?? '' },
    { enabled: !!props.providerId, staleTime: 60_000 },
  )
  const options = [
    ...new Set([...(models.data?.map((m) => m.id) ?? []), ...(props.suggestions ?? [])]),
  ]
  return (
    <>
      <input
        {...(props.id ? { id: props.id } : {})}
        className="input mono"
        list={listId}
        value={props.value}
        placeholder={props.placeholder}
        aria-label={props.label}
        aria-describedby={props.describedBy}
        autoComplete="off"
        spellCheck={false}
        onChange={(e) => props.onChange(e.target.value)}
      />
      <datalist id={listId} data-testid="model-options">
        {options.map((m) => (
          <option key={m} value={m} />
        ))}
      </datalist>
    </>
  )
}
