// humanitarian_3w_matrix and humanitarian_3w_map (spec 0469 FR-8): who does what where. The
// matrix lists partners by sector and admin area; the map shades admin areas by how many
// partners report. A cell or area with no report is drawn with a hatch and the words "no report":
// it is a gap or a reporting failure, not proof of no work, and the summary says so.
import { z } from 'zod'
import { GeoRing, label, makeProjection, mapChrome, mapKey, polyline } from '../geo/project'
import { INK, MUTED, seriesStyle } from '../theme'
import { frame, hashId, heading, n, patternDef, text, textWidth, wrap } from '../svg'
import type { FigureKind, FigureResult } from '../types'

const Name = z.string().min(1).max(60)
const NOTE = 'A blank is a gap or a reporting failure, not proof of no work.'

// ---- matrix ----------------------------------------------------------------------------------

export const ThreeWMatrixData = z
  .object({
    title: z.string().max(200).optional(),
    asOf: z.string().max(60).optional(),
    sectors: z.array(Name).min(1).max(8),
    areas: z.array(Name).min(1).max(16),
    cells: z
      .array(z.object({ sector: Name, area: Name, partners: z.array(Name).min(1).max(12) }))
      .max(128),
    simulated: z.boolean().default(true),
  })
  .refine((d) => d.cells.every((c) => d.sectors.includes(c.sector) && d.areas.includes(c.area)), {
    message: 'every cell needs a listed sector and admin area',
  })
export type ThreeWMatrixData = z.infer<typeof ThreeWMatrixData>

const ROW_LABEL = 132
const ROW_H = 40
const HEAD_H = 44

function renderMatrix(d: ThreeWMatrixData, o: { width: number; height: number }): FigureResult {
  const top = d.title ? 34 : 8
  const colW = (o.width - ROW_LABEL - 12) / d.sectors.length
  const height = top + HEAD_H + d.areas.length * ROW_H + 12
  const gapStyle = seriesStyle(1)
  const id = hashId(JSON.stringify(d))
  const defs = patternDef(`g${id}`, gapStyle)
  const partners = (s: string, a: string): string[] =>
    d.cells.find((c) => c.sector === s && c.area === a)?.partners ?? []
  let body = heading(d.title, 8)
  d.sectors.forEach((s, ci) => {
    const x = ROW_LABEL + ci * colW
    wrap(s, Math.max(6, Math.floor(colW / 6.4)), 2).forEach((ln, i) => {
      body += text(x + colW / 2, top + 16 + i * 14, ln, { size: 12, weight: 700, anchor: 'middle' })
    })
  })
  const gaps: string[] = []
  d.areas.forEach((a, ri) => {
    const y = top + HEAD_H + ri * ROW_H
    body += text(8, y + ROW_H / 2 + 4, a, { size: 12, weight: 600 })
    d.sectors.forEach((s, ci) => {
      const x = ROW_LABEL + ci * colW
      const p = partners(s, a)
      if (!p.length) {
        gaps.push(`${a}, ${s}`)
        body += `<rect x="${n(x)}" y="${n(y)}" width="${n(colW)}" height="${ROW_H}" fill="url(#g${id})" fill-opacity="0.35" stroke="${INK}" stroke-width="1"/>`
        body += `<rect x="${n(x + colW / 2 - 34)}" y="${n(y + ROW_H / 2 - 9)}" width="68" height="18" rx="3" fill="#ffffff"/>`
        body += text(x + colW / 2, y + ROW_H / 2 + 4, 'no report', {
          size: 11,
          weight: 700,
          anchor: 'middle',
        })
      } else {
        body += `<rect x="${n(x)}" y="${n(y)}" width="${n(colW)}" height="${ROW_H}" fill="#ffffff" stroke="${INK}" stroke-width="1"/>`
        body += text(x + 6, y + 16, `${p.length} partner${p.length === 1 ? '' : 's'}`, {
          size: 12,
          weight: 700,
        })
        const names = wrap(p.join(', '), Math.max(8, Math.floor((colW - 10) / 5.6)), 1)[0] ?? ''
        body += text(x + 6, y + 31, names, { size: 10.5, fill: MUTED })
      }
    })
  })
  const total = d.areas.length * d.sectors.length
  const summary =
    `${d.title ?? '3W matrix'}${d.asOf ? ` as of ${d.asOf}` : ''}: ${d.areas.length} admin areas by ${d.sectors.length} sectors. ` +
    `${total - gaps.length} of ${total} cells have at least one partner reporting. ` +
    (gaps.length ? `No report: ${gaps.join('; ')}. ${NOTE}` : 'Every cell has a report.') +
    (d.simulated ? ' Simulated 3W data.' : '')
  return {
    svg: frame({
      width: o.width,
      height,
      title: d.title ?? '3W matrix',
      summary,
      defs,
      body,
      idKey: id,
    }),
    summary,
    table: {
      caption: d.title ?? '3W matrix',
      columns: ['Admin area', ...d.sectors],
      rows: d.areas.map((a) => [
        a,
        ...d.sectors.map((s) => partners(s, a).join(', ') || 'no report'),
      ]),
    },
  }
}

export const threeWMatrixKind: FigureKind<ThreeWMatrixData> = {
  kind: 'humanitarian_3w_matrix',
  schema: ThreeWMatrixData,
  render: renderMatrix,
  defaultHeight: 300,
}

// ---- map -------------------------------------------------------------------------------------

export const ThreeWMapData = z.object({
  title: z.string().max(200).optional(),
  sector: z.string().max(60).optional(),
  areas: z
    .array(z.object({ name: Name, ring: GeoRing, partners: z.number().int().min(0).max(200) }))
    .min(1)
    .max(30),
  simulated: z.boolean().default(true),
})
export type ThreeWMapData = z.infer<typeof ThreeWMapData>

const klass = (p: number): 0 | 1 | 2 => (p === 0 ? 0 : p === 1 ? 1 : 2)
const KLASS_NAME = ['No report', 'One partner', 'Two or more partners'] as const

function renderMap(d: ThreeWMapData, o: { width: number; height: number }): FigureResult {
  const id = hashId(JSON.stringify(d))
  const styles = [seriesStyle(1), seriesStyle(2), seriesStyle(0)]
  const defs = styles.map((s, i) => patternDef(`m${id}${i}`, s)).join('')
  const keyItems = KLASS_NAME.map((name, i) => ({
    name,
    swatch: (x: number, y: number) =>
      `<rect x="${n(x)}" y="${n(y - 8)}" width="22" height="16" fill="url(#m${id}${i})" fill-opacity="0.6" stroke="${INK}"/>`,
  }))
  const keyH = mapKey(keyItems, 12, 0, o.width - 12).height
  const top = d.title ? 34 : 8
  const plot = { x: 8, y: top, w: o.width - 16, h: o.height - top - keyH - 10 }
  const proj = makeProjection(
    d.areas.flatMap((a) => a.ring),
    plot,
  )
  let body = heading(d.title, 8) + mapChrome(proj, plot)
  for (const a of d.areas) {
    const k = klass(a.partners)
    body += polyline(
      proj,
      a.ring,
      `fill="url(#m${id}${k})" fill-opacity="0.55" stroke="${styles[k]!.color}" stroke-width="2"`,
      true,
    )
    const [cx, cy] = proj.px({
      lon: a.ring.reduce((s, p) => s + p.lon, 0) / a.ring.length,
      lat: a.ring.reduce((s, p) => s + p.lat, 0) / a.ring.length,
    })
    body += label(cx - textWidth(a.name, 11) / 2, cy, a.name)
    body += label(cx - 20, cy + 14, a.partners === 0 ? 'no report' : `${a.partners} reporting`)
  }
  body += mapKey(keyItems, 12, plot.y + plot.h + 22, o.width - 12).svg
  const none = d.areas.filter((a) => a.partners === 0).map((a) => a.name)
  const summary =
    `${d.title ?? '3W map'}${d.sector ? ` (${d.sector})` : ''}: ${d.areas.length} admin areas shaded by partners reporting. ` +
    d.areas.map((a) => `${a.name} ${a.partners}`).join('; ') +
    '. ' +
    (none.length ? `No report: ${none.join(', ')}. ${NOTE}` : 'Every area has a report.') +
    (d.simulated ? ' Simulated 3W data.' : '')
  return {
    svg: frame({ ...o, title: d.title ?? '3W map', summary, defs, body, idKey: id }),
    summary,
    table: {
      caption: d.title ?? '3W map',
      columns: ['Admin area', 'Partners reporting', 'Coverage'],
      rows: d.areas.map((a) => [a.name, String(a.partners), KLASS_NAME[klass(a.partners)]!]),
    },
  }
}

export const threeWMapKind: FigureKind<ThreeWMapData> = {
  kind: 'humanitarian_3w_map',
  schema: ThreeWMapData,
  render: renderMap,
  defaultHeight: 420,
}
