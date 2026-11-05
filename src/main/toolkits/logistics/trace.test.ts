// Trace lookup on a worked example with a known ship-to list (#804), and the CSV and XLSX export.
import ExcelJS from 'exceljs'
import { describe, expect, it } from 'vitest'
import { traceLot, traceToCsv, traceToXlsx, TRACE_COLUMNS, type TraceRecord } from './trace'

const ship = (
  lot: string,
  from: string,
  to: string,
  qty: number,
  date: string,
  ref: string,
): TraceRecord => ({
  cte: 'shipping',
  lot,
  product: 'Spring mix',
  quantity: qty,
  unit: 'cases',
  shipFrom: from,
  shipTo: to,
  shipDate: date,
  reference: ref,
})

const RECORDS: TraceRecord[] = [
  {
    cte: 'transformation',
    lot: 'P-1',
    inputLots: ['F-9'],
    product: 'Spring mix',
    quantity: 100,
    unit: 'cases',
    location: 'Plant',
    date: '2026-11-01T00:00:00Z',
    reference: 'WO-1',
  },
  ship('P-1', 'Plant', 'DC A', 60, '2026-11-02T00:00:00Z', 'BOL-1'),
  ship('P-1', 'Plant', 'DC B', 40, '2026-11-02T00:00:00Z', 'BOL-2'),
  ship('P-1', 'DC A', 'Store 1', 20, '2026-11-03T00:00:00Z', 'INV-1'),
  ship('P-1', 'DC A', 'Store 2', 15, '2026-11-03T00:00:00Z', ''),
  ship('P-1', 'DC B', 'Store 3', 10, '2026-11-03T00:00:00Z', 'INV-3'),
  ship('RP-7', 'DC B', 'Store 4', 5, '2026-11-04T00:00:00Z', 'INV-4'),
  ship('Q-2', 'Plant', 'DC C', 99, '2026-11-02T00:00:00Z', 'BOL-9'),
]

describe('traceLot on a worked example', () => {
  const t = traceLot(RECORDS, 'P-1')

  it('lists every ship-to of the lot', () => {
    expect(t.rows.map((r) => r.shipTo).sort()).toEqual(
      ['DC A', 'DC B', 'Store 1', 'Store 2', 'Store 3'].sort(),
    )
    expect(t.accounts).toBe(5)
  })

  it('computes the quantity still held at distribution centers', () => {
    expect(t.rows.find((r) => r.shipTo === 'DC A')?.onHand).toBe(25)
    expect(t.rows.find((r) => r.shipTo === 'DC B')?.onHand).toBe(30)
    expect(t.rows.find((r) => r.shipTo === 'Store 1')?.onHand).toBeUndefined()
  })

  it('flags the missing reference document and the unlinked repack', () => {
    expect(t.rows.filter((r) => r.gap).map((r) => r.shipTo)).toEqual(['Store 2'])
    expect(t.suspects.map((r) => r.shipTo)).toEqual(['Store 4'])
    expect(t.gaps).toBe(2)
  })

  it('does not include a different lot', () => {
    expect(t.rows.some((r) => r.shipTo === 'DC C')).toBe(false)
  })

  it('reaches the same ship-tos from the input lot through the transformation', () => {
    expect(traceLot(RECORDS, 'F-9').rows.length).toBe(t.rows.length)
  })
})

describe('export', () => {
  const t = traceLot(RECORDS, 'P-1')

  it('writes CSV with the FSMA shipping data elements as columns', () => {
    const csv = traceToCsv(t)
    const lines = csv.trim().split('\r\n')
    expect(lines[0]).toBe(TRACE_COLUMNS.join(','))
    expect(lines).toHaveLength(1 + t.rows.length + t.suspects.length)
    expect(csv).toContain('missing reference document')
  })

  it('quotes cells that contain commas', () => {
    const odd = traceLot(
      [ship('P-1', 'Plant', 'Store, North "A"', 5, '2026-11-02T00:00:00Z', 'B-1')],
      'P-1',
    )
    expect(traceToCsv(odd)).toContain('"Store, North ""A"""')
  })

  it('writes an XLSX sheet that reads back with the same rows', async () => {
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load((await traceToXlsx(t)) as never)
    const ws = wb.getWorksheet('Trace')!
    expect(ws.rowCount).toBe(1 + t.rows.length + t.suspects.length)
    expect(ws.getRow(1).getCell(1).value).toBe(TRACE_COLUMNS[0])
    expect(ws.getRow(2).getCell(6).value).toBe('DC A')
  })
})
