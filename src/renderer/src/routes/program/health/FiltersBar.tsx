// Filters (FR-9): project, year, mission area, document, and the stale threshold. They apply to
// every panel at once and live in the URL query.
import { MISSION_AREA_LABELS, MISSION_AREAS } from '@shared/core-capabilities'
import { HEALTH_STALE_MONTHS } from '@shared/schemas'
import { Button, Field } from '../../../components/ui'
import type { HealthChoice } from './use-health-filter'

export interface FilterOptions {
  projects: { id: string; name: string }[]
  years: number[]
  documents: { key: string; title: string }[]
}

export function FiltersBar(props: {
  choice: HealthChoice
  options: FilterOptions
  onChange: (patch: Partial<HealthChoice>) => void
}) {
  const { choice, options, onChange } = props
  const select = (
    label: string,
    key: keyof HealthChoice,
    items: { value: string; label: string }[],
  ) => (
    <Field label={label}>
      {({ id }) => (
        <select
          id={id}
          className="select"
          value={choice[key]}
          onChange={(e) => onChange({ [key]: e.target.value })}
        >
          <option value="">All</option>
          {items.map((i) => (
            <option key={i.value} value={i.value}>
              {i.label}
            </option>
          ))}
        </select>
      )}
    </Field>
  )
  const anySet = Object.values(choice).some(Boolean)
  return (
    <form
      className="program-filters"
      aria-label="Filter the health report"
      onSubmit={(e) => e.preventDefault()}
    >
      {select(
        'Project',
        'project',
        options.projects.map((p) => ({ value: p.id, label: p.name })),
      )}
      {select(
        'Year',
        'year',
        options.years.map((y) => ({ value: String(y), label: String(y) })),
      )}
      {select(
        'Mission area',
        'area',
        MISSION_AREAS.map((a) => ({ value: a, label: MISSION_AREA_LABELS[a] })),
      )}
      {select(
        'Plan document',
        'doc',
        options.documents.map((d) => ({ value: d.key, label: d.title })),
      )}
      <Field label="Stale after (months)">
        {({ id }) => (
          <input
            id={id}
            className="input"
            type="number"
            min={1}
            max={120}
            placeholder={String(HEALTH_STALE_MONTHS)}
            value={choice.stale}
            onChange={(e) => onChange({ stale: e.target.value })}
          />
        )}
      </Field>
      <Button
        size="sm"
        disabled={!anySet}
        onClick={() => onChange({ project: '', year: '', area: '', doc: '', stale: '' })}
      >
        Clear filters
      </Button>
    </form>
  )
}
