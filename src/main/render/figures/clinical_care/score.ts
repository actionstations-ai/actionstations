// early_warning_score (spec 0452 FR-5, FR-6): the parameters of a reading with their bands and
// points, the total, the trigger level in words and the recommended response, citing the
// score's source. The arithmetic is done here from the configuration, never taken from text.
import { z } from 'zod'
import {
  EwsConfig,
  NEUTRAL_EWS,
  computeEws,
  type EwsReading,
} from '../../../../shared/clinical/ews'
import { frame, heading, n, text, wrap } from '../svg'
import { INK, MUTED } from '../theme'
import type { FigureKind, FigureResult } from '../types'

export const EarlyWarningScoreData = z.object({
  title: z.string().max(200).optional(),
  /** Absent: the neutral score bundled with the app. */
  config: EwsConfig.optional(),
  /** When the reading was taken ("10:40"). */
  time: z.string().max(40).optional(),
  /** Values by parameter key: numbers, or text for categorical parameters. */
  reading: z.record(z.string(), z.union([z.number().finite(), z.string().max(60), z.null()])),
})
export type EarlyWarningScoreData = z.infer<typeof EarlyWarningScoreData>

const LEVEL_FILL: Record<number, string> = {
  0: '#e3f3e8',
  1: '#fff0c2',
  2: '#fde1c8',
  3: '#fbe1e2',
}

function render(d: EarlyWarningScoreData, o: { width: number; height: number }): FigureResult {
  const config = d.config ?? NEUTRAL_EWS
  const r = computeEws(config, d.reading as EwsReading)
  const top = d.title ? 36 : 8
  const inner = o.width - 24
  const cols = [12, 12 + inner * 0.36, 12 + inner * 0.56, 12 + inner * 0.86]
  let body = heading(d.title, 12)
  body += text(12, top + 12, `${config.name}${d.time ? ` · ${d.time}` : ''}`, {
    size: 12,
    weight: 600,
  })
  const hy = top + 22
  body += `<rect x="12" y="${hy}" width="${n(inner)}" height="26" fill="${INK}"/>`
  ;['Parameter', 'Value', 'Band', 'Points'].forEach((h, i) => {
    body += text(i === 3 ? 12 + inner - 10 : cols[i]! + 8, hy + 17, h, {
      size: 12,
      weight: 700,
      fill: '#ffffff',
      anchor: i === 3 ? 'end' : 'start',
    })
  })
  r.lines.forEach((l, i) => {
    const y = hy + 26 + i * 28
    body += `<rect x="12" y="${y}" width="${n(inner)}" height="28" fill="${i % 2 ? '#ffffff' : '#f6efdc'}"/>`
    body += text(cols[0]! + 8, y + 19, l.label, { size: 13 })
    body += text(cols[1]! + 8, y + 19, `${l.value}${l.unit ? ' ' + l.unit : ''}`, {
      size: 13,
      weight: 600,
    })
    body += text(cols[2]! + 8, y + 19, l.band, { size: 13, fill: MUTED })
    body += text(12 + inner - 10, y + 19, `${l.points}`, {
      size: 15,
      weight: 700,
      anchor: 'end',
      fill: l.points >= (config.singleParameterMax ?? 99) ? '#b3121b' : INK,
    })
  })
  const ty = hy + 26 + r.lines.length * 28
  body += `<line x1="12" x2="${n(12 + inner)}" y1="${ty}" y2="${ty}" stroke="${INK}" stroke-width="1.5"/>`
  body += text(cols[0]! + 8, ty + 24, 'Total', { size: 14, weight: 700 })
  body += text(12 + inner - 10, ty + 26, `${r.total}`, { size: 22, weight: 700, anchor: 'end' })
  const level = r.trigger
  const rank = Math.min(
    3,
    [...config.triggers].sort((a, b) => a.minTotal - b.minTotal).findIndex((t) => t === level),
  )
  const by = ty + 40
  body += `<rect x="12" y="${by}" width="${n(inner)}" height="64" fill="${LEVEL_FILL[Math.max(0, rank)]}" stroke="${INK}"/>`
  body += text(22, by + 24, `Trigger level: ${level.level.toUpperCase()}`, {
    size: 15,
    weight: 700,
  })
  wrap(
    `${level.response}${r.singleParameter ? ' (A single parameter at the maximum raised the level.)' : ''}`,
    Math.floor(inner / 7),
    2,
  ).forEach((ln, k) => (body += text(22, by + 44 + k * 15, ln, { size: 13 })))
  const missing = r.missing.length ? ` Not recorded: ${r.missing.join(', ')}.` : ''
  const foot = wrap(`Source: ${config.source}.${missing}`, Math.floor(inner / 6), 3)
  foot.forEach((ln, k) => (body += text(12, by + 84 + k * 14, ln, { size: 11, fill: MUTED })))
  const height = by + 84 + foot.length * 14 + 8

  const summary =
    `${d.title ?? config.name}${d.time ? ` at ${d.time}` : ''}: total score ${r.total}, trigger level ${level.level}. ${level.response} ` +
    r.lines
      .map((l) => `${l.label} ${l.value}${l.unit ? ' ' + l.unit : ''} scores ${l.points}`)
      .join('; ') +
    `.${missing} Source: ${config.source}.`
  return {
    svg: frame({
      width: o.width,
      height,
      title: d.title ?? config.name,
      summary,
      body,
      idKey: JSON.stringify(d),
    }),
    summary,
    table: {
      caption: `${config.name}${d.time ? `, ${d.time}` : ''}`,
      columns: ['Parameter', 'Value', 'Band', 'Points'],
      rows: [
        ...r.lines.map((l) => [
          l.label,
          `${l.value}${l.unit ? ' ' + l.unit : ''}`,
          l.band,
          String(l.points),
        ]),
        ['Total', '', `Trigger level: ${level.level}`, String(r.total)],
      ],
    },
  }
}

export const earlyWarningScoreKind: FigureKind<EarlyWarningScoreData> = {
  kind: 'early_warning_score',
  schema: EarlyWarningScoreData,
  render,
  defaultHeight: 420,
}
