// Deck filters: phase, inject type, purpose tag and media.
import type { Scenario } from '@shared/schemas/scenario'
import { PURPOSE_TAG_INFO, type PurposeTag } from '@shared/taxonomy'
import { Field } from '../../components/ui'
import type { DeckFilters } from './deck-model'

interface FilterBarProps {
  value: DeckFilters
  onChange: (f: DeckFilters) => void
  scenario: Scenario
  types: string[]
  typeLabel: (t: string) => string
}

function FilterSelect(props: {
  label: string
  name: keyof DeckFilters
  options: [string, string][]
  value: DeckFilters
  onChange: (f: DeckFilters) => void
}) {
  const { value, name } = props
  return (
    <Field label={props.label}>
      {({ id }) => (
        <select
          id={id}
          className="select"
          value={value[name]}
          onChange={(e) => props.onChange({ ...value, [name]: e.target.value })}
        >
          <option value="">All</option>
          {props.options.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      )}
    </Field>
  )
}

export function DeckFilterBar(props: FilterBarProps) {
  const { value, onChange, scenario } = props
  const tags = [...new Set(scenario.msel.map((r) => r.purposeTag))]
  const select = (label: string, name: keyof DeckFilters, options: [string, string][]) => (
    <FilterSelect label={label} name={name} options={options} value={value} onChange={onChange} />
  )
  return (
    <div className="deck-filters" role="group" aria-label="Filter injects">
      {select(
        'Phase',
        'phase',
        [...scenario.phases]
          .sort((a, b) => a.index - b.index)
          .map((p) => [p.id, `${p.index + 1}. ${p.title}`]),
      )}
      {select(
        'Type',
        'type',
        props.types.map((t) => [t, props.typeLabel(t)]),
      )}
      {select(
        'Purpose',
        'tag',
        tags.map((t) => [t, PURPOSE_TAG_INFO[t as PurposeTag]?.label ?? t]),
      )}
      {select('Media', 'media', [
        ['with', 'Has media'],
        ['without', 'No media'],
      ])}
    </div>
  )
}
