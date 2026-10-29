// What the runs table and its trend show (#431, FR-12): one row per recorded run, one column per
// criterion and per corrective action seen in any run. The table is the source of truth; the
// trend line is only a second view of the same numbers.
import { RATING_LABELS, type Drill, type DrillRun, type Rating } from '@shared/schemas'

export interface Column {
  key: string
  label: string
  kind: 'criterion' | 'action'
}

export interface RunRow {
  runId: string
  date: string
  programRecorded: boolean
  cells: Record<string, string>
}

export interface RunsModel {
  columns: Column[]
  rows: RunRow[]
  /** Share of observed criteria that were met, per run, oldest first (null when none observed). */
  trend: (number | null)[]
}

const VERDICT_LABELS = { pass: 'Pass', partial: 'Partial', fail: 'Fail' } as const
const POINTS: Record<Rating, number | undefined> = {
  met: 1,
  partial: 0.5,
  not_met: 0,
  not_observed: undefined,
}

/** The share of observed criteria met, with a partial counting half. */
export function runScore(run: Pick<DrillRun, 'criteria'>): number | null {
  const points = run.criteria
    .map((c) => POINTS[c.rating])
    .filter((p): p is number => p !== undefined)
  return points.length ? points.reduce((a, b) => a + b, 0) / points.length : null
}

export function runsModel(
  drill: Pick<Drill, 'runs'>,
  actionLabel: (id: string) => string = (id) => id,
): RunsModel {
  const columns: Column[] = []
  const seen = new Set<string>()
  const add = (c: Column) => {
    if (!seen.has(c.key)) {
      seen.add(c.key)
      columns.push(c)
    }
  }
  for (const run of drill.runs) {
    for (const c of run.criteria)
      add({
        key: `c:${c.rowId}|${c.criterionId}`,
        label: `${c.rowId} ${c.criterionId}`,
        kind: 'criterion',
      })
    for (const a of run.correctiveActions)
      add({ key: `a:${a.id}`, label: actionLabel(a.id), kind: 'action' })
  }
  const rows = drill.runs.map((run) => ({
    runId: run.id,
    date: run.ranAt.slice(0, 10),
    programRecorded: run.programRecorded,
    cells: Object.fromEntries([
      ...run.criteria.map((c) => [`c:${c.rowId}|${c.criterionId}`, RATING_LABELS[c.rating]]),
      ...run.correctiveActions.map((a) => [`a:${a.id}`, VERDICT_LABELS[a.verdict]]),
    ]),
  }))
  return { columns, rows, trend: drill.runs.map(runScore) }
}

/** The trend as words, for readers who do not see the line. */
export function trendText(trend: (number | null)[]): string {
  const points = trend.map((t) => (t === null ? 'not observed' : `${Math.round(t * 100)}%`))
  return points.length ? `Criteria met by run: ${points.join(', ')}.` : 'No runs yet.'
}
