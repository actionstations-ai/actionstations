// Drill results export (#431, FR-13): drill-results.csv with every recorded run, and a one-page
// "Drill results" PDF for the latest run. Written to the folder the user chose.
import { join } from 'node:path'
import { RATING_LABELS, type Drill, type DrillRun } from '@shared/schemas'
import { escapeHtml } from '../export/escape'
import { writeFileAtomic, ensureDir } from '../lib/fs'
import { toCsv } from '../program/export'
import { exportFolder } from '../redline/export'

export const RESULTS_COLUMNS = ['Run date', 'Session', 'Kind', 'Row', 'Id', 'Result'] as const

const VERDICT_LABELS = { pass: 'Pass', partial: 'Partial', fail: 'Fail' } as const

/** One line per criterion and per corrective action of every run, oldest first. */
export function resultRows(drill: Pick<Drill, 'runs'>): string[][] {
  return drill.runs.flatMap((run) => [
    ...run.criteria.map((c) => [
      run.ranAt.slice(0, 10),
      run.sessionId ?? '',
      'Criterion',
      c.rowId,
      c.criterionId,
      RATING_LABELS[c.rating],
    ]),
    ...run.correctiveActions.map((a) => [
      run.ranAt.slice(0, 10),
      run.sessionId ?? '',
      'Corrective action',
      '',
      a.id,
      VERDICT_LABELS[a.verdict],
    ]),
  ])
}

export const resultsCsv = (drill: Pick<Drill, 'runs'>): string =>
  toCsv(RESULTS_COLUMNS, resultRows(drill))

function table(caption: string, head: string[], rows: string[][]): string {
  const th = head.map((h) => `<th scope="col">${escapeHtml(h)}</th>`).join('')
  const body = rows
    .map((r) => `<tr>${r.map((c) => `<td>${escapeHtml(c)}</td>`).join('')}</tr>`)
    .join('')
  return `<table><caption>${escapeHtml(caption)}</caption><thead><tr>${th}</tr></thead><tbody>${body}</tbody></table>`
}

/** The one-page results document for a run. */
export function resultsHtml(drill: Pick<Drill, 'title'>, run: DrillRun): string {
  const criteria = run.criteria.map((c) => [c.rowId, c.criterionId, RATING_LABELS[c.rating]])
  const actions = run.correctiveActions.map((a) => [a.id, VERDICT_LABELS[a.verdict], a.note ?? ''])
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">
<title>Drill results</title><style>
@page { size: letter; margin: 0.6in }
body { font: 10pt/1.35 'Helvetica Neue', Arial, sans-serif; color: #1d1d1b }
h1 { font-size: 16pt; margin: 0 0 2pt } p { margin: 0 0 10pt; color: #555 }
table { width: 100%; border-collapse: collapse; margin-bottom: 12pt }
caption { text-align: left; font-weight: 700; padding-bottom: 3pt }
th, td { border: 1px solid #999; padding: 3pt 5pt; text-align: left; vertical-align: top }
th { background: #e7e4dc }
</style></head><body>
<h1>Drill results</h1>
<p>${escapeHtml(drill.title)} · run ${escapeHtml(run.ranAt.slice(0, 10))}</p>
${table('Criteria', ['Row', 'Criterion', 'Rating'], criteria)}
${actions.length ? table('Corrective actions', ['Action', 'Verdict', 'Note'], actions) : ''}
</body></html>`
}

/** Write drill-results.csv, and drill-results.pdf when a run exists. Returns the files. */
export async function exportDrillResults(
  root: string,
  drill: Drill,
  outDir: string,
): Promise<string[]> {
  const dir = exportFolder(root, outDir)
  await ensureDir(dir)
  const files: string[] = []
  const csv = join(dir, 'drill-results.csv')
  await writeFileAtomic(csv, resultsCsv(drill))
  files.push(csv)
  const latest = drill.runs.at(-1)
  if (latest) {
    const { htmlToPdf } = await import('../export/pdf')
    const pdf = join(dir, 'drill-results.pdf')
    await writeFileAtomic(pdf, await htmlToPdf(resultsHtml(drill, latest), 'Drill results PDF'))
    files.push(pdf)
  }
  return files
}
