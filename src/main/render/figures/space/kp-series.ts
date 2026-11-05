// space_kp_series: planetary Kp as three-hour bars colored by G level, with the level words on
// the right axis and on each bar at G1 and above (spec 0468 FR-5). Predicted values are drawn
// lighter with a dashed outline and called predicted in the legend and the table.
import { scaleLinear } from 'd3-scale'
import { z } from 'zod'
import { makeXAxis } from '../axis'
import { frame, hashId, heading, legend, n, patternDef, text } from '../svg'
import { AXIS, INK, MUTED } from '../theme'
import type { FigureKind, FigureResult } from '../types'
import {
  IsoTime,
  Title,
  bottomAxis,
  gLevelOfKp,
  hashKey,
  kpLabel,
  leftTicks,
  levelStyle,
  levelText,
  LEVEL_WORDS,
  simulatedStamp,
  thin,
  utcShort,
} from './common'

export const KpSeriesData = z.object({
  title: Title,
  points: z
    .array(
      z.object({
        time: IsoTime,
        kp: z.number().finite().min(0).max(9),
        status: z.enum(['observed', 'estimated', 'predicted']).default('observed'),
      }),
    )
    .min(1)
    .max(400),
  /** Length of one Kp interval in hours, to size the bars. */
  periodHours: z.number().positive().max(24).default(3),
  simulated: z.boolean().default(false),
})
export type KpSeriesData = z.infer<typeof KpSeriesData>

const M = { left: 54, right: 118, bottom: 54 }

function render(d: KpSeriesData, o: { width: number; height: number }): FigureResult {
  const pts = [...d.points].sort((a, b) => Date.parse(a.time) - Date.parse(b.time))
  const top = d.title ? 44 : 22
  const plotB = o.height - M.bottom - 24
  const plotR = o.width - M.right
  const periodMs = d.periodHours * 3_600_000
  const endIso = new Date(Date.parse(pts.at(-1)!.time) + periodMs).toISOString()
  const x = makeXAxis([...pts.map((p) => p.time), endIso], M.left, plotR)
  const y = scaleLinear().domain([0, 9]).range([plotB, top])
  const barW = Math.max(
    2,
    x.position(endIso) - x.position(new Date(Date.parse(endIso) - periodMs).toISOString()) - 2,
  )
  const pid = `kp-${hashId(hashKey(d))}`

  let defs = ''
  for (let l = 0; l <= 5; l++) defs += patternDef(`${pid}-${l}`, levelStyle(l))
  let body = heading(d.title, M.left)
  body += leftTicks(
    Array.from({ length: 10 }, (_, k) => ({ y: y(k), label: String(k) })),
    M.left,
    plotR,
  )
  body += text(14, (top + plotB) / 2, 'Kp', {
    size: 12,
    fill: MUTED,
    extra: `transform="rotate(-90 14 ${n((top + plotB) / 2)})"`,
  })
  for (let g = 1; g <= 5; g++) {
    const yy = y(g + 4)
    body += `<line x1="${M.left}" x2="${n(plotR)}" y1="${n(yy)}" y2="${n(yy)}" stroke="${levelStyle(g).color}" stroke-dasharray="5 4"/>`
    body += text(plotR + 8, yy + 4, `G${g} ${LEVEL_WORDS[g]}`, {
      size: 11,
      weight: 700,
      fill: levelStyle(g).color,
    })
  }
  for (const p of pts) {
    const level = gLevelOfKp(p.kp)
    const left = x.position(p.time)
    const h = y(0) - y(p.kp)
    const predicted = p.status === 'predicted'
    body += `<rect x="${n(left + 1)}" y="${n(y(p.kp))}" width="${n(barW)}" height="${n(h)}" fill="url(#${pid}-${level})"${predicted ? ` fill-opacity="0.55" stroke="${levelStyle(level).color}" stroke-width="1.5" stroke-dasharray="4 3"` : ''}/>`
    if (level > 0 && barW >= 16)
      body += text(left + 1 + barW / 2, y(p.kp) - 4, `G${level}`, {
        size: 11,
        weight: 700,
        anchor: 'middle',
        fill: levelStyle(level).color,
      })
  }
  body += `<line x1="${M.left}" x2="${n(plotR)}" y1="${n(y(0))}" y2="${n(y(0))}" stroke="${AXIS}" stroke-width="1.5"/>`
  body += bottomAxis(x, M.left, plotR, plotB)
  const lg = legend(
    [
      ...[0, 1, 2, 3, 4, 5].map((l) => ({
        name: l === 0 ? 'below G1' : `G${l}`,
        swatch: (sx: number, sy: number) =>
          `<rect x="${n(sx)}" y="${n(sy - 6)}" width="28" height="12" fill="url(#${pid}-${l})"/>`,
      })),
      {
        name: 'predicted (dashed outline)',
        swatch: (sx: number, sy: number) =>
          `<rect x="${n(sx)}" y="${n(sy - 6)}" width="28" height="12" fill="#ffffff" stroke="${INK}" stroke-dasharray="4 3"/>`,
      },
    ],
    M.left,
    o.height - 18,
    o.width - 10,
  )
  body += lg.svg
  if (d.simulated) body += simulatedStamp(o.width - 10, 20)

  const peak = pts.reduce((a, b) => (b.kp > a.kp ? b : a))
  const peakLevel = gLevelOfKp(peak.kp)
  const atG1 = pts.filter((p) => gLevelOfKp(p.kp) >= 1).length
  const predicted = pts.filter((p) => p.status === 'predicted').length
  const summary =
    `${d.title ?? 'Planetary Kp'}${d.simulated ? ' (simulated)' : ''}: ${pts.length} periods of ${d.periodHours} hours from ${utcShort(pts[0]!.time)} to ${utcShort(pts.at(-1)!.time)}. ` +
    `Peak Kp ${kpLabel(peak.kp)} at ${utcShort(peak.time)}, ${levelText('G', peakLevel)}. ` +
    `${atG1} ${atG1 === 1 ? 'period is' : 'periods are'} at G1 or above` +
    (predicted ? `; ${predicted} ${predicted === 1 ? 'is' : 'are'} predicted.` : '.')
  return {
    svg: frame({
      width: o.width,
      height: o.height,
      title: d.title ?? 'Planetary Kp',
      summary,
      defs,
      body,
      idKey: hashKey(d),
    }),
    summary,
    table: {
      caption: d.title ?? 'Planetary Kp by period',
      columns: ['Period start', 'Kp', 'G level', 'Status'],
      rows: thin(pts, 60).map((p) => [
        utcShort(p.time),
        kpLabel(p.kp),
        levelText('G', gLevelOfKp(p.kp)),
        p.status,
      ]),
    },
  }
}

export const kpSeriesKind: FigureKind<KpSeriesData> = {
  kind: 'space_kp_series',
  schema: KpSeriesData,
  render,
  defaultHeight: 400,
}
