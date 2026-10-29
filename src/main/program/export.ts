// Program exports (FR-12): the Improvement Plan table in the HSEEP AAR/IP layout, the IPP
// schedule, and a ZIP of the program's own files for hand-off. DOCX through the `docx` package,
// PDF through the render window, CSV by hand. Owner names and emails are printed because the
// person who made the program asked for the export; nothing is sent anywhere.
import { promises as fs } from 'node:fs'
import { join, resolve } from 'node:path'
import { Document, HeadingLevel, Packer, PageOrientation, Paragraph } from 'docx'
import JSZip from 'jszip'
import { capabilityName } from '@shared/core-capabilities'
import { actionLabel } from '@shared/program/status'
import {
  CAPABILITY_ELEMENT_LABELS,
  CORRECTIVE_ACTION_STATUS_LABELS,
  EXERCISE_TYPE_LABELS,
  type PlannedExercise,
  type Program,
  type ProgramAction,
  type Schedule,
} from '@shared/schemas'
import type { ProgramExportTarget } from '@shared/ipc/program'
import { ensureDir, slugify, writeFileAtomic } from '../lib/fs'
import { run, table } from '../export/docx'
import type { ComposedDocument } from '../render/compose'
import { renderPdf } from '../render/window'
import { listAllActions } from './actions'
import { loadProgram, loadSchedule, programPaths } from './store'

export const IP_COLUMNS = [
  'ID',
  'Core Capability',
  'Issue/Area for Improvement',
  'Corrective Action',
  'Capability Element',
  'Primary Responsible Organization',
  'Organization POC',
  'Start Date',
  'Completion Date',
  'Status',
] as const

export const IPP_COLUMNS = [
  'When',
  'Exercise',
  'Type',
  'Status',
  'Priorities',
  'Core Capabilities',
  'Plan sections',
  'Corrective actions to verify',
  'Completed',
] as const

type Row = string[]

export function ipRows(actions: ProgramAction[]): Row[] {
  return actions.map((a) => [
    actionLabel(a),
    a.coreCapabilities.map(capabilityName).join('; '),
    a.areaForImprovement || a.title,
    a.description || a.title,
    a.element ? CAPABILITY_ELEMENT_LABELS[a.element] : '',
    a.owner.organization,
    [a.owner.name, a.owner.email].filter(Boolean).join(' '),
    a.startDate ?? '',
    a.dueDate ?? '',
    CORRECTIVE_ACTION_STATUS_LABELS[a.status],
  ])
}

export const whenLabel = (e: PlannedExercise): string =>
  'date' in e.when ? e.when.date : `${e.when.year} Q${e.when.quarter}`

export function ippRows(program: Program, schedule: Schedule, actions: ProgramAction[]): Row[] {
  const label = new Map(actions.map((a) => [a.id, actionLabel(a)]))
  const priority = new Map(program.priorities.map((p, i) => [p.id, `P-${i + 1}`]))
  return [...schedule.exercises]
    .sort((a, b) => whenLabel(a).localeCompare(whenLabel(b)))
    .map((e) => [
      whenLabel(e),
      e.title,
      EXERCISE_TYPE_LABELS[e.type],
      e.status,
      e.priorityIds.map((id) => priority.get(id) ?? id).join(', '),
      e.coreCapabilities.map(capabilityName).join('; '),
      e.planSections.map((s) => s.headingPath || s.documentTitle).join('; '),
      e.correctiveActionIds.map((id) => label.get(id) ?? id).join(', '),
      e.completedAt ?? '',
    ])
}

/** A cell a spreadsheet would run as a formula starts with one of these; neutralize it. */
const FORMULA_START = /^[=+\-@\t\r]/

export function csvCell(value: string): string {
  const safe = FORMULA_START.test(value) ? `'${value}` : value
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}

export function toCsv(header: readonly string[], rows: Row[]): string {
  return [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n'
}

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const PDF_CSS =
  'body{margin:0;font:10px/1.35 "Helvetica Neue",Arial,sans-serif;color:#1d1d1b}' +
  'main{width:816px;padding:36px 30px;box-sizing:border-box}h1{font-size:18px;margin:0 0 4px}' +
  'p{margin:0 0 12px;color:#555}table{width:100%;border-collapse:collapse;table-layout:fixed}' +
  'th,td{border:1px solid #999;padding:4px 5px;text-align:left;vertical-align:top;word-wrap:break-word}' +
  'th{background:#e7e4dc}tr{page-break-inside:avoid}thead{display:table-header-group}'

export function tableHtml(title: string, subtitle: string, header: readonly string[], rows: Row[]) {
  const head = header.map((h) => `<th scope="col">${esc(h)}</th>`).join('')
  const body = rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')
  return (
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(title)}</title>` +
    `<style>${PDF_CSS}</style></head><body><main class="inject-root"><h1>${esc(title)}</h1>` +
    `<p>${esc(subtitle)}</p><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>` +
    `</main></body></html>`
  )
}

function pdfDocument(html: string): ComposedDocument {
  return {
    html: html.replace(
      '<head>',
      `<head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'none'">`,
    ),
    meta: {
      type: 'program_export',
      label: 'Program export',
      version: '1',
      width: 816,
      paper: true,
      variants: [],
      background: '#ffffff',
      imageSlots: [],
    },
    baseDir: resolve('.'),
    readRoots: [],
  }
}

async function docx(title: string, header: readonly string[], rows: Row[]): Promise<Buffer> {
  const doc = new Document({
    sections: [
      {
        properties: { page: { size: { orientation: PageOrientation.LANDSCAPE } } },
        children: [
          new Paragraph({ heading: HeadingLevel.TITLE, children: [run(title, { bold: true })] }),
          table([...header], rows),
        ],
      },
    ],
  })
  return Packer.toBuffer(doc)
}

async function handoffZip(root: string): Promise<Buffer> {
  const zip = new JSZip()
  const paths = programPaths(root)
  zip.file('program.json', await fs.readFile(paths.file))
  zip.file('schedule.json', await fs.readFile(paths.schedule).catch(() => '{}'))
  for (const { action } of (await listAllActions(root)).actions)
    zip.file(`corrective-actions/${action.id}.json`, await fs.readFile(paths.action(action.id)))
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
}

interface Built {
  program: Program
  schedule: Schedule
  actions: ProgramAction[]
}

type Maker = (b: Built, root: string) => Promise<Buffer | string>

const IP_TITLE = 'Improvement Plan'
const IPP_TITLE = 'Integrated Preparedness Plan schedule'
const cycleText = (p: Program): string =>
  `${p.name} · ${p.cycle.startYear}-${p.cycle.startYear + p.cycle.years - 1}`

const MAKERS: Record<ProgramExportTarget, { file: string; make: Maker }> = {
  ip_docx: {
    file: 'improvement-plan.docx',
    make: (b) => docx(`${IP_TITLE}: ${cycleText(b.program)}`, IP_COLUMNS, ipRows(b.actions)),
  },
  ip_pdf: {
    file: 'improvement-plan.pdf',
    make: (b) =>
      renderPdf(
        pdfDocument(tableHtml(IP_TITLE, cycleText(b.program), IP_COLUMNS, ipRows(b.actions))),
      ),
  },
  ip_csv: { file: 'improvement-plan.csv', make: async (b) => toCsv(IP_COLUMNS, ipRows(b.actions)) },
  ipp_docx: {
    file: 'ipp-schedule.docx',
    make: (b) =>
      docx(
        `${IPP_TITLE}: ${cycleText(b.program)}`,
        IPP_COLUMNS,
        ippRows(b.program, b.schedule, b.actions),
      ),
  },
  ipp_pdf: {
    file: 'ipp-schedule.pdf',
    make: (b) =>
      renderPdf(
        pdfDocument(
          tableHtml(
            IPP_TITLE,
            cycleText(b.program),
            IPP_COLUMNS,
            ippRows(b.program, b.schedule, b.actions),
          ),
        ),
      ),
  },
  ipp_csv: {
    file: 'ipp-schedule.csv',
    make: async (b) => toCsv(IPP_COLUMNS, ippRows(b.program, b.schedule, b.actions)),
  },
  zip: { file: 'program-handoff.zip', make: (_b, root) => handoffZip(root) },
}

/** Write the chosen exports into `outDir`; returns the files written. */
export async function exportProgram(
  root: string,
  outDir: string,
  targets: ProgramExportTarget[],
): Promise<string[]> {
  const program = await loadProgram(root)
  const built: Built = {
    program,
    schedule: (await loadSchedule(root)).value,
    actions: (await listAllActions(root)).actions.map((v) => v.action),
  }
  const dir = resolve(outDir)
  await ensureDir(dir)
  const slug = slugify(program.name) || 'program'
  const files: string[] = []
  for (const target of [...new Set(targets)]) {
    const { file, make } = MAKERS[target]
    const path = join(dir, `${slug}-${file}`)
    await writeFileAtomic(path, await make(built, root))
    files.push(path)
  }
  return files
}
