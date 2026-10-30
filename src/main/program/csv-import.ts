// Import an existing corrective-action list from a CSV file (#504, #424). The file is treated
// as untrusted: size and row caps, every row is validated with the ProgramAction schema, and
// text cells are made formula-safe (leading `=`, `+`, `@`, tab or carriage return removed) so
// nothing in the file can turn into a spreadsheet formula when the program is exported again.
// Columns are matched by header, using the names of the Improvement Plan export too, so a file
// written by Action Stations imports back. A row whose title matches an existing action is
// skipped, which makes a second import of the same file harmless.
import {
  CAPABILITY_ELEMENTS,
  CAPABILITY_ELEMENT_LABELS,
  CORRECTIVE_ACTION_STATUSES,
  CORRECTIVE_ACTION_STATUS_LABELS,
  IsoDate,
  PROGRAM_LIMITS,
  ProgramAction,
  type CapabilityElement,
  type CorrectiveActionStatus,
} from '@shared/schemas'
import { CORE_CAPABILITIES } from '@shared/core-capabilities'
import type { CsvImportPreview, CsvImportRow } from '@shared/ipc/program'
import { AppError } from '../lib/errors'
import { nowIso } from '../lib/ids'
import { parseCsv } from '../hazards/sources/csv'
import { changeStatus, createAction, listAllActions } from './actions'
import { loadProgram } from './store'

export const CSV_LIMITS = { bytes: 1_000_000, rows: 1000 } as const

type Field =
  | 'title'
  | 'description'
  | 'areaForImprovement'
  | 'coreCapabilities'
  | 'element'
  | 'organization'
  | 'ownerName'
  | 'email'
  | 'startDate'
  | 'dueDate'
  | 'status'
  | 'priority'
  | 'notes'

const HEADERS: Record<string, Field> = {
  title: 'title',
  'corrective action': 'description',
  action: 'title',
  description: 'description',
  'issue/area for improvement': 'areaForImprovement',
  'area for improvement': 'areaForImprovement',
  issue: 'areaForImprovement',
  'core capability': 'coreCapabilities',
  'core capabilities': 'coreCapabilities',
  'capability element': 'element',
  element: 'element',
  'primary responsible organization': 'organization',
  organization: 'organization',
  'organization poc': 'ownerName',
  owner: 'ownerName',
  poc: 'ownerName',
  email: 'email',
  'start date': 'startDate',
  'completion date': 'dueDate',
  'due date': 'dueDate',
  status: 'status',
  priority: 'priority',
  notes: 'notes',
}

const FORMULA_LEAD = /^[=+@\t\r]+/

/** Remove the characters a spreadsheet would read as the start of a formula. */
export function formulaSafe(value: string): string {
  return value.replace(FORMULA_LEAD, '').trim()
}

const norm = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

function matchCapabilities(cell: string, warn: (m: string) => void) {
  const found: string[] = []
  for (const part of cell.split(/[;,]/).map((p) => norm(p))) {
    if (!part) continue
    const hit = CORE_CAPABILITIES.find((c) => norm(c.id) === part || norm(c.name) === part)
    if (hit) found.push(hit.id)
    else warn(`Core capability "${part}" is not one of the 32; left out`)
  }
  return [...new Set(found)]
}

function matchStatus(cell: string, warn: (m: string) => void): CorrectiveActionStatus {
  const key = norm(cell)
  if (!key) return 'open'
  const hit = CORRECTIVE_ACTION_STATUSES.find(
    (s) => norm(s) === key || norm(CORRECTIVE_ACTION_STATUS_LABELS[s]) === key,
  )
  if (!hit) {
    warn(`Status "${cell}" is not recognised; imported as Open`)
    return 'open'
  }
  if (hit === 'verified') {
    warn('Verified needs a verification record; imported as Completed')
    return 'completed'
  }
  return hit
}

/** `2026-03-01` or `3/1/2026`; anything else is dropped with a warning. */
function matchDate(cell: string, label: string, warn: (m: string) => void): string | undefined {
  if (!cell) return undefined
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(cell)
  const iso = us ? `${us[3]}-${us[1]!.padStart(2, '0')}-${us[2]!.padStart(2, '0')}` : cell
  if (IsoDate.safeParse(iso).success) return iso
  warn(`${label} "${cell}" is not a date (use YYYY-MM-DD); left out`)
  return undefined
}

function matchElement(cell: string, warn: (m: string) => void): CapabilityElement | undefined {
  if (!cell) return undefined
  const hit = CAPABILITY_ELEMENTS.find(
    (e) => norm(e) === norm(cell) || norm(CAPABILITY_ELEMENT_LABELS[e]) === norm(cell),
  )
  if (!hit) warn(`Capability element "${cell}" is not recognised; left out`)
  return hit
}

interface ParsedRow {
  row: CsvImportRow
  status: CorrectiveActionStatus
  action?: ProgramAction
}

function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

function buildRow(
  values: Partial<Record<Field, string>>,
  line: number,
  programId: string,
): ParsedRow {
  const warnings: string[] = []
  const warn = (m: string) => warnings.push(m)
  const text = (f: Field): string => {
    const raw = values[f] ?? ''
    const safe = formulaSafe(raw)
    if (safe !== raw.trim()) warn(`A leading formula character was removed from ${f}`)
    return safe
  }
  const description = text('description')
  const title = clip(text('title') || description, PROGRAM_LIMITS.title)
  const status = matchStatus(text('status'), warn)
  const priority = norm(text('priority'))
  const now = nowIso()
  const candidate = {
    id: 'new',
    programId,
    title,
    description: description === title ? '' : description,
    areaForImprovement: text('areaForImprovement'),
    coreCapabilities: matchCapabilities(text('coreCapabilities'), warn),
    element: matchElement(text('element'), warn),
    owner: { name: text('ownerName'), organization: text('organization'), email: text('email') },
    startDate: matchDate(text('startDate'), 'Start date', warn),
    dueDate: matchDate(text('dueDate'), 'Completion date', warn),
    priority: ['high', 'medium', 'low'].includes(priority) ? priority : 'medium',
    notes: text('notes'),
    source: { kind: 'manual' },
    createdAt: now,
    updatedAt: now,
  }
  const base = { line, title, status, warnings }
  if (!title) return { status, row: { ...base, error: 'No title or corrective action text' } }
  const parsed = ProgramAction.safeParse(candidate)
  if (!parsed.success)
    return { status, row: { ...base, error: parsed.error.issues[0]?.message ?? 'Invalid row' } }
  return { status, action: parsed.data, row: base }
}

function readRows(csv: string): {
  fields: (Field | undefined)[]
  rows: string[][]
  header: string[]
} {
  if (Buffer.byteLength(csv) > CSV_LIMITS.bytes)
    throw new AppError('VALIDATION', 'That file is larger than 1 MB; split it and import in parts.')
  const [header, ...rows] = parseCsv(csv.charCodeAt(0) === 0xfeff ? csv.slice(1) : csv)
  if (!header) throw new AppError('VALIDATION', 'The file is empty.')
  if (rows.length > CSV_LIMITS.rows)
    throw new AppError('VALIDATION', `The file has more than ${CSV_LIMITS.rows} rows.`)
  const fields = header.map((h) => HEADERS[h.trim().toLowerCase()])
  if (!fields.includes('title') && !fields.includes('description'))
    throw new AppError(
      'VALIDATION',
      'The first row must name the columns, including "Title" or "Corrective Action".',
    )
  return { fields, rows, header }
}

async function parseAll(programRoot: string, csv: string) {
  const { fields, rows, header } = readRows(csv)
  const program = await loadProgram(programRoot)
  const existing = new Set(
    (await listAllActions(programRoot)).actions.map((a) => norm(a.action.title)),
  )
  const parsed = rows.map((cells, i) => {
    const values: Partial<Record<Field, string>> = {}
    fields.forEach((f, c) => {
      if (f && values[f] === undefined) values[f] = (cells[c] ?? '').trim()
    })
    const p = buildRow(values, i + 2, program.id)
    if (p.action && existing.has(norm(p.row.title))) p.row.duplicate = true
    else if (p.action) existing.add(norm(p.row.title))
    return p
  })
  const ignored = header.filter((_, i) => !fields[i]).map((h) => h.trim())
  return { parsed, ignored }
}

export async function previewCsvImport(
  programRoot: string,
  csv: string,
): Promise<CsvImportPreview> {
  const { parsed, ignored } = await parseAll(programRoot, csv)
  return { rows: parsed.map((p) => p.row), ignoredColumns: ignored }
}

/** Create an action for every valid row that is not already in the program. */
export async function applyCsvImport(
  programRoot: string,
  csv: string,
): Promise<{ created: number; skipped: number }> {
  const { parsed } = await parseAll(programRoot, csv)
  let created = 0
  for (const p of parsed) {
    if (!p.action || p.row.duplicate) continue
    const view = await createAction(programRoot, p.action)
    if (p.status !== 'open')
      await changeStatus(programRoot, [view.action.id], p.status, 'Imported from a CSV file')
    created += 1
  }
  return { created, skipped: parsed.length - created }
}
