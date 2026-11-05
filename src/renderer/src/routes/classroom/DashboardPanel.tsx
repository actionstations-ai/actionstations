// Instructor dashboard (#736, FR-10, FR-13): every figure is a table with a CSV; participation
// also has a plain bar chart that repeats the table. Reliability states its sample size and that
// small samples are unstable. Participation is an instructor aid, never a grade input.
import type { Dashboard, DashboardSection, DashboardTable } from '@shared/ipc/classroom-dashboard'
import { Button } from '../../components/ui'
import { useIpcQuery } from '../../lib/query'
import { downloadText } from './download'

function DataTable({ table }: { table: DashboardTable }) {
  return (
    <div className="stack">
      <h4 className="classroom-table-title">{table.title}</h4>
      <div className="classroom-scroll">
        <table className="classroom-table">
          <caption className="sr-only">{table.title}</caption>
          <thead>
            <tr>
              {table.header.map((h) => (
                <th key={h} scope="col">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((r, i) => (
              <tr key={i}>
                {r.map((c, j) =>
                  j === 0 ? (
                    <th key={j} scope="row">
                      {c}
                    </th>
                  ) : (
                    <td key={j}>{c}</td>
                  ),
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="row">
        <Button
          size="sm"
          aria-label={`Download CSV: ${table.title}`}
          onClick={() => downloadText(`${table.id}.csv`, table.csv, 'text/csv')}
        >
          Download CSV
        </Button>
      </div>
    </div>
  )
}

function Bars({ section }: { section: DashboardSection }) {
  const max = Math.max(1, ...section.participation.rows.map((r) => r.ratio))
  return (
    <ul className="classroom-bars" aria-hidden="true">
      {section.participation.rows.map((r) => (
        <li key={r.name}>
          <span className="classroom-bars__name">{r.name}</span>
          <span className="classroom-bars__track">
            <span
              className={
                r.belowHalf ? 'classroom-bars__bar classroom-bars__bar--low' : 'classroom-bars__bar'
              }
              style={{ width: `${Math.round((r.ratio / max) * 100)}%` }}
            />
          </span>
        </li>
      ))}
    </ul>
  )
}

function SectionView({ section }: { section: DashboardSection }) {
  return (
    <section className="stack" aria-labelledby={`dash-${section.sectionId}`}>
      <h3 id={`dash-${section.sectionId}`}>{section.name}</h3>
      <p>
        {section.students} students. {section.gradedRuns} graded runs and {section.practiceRuns}{' '}
        practice runs. {section.accommodations} with accommodations.{' '}
        {section.noScore.length > 0
          ? `No score yet: ${section.noScore.join(', ')}.`
          : 'Every student has a score.'}{' '}
        {section.missingEvidence} scored criteria have no evidence.
      </p>
      {section.tables.map((t) => (
        <DataTable key={t.id} table={t} />
      ))}
      <p className="muted">
        {section.participation.belowHalfCount} students are below half of an even share. Shares are
        an instructor aid, not a grade, unless you link them to a criterion.
        {section.participation.caveat ? ` ${section.participation.caveat}` : ''}
      </p>
      <Bars section={section} />
    </section>
  )
}

export function DashboardPanel({ projectPath }: { projectPath: string }) {
  const dash = useIpcQuery('classroom:dashboard', { projectPath })
  const data: Dashboard | undefined = dash.data
  return (
    <section className="card stack" aria-labelledby="classroom-dashboard-title">
      <h2 id="classroom-dashboard-title" className="section-title">
        Dashboard
      </h2>
      {!data ? (
        <p className="muted">Loading.</p>
      ) : data.sections.length === 0 ? (
        <p className="muted">Add a section to see the dashboard.</p>
      ) : (
        <>
          {data.sections.map((s) => (
            <SectionView key={s.sectionId} section={s} />
          ))}
          <DataTable table={data.reliability.table} />
          {data.reliability.caveat && <p className="muted">{data.reliability.caveat}</p>}
          <p className="muted">
            Small samples make these numbers unstable. The app makes no claim about learning gains
            from tabletop exercises; use the dashboard to build your own evidence.
          </p>
        </>
      )}
    </section>
  )
}
