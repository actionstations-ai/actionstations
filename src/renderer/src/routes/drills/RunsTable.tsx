// Drill history (#431, FR-12): the table of runs first, a small trend line second. The trend is
// drawn for sighted readers only; the sentence under the table says the same in words.
import type { Drill } from '@shared/schemas'
import { Button } from '../../components/ui'
import { runsModel, trendText } from './drill-table'

function Trend({ trend }: { trend: (number | null)[] }) {
  const pts = trend.map((t, i) => (t === null ? null : ([i, t] as const))).filter((p) => p !== null)
  if (pts.length < 2) return null
  const w = 120
  const x = (i: number) => (trend.length > 1 ? (i / (trend.length - 1)) * w : 0)
  const d = pts
    .map(([i, t], n) => `${n ? 'L' : 'M'}${x(i).toFixed(1)},${(22 - t * 20).toFixed(1)}`)
    .join(' ')
  return (
    <svg className="runs__trend" width={w} height={24} viewBox={`0 0 ${w} 24`} aria-hidden="true">
      <path d={d} fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  )
}

export function RunsTable(props: {
  drill: Pick<Drill, 'runs'>
  actionLabel?: (id: string) => string
  /** Offer "Record in program" for runs not yet written to the program. */
  onRecordInProgram?: ((runId: string) => void) | undefined
}) {
  const model = runsModel(props.drill, props.actionLabel)
  if (!model.rows.length) return <p className="muted">No runs recorded yet.</p>
  return (
    <div className="runs">
      <div className="runs__scroll">
        <table className="runs__table">
          <caption className="sr-only">Results of each run of the drill</caption>
          <thead>
            <tr>
              <th scope="col">Run</th>
              {model.columns.map((c) => (
                <th key={c.key} scope="col">
                  {c.label}
                </th>
              ))}
              {props.onRecordInProgram && <th scope="col">Program</th>}
            </tr>
          </thead>
          <tbody>
            {model.rows.map((r) => (
              <tr key={r.runId}>
                <th scope="row">{r.date}</th>
                {model.columns.map((c) => (
                  <td key={c.key}>{r.cells[c.key] ?? '—'}</td>
                ))}
                {props.onRecordInProgram && (
                  <td>
                    {r.programRecorded ? (
                      'Recorded'
                    ) : (
                      <Button size="sm" onClick={() => props.onRecordInProgram?.(r.runId)}>
                        Record in program
                      </Button>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted runs__summary">
        <Trend trend={model.trend} /> {trendText(model.trend)}
      </p>
    </div>
  )
}
