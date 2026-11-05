// wildfire_evacuation_board (spec 0461 FR-7): one row per zone with its status word and symbol,
// when it was ordered, how many people live there and which special populations, the clearance
// time the zone needs, the time the fire is projected to arrive and the margin between the order
// and the latest time to give it (arrival less clearance). The margin is arithmetic on the times
// shown; for a simulated fire the arrival is the scenario's, not a prediction.
import { z } from 'zod'
import type { FigureKind } from '../types'
import { renderBoard, type BoardRow } from './board'
import { BASIS_TEXT, BasisT, IsoTime, TimeZoneT, ZONE_LOOK, ZoneStatusT, clockIn } from './common'

export const EvacuationBoardData = z.object({
  title: z.string().max(200).optional(),
  asOf: IsoTime.optional(),
  timeZone: TimeZoneT.default('UTC'),
  basis: BasisT,
  rows: z
    .array(
      z.object({
        zone: z.string().min(1).max(40),
        area: z.string().max(100).optional(),
        status: ZoneStatusT,
        orderedAt: IsoTime.optional(),
        people: z.number().int().min(0).max(1_000_000).optional(),
        special: z.string().max(160).optional(),
        clearanceMin: z.number().min(0).max(1440).optional(),
        arrivalAt: IsoTime.optional(),
      }),
    )
    .min(1)
    .max(40),
})
export type EvacuationBoardData = z.infer<typeof EvacuationBoardData>

const MIN = 60_000

/** Margin in minutes (positive is early) and the latest time to order, or null when unknown. */
export function orderMargin(r: EvacuationBoardData['rows'][number]) {
  if (!r.arrivalAt || r.clearanceMin === undefined) return null
  const latest = Date.parse(r.arrivalAt) - r.clearanceMin * MIN
  const margin = r.orderedAt ? Math.round((latest - Date.parse(r.orderedAt)) / MIN) : null
  return { latest, margin }
}

function marginText(r: EvacuationBoardData['rows'][number], tz: string): string {
  const m = orderMargin(r)
  if (!m) return r.arrivalAt ? 'Clearance time not given' : 'No arrival projected'
  if (m.margin === null)
    return `No order yet; latest ${clockIn(new Date(m.latest).toISOString(), tz)}`
  return m.margin >= 0
    ? `Ordered ${m.margin} min before the latest time`
    : `Ordered ${-m.margin} min after the latest time`
}

function render(d: EvacuationBoardData, o: { width: number; height: number }) {
  const tz = d.timeZone
  const at = (t: string | undefined): string => (t ? clockIn(t, tz) : 'None')
  const rows: BoardRow[] = d.rows.map((r) => ({
    cells: [
      { text: r.area ? `${r.zone} ${r.area}` : r.zone, bold: true },
      { text: r.status, look: ZONE_LOOK[r.status] },
      { text: at(r.orderedAt) },
      {
        text: `${r.people !== undefined ? r.people.toLocaleString('en-US') : 'Unknown'}${r.special ? `; ${r.special}` : ''}`,
      },
      { text: r.clearanceMin !== undefined ? `${r.clearanceMin} min` : 'Not given' },
      { text: at(r.arrivalAt) },
      { text: marginText(r, tz), bold: true },
    ],
  }))
  const count = (s: string) => d.rows.filter((r) => r.status === s).length
  const late = d.rows.filter((r) => (orderMargin(r)?.margin ?? 0) < 0).length
  const summary =
    `${d.title ?? 'Evacuation status'}${d.asOf ? ` as of ${clockIn(d.asOf, tz)}` : ''}: ${d.rows.length} zones, ` +
    `${count('Evacuation order')} evacuation order, ${count('Evacuation warning')} evacuation warning, ` +
    `${count('Shelter in place')} shelter in place, ${count('No status')} no status.` +
    ` ${late} zone${late === 1 ? '' : 's'} ordered after the latest time. ` +
    d.rows
      .map(
        (r) =>
          `${r.zone}: ${r.status}${r.orderedAt ? `, ordered ${clockIn(r.orderedAt, tz)}` : ''}; ${marginText(r, tz)}`,
      )
      .join('; ') +
    `. ${BASIS_TEXT[d.basis]}`
  return renderBoard({
    title: d.title,
    width: o.width,
    columns: [
      { title: 'Zone', share: 0.14 },
      { title: 'Status', share: 0.17 },
      { title: 'Ordered', share: 0.11 },
      { title: 'People and special populations', share: 0.2 },
      { title: 'Clearance', share: 0.09 },
      { title: 'Fire arrives', share: 0.11 },
      { title: 'Order margin', share: 0.18 },
    ],
    statusColumn: 1,
    rows,
    ...(d.asOf ? { asOf: clockIn(d.asOf, tz) } : {}),
    summary,
    idKey: JSON.stringify(d),
    footnote: BASIS_TEXT[d.basis],
  })
}

export const evacuationBoardKind: FigureKind<EvacuationBoardData> = {
  kind: 'wildfire_evacuation_board',
  schema: EvacuationBoardData,
  render,
}
