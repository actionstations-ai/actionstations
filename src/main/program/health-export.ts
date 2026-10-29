// Health dashboard exports (#438, FR-11): a dated PDF with every panel as a table, and a ZIP of
// the same tables as CSV files (RFC 4180 quoting, spreadsheet formulas neutralized).
import JSZip from 'jszip'
import { healthTables, type HealthTable } from '@shared/program/health-tables'
import type { Program } from '@shared/schemas'
import type { ProgramHealth } from '@shared/schemas'

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const CSS =
  'body{margin:0;font:9px/1.35 "Helvetica Neue",Arial,sans-serif;color:#1d1d1b}' +
  'main{width:816px;padding:36px 30px;box-sizing:border-box}h1{font-size:18px;margin:0 0 4px}' +
  'h2{font-size:12px;margin:18px 0 4px}p{margin:0 0 6px;color:#444}' +
  'table{width:100%;border-collapse:collapse;table-layout:auto;margin-bottom:6px}' +
  'caption{text-align:left;font-weight:bold;padding:2px 0}' +
  'th,td{border:1px solid #999;padding:3px 4px;text-align:left;vertical-align:top;word-wrap:break-word}' +
  'th{background:#e7e4dc}tr{page-break-inside:avoid}thead{display:table-header-group}'

function filterText(h: ProgramHealth): string {
  const f = h.filter
  const parts = [
    f.projectIds?.length ? `${f.projectIds.length} project(s)` : '',
    f.years?.length ? `years ${f.years.join(', ')}` : '',
    f.missionAreas?.length ? `mission areas ${f.missionAreas.join(', ')}` : '',
    f.documentKeys?.length ? `${f.documentKeys.length} document(s)` : '',
  ].filter(Boolean)
  return parts.length ? parts.join('; ') : 'none'
}

function tableHtml(t: HealthTable): string {
  const head = t.header.map((c) => `<th scope="col">${esc(c)}</th>`).join('')
  const body = t.rows.length
    ? t.rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')
    : `<tr><td colspan="${t.header.length}">Nothing to show.</td></tr>`
  return `<table><caption>${esc(t.title)}</caption><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`
}

export function healthHtml(h: ProgramHealth, program: Program): string {
  const { startYear, years } = program.cycle
  const unreachable = h.freshness.filter((f) => !f.reachable).length
  const title = `Program health: ${program.name}`
  const fresh = h.freshness
    .map((f) => `${f.name} (${f.takenAt.slice(0, 10)}${f.reachable ? '' : ', unreachable'})`)
    .join('; ')
  return (
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(title)}</title>` +
    `<style>${CSS}</style></head><body><main class="inject-root"><h1>${esc(title)}</h1>` +
    `<p>Cycle ${startYear}-${startYear + years - 1} · Computed ${h.computedAt.slice(0, 10)} · Filters: ${esc(filterText(h))}</p>` +
    `<p>Data: ${esc(fresh || 'no project snapshots')}</p>` +
    healthTables(h).map(tableHtml).join('') +
    `<p>Computed ${h.computedAt.slice(0, 10)} from ${h.freshness.length} project snapshots; ${unreachable} unreachable.` +
    `${h.filter.includeOwners ? '' : ' Owner names are left out.'}</p></main></body></html>`
  )
}

/** The five CSV files, same rows as the screen. `toCsv` is passed in to share export.ts's quoting. */
export async function healthCsvZip(
  h: ProgramHealth,
  toCsv: (header: readonly string[], rows: string[][]) => string,
): Promise<Buffer> {
  const zip = new JSZip()
  for (const t of healthTables(h)) zip.file(`${t.id}.csv`, toCsv(t.header, t.rows))
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
}
