// Never tested (FR-7) and the timeline (FR-8). Plain lists and a table: the facts, no narrative.
import { EXERCISE_TYPE_LABELS } from '@shared/schemas'
import type { ProgramHealth, TimelineEntry } from '@shared/schemas'
import { DataTable } from './DataTable'

function List(props: { title: string; empty: string; items: string[] }) {
  return (
    <div>
      <h3>{props.title}</h3>
      {props.items.length === 0 ? (
        <p className="muted">{props.empty}</p>
      ) : (
        <ul>
          {props.items.map((i) => (
            <li key={i}>{i}</li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function NeverTestedPanel({ health }: { health: ProgramHealth }) {
  const t = health.neverTested
  return (
    <section aria-labelledby="health-never" className="card stack">
      <h2 id="health-never">Never tested</h2>
      <List
        title="Capabilities a priority names, never exercised"
        empty="Every capability named by a priority has been exercised or is planned."
        items={t.capabilities.map((c) => c.label)}
      />
      <List
        title="Plan documents never cited"
        empty="Every plan document has at least one cited section."
        items={t.documents.map((d) => `${d.documentTitle} (${d.projectNames.join(', ')})`)}
      />
      <List
        title="Plan sections never cited (levels 1 and 2)"
        empty="No uncited plan section."
        items={t.sections.slice(0, 50).map((s) => `${s.documentTitle}: ${s.headingPath}`)}
      />
      {t.sections.length > 50 && (
        <p className="muted">
          {t.sections.length - 50} more are in the Plan sections table and the CSV.
        </p>
      )}
      <List
        title="Planned exercises past their quarter"
        empty="No planned exercise is past its quarter."
        items={t.overduePlanned.map(
          (p) => `${p.title} (${EXERCISE_TYPE_LABELS[p.type]}, ${p.when})`,
        )}
      />
    </section>
  )
}

const KIND = { exercise: 'Exercise run', planned: 'Planned', drill: 'Drill run' } as const

export function TimelinePanel({ health }: { health: ProgramHealth }) {
  return (
    <section aria-labelledby="health-timeline" className="card stack">
      <h2 id="health-timeline">Timeline</h2>
      <DataTable<TimelineEntry>
        caption="Exercises, planned exercises and drill runs by quarter"
        rows={health.timeline}
        rowKey={(t) =>
          `${t.quarter}|${t.kind}|${t.title}|${t.ref?.scenarioId ?? t.plannedExerciseId}|${t.drill ? JSON.stringify(t.drill) : ''}`
        }
        empty="Nothing has been run or planned yet."
        columns={[
          { key: 'quarter', label: 'Quarter', value: (t) => t.quarter },
          { key: 'kind', label: 'Kind', value: (t) => KIND[t.kind] },
          { key: 'title', label: 'Title', value: (t) => t.title },
          {
            key: 'type',
            label: 'Type',
            value: (t) => (t.type ? EXERCISE_TYPE_LABELS[t.type] : ''),
          },
          { key: 'caps', label: 'Capabilities', align: 'end', value: (t) => t.capabilities },
          {
            key: 'drill',
            label: 'Drill result',
            value: (t) =>
              t.drill
                ? `pass ${t.drill.pass}, partial ${t.drill.partial}, fail ${t.drill.fail}`
                : '',
          },
        ]}
      />
    </section>
  )
}
