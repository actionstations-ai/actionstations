// The lab table figures (spec 0466 FR-7): inventory reconciliation with the discrepancy
// highlighted, the sample loss register, and the access log with door events. Each is drawn from
// data, flags rows with a symbol and a word as well as a tint, and states its numbers as a text
// summary and a data table. Every row is exercise data about fictional people and items.
import { z } from 'zod'
import { frame, heading, text } from '../svg'
import type { FigureKind, FigureResult } from '../types'
import { CAPTION, renderFlagTable, type FlagRow } from './rows'

const HEAD = 36
const finish = (
  o: { width: number },
  title: string,
  summary: string,
  heads: string,
  table: { body: string; end: number },
  caption: string | undefined,
  idKey: unknown,
): string =>
  frame({
    width: o.width,
    height: table.end + (caption ? 28 : 10),
    title,
    summary,
    body: heads + table.body + (caption ? text(12, table.end + 18, caption, CAPTION) : ''),
    idKey: JSON.stringify(idKey),
  })

// ---------------------------------------------------------------- inventory reconciliation

export const LabInventoryData = z.object({
  title: z.string().max(200).optional(),
  entity: z.string().max(120).optional(),
  asOf: z.string().max(80).optional(),
  rows: z
    .array(
      z.object({
        item: z.string().min(1).max(80),
        location: z.string().max(80).default(''),
        expected: z.number().int().min(0).max(100_000),
        observed: z.number().int().min(0).max(100_000),
        note: z.string().max(160).default(''),
      }),
    )
    .min(1)
    .max(40),
})
export type LabInventoryData = z.infer<typeof LabInventoryData>

function renderInventory(d: LabInventoryData, o: { width: number; height: number }): FigureResult {
  const diff = (r: LabInventoryData['rows'][number]) => r.observed - r.expected
  const off = d.rows.filter((r) => diff(r) !== 0)
  const sign = (v: number) => (v > 0 ? `+${v}` : String(v))
  const rows: FlagRow[] = d.rows.map((r) => ({
    cells: [r.item, r.location, String(r.expected), String(r.observed), sign(diff(r)), r.note],
    ...(diff(r) !== 0 ? { flag: 'critical' as const, flagText: 'Discrepancy' } : {}),
  }))
  const columns = ['Item', 'Location', 'Expected', 'Observed', 'Difference', 'Note']
  const title = d.title ?? 'Inventory reconciliation'
  const table = renderFlagTable({ columns, rows, width: o.width, numeric: [2, 3, 4], top: HEAD })
  const summary =
    `${title}${d.entity ? ` for ${d.entity}` : ''}${d.asOf ? ` as of ${d.asOf}` : ''}: ${d.rows.length} items counted, ` +
    (off.length
      ? `${off.length} with a discrepancy. ` +
        off
          .map(
            (r) =>
              `${r.item}${r.location ? ` in ${r.location}` : ''}: expected ${r.expected}, observed ${r.observed}`,
          )
          .join('; ') +
        '.'
      : 'no discrepancy.')
  const heads =
    heading(title, 12) +
    (d.asOf
      ? text(o.width - 12, 20, `As of ${d.asOf}`, { size: 12, anchor: 'end', fill: '#594c3c' })
      : '')
  return {
    svg: finish(
      o,
      title,
      summary,
      heads,
      table,
      'Exercise data. Flagged rows differ from the record.',
      d,
    ),
    summary,
    table: {
      caption: title,
      columns: [...columns.slice(0, 5), 'Status', 'Note'],
      rows: d.rows.map((r) => [
        r.item,
        r.location,
        String(r.expected),
        String(r.observed),
        sign(diff(r)),
        diff(r) !== 0 ? 'Discrepancy' : 'Matches',
        r.note,
      ]),
    },
  }
}

export const labInventoryKind: FigureKind<LabInventoryData> = {
  kind: 'lab_inventory_reconciliation',
  schema: LabInventoryData,
  render: renderInventory,
}

// ---------------------------------------------------------------- sample loss register

export const SAMPLE_STATUS = ['safe', 'moved', 'at_risk', 'lost'] as const
const STATUS_WORD = {
  safe: 'Safe',
  moved: 'Moved to backup',
  at_risk: 'At risk',
  lost: 'Lost',
} as const

export const LabSampleRegisterData = z.object({
  title: z.string().max(200).optional(),
  unit: z.string().max(80).optional(),
  asOf: z.string().max(80).optional(),
  rows: z
    .array(
      z.object({
        sample: z.string().min(1).max(80),
        location: z.string().max(80).default(''),
        value: z.enum(['replaceable', 'irreplaceable']),
        backup: z.enum(['none', 'partial', 'full']),
        status: z.enum(SAMPLE_STATUS),
        movedAt: z.string().max(40).default(''),
      }),
    )
    .min(1)
    .max(60),
})
export type LabSampleRegisterData = z.infer<typeof LabSampleRegisterData>

function renderRegister(
  d: LabSampleRegisterData,
  o: { width: number; height: number },
): FigureResult {
  const flagOf = (r: LabSampleRegisterData['rows'][number]): FlagRow => {
    const cells = [
      r.sample,
      r.location,
      r.value,
      r.backup === 'none' ? 'No backup' : r.backup === 'partial' ? 'Partial backup' : 'Backed up',
      STATUS_WORD[r.status],
      r.movedAt,
    ]
    if (r.status === 'lost') return { cells, flag: 'critical', flagText: 'Lost' }
    if (r.status === 'at_risk')
      return r.value === 'irreplaceable'
        ? { cells, flag: 'critical', flagText: 'At risk' }
        : { cells, flag: 'attention', flagText: 'At risk' }
    return { cells }
  }
  const columns = ['Sample', 'Location', 'Value', 'Backup', 'Status', 'Moved at']
  const title = d.title ?? 'Sample loss register'
  const rows = d.rows.map(flagOf)
  const table = renderFlagTable({ columns, rows, width: o.width, top: HEAD })
  const count = (s: (typeof SAMPLE_STATUS)[number]) => d.rows.filter((r) => r.status === s).length
  const irreplaceableOpen = d.rows.filter(
    (r) => r.value === 'irreplaceable' && (r.status === 'at_risk' || r.status === 'lost'),
  ).length
  const summary =
    `${title}${d.unit ? ` for ${d.unit}` : ''}${d.asOf ? ` as of ${d.asOf}` : ''}: ${d.rows.length} samples, ` +
    `${count('safe')} safe, ${count('moved')} moved to backup, ${count('at_risk')} at risk, ${count('lost')} lost; ` +
    `${irreplaceableOpen} irreplaceable samples are at risk or lost.`
  const heads =
    heading(title, 12) +
    (d.asOf
      ? text(o.width - 12, 20, `As of ${d.asOf}`, { size: 12, anchor: 'end', fill: '#594c3c' })
      : '')
  return {
    svg: finish(
      o,
      title,
      summary,
      heads,
      table,
      'Exercise data. Samples and values are fictional.',
      d,
    ),
    summary,
    table: { caption: title, columns, rows: rows.map((r) => r.cells) },
  }
}

export const labSampleRegisterKind: FigureKind<LabSampleRegisterData> = {
  kind: 'lab_sample_loss_register',
  schema: LabSampleRegisterData,
  render: renderRegister,
}

// ---------------------------------------------------------------- access log

export const ACCESS_EVENTS = ['entry', 'exit', 'door_held_open', 'forced_open', 'denied'] as const
const EVENT_WORD = {
  entry: 'Entry',
  exit: 'Exit',
  door_held_open: 'Door held open',
  forced_open: 'Door forced',
  denied: 'Access denied',
} as const

export const LabAccessLogData = z.object({
  title: z.string().max(200).optional(),
  door: z.string().max(120).optional(),
  rows: z
    .array(
      z.object({
        time: z.string().min(1).max(40),
        person: z.string().min(1).max(80),
        event: z.enum(ACCESS_EVENTS),
        afterHours: z.boolean().default(false),
        note: z.string().max(160).default(''),
      }),
    )
    .min(1)
    .max(80),
})
export type LabAccessLogData = z.infer<typeof LabAccessLogData>

function renderAccessLog(d: LabAccessLogData, o: { width: number; height: number }): FigureResult {
  const flagOf = (r: LabAccessLogData['rows'][number]): FlagRow => {
    const cells = [r.time, r.person, EVENT_WORD[r.event], r.afterHours ? 'After hours' : '', r.note]
    if (r.event === 'forced_open') return { cells, flag: 'critical', flagText: 'Door forced' }
    if (r.event === 'door_held_open') return { cells, flag: 'attention', flagText: 'Held open' }
    if (r.event === 'denied') return { cells, flag: 'attention', flagText: 'Denied' }
    if (r.afterHours) return { cells, flag: 'attention', flagText: 'After hours' }
    return { cells }
  }
  const columns = ['Time', 'Person', 'Event', 'Hours', 'Note']
  const title = d.title ?? 'Access log extract'
  const rows = d.rows.map(flagOf)
  const table = renderFlagTable({ columns, rows, width: o.width, top: HEAD })
  const flagged = rows.filter((r) => r.flag)
  const summary =
    `${title}${d.door ? ` for ${d.door}` : ''}: ${d.rows.length} events, ${flagged.length} flagged. ` +
    d.rows
      .filter((_, i) => rows[i]!.flag)
      .map(
        (r) =>
          `${r.time} ${r.person}: ${EVENT_WORD[r.event]}${r.afterHours ? ', after hours' : ''}${r.note ? ` (${r.note})` : ''}`,
      )
      .join('; ') +
    (flagged.length ? '.' : 'No unusual events.')
  return {
    svg: finish(
      o,
      title,
      summary,
      heading(title, 12),
      table,
      'Exercise data. People are fictional.',
      d,
    ),
    summary,
    table: { caption: title, columns, rows: rows.map((r) => r.cells) },
  }
}

export const labAccessLogKind: FigureKind<LabAccessLogData> = {
  kind: 'lab_access_log',
  schema: LabAccessLogData,
  render: renderAccessLog,
}
