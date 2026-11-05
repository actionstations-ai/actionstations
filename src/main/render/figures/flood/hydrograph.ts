// hydrograph: a river gauge's observed and forecast stage or flow with the point's own flood
// category bands, the action and flood stage lines, the forecast crest and its time, historic
// crests and the issuance time (spec 0454 FR-5; the weather toolkit's hydrograph is this kind).
// The category bands carry the words minor, moderate and major and a fill pattern each.
import { scaleLinear } from 'd3-scale'
import { line } from 'd3-shape'
import { z } from 'zod'
import { makeXAxis } from '../axis'
import { fmt, frame, heading, legend, marker, n, text } from '../svg'
import { AXIS, GRID, INK, MUTED, seriesStyle } from '../theme'
import type { FigureKind, FigureResult } from '../types'
import {
  CATEGORY_STYLE,
  CATEGORY_WORD,
  CategoryTableSchema,
  GaugeSchema,
  IsoTime,
  TimedValue,
  categoryOf,
  categoryPatterns,
  localTime,
  shortId,
  thin,
  withUnit,
  type CategoryTableData,
  type GaugeData,
} from './common'

export const HydrographData = z
  .object({
    title: z.string().max(200).optional(),
    gauge: GaugeSchema,
    observed: z.array(TimedValue).max(1500).default([]),
    forecast: z.array(TimedValue).max(1500).default([]),
    /** The forecast before the latest issuance, drawn light to show a revision. */
    previousForecast: z.array(TimedValue).max(1500).default([]),
    /** When the forecast was issued (the boundary between observed and forecast). */
    issuedAt: IsoTime.optional(),
    categories: CategoryTableSchema.default({}),
    historicCrests: z
      .array(
        z.object({
          label: z.string().min(1).max(60),
          value: z.number().finite(),
          date: z.string().max(30).optional(),
        }),
      )
      .max(4)
      .default([]),
  })
  .refine((d) => d.observed.length + d.forecast.length > 0, {
    message: 'give observed or forecast values',
  })
export type HydrographData = z.infer<typeof HydrographData>

const M = { left: 66, right: 138, bottom: 52 }
const t = (iso: string): number => Date.parse(iso)

/** The highest forecast value, or failing that the highest observed one, with its time. */
export function crestOf(d: HydrographData): { time: string; value: number; forecast: boolean } {
  const pick = (rows: readonly { time: string; value: number }[], forecast: boolean) => {
    const top = rows.reduce((a, b) => (b.value > a.value ? b : a))
    return { ...top, forecast }
  }
  return d.forecast.length ? pick(d.forecast, true) : pick(d.observed, false)
}

function thresholdRows(
  c: CategoryTableData,
): { key: keyof CategoryTableData; label: string; value: number }[] {
  const names: [keyof CategoryTableData, string][] = [
    ['action', 'Action stage'],
    ['flood', 'Flood stage'],
    ['minor', 'Minor'],
    ['moderate', 'Moderate'],
    ['major', 'Major'],
  ]
  return names.flatMap(([key, label]) =>
    c[key] === undefined ? [] : [{ key, label, value: c[key]! }],
  )
}

function summarize(d: HydrographData, crest: ReturnType<typeof crestOf>): string {
  const g = d.gauge
  const u = g.unit
  const parts = [
    `${d.title ?? 'Hydrograph'}. Gauge: ${g.unit === 'ft' ? 'stage' : 'flow'} at ${g.name}${g.id ? ` (${g.id})` : ''}${g.datum ? `, ${g.datum}` : ''}.`,
  ]
  const last = d.observed.at(-1)
  if (last)
    parts.push(
      `Latest observed ${withUnit(last.value, u)} at ${localTime(last.time, g.timeZone)}` +
        (u === 'ft'
          ? `, ${CATEGORY_WORD[categoryOf(d.categories, last.value)].toLowerCase()}.`
          : '.'),
    )
  if (d.forecast.length) {
    parts.push(
      `${d.issuedAt ? `Forecast issued ${localTime(d.issuedAt, g.timeZone)}: ` : 'Forecast: '}` +
        `crest ${withUnit(crest.value, u)} at ${localTime(crest.time, g.timeZone)}` +
        (u === 'ft'
          ? `, ${CATEGORY_WORD[categoryOf(d.categories, crest.value)].toLowerCase()}.`
          : '.'),
    )
    const prev = d.previousForecast.length
      ? crestOf({ ...d, forecast: d.previousForecast })
      : undefined
    if (prev && u === 'ft') {
      const was = CATEGORY_WORD[categoryOf(d.categories, prev.value)].toLowerCase()
      const now = CATEGORY_WORD[categoryOf(d.categories, crest.value)].toLowerCase()
      parts.push(
        `The previous forecast crest was ${withUnit(prev.value, u)} at ${localTime(prev.time, g.timeZone)} (${was})` +
          (was === now ? '.' : `; the category changed to ${now}.`),
      )
    }
  } else parts.push('No forecast is shown.')
  const rows = thresholdRows(d.categories)
  parts.push(
    rows.length
      ? `This point's stages: ${rows.map((r) => `${r.label.toLowerCase()} ${withUnit(r.value, u)}`).join(', ')}.` +
          (d.categories.minor === undefined ||
          d.categories.moderate === undefined ||
          d.categories.major === undefined
            ? ' Categories not listed do not exist at this point.'
            : '')
      : 'The point has no flood category stages defined.',
  )
  if (d.historicCrests.length)
    parts.push(
      `Historic crests: ${d.historicCrests.map((h) => `${h.label} ${withUnit(h.value, u)}${h.date ? ` (${h.date})` : ''}`).join(', ')}.`,
    )
  return parts.join(' ')
}

function render(d: HydrographData, o: { width: number; height: number }): FigureResult {
  const crest = crestOf(d)
  const summary = summarize(d, crest)
  const u = d.gauge.unit
  const patterns = categoryPatterns(shortId(d))
  const rows = thresholdRows(d.categories)

  const legendItems = [
    ...(d.observed.length ? [{ name: 'Observed', style: seriesStyle(0) }] : []),
    ...(d.forecast.length ? [{ name: 'Forecast', style: seriesStyle(1) }] : []),
    ...(d.previousForecast.length ? [{ name: 'Previous forecast', style: seriesStyle(2) }] : []),
  ]
  const top0 = d.title ? 34 : 12
  const lg = legend(
    legendItems.map((it) => ({
      name: it.name,
      swatch: (x, y) =>
        `<line x1="${n(x)}" y1="${n(y)}" x2="${n(x + 26)}" y2="${n(y)}" stroke="${it.style.color}" stroke-width="2.5"${it.style.dash ? ` stroke-dasharray="${it.style.dash}"` : ''}/>` +
        marker(it.style.marker, x + 13, y, it.style.color),
    })),
    M.left,
    top0,
    o.width - M.right,
  )
  const top = top0 + lg.height + 8
  const plotB = o.height - M.bottom
  const plotR = o.width - M.right

  const values = [
    ...d.observed.map((p) => p.value),
    ...d.forecast.map((p) => p.value),
    ...d.previousForecast.map((p) => p.value),
  ]
  const dataMax = Math.max(...values)
  const above = rows.find((r) => r.value > dataMax)
  const shown = rows.filter((r) => r.value <= dataMax || r === above)
  const hist = d.historicCrests.filter((h) => h.value <= dataMax * 1.35)
  const lo = Math.min(...values, ...shown.map((r) => r.value))
  const hi = Math.max(dataMax, ...shown.map((r) => r.value), ...hist.map((h) => h.value))
  const pad = (hi - lo) * 0.08 || 1
  const y = scaleLinear()
    .domain([lo - pad, hi + pad])
    .nice()
    .range([plotB, top])
  const times = [...d.observed, ...d.forecast, ...d.previousForecast].map((p) => p.time)
  const x = makeXAxis(times, M.left, plotR)
  const xp = (iso: string): number => x.position(iso)

  let body = heading(d.title, M.left) + lg.svg
  // category bands, from each defined threshold up to the next defined one
  const bandKeys = (['minor', 'moderate', 'major'] as const).filter(
    (k) => d.categories[k] !== undefined,
  )
  bandKeys.forEach((k, i) => {
    const from = d.categories[k]!
    const to = d.categories[bandKeys[i + 1]!] ?? y.domain()[1]!
    const yTop = y(Math.min(to, y.domain()[1]!))
    const yBot = y(Math.max(from, y.domain()[0]!))
    if (from >= y.domain()[1]! || yBot <= yTop) return
    body += `<rect x="${M.left}" y="${n(yTop)}" width="${n(plotR - M.left)}" height="${n(yBot - yTop)}" fill="url(#${patterns.id(k)})" opacity="0.16"/>`
    body += `<rect x="${n(plotR + 8)}" y="${n(yTop)}" width="12" height="${n(yBot - yTop)}" fill="url(#${patterns.id(k)})" stroke="${CATEGORY_STYLE[k].color}"/>`
    body += text(plotR + 24, (yTop + yBot) / 2 + 4, CATEGORY_WORD[k].replace(' flooding', ''), {
      size: 12,
      weight: 700,
      fill: CATEGORY_STYLE[k].color,
    })
  })
  for (const tick of y.ticks(6)) {
    body += `<line x1="${M.left}" x2="${n(plotR)}" y1="${n(y(tick))}" y2="${n(y(tick))}" stroke="${GRID}" stroke-width="1"/>`
    body += text(M.left - 8, y(tick) + 4, fmt(tick), { size: 11, anchor: 'end', fill: MUTED })
  }
  body += `<line x1="${M.left}" x2="${n(plotR)}" y1="${n(plotB)}" y2="${n(plotB)}" stroke="${AXIS}" stroke-width="1.5"/>`
  for (const tk of x.ticks) {
    body += `<line x1="${n(tk.pos)}" x2="${n(tk.pos)}" y1="${n(plotB)}" y2="${n(plotB + 5)}" stroke="${AXIS}"/>`
    body += text(tk.pos, plotB + 18, tk.label, { size: 11, anchor: 'middle', fill: MUTED })
  }
  body += text((M.left + plotR) / 2, plotB + 38, `Time (${d.gauge.timeZone ?? 'UTC'})`, {
    size: 12,
    anchor: 'middle',
    fill: MUTED,
  })
  body += text(0, 0, `${u === 'ft' ? 'Stage' : 'Flow'} (${u})`, {
    size: 12,
    anchor: 'middle',
    fill: MUTED,
    extra: `transform="translate(14 ${n((top + plotB) / 2)}) rotate(-90)"`,
  })

  // action and flood stage lines
  for (const [k, dash, label] of [
    ['action', '6 4', 'Action stage'],
    ['flood', undefined, 'Flood stage'],
  ] as const) {
    const v = d.categories[k]
    if (v === undefined || v < y.domain()[0]! || v > y.domain()[1]!) continue
    body += `<line x1="${M.left}" x2="${n(plotR)}" y1="${n(y(v))}" y2="${n(y(v))}" stroke="${INK}" stroke-width="1.6"${dash ? ` stroke-dasharray="${dash}"` : ''}/>`
    body += text(M.left + 6, y(v) - 5, `${label} ${withUnit(v, u)}`, { size: 11, weight: 600 })
  }
  for (const h of hist) {
    body += `<line x1="${M.left}" x2="${n(plotR)}" y1="${n(y(h.value))}" y2="${n(y(h.value))}" stroke="${MUTED}" stroke-width="1" stroke-dasharray="1 4"/>`
    body += text(plotR - 4, y(h.value) - 4, `${h.label} ${withUnit(h.value, u)}`, {
      size: 10.5,
      anchor: 'end',
      fill: MUTED,
    })
  }

  const path = (pts: readonly { time: string; value: number }[]): string =>
    line<{ time: string; value: number }>()
      .x((p) => xp(p.time))
      .y((p) => y(p.value))([...pts].sort((a, b) => t(a.time) - t(b.time))) ?? ''
  const series: [typeof d.observed, number, number][] = [
    [d.previousForecast, 2, 1.8],
    [d.forecast, 1, 2.6],
    [d.observed, 0, 2.6],
  ]
  for (const [pts, idx, w] of series) {
    if (!pts.length) continue
    const st = seriesStyle(idx)
    body += `<path d="${path(pts)}" fill="none" stroke="${st.color}" stroke-width="${w}" stroke-linejoin="round"${st.dash ? ` stroke-dasharray="${st.dash}"` : ''}/>`
    const every = Math.max(1, Math.ceil(pts.length / 10))
    if (idx !== 2)
      pts.forEach((p, k) => {
        if (k % every === 0 || k === pts.length - 1)
          body += marker(st.marker, xp(p.time), y(p.value), st.color)
      })
  }
  if (d.issuedAt) {
    const ix = xp(d.issuedAt)
    if (ix >= M.left && ix <= plotR) {
      body += `<line x1="${n(ix)}" x2="${n(ix)}" y1="${n(top)}" y2="${n(plotB)}" stroke="${INK}" stroke-width="1" stroke-dasharray="2 3"/>`
      body += text(ix + 4, top + 12, `Issued ${localTime(d.issuedAt, d.gauge.timeZone)}`, {
        size: 10.5,
        fill: MUTED,
      })
    }
  }
  const cx = xp(crest.time)
  const cy = y(crest.value)
  body += `<path d="M${n(cx)} ${n(cy - 8)}L${n(cx + 7)} ${n(cy)}L${n(cx)} ${n(cy + 8)}L${n(cx - 7)} ${n(cy)}Z" fill="${INK}" stroke="#ffffff" stroke-width="1.5"/>`
  const label = `${crest.forecast ? 'Forecast crest' : 'Crest'} ${withUnit(crest.value, u)}`
  const anchor = cx > plotR - 150 ? 'end' : 'start'
  body += text(anchor === 'end' ? cx - 11 : cx + 11, cy - 28, label, {
    size: 12,
    weight: 700,
    anchor,
  })
  body += text(
    anchor === 'end' ? cx - 11 : cx + 11,
    cy - 14,
    localTime(crest.time, d.gauge.timeZone),
    { size: 10.5, fill: MUTED, anchor },
  )

  return {
    svg: frame({
      width: o.width,
      height: o.height,
      title: d.title ?? 'Hydrograph',
      summary,
      defs: patterns.defs,
      body,
      idKey: JSON.stringify(d),
    }),
    summary,
    table: tableOf(d),
  }
}

function tableOf(d: HydrographData): NonNullable<FigureResult['table']> {
  const u = d.gauge.unit
  const rows: [string, string, number][] = [
    ...d.observed.map((p) => ['Observed', p.time, p.value] as [string, string, number]),
    ...d.forecast.map((p) => ['Forecast', p.time, p.value] as [string, string, number]),
  ].sort((a, b) => t(a[1]) - t(b[1]))
  return {
    caption: d.title ?? `${d.gauge.name} hydrograph`,
    columns: ['Time', 'Type', `Value (${u})`, 'Category'],
    rows: thin(rows, 48).map(([type, time, value]) => [
      localTime(time, d.gauge.timeZone),
      type,
      fmt(value),
      u === 'ft' ? CATEGORY_WORD[categoryOf(d.categories, value)] : 'n/a',
    ]),
  }
}

export type { GaugeData }
export const hydrographKind: FigureKind<HydrographData> = {
  kind: 'hydrograph',
  schema: HydrographData,
  render,
  defaultHeight: 420,
}
