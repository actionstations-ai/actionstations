// Traceability lookup and export (spec 0462 FR-6). From a scenario's records of shipping,
// receiving and transformation events it follows a lot forward to every ship-to and returns the
// rows with the data elements the FSMA 204 rule names for shipping (traceability lot code,
// quantity and unit, product description, location description, ship date, reference document),
// the quantity still on hand at each distribution point, and the gaps a records request would
// expose: a missing reference document, or a lot that left a holder under a different code with
// no transformation record linking it. The same rows export as CSV and XLSX.
import ExcelJS from 'exceljs'

export interface ShippingRecord {
  cte: 'shipping'
  lot: string
  product: string
  quantity: number
  unit: string
  shipFrom: string
  shipTo: string
  /** ISO date or time. */
  shipDate: string
  reference: string
}
export interface ReceivingRecord {
  cte: 'receiving'
  lot: string
  product: string
  quantity: number
  unit: string
  location: string
  receiveDate: string
  reference: string
}
export interface TransformationRecord {
  cte: 'transformation'
  lot: string
  inputLots: string[]
  product: string
  quantity: number
  unit: string
  location: string
  date: string
  reference: string
}
export type TraceRecord = ShippingRecord | ReceivingRecord | TransformationRecord

export interface TraceRow {
  lot: string
  product: string
  quantity: number
  unit: string
  shipFrom: string
  shipTo: string
  shipDate: string
  reference: string
  /** Quantity still held at the ship-to, when the ship-to ships onward and so can be known. */
  onHand?: number
  /** What is wrong with the record; blank when it is complete. */
  gap: string
}

export interface TraceResult {
  lot: string
  /** The lot and every lot made from it through a recorded transformation. */
  lots: string[]
  rows: TraceRow[]
  /** Shipments that probably carry the product under another lot code but are not linked by a record. */
  suspects: TraceRow[]
  accounts: number
  gaps: number
}

const rowOf = (r: ShippingRecord, gap: string): TraceRow => ({
  lot: r.lot,
  product: r.product,
  quantity: r.quantity,
  unit: r.unit,
  shipFrom: r.shipFrom,
  shipTo: r.shipTo,
  shipDate: r.shipDate,
  reference: r.reference,
  gap,
})

/** The lot and every lot made from it through recorded transformations. */
export function descendantLots(records: readonly TraceRecord[], lot: string): string[] {
  const out = new Set([lot])
  let grew = true
  while (grew) {
    grew = false
    for (const r of records)
      if (r.cte === 'transformation' && !out.has(r.lot) && r.inputLots.some((l) => out.has(l))) {
        out.add(r.lot)
        grew = true
      }
  }
  return [...out]
}

/** Quantity received minus shipped onward at a holder, for the lots in `lots`; never negative. */
function onHandAt(
  records: readonly TraceRecord[],
  holder: string,
  lots: ReadonlySet<string>,
): number {
  let received = 0
  let sent = 0
  for (const r of records) {
    if (r.cte === 'shipping' && lots.has(r.lot)) {
      if (r.shipTo === holder) received += r.quantity
      if (r.shipFrom === holder) sent += r.quantity
    }
  }
  return Math.max(0, received - sent)
}

function gapOf(r: ShippingRecord): string {
  return r.reference.trim() ? '' : 'missing reference document'
}

/** Shipments from a holder of the lot, of the same product, under a lot code the trace did not reach. */
function findSuspects(
  records: readonly TraceRecord[],
  lots: ReadonlySet<string>,
  rows: readonly TraceRow[],
): TraceRow[] {
  const holders = new Map<string, { product: string; since: number }>()
  for (const r of rows) {
    const t = Date.parse(r.shipDate)
    const h = holders.get(r.shipTo)
    if (!h || t < h.since) holders.set(r.shipTo, { product: r.product, since: t })
  }
  return records
    .filter((r): r is ShippingRecord => r.cte === 'shipping' && !lots.has(r.lot))
    .filter((r) => {
      const h = holders.get(r.shipFrom)
      return h !== undefined && r.product === h.product && Date.parse(r.shipDate) >= h.since
    })
    .map((r) =>
      rowOf(
        r,
        `lot code ${r.lot} is not linked to the traced lot by a transformation record; possible repack`,
      ),
    )
}

export function traceLot(records: readonly TraceRecord[], lot: string): TraceResult {
  const lots = new Set(descendantLots(records, lot))
  const rows = records
    .filter((r): r is ShippingRecord => r.cte === 'shipping' && lots.has(r.lot))
    .map((r) => rowOf(r, gapOf(r)))
    .sort((a, b) => a.shipDate.localeCompare(b.shipDate) || a.shipTo.localeCompare(b.shipTo))
  const shipsOnward = new Set(
    records.filter((r): r is ShippingRecord => r.cte === 'shipping').map((r) => r.shipFrom),
  )
  for (const row of rows)
    if (shipsOnward.has(row.shipTo)) row.onHand = onHandAt(records, row.shipTo, lots)
  const suspects = findSuspects(records, lots, rows)
  return {
    lot,
    lots: [...lots].sort(),
    rows,
    suspects,
    accounts: new Set(rows.map((r) => r.shipTo)).size,
    gaps: rows.filter((r) => r.gap).length + suspects.length,
  }
}

// ---- export -------------------------------------------------------------------------------

export const TRACE_COLUMNS = [
  'Traceability lot code',
  'Product description',
  'Quantity',
  'Unit of measure',
  'Ship-from location',
  'Ship-to location',
  'Ship date',
  'Reference document',
  'On hand at ship-to',
  'Record check',
] as const

const cells = (r: TraceRow): (string | number)[] => [
  r.lot,
  r.product,
  r.quantity,
  r.unit,
  r.shipFrom,
  r.shipTo,
  r.shipDate.slice(0, 10),
  r.reference,
  r.onHand ?? '',
  r.gap || 'complete',
]

const csvCell = (v: string | number): string => {
  const s = String(v)
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** The result as CSV: one header row, then confirmed rows, then suspect rows. */
export function traceToCsv(t: TraceResult): string {
  const lines = [[...TRACE_COLUMNS], ...[...t.rows, ...t.suspects].map(cells)]
  return lines.map((l) => l.map(csvCell).join(',')).join('\r\n') + '\r\n'
}

/** The result as an XLSX workbook (a sortable table on one sheet). */
export async function traceToXlsx(t: TraceResult): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Trace')
  ws.addRow([...TRACE_COLUMNS])
  for (const r of [...t.rows, ...t.suspects]) ws.addRow(cells(r))
  ws.getRow(1).font = { bold: true }
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: TRACE_COLUMNS.length } }
  ws.views = [{ state: 'frozen', ySplit: 1 }]
  ws.columns.forEach((c) => (c.width = 22))
  return Buffer.from(await wb.xlsx.writeBuffer())
}
