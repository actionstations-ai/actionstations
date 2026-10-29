// "Pin facility facts" (#436, FR-4): entries from the project's facility facts that are not yet
// places. Adding one makes a place named after it, linked to the fact.
import type { Place } from '@shared/schemas'
import { Button } from '../../components/ui'
import { useIpcQuery } from '../../lib/query'

const MAX_SHOWN = 40

export function FactsPanel(props: {
  projectPath: string
  places: Place[]
  onAdd: (label: string, factRef: string) => void
}) {
  const facts = useIpcQuery('project:facility-facts', { path: props.projectPath })
  const placed = new Set(props.places.map((p) => p.factRef))
  const open = (facts.data?.categories ?? []).flatMap((c) =>
    c.entries
      .filter((e) => !placed.has(`${c.id}:${e}`))
      .map((e) => ({ ref: `${c.id}:${e}`, entry: e, category: c.label })),
  )
  if (open.length === 0) return null
  return (
    <details>
      <summary>Pin facility facts ({open.length} not placed)</summary>
      <ul className="stack" aria-label="Facility facts not yet placed">
        {open.slice(0, MAX_SHOWN).map((f) => (
          <li key={f.ref} className="row">
            <span>
              {f.entry} <span className="muted">({f.category})</span>
            </span>
            <Button
              size="sm"
              onClick={() => props.onAdd(f.entry.slice(0, 80), f.ref.slice(0, 200))}
            >
              Add as place
            </Button>
          </li>
        ))}
      </ul>
      {open.length > MAX_SHOWN && <p className="muted">Showing the first {MAX_SHOWN}.</p>}
    </details>
  )
}
