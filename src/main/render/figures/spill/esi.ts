// esi_excerpt (spec 0455 FR-5, #762): an excerpt of the shoreline classes and resources at risk
// for an area, with the resources numbered in protection-priority order on the map and listed in
// a table, the way an ICS 232 reads. The shoreline is drawn by ESI class (weight and dash rise
// with sensitivity). Drawn from data, labeled with its source, never an AI image.
import { z } from 'zod'
import { INK, MUTED } from '../theme'
import { fmt, frame, hashId, heading, n, text } from '../svg'
import type { FigureKind, FigureResult, FigureTable } from '../types'
import {
  HALO,
  esiLegend,
  esiRank,
  fit,
  mapBackground,
  mapFurniture,
  shorelineSvg,
  type Pt,
} from './map-frame'

const Lon = z.number().finite().min(-180).max(180)
const Lat = z.number().finite().min(-90).max(90)
const Position = z.tuple([Lon, Lat])

export const EsiExcerptData = z.object({
  title: z.string().max(200).optional(),
  source: z.string().min(1).max(160).default('NOAA Environmental Sensitivity Index'),
  shorelines: z
    .array(
      z.object({
        esi: z.string().max(12),
        /** The shore type in words ("Salt- and brackish-water marshes"). */
        shoretype: z.string().max(120).optional(),
        points: z.array(Position).min(2).max(1000),
      }),
    )
    .min(1)
    .max(2000),
  /** Resources at risk, in priority order (the first is protected first). */
  resources: z
    .array(
      z.object({
        name: z.string().min(1).max(80),
        kind: z.string().max(40).default('Resource'),
        lon: Lon,
        lat: Lat,
        note: z.string().max(120).default(''),
      }),
    )
    .max(12)
    .default([]),
})
export type EsiExcerptData = z.infer<typeof EsiExcerptData>

function classes(d: EsiExcerptData): { esi: string; type: string; segments: number }[] {
  const by = new Map<string, { esi: string; type: string; count: number }>()
  for (const s of d.shorelines) {
    const k = s.esi.trim()
    const e = by.get(k) ?? { esi: k, type: s.shoretype ?? '', count: 0 }
    e.count += 1
    if (!e.type && s.shoretype) e.type = s.shoretype
    by.set(k, e)
  }
  return [...by.values()]
    .sort((a, b) => esiRank(b.esi) - esiRank(a.esi) || a.esi.localeCompare(b.esi))
    .map((e) => ({ esi: e.esi, type: e.type, segments: e.count }))
}

function summarize(d: EsiExcerptData): string {
  const cls = classes(d)
  const most = cls[0]
  const parts = [
    `${d.title ?? 'ESI map excerpt and resources at risk'}: map of ${d.shorelines.length} shoreline segments by ESI class, with ${d.resources.length} resources at risk numbered in priority order.`,
    `${d.source}. Cropped to the area shown.`,
    `Shoreline classes present, most sensitive first: ${cls.map((c) => `${c.esi}${c.type ? ` ${c.type.toLowerCase()}` : ''} (${c.segments} segments)`).join('; ')}.`,
  ]
  if (most) parts.push(`The most sensitive class shown is ESI ${most.esi}.`)
  d.resources.forEach((r, i) =>
    parts.push(
      `Priority ${i + 1}: ${r.name} (${r.kind.toLowerCase()})${r.note ? `, ${r.note}` : ''}.`,
    ),
  )
  return parts.join(' ')
}

function tableOf(d: EsiExcerptData): FigureTable {
  return {
    caption: d.title ?? 'Resources at risk',
    columns: ['Priority', 'Resource at risk', 'Kind', 'Location', 'Notes'],
    rows: d.resources.map((r, i) => [
      String(i + 1),
      r.name,
      r.kind,
      `${fmt(r.lat)} N, ${fmt(Math.abs(r.lon))} ${r.lon < 0 ? 'W' : 'E'}`,
      r.note,
    ]),
  }
}

function render(d: EsiExcerptData, o: { width: number; height: number }): FigureResult {
  const summary = summarize(d)
  const top = d.title ? 34 : 10
  const rect = { x: 36, y: top, w: o.width - 60, h: o.height - top - 34 }
  const pts: Pt[] = [
    ...d.shorelines.flatMap((s) => s.points),
    ...d.resources.map((r): Pt => [r.lon, r.lat]),
  ]
  const proj = fit(pts, rect, 0.06)
  const clipId = `c${hashId(JSON.stringify(d))}`
  const defs = `<clipPath id="${clipId}"><rect x="${n(rect.x)}" y="${n(rect.y)}" width="${n(rect.w)}" height="${n(rect.h)}"/></clipPath>`
  let body = heading(d.title, 36) + mapBackground(rect, proj)
  const shore = shorelineSvg(
    d.shorelines.map((s) => ({ esi: s.esi, points: s.points })),
    proj,
  )
  body += `<g clip-path="url(#${clipId})">${shore.svg}</g>`
  d.resources.forEach((r, i) => {
    const x = proj.x(r.lon)
    const y = proj.y(r.lat)
    body += `<circle cx="${n(x)}" cy="${n(y)}" r="11" fill="#ffffff" stroke="${INK}" stroke-width="2.5"/>`
    body += text(x, y + 4, String(i + 1), { size: 12, weight: 700, anchor: 'middle' })
    body += text(x + 15, y + 4, r.name, { size: 12, weight: 600, extra: HALO })
  })
  body += mapFurniture(proj, rect)
  const el = esiLegend(shore.groups, rect.x + 14, rect.y + 24)
  if (el.height)
    body += `<rect x="${n(rect.x + 6)}" y="${n(rect.y + 6)}" width="236" height="${n(el.height + 22)}" fill="#ffffff" fill-opacity="0.9"/>${el.svg}`
  body += text(o.width - 24, o.height - 10, d.source, {
    size: 11,
    anchor: 'end',
    fill: MUTED,
    weight: 600,
  })
  body += text(36, o.height - 10, 'Numbers are protection priorities; see the table.', {
    size: 11,
    fill: MUTED,
  })
  return {
    svg: frame({
      width: o.width,
      height: o.height,
      title: d.title ?? 'ESI map excerpt and resources at risk',
      summary,
      defs,
      body,
      idKey: JSON.stringify(d),
    }),
    summary,
    table: tableOf(d),
  }
}

export const esiExcerptKind: FigureKind<EsiExcerptData> = {
  kind: 'esi_excerpt',
  schema: EsiExcerptData,
  render,
  defaultHeight: 480,
}
