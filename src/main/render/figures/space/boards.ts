// space_scale_panel and space_impact_board: the NOAA scale panel (G, S and R now and by day) and a
// status board for grid, aviation, navigation and satellite impacts (spec 0468 FR-5). Levels and
// states are always words and numbers with a fill pattern or symbol, never color alone.
import { z } from 'zod'
import { frame, hashId, heading, n, patternDef, text, wrap } from '../svg'
import { INK, MUTED } from '../theme'
import type { FigureKind, FigureResult } from '../types'
import {
  Title,
  hashKey,
  levelStyle,
  levelText,
  LEVEL_WORDS,
  SCALE_NAMES,
  type Scale,
} from './common'

const Level = z.number().int().min(0).max(5)
const Levels = z.object({ g: Level, s: Level, r: Level })

export const ScalePanelData = z.object({
  title: Title,
  asOf: z.string().max(60).optional(),
  /** Levels observed now. */
  now: Levels,
  /** The highest level predicted for each following day. */
  days: z
    .array(z.object({ label: z.string().min(1).max(30), g: Level, s: Level, r: Level }))
    .max(5)
    .default([]),
  simulated: z.boolean().default(false),
})
export type ScalePanelData = z.infer<typeof ScalePanelData>

const SCALES: Scale[] = ['R', 'S', 'G']

function renderPanel(d: ScalePanelData, o: { width: number; height: number }): FigureResult {
  const cols = [{ label: 'Now', ...d.now }, ...d.days.map((x) => ({ ...x }))]
  const top = d.title ? 40 : 10
  const labelW = 190
  const headH = 30
  const rowH = 64
  const colW = (o.width - labelW - 12) / cols.length
  const height = top + headH + SCALES.length * rowH + 12
  const pid = `sp-${hashId(hashKey(d))}`
  let defs = ''
  for (let l = 0; l <= 5; l++) defs += patternDef(`${pid}-${l}`, levelStyle(l))
  let body = heading(d.title ?? 'Space weather scales', 12)
  if (d.asOf)
    body += text(o.width - 12, 20, `As of ${d.asOf}`, { size: 12, anchor: 'end', fill: MUTED })
  body += `<rect x="0" y="${top}" width="${o.width}" height="${headH}" fill="#14100c"/>`
  body += text(12, top + 20, 'Scale', { size: 12, weight: 700, fill: '#ffffff' })
  cols.forEach((c, i) => {
    body += text(labelW + i * colW + colW / 2, top + 20, c.label, {
      size: 12,
      weight: 700,
      fill: '#ffffff',
      anchor: 'middle',
    })
  })
  SCALES.forEach((sc, r) => {
    const y = top + headH + r * rowH
    body += text(12, y + 28, `${sc}: ${SCALE_NAMES[sc]}`, { size: 13, weight: 700 })
    body += text(12, y + 46, sc === 'G' ? 'by Kp' : sc === 'S' ? '10 MeV protons' : 'X-ray flux', {
      size: 11,
      fill: MUTED,
    })
    cols.forEach((c, i) => {
      const level = c[sc.toLowerCase() as 'g' | 's' | 'r']
      const st = levelStyle(level)
      const x = labelW + i * colW
      body += `<rect x="${n(x + 4)}" y="${n(y + 4)}" width="${n(colW - 8)}" height="${rowH - 8}" fill="url(#${pid}-${level})" fill-opacity="${level ? 0.28 : 0.12}" stroke="${st.color}" stroke-width="2"/>`
      body += `<rect x="${n(x + colW / 2 - 40)}" y="${n(y + 14)}" width="80" height="${rowH - 28}" fill="#ffffff" fill-opacity="0.92"/>`
      body += text(x + colW / 2, y + 31, level ? `${sc}${level}` : 'none', {
        size: 16,
        weight: 800,
        anchor: 'middle',
        fill: level ? st.color : INK,
      })
      body += text(x + colW / 2, y + 46, level ? LEVEL_WORDS[level]! : 'below 1', {
        size: 11,
        anchor: 'middle',
        fill: INK,
      })
    })
  })
  const nowText = SCALES.map((s) => levelText(s, d.now[s.toLowerCase() as 'g' | 's' | 'r'])).join(
    ', ',
  )
  const summary =
    `${d.title ?? 'Space weather scales'}${d.asOf ? ` as of ${d.asOf}` : ''}${d.simulated ? ' (simulated, not an NOAA product)' : ''}: ` +
    `now ${nowText}. ` +
    (d.days.length
      ? `Highest predicted by day: ${d.days
          .map(
            (x) =>
              `${x.label} ${SCALES.map((s) => levelText(s, x[s.toLowerCase() as 'g' | 's' | 'r'])).join(', ')}`,
          )
          .join('; ')}.`
      : 'No daily predictions are listed.')
  return {
    svg: frame({
      width: o.width,
      height,
      title: d.title ?? 'Space weather scales',
      summary,
      defs,
      body,
      idKey: hashKey(d),
    }),
    summary,
    table: {
      caption: d.title ?? 'Space weather scales',
      columns: ['Scale', ...cols.map((c) => c.label)],
      rows: SCALES.map((s) => [
        `${s}: ${SCALE_NAMES[s]}`,
        ...cols.map((c) => levelText(s, c[s.toLowerCase() as 'g' | 's' | 'r'])),
      ]),
    },
  }
}

export const scalePanelKind: FigureKind<ScalePanelData> = {
  kind: 'space_scale_panel',
  schema: ScalePanelData,
  render: renderPanel,
}

export const IMPACT_STATES = {
  normal: { label: 'Normal', color: '#1b7a3a', tint: '#e3f3e8' },
  watch: { label: 'Watch', color: '#8a5a00', tint: '#fff0c2' },
  degraded: { label: 'Degraded', color: '#b34700', tint: '#ffe3cc' },
  severe: { label: 'Severe', color: '#b3121b', tint: '#fbe1e2' },
  unknown: { label: 'Unknown', color: '#594c3c', tint: '#ece6d8' },
} as const
type ImpactState = keyof typeof IMPACT_STATES

function symbol(state: ImpactState, x: number, y: number): string {
  const c = IMPACT_STATES[state].color
  switch (state) {
    case 'watch':
      return `<path d="M${n(x)} ${n(y - 8)}L${n(x + 8)} ${n(y + 7)}L${n(x - 8)} ${n(y + 7)}Z" fill="${c}"/>`
    case 'degraded':
      return `<path d="M${n(x)} ${n(y - 8)}L${n(x + 8)} ${n(y)}L${n(x)} ${n(y + 8)}L${n(x - 8)} ${n(y)}Z" fill="${c}"/>`
    case 'severe':
      return `<rect x="${n(x - 7)}" y="${n(y - 7)}" width="14" height="14" fill="${c}"/><path d="M${n(x - 4)} ${n(y - 4)}L${n(x + 4)} ${n(y + 4)}M${n(x + 4)} ${n(y - 4)}L${n(x - 4)} ${n(y + 4)}" stroke="#ffffff" stroke-width="2"/>`
    case 'unknown':
      return `<circle cx="${n(x)}" cy="${n(y)}" r="6.5" fill="none" stroke="${c}" stroke-width="2.5"/>`
    default:
      return `<circle cx="${n(x)}" cy="${n(y)}" r="7" fill="${c}"/><path d="M${n(x - 3.5)} ${n(y)}L${n(x - 1)} ${n(y + 3)}L${n(x + 4)} ${n(y - 3)}" stroke="#ffffff" stroke-width="2" fill="none"/>`
  }
}

export const ImpactBoardData = z.object({
  title: Title,
  asOf: z.string().max(60).optional(),
  rows: z
    .array(
      z.object({
        sector: z.string().min(1).max(80),
        state: z.enum(['normal', 'watch', 'degraded', 'severe', 'unknown']),
        detail: z.string().max(240).optional(),
        updated: z.string().max(40).optional(),
      }),
    )
    .min(1)
    .max(12),
  simulated: z.boolean().default(false),
})
export type ImpactBoardData = z.infer<typeof ImpactBoardData>

function renderBoard(d: ImpactBoardData, o: { width: number; height: number }): FigureResult {
  const headH = d.title ? 36 : 8
  const colName = 20
  const colState = Math.round(o.width * 0.26)
  const colDetail = Math.round(o.width * 0.46)
  const chars = Math.floor((o.width - colDetail - 16) / 6.4)
  const lines = d.rows.map((r) => wrap(r.detail ?? '', chars, 3))
  const heights = lines.map((l) => Math.max(40, 18 + Math.max(1, l.length) * 15))
  const height = headH + 26 + heights.reduce((a, b) => a + b, 0) + 8
  let body = heading(d.title ?? 'Impact board', 16)
  if (d.asOf)
    body += text(o.width - 16, 20, `As of ${d.asOf}`, { size: 12, anchor: 'end', fill: MUTED })
  let y = headH
  body += `<rect x="0" y="${y}" width="${o.width}" height="26" fill="#14100c"/>`
  for (const [x, label] of [
    [colName, 'Sector'],
    [colState, 'State'],
    [colDetail, 'Impact'],
  ] as const)
    body += text(x, y + 17, label, { size: 12, weight: 700, fill: '#ffffff' })
  y += 26
  d.rows.forEach((r, i) => {
    const h = heights[i]!
    const st = IMPACT_STATES[r.state]
    body += `<rect x="0" y="${y}" width="${o.width}" height="${h}" fill="${st.tint}"/>`
    body += `<line x1="0" x2="${o.width}" y1="${y + h}" y2="${y + h}" stroke="#ffffff" stroke-width="2"/>`
    body += `<rect x="0" y="${y}" width="6" height="${h}" fill="${st.color}"/>`
    body += text(colName, y + h / 2 + 5, r.sector, { size: 14, weight: 600 })
    body += symbol(r.state, colState + 8, y + h / 2)
    body += text(colState + 24, y + h / 2 + 5, st.label, { size: 14, weight: 700, fill: st.color })
    lines[i]!.forEach((ln, k) => {
      body += text(colDetail, y + 22 + k * 15, ln, { size: 12, fill: INK })
    })
    if (r.updated)
      body += text(o.width - 12, y + h - 8, r.updated, { size: 10, anchor: 'end', fill: MUTED })
    y += h
  })
  const summary =
    `${d.title ?? 'Impact board'}${d.asOf ? ` as of ${d.asOf}` : ''}${d.simulated ? ' (simulated)' : ''}: ${d.rows.length} sectors. ` +
    d.rows
      .map((r) => `${r.sector}: ${IMPACT_STATES[r.state].label}${r.detail ? ` (${r.detail})` : ''}`)
      .join('; ') +
    '.'
  return {
    svg: frame({
      width: o.width,
      height,
      title: d.title ?? 'Impact board',
      summary,
      body,
      idKey: hashKey(d),
    }),
    summary,
    table: {
      caption: d.title ?? 'Impact board',
      columns: ['Sector', 'State', 'Impact', 'Updated'],
      rows: d.rows.map((r) => [
        r.sector,
        IMPACT_STATES[r.state].label,
        r.detail ?? '',
        r.updated ?? '',
      ]),
    },
  }
}

export const impactBoardKind: FigureKind<ImpactBoardData> = {
  kind: 'space_impact_board',
  schema: ImpactBoardData,
  render: renderBoard,
}
