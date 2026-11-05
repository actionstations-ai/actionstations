// decision_timeline: the hurricane evacuation decision timeline (spec 0449 FR-11). For each zone
// a bar shows the clearance time ending at the arrival of tropical-storm-force winds, so the
// start of the bar is the latest moment an evacuation order can come; a mark shows when the
// order was given. Zone clearance times come from the community's hurricane evacuation study and
// are entered with the figure's data. The same arithmetic as the threshold timing metric: the
// margin is the deadline minus the order time, and zero or more is on time.
import { z } from 'zod'
import { INK, MUTED, GRID } from '../theme'
import { frame, n, text } from '../svg'
import type { FigureKind, FigureResult } from '../types'
import { utcLabel } from './radar'

export const DecisionTimelineData = z.object({
  title: z.string().max(200).optional(),
  origin: z.enum(['historical', 'simulated']),
  storm: z.string().min(2).max(60),
  /** What arrives, for the wording ("tropical-storm-force winds"). */
  hazard: z.string().min(2).max(60).default('tropical-storm-force winds'),
  zones: z
    .array(
      z.object({
        name: z.string().min(1).max(60),
        /** When the hazard arrives in the zone; null when it never does. */
        arrival: z.iso.datetime({ offset: true }).nullable(),
        /** Minutes the zone needs to clear (from the evacuation study). */
        clearanceMin: z
          .number()
          .min(0)
          .max(14 * 24 * 60),
        /** When the evacuation order was given, if it was. */
        orderedAt: z.iso.datetime({ offset: true }).optional(),
      }),
    )
    .min(1)
    .max(14),
})
export type DecisionTimelineData = z.infer<typeof DecisionTimelineData>

type Status = 'on time' | 'late' | 'no order' | 'no arrival'

interface Row {
  name: string
  arrival: number | null
  deadline: number | null
  ordered: number | null
  clearanceMin: number
  margin: number | null
  status: Status
}

const dur = (min: number): string => {
  const a = Math.abs(Math.round(min))
  const h = Math.floor(a / 60)
  const m = a % 60
  return h && m ? `${h} h ${m} min` : h ? `${h} h` : `${m} min`
}

function rows(d: DecisionTimelineData): Row[] {
  return d.zones.map((z) => {
    const arrival = z.arrival ? Date.parse(z.arrival) : null
    const deadline = arrival === null ? null : arrival - z.clearanceMin * 60_000
    const ordered = z.orderedAt ? Date.parse(z.orderedAt) : null
    const margin = deadline !== null && ordered !== null ? (deadline - ordered) / 60_000 : null
    const status: Status =
      arrival === null
        ? 'no arrival'
        : ordered === null
          ? 'no order'
          : margin! >= 0
            ? 'on time'
            : 'late'
    return {
      name: z.name,
      arrival,
      deadline,
      ordered,
      clearanceMin: z.clearanceMin,
      margin,
      status,
    }
  })
}

function render(d: DecisionTimelineData, o: { width: number; height: number }): FigureResult {
  const rs = rows(d)
  const times = rs
    .flatMap((r) => [r.arrival, r.deadline, r.ordered])
    .filter((t): t is number => t !== null)
  const t0 = Math.min(...times) - 3_600_000
  const t1 = Math.max(...times) + 3_600_000
  const left = 150
  const right = 190
  const top = d.title ? 40 : 18
  const rowH = Math.min(46, (o.height - top - 70) / rs.length)
  const plotW = o.width - left - right
  const x = (t: number): number => left + ((t - t0) / (t1 - t0 || 1)) * plotW
  let body = d.title ? text(16, 22, d.title, { size: 15, weight: 700 }) : ''
  // axis ticks every few hours
  const span = (t1 - t0) / 3_600_000
  const stepH = span > 72 ? 12 : span > 36 ? 6 : span > 16 ? 3 : 1
  for (
    let t = Math.ceil(t0 / (stepH * 3_600_000)) * stepH * 3_600_000;
    t <= t1;
    t += stepH * 3_600_000
  ) {
    const dt = new Date(t)
    body += `<path d="M${n(x(t))} ${top - 4}V${n(top + rs.length * rowH)}" stroke="${GRID}" stroke-width="0.8"/>${text(x(t), top + rs.length * rowH + 14, `${String(dt.getUTCHours()).padStart(2, '0')}Z ${dt.getUTCDate()}`, { size: 10, anchor: 'middle', fill: MUTED })}`
  }
  rs.forEach((r, i) => {
    const y = top + i * rowH + rowH / 2
    body += text(left - 10, y + 4, r.name, { size: 12, weight: 600, anchor: 'end' })
    if (r.arrival !== null && r.deadline !== null) {
      body += `<rect x="${n(x(r.deadline))}" y="${n(y - 9)}" width="${n(Math.max(2, x(r.arrival) - x(r.deadline)))}" height="18" fill="#cfe0f7" stroke="#1f5fbf" stroke-width="1.2"/>`
      body += `<path d="M${n(x(r.arrival))} ${n(y - 13)}l7 13l-7 13l-7 -13Z" fill="${INK}"/>`
    }
    if (r.ordered !== null) {
      const ok = r.status === 'on time'
      body += ok
        ? `<circle cx="${n(x(r.ordered))}" cy="${n(y)}" r="6" fill="#1b7a3a" stroke="#fff" stroke-width="1.5"/>`
        : `<path d="M${n(x(r.ordered) - 6)} ${n(y - 6)}l12 12m0 -12l-12 12" stroke="#b3121b" stroke-width="3"/>`
    }
    const label =
      r.status === 'no arrival'
        ? 'Winds never arrive'
        : r.status === 'no order'
          ? 'No order given'
          : `${r.status === 'on time' ? 'On time' : 'Late'}, ${dur(r.margin!)} ${r.margin! >= 0 ? 'ahead' : 'behind'}`
    body += text(o.width - right + 12, y + 4, label, {
      size: 12,
      weight: 700,
      fill:
        r.status === 'on time'
          ? '#1b7a3a'
          : r.status === 'late' || r.status === 'no order'
            ? '#b3121b'
            : MUTED,
    })
  })
  const ly = top + rs.length * rowH + 36
  body += `<rect x="${left}" y="${ly - 9}" width="26" height="14" fill="#cfe0f7" stroke="#1f5fbf"/>${text(left + 32, ly + 2, 'Clearance time', { size: 11, fill: MUTED })}`
  body += `<path d="M${left + 150} ${ly - 8}l6 9l-6 9l-6 -9Z" fill="${INK}"/>${text(left + 162, ly + 2, `${d.hazard} arrive`, { size: 11, fill: MUTED })}`
  body += `<circle cx="${left + 400}" cy="${ly - 2}" r="5" fill="#1b7a3a"/>${text(left + 410, ly + 2, 'Order on time', { size: 11, fill: MUTED })}`
  body += `<path d="M${left + 520} ${ly - 8}l10 10m0 -10l-10 10" stroke="#b3121b" stroke-width="3"/>${text(left + 536, ly + 2, 'Order late', { size: 11, fill: MUTED })}`
  const originWord = d.origin === 'historical' ? 'Historical data' : 'Simulated data'
  body += text(
    left,
    ly + 24,
    `${d.storm} · ${originWord} · exercise figure · bar start is the latest time to order`,
    { size: 11, fill: MUTED },
  )

  const sentences = rs.map((r) => {
    if (r.arrival === null) return `${r.name}: ${d.hazard} never arrive.`
    const need = `${d.hazard} arrive ${utcLabel(new Date(r.arrival).toISOString())} and the zone needs ${dur(r.clearanceMin)} to clear, so the order was needed by ${utcLabel(new Date(r.deadline!).toISOString())}`
    if (r.ordered === null) return `${r.name}: ${need}; no order was given.`
    return `${r.name}: ${need}; the order came ${utcLabel(new Date(r.ordered).toISOString())}, ${dur(r.margin!)} ${r.margin! >= 0 ? 'ahead of the deadline (on time)' : 'after the deadline (late)'}.`
  })
  const summary = `Evacuation decision timeline for ${d.storm}, ${originWord.toLowerCase()}. ${sentences.join(' ')}`
  const stamp = (t: number | null): string =>
    t === null ? 'none' : utcLabel(new Date(t).toISOString())
  return {
    svg: frame({
      width: o.width,
      height: o.height,
      title: `Evacuation decision timeline, ${d.storm}`,
      summary,
      body,
      idKey: `dtl${d.storm}${d.zones.map((z) => z.name).join('')}`,
    }),
    summary,
    table: {
      caption: `${d.storm}: evacuation orders against the arrival of ${d.hazard}`,
      columns: [
        'Zone',
        'Arrival',
        'Clearance time',
        'Order needed by',
        'Order given',
        'Margin',
        'Status',
      ],
      rows: rs.map((r) => [
        r.name,
        stamp(r.arrival),
        dur(r.clearanceMin),
        stamp(r.deadline),
        stamp(r.ordered),
        r.margin === null ? 'n/a' : `${r.margin >= 0 ? '+' : '-'}${dur(r.margin)}`,
        r.status,
      ]),
    },
  }
}

export const decisionTimelineKind: FigureKind<DecisionTimelineData> = {
  kind: 'decision_timeline',
  schema: DecisionTimelineData,
  render,
  defaultHeight: 420,
}
