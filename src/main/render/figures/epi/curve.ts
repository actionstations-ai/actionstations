// epi_curve: an epidemic curve, cases by onset time (spec 0457 FR-5). Bars are stacked by case
// status (confirmed solid, probable hatched, suspect dotted, so status never rests on color),
// with numbered markers for exposure and intervention times and an optional smoothed overlay
// (centered three-bin moving average of the totals). Cases are counted by onset only: the
// schema has no report-date input, so a curve cannot be drawn by report date by mistake.
import { scaleBand, scaleLinear } from 'd3-scale'
import { z } from 'zod'
import { AXIS, GRID, INK, MUTED, seriesStyle } from '../theme'
import { fmt, frame, hashId, heading, legend, n, patternDef, text, wrap } from '../svg'
import type { FigureKind, FigureResult } from '../types'

const isoDate = z.string().refine((s) => !Number.isNaN(Date.parse(s)), 'not a date or time')
const Status = z.enum(['confirmed', 'probable', 'suspect'])
export type EpiStatus = z.infer<typeof Status>
const STATUSES: readonly EpiStatus[] = ['confirmed', 'probable', 'suspect']

const Count = z.number().int().min(0).max(100_000)

export const EpiCurveData = z
  .object({
    title: z.string().max(200).optional(),
    /** Start of the first bin. */
    start: isoDate,
    binHours: z.number().int().min(1).max(168).default(24),
    /** Number of bins; defaults to enough for the last case. */
    bins: z.number().int().min(1).max(400).optional(),
    cases: z
      .array(z.object({ onset: isoDate, status: Status.default('confirmed') }))
      .max(20_000)
      .optional(),
    /** Pre-counted bins, for replayed series where only totals exist. */
    counts: z
      .array(
        z.object({
          start: isoDate,
          confirmed: Count.default(0),
          probable: Count.default(0),
          suspect: Count.default(0),
        }),
      )
      .max(400)
      .optional(),
    markers: z
      .array(
        z.object({
          time: isoDate,
          label: z.string().min(1).max(160),
          kind: z.enum(['exposure', 'intervention', 'report']).default('intervention'),
        }),
      )
      .max(6)
      .default([]),
    smooth: z.boolean().default(false),
    /** Axis titles; the defaults suit cases of illness. Another unit (premises) names its own. */
    xLabel: z.string().min(1).max(80).optional(),
    yLabel: z.string().min(1).max(60).default('Number of cases'),
  })
  .refine((d) => (d.cases === undefined) !== (d.counts === undefined), {
    message: 'give either cases or counts, not both',
  })
export type EpiCurveData = z.infer<typeof EpiCurveData>

export interface CurveBin {
  startMs: number
  confirmed: number
  probable: number
  suspect: number
  total: number
}

const pad = (v: number): string => String(v).padStart(2, '0')

/** "Oct 17" for day bins, "Oct 17 18:00" for hour bins, in UTC. */
export function binLabel(ms: number, binHours: number): string {
  const d = new Date(ms)
  const mon = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][
    d.getUTCMonth()
  ]!
  const day = `${mon} ${d.getUTCDate()}`
  return binHours >= 24 ? day : `${day} ${pad(d.getUTCHours())}:00`
}

/** The curve's bins from cases (counted by onset) or from pre-counted rows. */
export function curveBins(d: EpiCurveData): CurveBin[] {
  const binMs = d.binHours * 3_600_000
  const t0 = Date.parse(d.start)
  const make = (i: number): CurveBin => ({
    startMs: t0 + i * binMs,
    confirmed: 0,
    probable: 0,
    suspect: 0,
    total: 0,
  })
  const idxOf = (ms: number): number => Math.floor((ms - t0) / binMs)
  let count = d.bins ?? 0
  if (d.cases) {
    if (!d.bins) count = Math.max(1, ...d.cases.map((c) => idxOf(Date.parse(c.onset)) + 1))
  } else if (d.counts) {
    if (!d.bins) count = Math.max(1, ...d.counts.map((c) => idxOf(Date.parse(c.start)) + 1))
  }
  count = Math.min(400, Math.max(1, count))
  const bins = Array.from({ length: count }, (_, i) => make(i))
  const add = (i: number, s: EpiStatus, k: number): void => {
    const b = bins[i]
    if (!b) return
    b[s] += k
    b.total += k
  }
  for (const c of d.cases ?? []) add(idxOf(Date.parse(c.onset)), c.status, 1)
  for (const c of d.counts ?? []) for (const s of STATUSES) add(idxOf(Date.parse(c.start)), s, c[s])
  return bins
}

/** Centered three-bin moving average of the totals (edges use the bins that exist). */
export function smoothTotals(bins: readonly CurveBin[]): number[] {
  return bins.map((_, i) => {
    const w = bins.slice(Math.max(0, i - 1), Math.min(bins.length, i + 2))
    return w.reduce((s, b) => s + b.total, 0) / w.length
  })
}

const MARKER_WORD = {
  exposure: 'Exposure',
  intervention: 'Control measure',
  report: 'First report',
}
const M = { left: 58, right: 20, bottom: 52 }

function render(d: EpiCurveData, o: { width: number; height: number }): FigureResult {
  const bins = curveBins(d)
  const total = bins.reduce((s, b) => s + b.total, 0)
  const tally = Object.fromEntries(
    STATUSES.map((s) => [s, bins.reduce((acc, b) => acc + b[s], 0)]),
  ) as Record<EpiStatus, number>
  const id = hashId(JSON.stringify(d))
  const defs = STATUSES.map((_, i) =>
    patternDef(`p${id}-${i}`, seriesStyle(i === 0 ? 0 : i === 1 ? 1 : 2)),
  ).join('')
  const lg = legend(
    [
      ...STATUSES.map((s, i) => ({
        name: `${s[0]!.toUpperCase()}${s.slice(1)} (${tally[s]})`,
        swatch: (x: number, y: number) =>
          `<rect x="${n(x)}" y="${n(y - 7)}" width="26" height="14" fill="url(#p${id}-${i})" stroke="${INK}" stroke-width="0.8"/>`,
      })),
      ...(d.smooth
        ? [
            {
              name: 'Smoothed (3-bin average)',
              swatch: (x: number, y: number) =>
                `<path d="M${n(x)} ${n(y)}L${n(x + 26)} ${n(y)}" stroke="${INK}" stroke-width="2.2" stroke-dasharray="6 3"/>`,
            },
          ]
        : []),
    ],
    M.left,
    d.title ? 42 : 14,
    o.width - M.right,
  )
  const top = (d.title ? 42 : 14) + lg.height + 8
  const outside = (time: string): boolean => {
    const pos = (Date.parse(time) - Date.parse(d.start)) / (d.binHours * 3_600_000)
    return pos < 0 || pos > bins.length
  }
  const keyLines = d.markers.map((m, i) =>
    wrap(
      `${i + 1}. ${MARKER_WORD[m.kind]}: ${m.label}${outside(m.time) ? ' (outside the plotted period)' : ''}`,
      Math.floor((o.width - 2 * M.left) / 6.6),
      2,
    ),
  )
  const keyH = keyLines.reduce((s, l) => s + l.length * 15, 0)
  const height = o.height + keyH
  const plotH = o.height - top - M.bottom
  const plotR = o.width - M.right
  const peakTotal = Math.max(1, ...bins.map((b) => b.total))
  const y = scaleLinear()
    .domain([0, peakTotal])
    .nice()
    .range([top + plotH, top])
  const band = scaleBand<string>()
    .domain(bins.map((_, i) => String(i)))
    .range([M.left, plotR])
    .padding(0.08)
  let body = heading(d.title, M.left) + lg.svg
  const step = Math.max(1, Math.ceil(peakTotal > 8 ? peakTotal / 5 : 1))
  for (let t = 0; t <= y.domain()[1]!; t += step) {
    body += `<line x1="${M.left}" x2="${n(plotR)}" y1="${n(y(t))}" y2="${n(y(t))}" stroke="${GRID}"/>`
    body += text(M.left - 8, y(t) + 4, fmt(t), { size: 11, anchor: 'end', fill: MUTED })
  }
  body += `<line x1="${M.left}" x2="${n(plotR)}" y1="${n(top + plotH)}" y2="${n(top + plotH)}" stroke="${AXIS}" stroke-width="1.5"/>`
  const every = Math.max(1, Math.ceil((bins.length * 62) / (plotR - M.left)))
  bins.forEach((b, i) => {
    const x = band(String(i))!
    let acc = 0
    STATUSES.forEach((s, si) => {
      const v = b[s]
      if (v <= 0) return
      const yTop = y(acc + v)
      const yBot = y(acc)
      acc += v
      body += `<rect x="${n(x)}" y="${n(yTop)}" width="${n(band.bandwidth())}" height="${n(yBot - yTop)}" fill="url(#p${id}-${si})" stroke="#ffffff" stroke-width="0.6"/>`
    })
    if (i % every === 0)
      body += text(x + band.bandwidth() / 2, top + plotH + 16, binLabel(b.startMs, d.binHours), {
        size: 10.5,
        anchor: 'middle',
      })
  })
  if (d.smooth) {
    const pts = smoothTotals(bins).map(
      (v, i) => `${n(band(String(i))! + band.bandwidth() / 2)} ${n(y(v))}`,
    )
    body += `<polyline points="${pts.join(' ')}" fill="none" stroke="${INK}" stroke-width="2.2" stroke-dasharray="6 3"/>`
  }
  const binMs = d.binHours * 3_600_000
  const t0 = Date.parse(d.start)
  d.markers.forEach((m, i) => {
    const pos = (Date.parse(m.time) - t0) / binMs
    if (pos < 0 || pos > bins.length) return
    const x = M.left + (pos / bins.length) * (plotR - M.left)
    body += `<line x1="${n(x)}" x2="${n(x)}" y1="${n(top)}" y2="${n(top + plotH)}" stroke="${INK}" stroke-width="1.6" stroke-dasharray="${m.kind === 'exposure' ? '2 3' : '8 4'}"/>`
    body += `<circle cx="${n(x)}" cy="${n(top + 9)}" r="9" fill="#ffffff" stroke="${INK}" stroke-width="1.6"/>`
    body += text(x, top + 13, String(i + 1), { size: 11, weight: 700, anchor: 'middle' })
  })
  body += text(
    M.left + (plotR - M.left) / 2,
    top + plotH + 36,
    `${d.xLabel ?? (d.binHours >= 24 ? 'Date of illness onset' : 'Time of illness onset')} (UTC), ${d.binHours >= 24 ? `${d.binHours / 24 === 1 ? '1-day' : `${d.binHours / 24}-day`}` : `${d.binHours}-hour`} intervals`,
    { size: 11.5, anchor: 'middle', fill: MUTED },
  )
  body += text(0, 0, d.yLabel, {
    size: 11.5,
    anchor: 'middle',
    fill: MUTED,
    extra: `transform="translate(14 ${n(top + plotH / 2)}) rotate(-90)"`,
  })
  let ky = o.height - 4
  keyLines.forEach((lines) =>
    lines.forEach((ln) => {
      ky += 15
      body += text(M.left, ky, ln, { size: 11.5 })
    }),
  )
  const peak = bins.reduce((best, b) => (b.total > best.total ? b : best), bins[0]!)
  const first = bins.find((b) => b.total > 0)
  const last = [...bins].reverse().find((b) => b.total > 0)
  const summary =
    `${d.title ?? 'Epidemic curve'}: epidemic curve by onset, ${total} cases ` +
    `(${tally.confirmed} confirmed, ${tally.probable} probable, ${tally.suspect} suspect) in ${bins.length} ${d.binHours >= 24 ? 'day' : `${d.binHours}-hour`} bins` +
    (first && last
      ? ` from ${binLabel(first.startMs, d.binHours)} to ${binLabel(last.startMs, d.binHours)}. `
      : '. ') +
    (total > 0
      ? `Peak ${peak.total} cases in the bin starting ${binLabel(peak.startMs, d.binHours)}.`
      : 'No cases.') +
    d.markers
      .map(
        (m, i) =>
          ` Marker ${i + 1}, ${MARKER_WORD[m.kind].toLowerCase()} at ${new Date(Date.parse(m.time)).toISOString().slice(0, 16)}Z: ${m.label}.`,
      )
      .join('')
  return {
    svg: frame({
      width: o.width,
      height,
      title: d.title ?? 'Epidemic curve',
      summary,
      defs,
      body,
      idKey: id,
    }),
    summary,
    table: {
      caption: d.title,
      columns: ['Bin start (UTC)', 'Confirmed', 'Probable', 'Suspect', 'Total'],
      rows: bins.map((b) => [
        binLabel(b.startMs, d.binHours),
        String(b.confirmed),
        String(b.probable),
        String(b.suspect),
        String(b.total),
      ]),
    },
  }
}

export const epiCurveKind: FigureKind<EpiCurveData> = {
  kind: 'epi_curve',
  schema: EpiCurveData,
  render,
}
