// Compliance coverage exports (#426, spec 0426 FR-14): the coverage matrix as an Excel workbook
// (one sheet per enabled framework, a "Clocks" sheet and an "About" sheet with the not-legal-
// advice line) and as CSV, plus the Markdown section of scenario.md. Facilitator material only:
// the distribution ZIP never puts these in players/. Cells are plain strings (no formulas).
import type { CoverageReport } from '@shared/compliance/coverage'
import { formatScenarioDate, parseLocal } from '@shared/compliance/scenario-time'
import type { ExportModel } from './model'
import { neutralizeFormula, tableWorkbook, type ColumnSpec, type SheetSpec } from './xlsx'

export const COVERAGE_COLUMNS = [
  { key: 'framework', header: 'Framework', width: 22 },
  { key: 'path', header: 'Hierarchy', width: 40, wrap: true },
  { key: 'control', header: 'Control', width: 12 },
  { key: 'title', header: 'Title', width: 60, wrap: true },
  { key: 'rows', header: 'MSEL rows', width: 16, wrap: true },
  { key: 'mapping', header: 'Mapping', width: 12 },
  { key: 'evidence', header: 'Evidence', width: 11 },
  { key: 'references', header: 'Evidence references', width: 44, wrap: true },
  { key: 'gaps', header: 'Gaps', width: 36, wrap: true },
] as const satisfies readonly ColumnSpec[]

export const CLOCK_COLUMNS = [
  { key: 'cite', header: 'Cite', width: 6 },
  { key: 'regulation', header: 'Regulation', width: 30, wrap: true },
  { key: 'status', header: 'Rule status', width: 14 },
  { key: 'clock', header: 'Filing', width: 30, wrap: true },
  { key: 'recipient', header: 'Recipient', width: 24, wrap: true },
  { key: 'triggered', header: 'Clock started', width: 20 },
  { key: 'due', header: 'Deadline', width: 20 },
  { key: 'filed', header: 'Filed', width: 20 },
  { key: 'result', header: 'Result', width: 10 },
  { key: 'note', header: 'Note', width: 36, wrap: true },
] as const satisfies readonly ColumnSpec[]

const EVIDENCE_LABEL = {
  none: '—',
  planned: 'Planned',
  delivered: 'Delivered',
  observed: 'Observed',
}

/** "2026-03-12T10:40" → "Thu 12 Mar 2026 10:40" (scenario time). */
const when = (local: string | undefined): string =>
  local ? formatScenarioDate(parseLocal(local), { year: true }) : ''

export function coverageRows(report: CoverageReport): string[][] {
  return report.frameworks.flatMap((f) =>
    f.rows.map((r) => [
      f.label,
      r.path.join(' › '),
      r.controlId,
      r.title,
      r.rowIds.join(', '),
      r.rowIds.length ? (r.suggestedOnly ? 'Suggested' : 'Accepted') : '',
      EVIDENCE_LABEL[r.evidence],
      r.references.join('; '),
      r.gaps.join('; '),
    ]),
  )
}

export function clockRows(report: CoverageReport): string[][] {
  return report.clocks.map((c) => [
    c.cite,
    c.regulation,
    c.status,
    c.clock,
    c.recipient,
    when(c.triggeredAt),
    when(c.dueAt),
    when(c.filedAt),
    c.resultLabel,
    c.note,
  ])
}

/** Excel sheet names: at most 31 characters, none of []:*?/\ . */
export const sheetName = (label: string): string =>
  label
    .replace(/[[\]:*?/\\]/g, ' ')
    .slice(0, 31)
    .trim() || 'Framework'

function frameworkSheet(report: CoverageReport, i: number): SheetSpec {
  const f = report.frameworks[i]!
  return {
    name: sheetName(f.shortLabel),
    columns: COVERAGE_COLUMNS,
    rows: coverageRows({ ...report, frameworks: [f] }),
  }
}

export async function coverageWorkbook(model: ExportModel, report: CoverageReport) {
  const sheets: SheetSpec[] = [
    ...report.frameworks.map((_, i) => frameworkSheet(report, i)),
    { name: 'Clocks', columns: CLOCK_COLUMNS, rows: clockRows(report) },
    {
      name: 'About',
      columns: [
        { key: 'k', header: 'Item', width: 22 },
        { key: 'v', header: 'Value', width: 90, wrap: true },
      ],
      rows: [
        ['Scenario', report.scenarioTitle],
        ['Note', report.disclaimer],
        ['Scenario dates', startNote(report)],
        [
          'Evidence levels',
          'Planned: an MSEL row maps to the control. Delivered: that row was delivered in Facilitate. Observed: a facilitator note, an evaluator observation or a met reporting clock references it.',
        ],
      ],
    },
  ]
  return tableWorkbook(sheets, {
    creator: 'Action Stations',
    created: new Date(model.generatedAt),
  })
}

export function startNote(report: CoverageReport): string {
  if (report.startSource === 'brief') return 'From the scenario brief.'
  if (report.startSource === 'startex') return 'Read from the STARTEX card.'
  return 'The scenario has no start date; business days assume STARTEX on the next Monday.'
}

/** Whether a report has anything to show: an enabled framework or a regulatory clock. */
export const hasCoverage = (r: CoverageReport | undefined): r is CoverageReport =>
  !!r && (r.frameworks.length > 0 || r.clocks.length > 0)

/** UTF-8 byte order mark, so Excel opens the CSV as UTF-8. */
const BOM = '\uFEFF'

const csvCell = (v: string): string => {
  const safe = neutralizeFormula(v)
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}
const csvLine = (cells: readonly string[]): string => cells.map(csvCell).join(',')

/** The matrix as CSV (UTF-8 with BOM, CRLF), one line per control, the note on the last line. */
export function coverageCsv(report: CoverageReport): string {
  const lines = [
    csvLine(COVERAGE_COLUMNS.map((c) => c.header)),
    ...coverageRows(report).map(csvLine),
    csvLine(['Note', '', '', report.disclaimer]),
  ]
  return `${BOM}${lines.join('\r\n')}\r\n`
}

/** The clocks as CSV. */
export function clocksCsv(report: CoverageReport): string {
  const lines = [
    csvLine(CLOCK_COLUMNS.map((c) => c.header)),
    ...clockRows(report).map(csvLine),
    csvLine(['', 'Note', '', report.disclaimer]),
  ]
  return `${BOM}${lines.join('\r\n')}\r\n`
}

const mdCell = (s: string): string => s.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ')

/** "## Compliance coverage" for scenario.md (controls with any evidence, and every clock). */
export function coverageMarkdown(report: CoverageReport): string {
  const out = ['## Compliance coverage', '', `_${report.disclaimer}_`, '']
  for (const f of report.frameworks) {
    const used = f.rows.filter((r) => r.rowIds.length || r.gaps.length || r.evidence !== 'none')
    out.push(`### ${f.label}`, '')
    if (!used.length) out.push('No MSEL row maps to this framework yet.', '')
    else {
      out.push(
        '| Control | Title | Rows | Evidence | References |',
        '| --- | --- | --- | --- | --- |',
      )
      for (const r of used)
        out.push(
          `| ${mdCell(r.controlId)} | ${mdCell(r.title)} | ${mdCell(r.rowIds.join(', '))} | ${EVIDENCE_LABEL[r.evidence]} | ${mdCell([...r.references, ...r.gaps].join('; '))} |`,
        )
      out.push('')
    }
    if (f.gapCount) out.push(`Gaps: ${f.gapCount} controls in mapped categories have no row.`, '')
  }
  if (report.clocks.length) {
    out.push('### Regulatory clocks', '', startNote(report), '')
    out.push(
      '| Cite | Regulation | Filing | Deadline | Filed | Result |',
      '| --- | --- | --- | --- | --- | --- |',
    )
    for (const c of report.clocks)
      out.push(
        `| ${c.cite} | ${mdCell(c.regulation)} | ${mdCell(c.clock)} | ${when(c.dueAt)} | ${when(c.filedAt)} | ${c.resultLabel} |`,
      )
    out.push('')
  }
  return out.join('\n')
}
