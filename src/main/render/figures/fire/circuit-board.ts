// wildfire_psps_board (spec 0461 FR-7): the power shutoff circuit and customer board. One row per
// circuit with customers, medical baseline customers, critical facilities, the status word and
// symbol and the time customers were notified, with totals in the summary. All data is fictional
// in examples; the board draws what the case data gives it.
import { z } from 'zod'
import type { FigureKind } from '../types'
import { renderBoard, type BoardRow } from './board'
import { IsoTime, SHUTOFF_LOOK, ShutoffStatusT, TimeZoneT, clockIn } from './common'

export const CircuitBoardData = z.object({
  title: z.string().max(200).optional(),
  asOf: IsoTime.optional(),
  timeZone: TimeZoneT.default('UTC'),
  rows: z
    .array(
      z.object({
        circuit: z.string().min(1).max(40),
        area: z.string().max(100).optional(),
        customers: z.number().int().min(0).max(1_000_000),
        medicalBaseline: z.number().int().min(0).max(100_000),
        critical: z.array(z.string().min(1).max(100)).max(10).default([]),
        status: ShutoffStatusT,
        notifiedAt: IsoTime.optional(),
      }),
    )
    .min(1)
    .max(40),
})
export type CircuitBoardData = z.infer<typeof CircuitBoardData>

const sum = (xs: number[]): number => xs.reduce((a, b) => a + b, 0)

function render(d: CircuitBoardData, o: { width: number; height: number }) {
  const tz = d.timeZone
  const rows: BoardRow[] = d.rows.map((r) => ({
    cells: [
      { text: r.area ? `${r.circuit} ${r.area}` : r.circuit, bold: true },
      { text: r.customers.toLocaleString('en-US') },
      { text: r.medicalBaseline.toLocaleString('en-US') },
      { text: r.critical.length ? r.critical.join('; ') : 'None listed' },
      { text: r.status, look: SHUTOFF_LOOK[r.status] },
      { text: r.notifiedAt ? clockIn(r.notifiedAt, tz) : 'Not yet' },
    ],
  }))
  const off = d.rows.filter((r) => r.status === 'De-energized' || r.status === 'Patrolling')
  const summary =
    `${d.title ?? 'Power shutoff circuit board'}${d.asOf ? ` as of ${clockIn(d.asOf, tz)}` : ''}: ${d.rows.length} circuits, ` +
    `${sum(d.rows.map((r) => r.customers)).toLocaleString('en-US')} customers, ` +
    `${sum(d.rows.map((r) => r.medicalBaseline)).toLocaleString('en-US')} medical baseline customers. ` +
    `${off.length} circuit${off.length === 1 ? '' : 's'} without power now (${sum(off.map((r) => r.customers)).toLocaleString('en-US')} customers). ` +
    d.rows
      .map(
        (r) =>
          `${r.circuit}: ${r.status}, ${r.customers.toLocaleString('en-US')} customers${r.notifiedAt ? `, notified ${clockIn(r.notifiedAt, tz)}` : ', not yet notified'}`,
      )
      .join('; ') +
    '. Simulated exercise data: fictional circuits and customers, not a utility record.'
  return renderBoard({
    title: d.title,
    width: o.width,
    columns: [
      { title: 'Circuit', share: 0.2 },
      { title: 'Customers', share: 0.11 },
      { title: 'Medical baseline', share: 0.13 },
      { title: 'Critical facilities', share: 0.22 },
      { title: 'Status', share: 0.19 },
      { title: 'Notified', share: 0.15 },
    ],
    statusColumn: 4,
    rows,
    ...(d.asOf ? { asOf: clockIn(d.asOf, tz) } : {}),
    summary,
    idKey: JSON.stringify(d),
  })
}

export const circuitBoardKind: FigureKind<CircuitBoardData> = {
  kind: 'wildfire_psps_board',
  schema: CircuitBoardData,
  render,
}
