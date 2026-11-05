// epi_spot_map: a spot map of cases (spec 0457 FR-5). A schematic plot of longitude and latitude
// with no basemap, so nothing on it can be mistaken for a real place: points differ by shape
// as well as color, sites (the venue, the school) are numbered diamonds keyed under the chart,
// and every map says its positions are simulated. A real basemap view is the maps feature.
import { z } from 'zod'
import { AXIS, GRID, INK, MUTED, seriesStyle } from '../theme'
import { frame, heading, legend, marker, n, text, wrap } from '../svg'
import type { FigureKind, FigureResult } from '../types'

const Status = z.enum(['confirmed', 'probable', 'suspect'])
const STATUSES = ['confirmed', 'probable', 'suspect'] as const
const SHAPE = { confirmed: 'circle', probable: 'triangle', suspect: 'cross' } as const
const STYLE = { confirmed: seriesStyle(0), probable: seriesStyle(2), suspect: seriesStyle(4) }

export const EpiSpotMapData = z.object({
  title: z.string().max(200).optional(),
  points: z
    .array(
      z.object({
        lon: z.number().min(-180).max(180),
        lat: z.number().min(-90).max(90),
        status: Status.default('confirmed'),
        label: z.string().max(60).optional(),
      }),
    )
    .min(1)
    .max(2000),
  sites: z
    .array(
      z.object({
        lon: z.number().min(-180).max(180),
        lat: z.number().min(-90).max(90),
        label: z.string().min(1).max(80),
      }),
    )
    .max(8)
    .default([]),
  simulated: z.boolean().default(true),
})
export type EpiSpotMapData = z.infer<typeof EpiSpotMapData>

const M = { left: 62, right: 24, bottom: 46 }

function render(d: EpiSpotMapData, o: { width: number; height: number }): FigureResult {
  const all = [...d.points, ...d.sites]
  const meanLat = all.reduce((s, p) => s + p.lat, 0) / all.length
  const kx = Math.cos((meanLat * Math.PI) / 180)
  const xs = all.map((p) => p.lon * kx)
  const ys = all.map((p) => p.lat)
  const padFrac = 0.08
  const spanX = Math.max(1e-4, Math.max(...xs) - Math.min(...xs))
  const spanY = Math.max(1e-4, Math.max(...ys) - Math.min(...ys))
  const x0 = Math.min(...xs) - spanX * padFrac
  const y0 = Math.min(...ys) - spanY * padFrac
  const w = spanX * (1 + 2 * padFrac)
  const h = spanY * (1 + 2 * padFrac)
  const lg = legend(
    STATUSES.map((s) => ({
      name: `${s[0]!.toUpperCase()}${s.slice(1)} (${d.points.filter((p) => p.status === s).length})`,
      swatch: (x: number, y: number) => marker(SHAPE[s], x + 13, y, STYLE[s].color),
    })),
    M.left,
    d.title ? 42 : 14,
    o.width - M.right,
  )
  const top = (d.title ? 42 : 14) + lg.height + 6
  const keyLines = d.sites.map((s, i) => wrap(`${i + 1}. ${s.label}`, 80, 2))
  const keyH = keyLines.reduce((s, l) => s + l.length * 15, 0)
  const height = o.height + keyH
  const plotW = o.width - M.left - M.right
  const plotH = o.height - top - M.bottom
  // One scale for both axes so distances are not stretched.
  const scale = Math.min(plotW / w, plotH / h)
  const offX = M.left + (plotW - w * scale) / 2
  const offY = top + (plotH - h * scale) / 2
  const px = (lon: number): number => offX + (lon * kx - x0) * scale
  const py = (lat: number): number => offY + (h - (lat - y0)) * scale
  let body = heading(d.title, M.left) + lg.svg
  body += `<rect x="${n(M.left)}" y="${n(top)}" width="${n(plotW)}" height="${n(plotH)}" fill="#ffffff" stroke="${AXIS}" stroke-width="1.2"/>`
  for (let i = 1; i < 4; i++) {
    const gx = M.left + (plotW * i) / 4
    const gy = top + (plotH * i) / 4
    body += `<line x1="${n(gx)}" x2="${n(gx)}" y1="${n(top)}" y2="${n(top + plotH)}" stroke="${GRID}" stroke-dasharray="3 4"/>`
    body += `<line x1="${n(M.left)}" x2="${n(M.left + plotW)}" y1="${n(gy)}" y2="${n(gy)}" stroke="${GRID}" stroke-dasharray="3 4"/>`
  }
  const lonAt = (xPx: number): number => ((xPx - offX) / scale + x0) / kx
  const latAt = (yPx: number): number => y0 + h - (yPx - offY) / scale
  for (const i of [0, 2, 4]) {
    body += text(
      M.left + (plotW * i) / 4,
      top + plotH + 16,
      `${lonAt(M.left + (plotW * i) / 4).toFixed(3)}°`,
      { size: 10.5, anchor: i === 0 ? 'start' : i === 4 ? 'end' : 'middle', fill: MUTED },
    )
    body += text(
      M.left - 6,
      top + (plotH * i) / 4 + 4,
      `${latAt(top + (plotH * i) / 4).toFixed(3)}°`,
      { size: 10.5, anchor: 'end', fill: MUTED },
    )
  }
  for (const s of STATUSES)
    for (const p of d.points.filter((q) => q.status === s))
      body += marker(SHAPE[s], px(p.lon), py(p.lat), STYLE[s].color)
  d.sites.forEach((s, i) => {
    const x = px(s.lon)
    const y = py(s.lat)
    body += `<path d="M${n(x)} ${n(y - 11)}L${n(x + 11)} ${n(y)}L${n(x)} ${n(y + 11)}L${n(x - 11)} ${n(y)}Z" fill="#ffffff" stroke="${INK}" stroke-width="2"/>`
    body += text(x, y + 4, String(i + 1), { size: 11, weight: 700, anchor: 'middle' })
  })
  body += text(
    M.left + plotW / 2,
    top + plotH + 34,
    d.simulated ? 'Schematic, no basemap. Positions are simulated.' : 'Schematic, no basemap.',
    { size: 11, anchor: 'middle', fill: MUTED },
  )
  let ky = o.height - 4
  keyLines.forEach((lines) =>
    lines.forEach((ln) => {
      ky += 15
      body += text(M.left, ky, ln, { size: 11.5 })
    }),
  )
  const tally = Object.fromEntries(
    STATUSES.map((s) => [s, d.points.filter((p) => p.status === s).length]),
  )
  const summary =
    `${d.title ?? 'Spot map of cases'}: schematic spot map of ${d.points.length} cases ` +
    `(${tally.confirmed} confirmed, ${tally.probable} probable, ${tally.suspect} suspect)` +
    (d.sites.length
      ? ` and ${d.sites.length} sites: ${d.sites.map((s, i) => `${i + 1}, ${s.label}`).join('; ')}`
      : '') +
    `. Latitude ${Math.min(...d.points.map((p) => p.lat)).toFixed(3)} to ${Math.max(...d.points.map((p) => p.lat)).toFixed(3)}, ` +
    `longitude ${Math.min(...d.points.map((p) => p.lon)).toFixed(3)} to ${Math.max(...d.points.map((p) => p.lon)).toFixed(3)}.` +
    (d.simulated ? ' Positions are simulated.' : '')
  return {
    svg: frame({
      width: o.width,
      height,
      title: d.title ?? 'Spot map of cases',
      summary,
      body,
      idKey: JSON.stringify(d),
    }),
    summary,
    table: {
      caption: d.title,
      columns: ['Kind', 'Label', 'Status', 'Latitude', 'Longitude'],
      rows: [
        ...d.sites.map((s, i) => [
          'Site',
          `${i + 1}. ${s.label}`,
          '',
          s.lat.toFixed(4),
          s.lon.toFixed(4),
        ]),
        ...d.points.map((p, i) => [
          'Case',
          p.label ?? `Case ${i + 1}`,
          p.status,
          p.lat.toFixed(4),
          p.lon.toFixed(4),
        ]),
      ],
    },
  }
}

export const epiSpotMapKind: FigureKind<EpiSpotMapData> = {
  kind: 'epi_spot_map',
  schema: EpiSpotMapData,
  render,
}
