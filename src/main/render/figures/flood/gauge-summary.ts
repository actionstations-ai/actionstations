// flood_gauge_summary: the current reading at a river gauge, its flood category, the trend and
// the point's flood stage table, as on an NWS gauge page (spec 0454 FR-5).
import { z } from 'zod'
import { fmt, frame, heading, n, text } from '../svg'
import { AXIS, GRID, INK, MUTED } from '../theme'
import type { FigureKind, FigureResult } from '../types'
import {
  CATEGORY_STYLE,
  CATEGORY_WORD,
  CategoryTableSchema,
  GaugeSchema,
  TimedValue,
  categoryOf,
  hashKey,
  localTime,
  withUnit,
} from './common'

export const GaugeSummaryData = z.object({
  title: z.string().max(200).optional(),
  gauge: GaugeSchema,
  current: TimedValue,
  /** An earlier reading (about three hours back) used for the trend. */
  previous: TimedValue.optional(),
  /** Flow at the same time, in cfs. */
  flowCfs: z.number().finite().optional(),
  categories: CategoryTableSchema.default({}),
  forecastCrest: TimedValue.optional(),
  historicCrests: z
    .array(
      z.object({
        label: z.string().min(1).max(60),
        value: z.number().finite(),
        date: z.string().max(30).optional(),
      }),
    )
    .max(5)
    .default([]),
})
export type GaugeSummaryData = z.infer<typeof GaugeSummaryData>

const STEADY_BAND = 0.1

export function trendOf(d: GaugeSummaryData): 'rising' | 'falling' | 'steady' | 'unknown' {
  if (!d.previous) return 'unknown'
  const delta = d.current.value - d.previous.value
  return Math.abs(delta) <= STEADY_BAND ? 'steady' : delta > 0 ? 'rising' : 'falling'
}

const TREND_SYMBOL = { rising: '▲', falling: '▼', steady: '■', unknown: '○' } as const

interface Row {
  name: string
  stage: number | undefined
}

function rowsOf(d: GaugeSummaryData): Row[] {
  const c = d.categories
  return [
    { name: 'Major flood stage', stage: c.major },
    { name: 'Moderate flood stage', stage: c.moderate },
    { name: 'Minor flood stage', stage: c.minor },
    { name: 'Flood stage', stage: c.flood },
    { name: 'Action stage', stage: c.action },
  ]
}

function render(d: GaugeSummaryData, o: { width: number; height: number }): FigureResult {
  const u = d.gauge.unit
  const cat = u === 'ft' ? categoryOf(d.categories, d.current.value) : 'none'
  const trend = trendOf(d)
  const rows = rowsOf(d)
  const when = localTime(d.current.time, d.gauge.timeZone)
  const summary = [
    `${d.title ?? d.gauge.name}${d.gauge.id ? ` (${d.gauge.id})` : ''}: ${withUnit(d.current.value, u)} at ${when}, ${CATEGORY_WORD[cat].toLowerCase()}, ${trend === 'unknown' ? 'trend not known' : trend}.`,
    d.flowCfs !== undefined ? `Flow ${fmt(d.flowCfs)} cfs.` : '',
    d.forecastCrest
      ? `Forecast crest ${withUnit(d.forecastCrest.value, u)} at ${localTime(d.forecastCrest.time, d.gauge.timeZone)}.`
      : '',
    `Flood stage table: ${rows.map((r) => `${r.name.toLowerCase()} ${r.stage === undefined ? 'not defined at this point' : withUnit(r.stage, u)}`).join('; ')}.`,
    d.historicCrests.length
      ? `Historic crests: ${d.historicCrests.map((h) => `${h.label} ${withUnit(h.value, u)}${h.date ? ` (${h.date})` : ''}`).join(', ')}.`
      : '',
  ]
    .filter(Boolean)
    .join(' ')

  const st = cat === 'none' ? undefined : CATEGORY_STYLE[cat]
  const left = 24
  let body = heading(d.title ?? d.gauge.name, left)
  body += text(
    left,
    52,
    `${d.gauge.name}${d.gauge.id ? ` · ${d.gauge.id}` : ''}${d.gauge.datum ? ` · ${d.gauge.datum}` : ''}`,
    { size: 12, fill: MUTED },
  )
  body += text(left, 112, withUnit(d.current.value, u), {
    size: 46,
    weight: 700,
    fill: st?.color ?? INK,
  })
  body += text(left, 138, `${CATEGORY_WORD[cat]}`, {
    size: 15,
    weight: 700,
    fill: st?.color ?? INK,
  })
  body += text(
    left,
    160,
    `${TREND_SYMBOL[trend]} ${trend === 'unknown' ? 'Trend not known' : trend[0]!.toUpperCase() + trend.slice(1)}`,
    { size: 13 },
  )
  body += text(left, 180, `As of ${when}`, { size: 12, fill: MUTED })
  if (d.flowCfs !== undefined)
    body += text(left, 200, `Flow ${fmt(d.flowCfs)} cfs`, { size: 12, fill: MUTED })
  if (d.forecastCrest)
    body += text(
      left,
      220,
      `Forecast crest ${withUnit(d.forecastCrest.value, u)}, ${localTime(d.forecastCrest.time, d.gauge.timeZone)}`,
      { size: 12, weight: 600 },
    )

  const tx = Math.max(300, o.width * 0.45)
  let y = 78
  body += text(tx, y, 'Flood stage table', { size: 13, weight: 700 })
  y += 10
  for (const r of rows) {
    y += 26
    body += `<line x1="${n(tx)}" x2="${n(o.width - 24)}" y1="${n(y - 18)}" y2="${n(y - 18)}" stroke="${GRID}"/>`
    body += text(tx, y, r.name, { size: 12.5 })
    body += text(o.width - 24, y, r.stage === undefined ? 'not defined' : withUnit(r.stage, u), {
      size: 12.5,
      weight: 600,
      anchor: 'end',
      fill: r.stage === undefined ? MUTED : INK,
    })
  }
  y += 8
  body += `<line x1="${n(tx)}" x2="${n(o.width - 24)}" y1="${n(y)}" y2="${n(y)}" stroke="${AXIS}"/>`
  for (const h of d.historicCrests) {
    y += 22
    body += text(tx, y, `${h.label}${h.date ? ` (${h.date})` : ''}`, { size: 12, fill: MUTED })
    body += text(o.width - 24, y, withUnit(h.value, u), { size: 12, anchor: 'end', fill: MUTED })
  }

  const height = Math.max(250, y + 24)
  return {
    svg: frame({
      width: o.width,
      height,
      title: d.title ?? d.gauge.name,
      summary,
      body,
      idKey: hashKey(d),
    }),
    summary,
    table: {
      caption: `${d.gauge.name} flood stage table`,
      columns: ['Level', `Stage (${u})`, 'Current reading is'],
      rows: [
        ...rows.map((r) => [
          r.name,
          r.stage === undefined ? 'not defined' : fmt(r.stage),
          r.stage !== undefined && d.current.value >= r.stage ? 'at or above' : 'below',
        ]),
        ['Current reading', fmt(d.current.value), `${CATEGORY_WORD[cat]}; ${trend}`],
      ],
    },
  }
}

export const gaugeSummaryKind: FigureKind<GaugeSummaryData> = {
  kind: 'flood_gauge_summary',
  schema: GaugeSummaryData,
  render,
  defaultHeight: 300,
}
