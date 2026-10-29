// The MSEL as an Excel workbook (#420) in the common HSEEP column layout: sheet "MSEL" with one
// row per MSEL row, plus Overview, Objectives, Roles and Legend. Written with exceljs (ADR-0030).
// Every cell is a plain string: no formulas, no macros, no external links. Model text that
// starts like a formula (= + - @) gets a leading space so no spreadsheet evaluates it.
import ExcelJS from 'exceljs'
import type { Inject, MselRow, Scenario } from '@shared/schemas'
import {
  deliveryMethodFor,
  DELIVERY_METHODS,
  injectTypeInfo,
  PURPOSE_TAG_INFO,
  PURPOSE_TAGS,
} from '@shared/taxonomy'
import { citationLabel } from '../generate/docs'
import { buildGraph, hasBranches } from '@shared/branching/graph'
import { tasksForRow } from './evaluation'
import { exerciseOverviewFacts } from './hseep'
import { objectiveText } from './hseep/common'
import type { ExportModel } from './model'
import { groupRows, phaseHeading, toText } from './views'

export interface ColumnSpec {
  key: string
  header: string
  width: number
  wrap?: boolean
}

export const MSEL_COLUMNS = [
  { key: 'id', header: 'Inject #', width: 10 },
  { key: 'phase', header: 'Phase / Module', width: 22 },
  { key: 'time', header: 'Scenario Time', width: 12 },
  { key: 'wallClock', header: 'Wall Clock', width: 11 },
  { key: 'eventType', header: 'Event Type', width: 13 },
  { key: 'from', header: 'From', width: 18 },
  { key: 'to', header: 'To', width: 18 },
  { key: 'method', header: 'Delivery Method', width: 16 },
  { key: 'event', header: 'Inject Description', width: 60, wrap: true },
  { key: 'expected', header: 'Expected Player Action', width: 48, wrap: true },
  { key: 'objectives', header: 'Objective(s)', width: 24, wrap: true },
  { key: 'capabilities', header: 'Core Capability(ies)', width: 26, wrap: true },
  { key: 'tasks', header: 'Critical Task(s)', width: 16 },
  { key: 'purpose', header: 'Purpose', width: 16 },
  { key: 'format', header: 'Format', width: 16 },
  { key: 'media', header: 'Media File', width: 30 },
  { key: 'controllerNotes', header: 'Controller Notes', width: 40, wrap: true },
  { key: 'deliveredAt', header: 'Delivered At', width: 12 },
  { key: 'notes', header: 'Notes', width: 30 },
] as const satisfies readonly ColumnSpec[]

export interface RowStyle {
  /** ARGB fill, e.g. "FFF3F1EC". */
  fill?: string
  italic?: boolean
}

export interface SheetSpec {
  name: string
  columns: readonly ColumnSpec[]
  rows: string[][]
  style?: (rowIndex: number) => RowStyle | undefined
}

/** Model text never starts a formula: "=SUM(…)" → " =SUM(…)". */
export function neutralizeFormula(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? ` ${value}` : value
}

const HEADER_FILL = 'FFE7E4DC'
/** Alternating phase bands, light enough to print. */
const BANDS = ['FFFFFFFF', 'FFF1F4F7']
const CONTROL_TAGS = new Set(['STARTEX', 'TIME_JUMP', 'ENDEX'])

function addSheet(wb: ExcelJS.Workbook, spec: SheetSpec): void {
  const ws = wb.addWorksheet(spec.name, { views: [{ state: 'frozen', ySplit: 1 }] })
  ws.columns = spec.columns.map((c) => ({ key: c.key, width: c.width }))
  const header = ws.getRow(1)
  spec.columns.forEach((c, i) => {
    const cell = header.getCell(i + 1)
    cell.value = c.header
    cell.font = { bold: true }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } }
    cell.alignment = { vertical: 'top', wrapText: true }
  })
  spec.rows.forEach((values, r) => {
    const row = ws.getRow(r + 2)
    const style = spec.style?.(r)
    spec.columns.forEach((c, i) => {
      const cell = row.getCell(i + 1)
      cell.value = neutralizeFormula(values[i] ?? '')
      cell.alignment = { vertical: 'top', wrapText: !!c.wrap }
      if (style?.italic) cell.font = { italic: true }
      if (style?.fill)
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: style.fill } }
    })
  })
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: spec.columns.length } }
}

/** A workbook of plain-text sheets (shared with the AAR's Improvement Plan tracker, #419). */
export async function tableWorkbook(
  sheets: SheetSpec[],
  meta: { creator: string; created: Date },
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  wb.creator = meta.creator
  wb.lastModifiedBy = meta.creator
  wb.created = meta.created
  wb.modified = meta.created
  for (const s of sheets) addSheet(wb, s)
  return Buffer.from(await wb.xlsx.writeBuffer())
}

const eventType = (row: MselRow): string =>
  CONTROL_TAGS.has(row.purposeTag)
    ? 'Control card'
    : row.expectedAction.trim()
      ? 'Inject'
      : 'Contextual'

/** Objective names for a row: its critical tasks' objectives (#421), else its rubric metrics'. */
function rowObjectives(model: ExportModel, row: MselRow): string[] {
  const s = model.scenario
  const name = (ref: string) => {
    const o = s.objectives.find((x) => x.id === ref || x.name === ref)
    return o ? o.name || o.text : ref
  }
  const fromTasks = tasksForRow(model.evaluation, row.id).flatMap((t) => t.objectiveIds)
  const refs = fromTasks.length
    ? fromTasks
    : (s.rubric?.metrics ?? [])
        .filter((m) => m.linkedInjectIds.includes(row.id))
        .flatMap((m) => m.objectiveRefs)
  return [...new Set(refs.map(name))]
}

export function mselRowValues(model: ExportModel, row: MselRow, phase: string): string[] {
  const inject: Inject | undefined = model.injects.find((i) => i.mselRowId === row.id)
  const format = inject?.type ?? row.format
  const tasks = tasksForRow(model.evaluation, row.id)
  const media = model.media.filter((m) => inject && m.inject.id === inject.id)
  const values: Record<(typeof MSEL_COLUMNS)[number]['key'], string> = {
    id: row.id,
    phase,
    time: row.time,
    wallClock: row.wallClock ?? '',
    eventType: eventType(row),
    from: row.from,
    to: toText(row, model.scenario),
    method: deliveryMethodFor(format, inject?.deliveryMode),
    event: row.event,
    expected: row.expectedAction,
    objectives: rowObjectives(model, row).join('; '),
    capabilities: [...new Set(tasks.map((t) => t.capability))].join('; '),
    tasks: tasks.map((t) => t.task.id).join('; '),
    purpose: PURPOSE_TAG_INFO[row.purposeTag]?.label ?? row.purposeTag,
    format: (format && injectTypeInfo(format)?.label) || format || '',
    media: media.map((m) => m.fileName).join('; '),
    controllerNotes: inject?.instructorNote ?? '',
    deliveredAt: '',
    notes: '',
  }
  return MSEL_COLUMNS.map((c) => values[c.key])
}

const BRANCH_COLUMN: ColumnSpec = { key: 'branch', header: 'Branch', width: 22 }

const SEAM_COLUMN: ColumnSpec = { key: 'seam', header: 'Plan Seam', width: 28, wrap: true }

/** The MSEL columns; a branched scenario gets a Branch column, one with seam rows a Plan Seam column. */
function columnsFor(branched: boolean, seamed = false): readonly ColumnSpec[] {
  const cols: ColumnSpec[] = [...MSEL_COLUMNS]
  if (branched) cols.splice(1, 0, BRANCH_COLUMN)
  if (seamed) cols.splice(cols.findIndex((c) => c.key === 'purpose') + 1, 0, SEAM_COLUMN)
  return cols
}

const hasSeamRows = (model: ExportModel): boolean => model.scenario.msel.some((r) => r.seamId)

/** "Seam: Who approves public releases" on a row that tests a plan seam (#427), else "". */
function seamCell(model: ExportModel, row: MselRow): string {
  if (!row.seamId) return ''
  const seam = model.scenario.seams?.find((x) => x.id === row.seamId)
  return seam ? `Seam: ${seam.slotLabel}` : 'Seam'
}

/** "B1 Pay" for a branch row, "" on the trunk. */
function branchCell(model: ExportModel, row: MselRow): string {
  const b = model.scenario.branches?.find((x) => x.id === row.branchId)
  return b ? `${b.id.toUpperCase()} ${b.label}` : ''
}

function sheetRow(model: ExportModel, row: MselRow, phase: string, branched: boolean): string[] {
  const values = mselRowValues(model, row, phase)
  if (branched) values.splice(1, 0, branchCell(model, row))
  if (hasSeamRows(model)) {
    const at = columnsFor(branched, true).findIndex((c) => c.key === 'seam')
    values.splice(at, 0, seamCell(model, row))
  }
  return values
}

function mselSheet(model: ExportModel): SheetSpec {
  const branched = hasBranches(model.scenario)
  const rows: string[][] = []
  const styles: RowStyle[] = []
  groupRows(model.scenario).forEach(({ phase, rows: msel }, band) => {
    const label = phase ? phaseHeading(phase) : 'Additional events'
    for (const r of msel) {
      rows.push(sheetRow(model, r, label, branched))
      styles.push({
        fill: BANDS[band % BANDS.length]!,
        italic: CONTROL_TAGS.has(r.purposeTag),
      })
    }
  })
  return {
    name: 'MSEL',
    columns: columnsFor(branched, hasSeamRows(model)),
    rows,
    style: (i) => styles[i],
  }
}

/** Excel sheet names: at most 31 characters, none of []:*?/\ , unique within the workbook. */
function sheetName(raw: string, taken: Set<string>): string {
  const base =
    raw
      .replace(/[[\]:*?/\\]/g, ' ')
      .trim()
      .slice(0, 31) || 'Branch'
  let name = base
  for (let n = 2; taken.has(name.toLowerCase()); n++) name = `${base.slice(0, 28)} ${n}`
  taken.add(name.toLowerCase())
  return name
}

/** One sheet per branch with its rows (same columns as the MSEL sheet). */
function branchSheets(model: ExportModel): SheetSpec[] {
  const s = model.scenario
  if (!hasBranches(s)) return []
  const taken = new Set(['msel', 'decisions', 'overview', 'objectives', 'roles', 'legend'])
  const phaseOf = (r: MselRow) => {
    const p = s.phases.find((x) => x.id === r.phaseId)
    return p ? phaseHeading(p) : 'Additional events'
  }
  return [...buildGraph(s).branches.values()].map((node) => ({
    name: sheetName(`Branch ${node.branch.id.toUpperCase()} ${node.branch.label}`, taken),
    columns: columnsFor(true, hasSeamRows(model)),
    rows: node.rows.map((r) => sheetRow(model, r, phaseOf(r), true)),
  }))
}

const branchRejoin = (model: ExportModel, branchId: string | undefined): string => {
  const b = model.scenario.branches?.find((x) => x.id === branchId)
  return b ? (b.rejoinRowId ?? 'Ends the exercise') : ''
}

/** Every decision with one line per option: where it leads and how it is decided. */
function decisionsSheet(model: ExportModel): SheetSpec[] {
  const decisions = [...buildGraph(model.scenario).decisions.values()]
  if (!decisions.length || !hasBranches(model.scenario)) return []
  const rows = decisions.flatMap(({ row, decision: d }) =>
    d.options.map((o) => [
      row.id,
      row.time,
      d.question,
      o.label,
      o.branchId ? o.branchId.toUpperCase() : 'Continues',
      branchRejoin(model, o.branchId),
      d.rule.kind,
      o.id === d.defaultOptionId ? 'Yes' : '',
      d.timeoutMin ? String(d.timeoutMin) : '',
    ]),
  )
  return [
    {
      name: 'Decisions',
      columns: [
        { key: 'row', header: 'Decision row', width: 14 },
        { key: 'time', header: 'Time', width: 10 },
        { key: 'question', header: 'Question', width: 50, wrap: true },
        { key: 'option', header: 'Option', width: 28, wrap: true },
        { key: 'branch', header: 'Branch', width: 10 },
        { key: 'rejoin', header: 'Rejoins at', width: 14 },
        { key: 'rule', header: 'Rule', width: 14 },
        { key: 'default', header: 'Default', width: 10 },
        { key: 'timeout', header: 'Timeout (min)', width: 14 },
      ],
      rows,
    },
  ]
}

const KV: ColumnSpec[] = [
  { key: 'field', header: 'Field', width: 28 },
  { key: 'value', header: 'Value', width: 90, wrap: true },
]

function overviewSheet(model: ExportModel): SheetSpec {
  const o: Scenario['overview'] = model.scenario.overview
  return {
    name: 'Overview',
    columns: KV,
    rows: [
      ...exerciseOverviewFacts(model).map((f) => [f.label, f.value]),
      ['Theme', o?.theme ?? ''],
      ['Threat', o?.threat ?? ''],
      ['Operational impact', o?.operationalImpact ?? ''],
      ['Plan sections tested', (o?.coreSectionsTested ?? []).map(citationLabel).join('; ')],
    ],
  }
}

function objectivesSheet(model: ExportModel): SheetSpec {
  const ev = model.evaluation
  return {
    name: 'Objectives',
    columns: [
      { key: 'objective', header: 'Objective', width: 60, wrap: true },
      { key: 'capabilities', header: 'Core Capabilities', width: 30, wrap: true },
      { key: 'tasks', header: 'Critical Tasks', width: 60, wrap: true },
    ],
    rows: model.scenario.objectives.map((o) => {
      const eegs = (ev?.eegs ?? []).filter((e) => e.objectiveIds.includes(o.id))
      return [
        objectiveText(o),
        (ev?.objectiveCapabilities[o.id] ?? []).join('; '),
        eegs.flatMap((e) => e.criticalTasks.map((t) => `${t.id}: ${t.text}`)).join('\n'),
      ]
    }),
  }
}

function rolesSheet(model: ExportModel): SheetSpec {
  return {
    name: 'Roles',
    columns: [
      { key: 'role', header: 'Role', width: 34 },
      { key: 'abbr', header: 'Abbreviation', width: 14 },
      { key: 'team', header: 'Team', width: 20 },
      { key: 'description', header: 'Description', width: 70, wrap: true },
    ],
    rows: model.scenario.roles.map((r) => [r.name, r.abbreviation, r.team, r.description]),
  }
}

const EVENT_TYPES: [string, string][] = [
  ['Inject', 'An event delivered to players that expects an action.'],
  ['Contextual', 'Background information; no player action expected.'],
  ['Control card', 'STARTEX, time jump or ENDEX, read by the controller to the room.'],
]

function legendSheet(): SheetSpec {
  return {
    name: 'Legend',
    columns: [
      { key: 'kind', header: 'Kind', width: 18 },
      { key: 'term', header: 'Term', width: 24 },
      { key: 'meaning', header: 'Meaning', width: 70, wrap: true },
    ],
    rows: [
      ...PURPOSE_TAGS.map((t) => [
        'Purpose',
        PURPOSE_TAG_INFO[t].label,
        PURPOSE_TAG_INFO[t].meaning,
      ]),
      ...DELIVERY_METHODS.map((m) => ['Delivery method', m, '']),
      ...EVENT_TYPES.map(([t, m]) => ['Event type', t, m]),
    ],
  }
}

/** The Excel MSEL for one scenario. */
export function mselWorkbook(model: ExportModel): Promise<Buffer> {
  return tableWorkbook(
    [
      mselSheet(model),
      ...branchSheets(model),
      ...decisionsSheet(model),
      overviewSheet(model),
      objectivesSheet(model),
      rolesSheet(model),
      legendSheet(),
    ],
    {
      creator: model.project.orgName || 'Action Stations',
      created: new Date(model.generatedAt),
    },
  )
}
