// humanitarian_needs_coverage and humanitarian_funding_bar (spec 0469 FR-8). Needs coverage
// draws, per sector, people in need, people targeted and people reached on one scale; funding
// draws received and the gap against the requirement. Bars differ by fill pattern as well as
// color and carry their numbers as text; percentages are computed here, never typed.
import { z } from 'zod'
import { GRID, INK, MUTED, seriesStyle } from '../theme'
import { fmt, frame, hashId, heading, n, patternDef, text, wrap } from '../svg'
import type { FigureKind, FigureResult } from '../types'

const Sector = z.string().min(1).max(60)
const pct = (a: number, b: number): string => (b > 0 ? `${Math.round((a / b) * 100)}%` : 'n/a')

// ---- needs coverage --------------------------------------------------------------------------

export const NeedsCoverageData = z
  .object({
    title: z.string().max(200).optional(),
    sectors: z
      .array(
        z.object({
          sector: Sector,
          inNeed: z.number().finite().min(0),
          targeted: z.number().finite().min(0),
          reached: z.number().finite().min(0),
        }),
      )
      .min(1)
      .max(12),
    asOf: z.string().max(60).optional(),
    simulated: z.boolean().default(true),
  })
  .refine((d) => d.sectors.every((s) => s.targeted <= s.inNeed && s.reached <= s.targeted), {
    message: 'people reached cannot exceed people targeted, nor targeted exceed in need',
  })
export type NeedsCoverageData = z.infer<typeof NeedsCoverageData>

const LABEL_W = 150
const ROW = 58

function renderNeeds(d: NeedsCoverageData, o: { width: number; height: number }): FigureResult {
  const top = d.title ? 56 : 30
  const height = top + d.sectors.length * ROW + 12
  const max = Math.max(1, ...d.sectors.map((s) => s.inNeed))
  const plotW = o.width - LABEL_W - 140
  const id = hashId(JSON.stringify(d))
  const st = [seriesStyle(3), seriesStyle(0), seriesStyle(2)]
  const defs = st.map((s, i) => patternDef(`c${id}${i}`, s)).join('')
  const names = ['In need', 'Targeted', 'Reached']
  let body = heading(d.title, 8)
  names.forEach((nm, i) => {
    const x = LABEL_W + i * 120
    body += `<rect x="${x}" y="${top - 22}" width="22" height="12" fill="url(#c${id}${i})" stroke="${INK}" stroke-width="0.8"/>`
    body += text(x + 28, top - 12, nm, { size: 12, fill: MUTED })
  })
  d.sectors.forEach((s, ri) => {
    const y = top + ri * ROW
    wrap(s.sector, 22, 2).forEach((ln, i) => {
      body += text(8, y + 16 + i * 14, ln, { size: 12, weight: 600 })
    })
    ;[s.inNeed, s.targeted, s.reached].forEach((v, i) => {
      const w = (v / max) * plotW
      body += `<rect x="${LABEL_W}" y="${y + i * 17}" width="${n(Math.max(w, 1))}" height="14" fill="url(#c${id}${i})" stroke="${INK}" stroke-width="0.8"/>`
      body += text(LABEL_W + w + 6, y + i * 17 + 11, fmt(v), { size: 11, fill: INK })
    })
    body += text(o.width - 8, y + 28, `${pct(s.reached, s.targeted)} of target`, {
      size: 12,
      weight: 700,
      anchor: 'end',
    })
    body += `<line x1="8" x2="${o.width - 8}" y1="${y + ROW - 5}" y2="${y + ROW - 5}" stroke="${GRID}"/>`
  })
  const summary =
    `${d.title ?? 'Needs against coverage'}${d.asOf ? ` as of ${d.asOf}` : ''}: ` +
    d.sectors
      .map(
        (s) =>
          `${s.sector}: ${fmt(s.inNeed)} in need, ${fmt(s.targeted)} targeted, ${fmt(s.reached)} reached (${pct(s.reached, s.targeted)} of target, ${pct(s.reached, s.inNeed)} of need)`,
      )
      .join('; ') +
    '. Targets come from the response plan; people targeted is not people reached.' +
    (d.simulated ? ' Simulated data.' : '')
  return {
    svg: frame({
      width: o.width,
      height,
      title: d.title ?? 'Needs against coverage',
      summary,
      defs,
      body,
      idKey: id,
    }),
    summary,
    table: {
      caption: d.title ?? 'Needs against coverage',
      columns: ['Sector', 'In need', 'Targeted', 'Reached', 'Reached of target', 'Reached of need'],
      rows: d.sectors.map((s) => [
        s.sector,
        fmt(s.inNeed),
        fmt(s.targeted),
        fmt(s.reached),
        pct(s.reached, s.targeted),
        pct(s.reached, s.inNeed),
      ]),
    },
  }
}

export const needsCoverageKind: FigureKind<NeedsCoverageData> = {
  kind: 'humanitarian_needs_coverage',
  schema: NeedsCoverageData,
  render: renderNeeds,
  defaultHeight: 380,
}

// ---- funding bar -----------------------------------------------------------------------------

export const FundingBarData = z
  .object({
    title: z.string().max(200).optional(),
    unit: z.string().max(30).default('US$ million'),
    sectors: z
      .array(
        z.object({
          sector: Sector,
          required: z.number().finite().positive(),
          received: z.number().finite().min(0),
        }),
      )
      .min(1)
      .max(12),
    asOf: z.string().max(60).optional(),
  })
  .refine((d) => d.sectors.every((s) => s.received <= s.required), {
    message: 'received cannot exceed required',
  })
export type FundingBarData = z.infer<typeof FundingBarData>

function renderFunding(d: FundingBarData, o: { width: number; height: number }): FigureResult {
  const top = d.title ? 56 : 30
  const rowH = 40
  const height = top + (d.sectors.length + 1) * rowH + 12
  const rows = [
    ...d.sectors,
    {
      sector: 'Total',
      required: d.sectors.reduce((s, r) => s + r.required, 0),
      received: d.sectors.reduce((s, r) => s + r.received, 0),
    },
  ]
  const max = Math.max(...rows.slice(0, -1).map((r) => r.required))
  const plotW = o.width - LABEL_W - 150
  const id = hashId(JSON.stringify(d))
  const rec = seriesStyle(2)
  const gap = seriesStyle(1)
  const defs = patternDef(`f${id}r`, rec) + patternDef(`f${id}g`, gap)
  let body = heading(d.title, 8)
  body += `<rect x="${LABEL_W}" y="${top - 22}" width="22" height="12" fill="url(#f${id}r)" stroke="${INK}" stroke-width="0.8"/>`
  body += text(LABEL_W + 28, top - 12, 'Received', { size: 12, fill: MUTED })
  body += `<rect x="${LABEL_W + 110}" y="${top - 22}" width="22" height="12" fill="url(#f${id}g)" stroke="${INK}" stroke-width="0.8"/>`
  body += text(LABEL_W + 138, top - 12, 'Gap', { size: 12, fill: MUTED })
  rows.forEach((r, ri) => {
    const y = top + ri * rowH
    const total = ri === rows.length - 1
    const scale = total ? plotW / r.required : plotW / max
    body += text(8, y + 18, r.sector, { size: 12, weight: total ? 800 : 600 })
    body += `<rect x="${LABEL_W}" y="${y + 4}" width="${n(r.received * scale)}" height="20" fill="url(#f${id}r)" stroke="${INK}" stroke-width="0.8"/>`
    body += `<rect x="${n(LABEL_W + r.received * scale)}" y="${y + 4}" width="${n((r.required - r.received) * scale)}" height="20" fill="url(#f${id}g)" fill-opacity="0.55" stroke="${INK}" stroke-width="0.8"/>`
    body += text(
      o.width - 8,
      y + 19,
      `${fmt(r.received)} of ${fmt(r.required)} (${pct(r.received, r.required)})`,
      {
        size: 12,
        weight: 700,
        anchor: 'end',
      },
    )
  })
  const t = rows.at(-1)!
  const summary =
    `${d.title ?? 'Funding status'}${d.asOf ? ` as of ${d.asOf}` : ''} (${d.unit}): ${fmt(t.received)} received of ${fmt(t.required)} required, ${pct(t.received, t.required)} funded, gap ${fmt(t.required - t.received)}. ` +
    d.sectors
      .map(
        (s) =>
          `${s.sector} ${fmt(s.received)} of ${fmt(s.required)} (${pct(s.received, s.required)})`,
      )
      .join('; ') +
    '.'
  return {
    svg: frame({
      width: o.width,
      height,
      title: d.title ?? 'Funding status',
      summary,
      defs,
      body,
      idKey: id,
    }),
    summary,
    table: {
      caption: d.title ?? 'Funding status',
      columns: ['Sector', `Required (${d.unit})`, `Received (${d.unit})`, 'Gap', 'Funded'],
      rows: rows.map((r) => [
        r.sector,
        fmt(r.required),
        fmt(r.received),
        fmt(r.required - r.received),
        pct(r.received, r.required),
      ]),
    },
  }
}

export const fundingBarKind: FigureKind<FundingBarData> = {
  kind: 'humanitarian_funding_bar',
  schema: FundingBarData,
  render: renderFunding,
  defaultHeight: 340,
}
