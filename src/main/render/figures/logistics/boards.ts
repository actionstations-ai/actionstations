// The table-shaped logistics figure kinds (spec 0462 FR-5): shipment tracker, days of supply,
// congestion board and traceability lookup. Each is drawn by the generic table kind, so it sizes
// to its rows and carries the same summary and data table. Status is always a word, never color.
import { z } from 'zod'
import {
  daysOfSupply,
  slipDays,
  stockOutDate,
  supplyState,
  type SupplyState,
} from '@shared/logistics/arithmetic'
import { tableKind } from '../table'
import type { FigureKind, FigureOptions, FigureResult } from '../types'

const isoDate = z.string().refine((s) => !Number.isNaN(Date.parse(s)), 'not a date or time')
const stamp = (iso: string): string =>
  new Date(Date.parse(iso)).toISOString().slice(0, 16).replace('T', ' ')
const day = (iso: string): string => new Date(Date.parse(iso)).toISOString().slice(0, 10)
const MAX_DRAWN = 40

/** Draw `rows` as the generic table, capped, and return the full rows as the data table. */
function drawn(
  title: string,
  caption: string | undefined,
  columns: string[],
  rows: string[][],
  o: FigureOptions,
  /** Column indexes drawn on the picture; the data table always has every column. */
  pick?: number[],
): { svg: string; table: NonNullable<FigureResult['table']> } {
  const note = rows.length > MAX_DRAWN ? `Showing ${MAX_DRAWN} of ${rows.length} rows.` : undefined
  const cap = [note, caption].filter(Boolean).join(' ') || undefined
  const cols = pick ? pick.map((i) => columns[i]!) : columns
  const body = rows.slice(0, MAX_DRAWN).map((r) => (pick ? pick.map((i) => r[i]!) : r))
  const t = tableKind.render(
    { title, ...(cap ? { caption: cap } : {}), columns: cols, rows: body },
    o,
  )
  return { svg: t.svg, table: { caption: title, columns, rows } }
}

// ---- shipment tracker --------------------------------------------------------------------

export const SHIPMENT_STATUSES = ['on_time', 'at_risk', 'delayed', 'held', 'delivered'] as const
const STATUS_WORD: Record<(typeof SHIPMENT_STATUSES)[number], string> = {
  on_time: 'ON TIME',
  at_risk: 'AT RISK',
  delayed: 'DELAYED',
  held: 'HELD',
  delivered: 'DELIVERED',
}

export const ShipmentTrackerData = z.object({
  title: z.string().max(200).optional(),
  asOf: isoDate.optional(),
  rows: z
    .array(
      z.object({
        shipment: z.string().min(1).max(30),
        lane: z.string().min(1).max(60),
        carrier: z.string().min(1).max(60),
        /** Vessel, trailer or railcar. */
        equipment: z.string().max(40).default(''),
        etaPlanned: isoDate,
        etaCurrent: isoDate,
        status: z.enum(SHIPMENT_STATUSES),
        exception: z.string().max(160).default(''),
      }),
    )
    .min(1)
    .max(200),
  simulated: z.boolean().default(true),
})
export type ShipmentTrackerData = z.infer<typeof ShipmentTrackerData>

function renderShipments(d: ShipmentTrackerData, o: FigureOptions): FigureResult {
  const title = d.title ?? 'Shipment tracker'
  const columns = [
    'Shipment',
    'Lane',
    'Carrier',
    'Equipment',
    'ETA planned',
    'ETA now',
    'Slip (days)',
    'Status',
    'Exception',
  ]
  const rows = d.rows.map((r) => {
    const slip = slipDays(Date.parse(r.etaPlanned), Date.parse(r.etaCurrent))
    return [
      r.shipment,
      r.lane,
      r.carrier,
      r.equipment,
      stamp(r.etaPlanned),
      stamp(r.etaCurrent),
      slip > 0 ? `+${slip}` : String(slip),
      STATUS_WORD[r.status],
      r.exception,
    ]
  })
  const note = d.simulated ? 'Simulated shipments. All companies are fictional.' : undefined
  const g = drawn(
    title,
    [d.asOf ? `As of ${stamp(d.asOf)} UTC.` : '', note ?? ''].filter(Boolean).join(' ') ||
      undefined,
    columns,
    rows,
    o,
    [0, 1, 5, 6, 7, 8],
  )
  const count = (s: (typeof SHIPMENT_STATUSES)[number]): number =>
    d.rows.filter((r) => r.status === s).length
  const late = d.rows.filter((r) => Date.parse(r.etaCurrent) > Date.parse(r.etaPlanned))
  const worst = [...late].sort(
    (a, b) =>
      Date.parse(b.etaCurrent) -
        Date.parse(b.etaPlanned) -
        (Date.parse(a.etaCurrent) - Date.parse(a.etaPlanned)) ||
      a.shipment.localeCompare(b.shipment),
  )[0]
  const summary =
    `${title}: ${d.rows.length} shipments, ${count('on_time')} on time, ${count('at_risk')} at risk, ` +
    `${count('delayed')} delayed, ${count('held')} held, ${count('delivered')} delivered.` +
    (worst
      ? ` Largest slip: ${worst.shipment} on ${worst.lane}, ${slipDays(Date.parse(worst.etaPlanned), Date.parse(worst.etaCurrent))} days late.`
      : ' No shipment is late.') +
    (note ? ` ${note}` : '')
  return { svg: g.svg, summary, table: g.table }
}

export const logisticsShipmentTrackerKind: FigureKind<ShipmentTrackerData> = {
  kind: 'logistics_shipment_tracker',
  schema: ShipmentTrackerData,
  render: renderShipments,
}

// ---- days of supply ----------------------------------------------------------------------

export const DaysOfSupplyData = z.object({
  title: z.string().max(200).optional(),
  asOf: isoDate,
  rows: z
    .array(
      z.object({
        item: z.string().min(1).max(60),
        site: z.string().min(1).max(60),
        unit: z.string().max(20).default('units'),
        onHand: z.number().min(0),
        inbound: z.number().min(0).default(0),
        dailyDemand: z.number().min(0),
        reorderPointDays: z.number().min(0),
        /** Below this the item is critical; defaults to half the reorder point. */
        floorDays: z.number().min(0).optional(),
      }),
    )
    .min(1)
    .max(200),
  simulated: z.boolean().default(true),
})
export type DaysOfSupplyData = z.infer<typeof DaysOfSupplyData>

const STATE_WORD: Record<SupplyState, string> = {
  ok: 'OK',
  low: 'LOW',
  critical: 'CRITICAL',
  out: 'OUT',
}

/** One row's computed values: shared by the figure and the data builders. */
export function supplyRow(
  r: DaysOfSupplyData['rows'][number],
  asOfMs: number,
): { days: number | null; stockOut: string | null; state: SupplyState } {
  const days = daysOfSupply(r.onHand, r.inbound, r.dailyDemand)
  return {
    days,
    stockOut: stockOutDate(asOfMs, days),
    state: supplyState(days, r.reorderPointDays, r.floorDays ?? r.reorderPointDays / 2),
  }
}

const oneDecimal = (v: number): string => (Math.round(v * 10) / 10).toFixed(1)

function renderSupply(d: DaysOfSupplyData, o: FigureOptions): FigureResult {
  const title = d.title ?? 'Inventory and days of supply'
  const asOfMs = Date.parse(d.asOf)
  const calc = d.rows.map((r) => ({ r, c: supplyRow(r, asOfMs) }))
  const order: Record<SupplyState, number> = { out: 0, critical: 1, low: 2, ok: 3 }
  calc.sort(
    (a, b) =>
      order[a.c.state] - order[b.c.state] ||
      (a.c.days ?? Infinity) - (b.c.days ?? Infinity) ||
      a.r.item.localeCompare(b.r.item) ||
      a.r.site.localeCompare(b.r.site),
  )
  const columns = [
    'Item',
    'Site',
    'On hand',
    'Inbound',
    'Daily demand',
    'Days of supply',
    'Reorder point (days)',
    'Stock-out date',
    'State',
  ]
  const rows = calc.map(({ r, c }) => [
    r.item,
    r.site,
    `${r.onHand} ${r.unit}`,
    String(r.inbound),
    String(r.dailyDemand),
    c.days === null ? 'no demand' : oneDecimal(c.days),
    String(r.reorderPointDays),
    c.stockOut ?? 'none',
    STATE_WORD[c.state],
  ])
  const note = d.simulated ? 'Simulated inventory. All companies are fictional.' : undefined
  const g = drawn(
    title,
    [`As of ${stamp(d.asOf)} UTC.`, note ?? ''].filter(Boolean).join(' '),
    columns,
    rows,
    o,
    [0, 1, 2, 5, 7, 8],
  )
  const tally = (s: SupplyState): number => calc.filter((x) => x.c.state === s).length
  const first = calc[0]
  const summary =
    `${title}: ${calc.length} item and site rows, ${tally('out')} out, ${tally('critical')} critical, ` +
    `${tally('low')} low, ${tally('ok')} ok.` +
    (first && first.c.state !== 'ok'
      ? ` Lowest: ${first.r.item} at ${first.r.site}, ${first.c.days === null ? 'no demand' : `${oneDecimal(first.c.days)} days`} of supply` +
        (first.c.stockOut ? `, projected stock-out ${first.c.stockOut}.` : '.')
      : ' Every row is above its reorder point.') +
    (note ? ` ${note}` : '')
  return { svg: g.svg, summary, table: g.table }
}

export const logisticsDaysOfSupplyKind: FigureKind<DaysOfSupplyData> = {
  kind: 'logistics_days_of_supply',
  schema: DaysOfSupplyData,
  render: renderSupply,
}

// ---- congestion board --------------------------------------------------------------------

export const CongestionBoardData = z.object({
  title: z.string().max(200).optional(),
  asOf: isoDate.optional(),
  rows: z
    .array(
      z.object({
        location: z.string().min(1).max(80),
        kind: z.enum(['port', 'rail_ramp', 'border_crossing', 'canal', 'highway']),
        /** Vessels, trains or trucks waiting. */
        waiting: z.number().int().min(0),
        dwellDays: z.number().min(0),
        trend: z.enum(['rising', 'steady', 'falling']),
        state: z.enum(['normal', 'congested', 'closed']),
        note: z.string().max(160).default(''),
      }),
    )
    .min(1)
    .max(60),
  simulated: z.boolean().default(true),
})
export type CongestionBoardData = z.infer<typeof CongestionBoardData>

const KIND_WORD = {
  port: 'Port',
  rail_ramp: 'Rail ramp',
  border_crossing: 'Border crossing',
  canal: 'Canal',
  highway: 'Highway',
}
const CONG_WORD = { normal: 'NORMAL', congested: 'CONGESTED', closed: 'CLOSED' }

function renderCongestion(d: CongestionBoardData, o: FigureOptions): FigureResult {
  const title = d.title ?? 'Lane and port congestion'
  const columns = ['Location', 'Kind', 'Waiting', 'Dwell (days)', 'Trend', 'State', 'Note']
  const rows = d.rows.map((r) => [
    r.location,
    KIND_WORD[r.kind],
    String(r.waiting),
    oneDecimal(r.dwellDays),
    r.trend,
    CONG_WORD[r.state],
    r.note,
  ])
  const note = d.simulated ? 'Simulated conditions. Not a record of a real event.' : undefined
  const g = drawn(
    title,
    [d.asOf ? `As of ${stamp(d.asOf)} UTC.` : '', note ?? ''].filter(Boolean).join(' ') ||
      undefined,
    columns,
    rows,
    o,
  )
  const closed = d.rows.filter((r) => r.state === 'closed')
  const cong = d.rows.filter((r) => r.state === 'congested')
  const worst = [...d.rows].sort(
    (a, b) => b.dwellDays - a.dwellDays || a.location.localeCompare(b.location),
  )[0]!
  const summary =
    `${title}: ${d.rows.length} locations, ${closed.length} closed, ${cong.length} congested. ` +
    `Longest dwell: ${worst.location}, ${oneDecimal(worst.dwellDays)} days with ${worst.waiting} waiting.` +
    (note ? ` ${note}` : '')
  return { svg: g.svg, summary, table: g.table }
}

export const logisticsCongestionBoardKind: FigureKind<CongestionBoardData> = {
  kind: 'logistics_congestion_board',
  schema: CongestionBoardData,
  render: renderCongestion,
}

// ---- traceability lookup -----------------------------------------------------------------

export const TraceTableData = z.object({
  title: z.string().max(200).optional(),
  lot: z.string().min(1).max(40),
  rows: z
    .array(
      z.object({
        shipTo: z.string().min(1).max(80),
        location: z.string().max(120).default(''),
        quantity: z.number().min(0),
        unit: z.string().max(20).default('cases'),
        shipDate: isoDate,
        product: z.string().max(80).default(''),
        /** The reference document (bill of lading or invoice number); blank is a gap. */
        reference: z.string().max(40).default(''),
        onHand: z.number().min(0).optional(),
        /** What is wrong with the record, from the lookup. */
        gap: z.string().max(120).default(''),
      }),
    )
    .min(1)
    .max(500),
  simulated: z.boolean().default(true),
})
export type TraceTableData = z.infer<typeof TraceTableData>

function renderTrace(d: TraceTableData, o: FigureOptions): FigureResult {
  const title = d.title ?? `Traceability lookup: lot ${d.lot}`
  const columns = [
    'Ship-to',
    'Location',
    'Product',
    'Quantity',
    'Unit',
    'Ship date',
    'Reference document',
    'On hand',
    'Record check',
  ]
  const rows = d.rows.map((r) => [
    r.shipTo,
    r.location,
    r.product,
    String(r.quantity),
    r.unit,
    day(r.shipDate),
    r.reference || 'MISSING',
    r.onHand === undefined ? '' : String(r.onHand),
    r.gap || (r.reference ? 'complete' : 'missing reference document'),
  ])
  const note = d.simulated ? 'Simulated records. All companies are fictional.' : undefined
  const g = drawn(title, note, columns, rows, o, [0, 3, 6, 7, 8])
  const total = d.rows.reduce((s, r) => s + r.quantity, 0)
  const gaps = rows.filter((r) => r[8] !== 'complete').length
  const accounts = new Set(d.rows.map((r) => r.shipTo)).size
  const summary =
    `${title}: ${d.rows.length} shipments to ${accounts} accounts, ${total} in all. ` +
    `${gaps} records have a gap${gaps ? ' and need follow-up' : ''}.` +
    (note ? ` ${note}` : '')
  return { svg: g.svg, summary, table: g.table }
}

export const logisticsTraceTableKind: FigureKind<TraceTableData> = {
  kind: 'logistics_trace_table',
  schema: TraceTableData,
  render: renderTrace,
}
