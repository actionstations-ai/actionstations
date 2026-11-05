// Earth science map figures (spec 0450 FR-8): ShakeMap intensity, "Did You Feel It?", epicenter
// and aftershocks, volcanic ash advisory, lahar travel time, tsunami travel time, inundation
// zones and the debris-flow hazard map. Each is a schematic map (project.ts) drawn from data.
// Colors never stand alone: intensities carry Roman numerals, areas carry fill patterns and
// names, every figure writes a summary and a data table.
import { z } from 'zod'
import { INK, SURFACE, seriesStyle, type SeriesStyle } from '../theme'
import { frame, heading, hashId, marker, n, patternDef, text } from '../svg'
import type { FigureKind, FigureResult, FigureTable } from '../types'
import {
  GeoLine,
  GeoPoint,
  GeoRing,
  NamedPlace,
  circleKm,
  coord,
  distanceKm,
  label,
  makeProjection,
  mapChrome,
  mapKey,
  polyline,
  round1,
  type KeyItem,
  type Plot,
  type Projection,
} from './project'

const Title = z.string().max(200).optional()
const Name = z.string().min(1).max(80)

// ---- intensity scale ------------------------------------------------------------------------

export const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'] as const
const MMI_COLORS = [
  '#ffffff',
  '#d4ddff',
  '#bfccff',
  '#a0e6ff',
  '#80ffff',
  '#7aff93',
  '#ffff00',
  '#ffc800',
  '#ff9100',
  '#ff5a4a',
]
const MMI_WORDS = [
  'Not felt',
  'Weak',
  'Weak',
  'Light',
  'Moderate',
  'Strong',
  'Very strong',
  'Severe',
  'Violent',
  'Extreme',
]
const mmiIndex = (v: number): number => Math.min(10, Math.max(1, Math.round(v))) - 1
export const mmiRoman = (v: number): string => ROMAN[mmiIndex(v)]!

const mmiKey = (): KeyItem[] =>
  ROMAN.map((r, i) => ({
    name: `${r} ${MMI_WORDS[i]}`,
    swatch: (x, y) =>
      `<rect x="${n(x)}" y="${n(y - 8)}" width="22" height="16" fill="${MMI_COLORS[i]}" stroke="${INK}"/>` +
      text(x + 11, y + 4, r, { size: 9, weight: 700, anchor: 'middle' }),
  }))

// ---- layout ---------------------------------------------------------------------------------

interface MapJob {
  title: string | undefined
  width: number
  height: number
  points: GeoPoint[]
  /** Layers drawn inside the map; gets the projection and the defs-id prefix. */
  draw: (proj: Projection, id: string) => string
  defs?: (id: string) => string
  key: KeyItem[]
  summary: string
  table: FigureTable
  idKey: string
}

function renderMap(j: MapJob): FigureResult {
  const id = hashId(j.idKey)
  const top = j.title ? 34 : 10
  const key = mapKey(j.key, 14, 0, j.width - 14)
  const plot: Plot = { x: 10, y: top, w: j.width - 20, h: j.height - top - key.height - 14 }
  const proj = makeProjection(j.points, plot)
  const keyY = plot.y + plot.h + 16
  const keyShifted = mapKey(j.key, 14, keyY, j.width - 14)
  const clip = `<clipPath id="c${id}"><rect x="${n(plot.x)}" y="${n(plot.y)}" width="${n(plot.w)}" height="${n(plot.h)}"/></clipPath>`
  const body =
    heading(j.title, 14) +
    mapChrome(proj, plot) +
    `<g clip-path="url(#c${id})">${j.draw(proj, id)}</g>` +
    keyShifted.svg
  return {
    svg: frame({
      width: j.width,
      height: j.height,
      title: j.title ?? 'Map',
      summary: j.summary,
      defs: clip + (j.defs?.(id) ?? ''),
      body,
      idKey: j.idKey,
    }),
    summary: j.summary,
    table: j.table,
  }
}

const places = <P extends NamedPlace>(
  proj: Projection,
  list: P[],
  valueOf?: (p: P) => string,
): string =>
  list
    .map((p) => {
      const [x, y] = proj.px(p)
      return (
        `<rect x="${n(x - 3.5)}" y="${n(y - 3.5)}" width="7" height="7" fill="${INK}" stroke="${SURFACE}"/>` +
        (x > proj.plot.x + proj.plot.w - 150
          ? label(x - 7, y + 4, valueOf ? `${p.name} ${valueOf(p)}` : p.name, { anchor: 'end' })
          : label(x + 7, y + 4, valueOf ? `${p.name} ${valueOf(p)}` : p.name))
      )
    })
    .join('')

const lines = (proj: Projection, list: GeoLine[], attrs: string): string =>
  list.map((l) => polyline(proj, l.points, attrs)).join('')

const star = (x: number, y: number, r = 9): string => {
  const pts = Array.from({ length: 10 }, (_, i) => {
    const a = (Math.PI / 5) * i - Math.PI / 2
    const rr = i % 2 ? r * 0.45 : r
    return `${n(x + rr * Math.cos(a))},${n(y + rr * Math.sin(a))}`
  }).join(' ')
  return `<polygon points="${pts}" fill="#14100c" stroke="${SURFACE}" stroke-width="1.5"/>`
}

const FAULT = `fill="none" stroke="#8a4b00" stroke-width="2" stroke-dasharray="10 3 2 3"`
const FAULT_KEY: KeyItem = {
  name: 'Fault trace',
  swatch: (x, y) =>
    `<line x1="${n(x)}" y1="${n(y)}" x2="${n(x + 22)}" y2="${n(y)}" stroke="#8a4b00" stroke-width="2" stroke-dasharray="10 3 2 3"/>`,
}
const ROAD = `fill="none" stroke="#3b3b3b" stroke-width="2"`

// ---- shakemap_intensity ---------------------------------------------------------------------

export const ShakemapData = z
  .object({
    title: Title,
    scenario: z.string().max(120).optional(),
    epicenter: GeoPoint.extend({ label: z.string().max(80).optional() }).optional(),
    grid: z.object({
      west: z.number().finite(),
      south: z.number().finite(),
      east: z.number().finite(),
      north: z.number().finite(),
      cols: z.number().int().min(2).max(200),
      rows: z.number().int().min(2).max(200),
      /** Row-major from the north row, one intensity (1 to 10) per cell. */
      values: z.array(z.number().finite().min(0).max(10)).max(40000),
    }),
    places: z
      .array(NamedPlace.extend({ mmi: z.number().finite().min(1).max(10) }))
      .max(30)
      .default([]),
    faults: z.array(GeoLine).max(20).default([]),
  })
  .refine((d) => d.grid.values.length === d.grid.cols * d.grid.rows, {
    message: 'grid.values must hold cols x rows values',
    path: ['grid', 'values'],
  })
  .refine((d) => d.grid.east > d.grid.west && d.grid.north > d.grid.south, {
    message: 'grid east and north must exceed west and south',
    path: ['grid'],
  })
type ShakemapData = z.infer<typeof ShakemapData>

function shakemap(d: ShakemapData, o: { width: number; height: number }): FigureResult {
  const g = d.grid
  const counts = new Array<number>(10).fill(0)
  for (const v of g.values) counts[mmiIndex(v)]!++
  const max = Math.max(...g.values)
  const rows: string[][] = ROMAN.map((r, i) => [
    `${r} ${MMI_WORDS[i]}`,
    String(counts[i]),
    `${Math.round((100 * counts[i]!) / g.values.length)}%`,
  ])
  for (const p of d.places) rows.push([`${p.name}`, mmiRoman(p.mmi), ''])
  const where = d.epicenter ? ` Epicenter ${d.epicenter.label ?? ''} at ${coord(d.epicenter)}.` : ''
  const placeText = d.places.length
    ? ` Places: ${d.places.map((p) => `${p.name} ${mmiRoman(p.mmi)}`).join(', ')}.`
    : ''
  const summary =
    `${d.title ?? 'ShakeMap'}: map of estimated shaking intensity (Modified Mercalli) on a ${g.cols} by ${g.rows} grid` +
    `${d.scenario ? `, ${d.scenario}` : ''}. Highest intensity ${mmiRoman(max)} (${MMI_WORDS[mmiIndex(max)]}).` +
    where +
    placeText
  const pts: GeoPoint[] = [
    { lon: g.west, lat: g.south },
    { lon: g.east, lat: g.north },
  ]
  return renderMap({
    title: d.title,
    width: o.width,
    height: o.height,
    points: pts,
    idKey: JSON.stringify(d),
    key: [...mmiKey(), ...(d.faults.length ? [FAULT_KEY] : [])],
    summary,
    table: {
      caption: 'Grid cells and places by intensity',
      columns: ['Intensity or place', 'Cells / MMI', 'Share of grid'],
      rows,
    },
    draw: (proj) => {
      const dx = (g.east - g.west) / g.cols
      const dy = (g.north - g.south) / g.rows
      let out = ''
      for (let r = 0; r < g.rows; r++)
        for (let c = 0; c < g.cols; c++) {
          const v = g.values[r * g.cols + c]!
          const [x1, y1] = proj.px({ lon: g.west + c * dx, lat: g.north - r * dy })
          const [x2, y2] = proj.px({ lon: g.west + (c + 1) * dx, lat: g.north - (r + 1) * dy })
          out += `<rect x="${n(x1)}" y="${n(y1)}" width="${n(x2 - x1 + 0.4)}" height="${n(y2 - y1 + 0.4)}" fill="${MMI_COLORS[mmiIndex(v)]}"/>`
        }
      out += lines(proj, d.faults, FAULT)
      out += places(proj, d.places, (p) => mmiRoman(p.mmi))
      if (d.epicenter) {
        const [x, y] = proj.px(d.epicenter)
        out += star(x, y)
      }
      return out
    },
  })
}

// ---- dyfi_map -------------------------------------------------------------------------------

export const DyfiData = z.object({
  title: Title,
  epicenter: GeoPoint.optional(),
  reports: z
    .array(
      GeoPoint.extend({
        mmi: z.number().finite().min(1).max(10),
        responses: z.number().int().min(1).max(100000).default(1),
        place: z.string().max(80).optional(),
      }),
    )
    .min(1)
    .max(2000),
})
type DyfiData = z.infer<typeof DyfiData>

function dyfi(d: DyfiData, o: { width: number; height: number }): FigureResult {
  const total = d.reports.reduce((s, r) => s + r.responses, 0)
  const top = [...d.reports].sort((a, b) => b.mmi - a.mmi).slice(0, 5)
  const summary =
    `${d.title ?? 'Did You Feel It?'}: map of community intensity from ${total} felt reports in ${d.reports.length} communities. ` +
    `Highest reported intensity ${mmiRoman(top[0]!.mmi)}. Strongest: ${top.map((r) => `${r.place ?? coord(r)} ${mmiRoman(r.mmi)} (${r.responses} reports)`).join('; ')}.`
  return renderMap({
    title: d.title,
    width: o.width,
    height: o.height,
    points: [...d.reports, ...(d.epicenter ? [d.epicenter] : [])],
    idKey: JSON.stringify(d),
    key: mmiKey(),
    summary,
    table: {
      caption: 'Community intensity',
      columns: ['Community', 'Intensity (MMI)', 'Reports'],
      rows: [...d.reports]
        .sort((a, b) => b.mmi - a.mmi)
        .slice(0, 40)
        .map((r) => [r.place ?? coord(r), mmiRoman(r.mmi), String(r.responses)]),
    },
    draw: (proj) => {
      let out = ''
      for (const r of d.reports) {
        const [x, y] = proj.px(r)
        const rad = 4 + Math.min(8, Math.log10(r.responses + 1) * 3)
        out += `<circle cx="${n(x)}" cy="${n(y)}" r="${n(rad)}" fill="${MMI_COLORS[mmiIndex(r.mmi)]}" stroke="${INK}" stroke-width="1.2"/>`
        out += text(x, y + 3, mmiRoman(r.mmi), { size: 8, weight: 700, anchor: 'middle' })
      }
      if (d.epicenter) out += star(...proj.px(d.epicenter))
      return out
    },
  })
}

// ---- epicenter_map --------------------------------------------------------------------------

export const EpicenterData = z.object({
  title: Title,
  mainshock: GeoPoint.extend({
    magnitude: z.number().finite().min(0).max(10),
    label: z.string().max(80).optional(),
  }),
  events: z
    .array(
      GeoPoint.extend({
        magnitude: z.number().finite().min(0).max(10),
        time: z.string().max(40).optional(),
      }),
    )
    .max(2000)
    .default([]),
  faults: z.array(GeoLine).max(20).default([]),
  places: z.array(NamedPlace).max(20).default([]),
})
type EpicenterData = z.infer<typeof EpicenterData>

const eqRadius = (m: number): number => 2 + Math.max(0, m - 1) * 2.2

function epicenter(d: EpicenterData, o: { width: number; height: number }): FigureResult {
  const big = [...d.events].sort((a, b) => b.magnitude - a.magnitude)[0]
  const summary =
    `${d.title ?? 'Epicenter map'}: M ${d.mainshock.magnitude} mainshock${d.mainshock.label ? ` (${d.mainshock.label})` : ''} at ${coord(d.mainshock)} ` +
    `with ${d.events.length} aftershocks${big ? `, the largest M ${big.magnitude}` : ''}.` +
    (d.faults.length
      ? ` ${d.faults.length} fault trace${d.faults.length > 1 ? 's' : ''} shown.`
      : '') +
    (d.places.length ? ` Places: ${d.places.map((p) => p.name).join(', ')}.` : '')
  const bins = [3, 4, 5, 6, 7]
  return renderMap({
    title: d.title,
    width: o.width,
    height: o.height,
    points: [d.mainshock, ...d.events, ...d.places, ...d.faults.flatMap((f) => f.points)],
    idKey: JSON.stringify(d),
    key: [
      {
        name: 'Mainshock',
        swatch: (x, y) => star(x + 11, y, 8),
      },
      ...bins.slice(0, 4).map((m) => ({
        name: `Aftershock M ${m}`,
        swatch: (x: number, y: number) =>
          `<circle cx="${n(x + 11)}" cy="${n(y)}" r="${n(eqRadius(m))}" fill="none" stroke="#b3121b" stroke-width="2"/>`,
      })),
      ...(d.faults.length ? [FAULT_KEY] : []),
    ],
    summary,
    table: {
      caption: 'Events by magnitude',
      columns: ['Magnitude', 'Events'],
      rows: [
        ['Mainshock', `M ${d.mainshock.magnitude}`],
        ...bins.map((m, i) => [
          `M ${m} to ${m + 1}`,
          String(
            d.events.filter((e) => e.magnitude >= m && e.magnitude < (bins[i + 1] ?? 11)).length,
          ),
        ]),
        ['Under M 3', String(d.events.filter((e) => e.magnitude < 3).length)],
      ],
    },
    draw: (proj) => {
      let out = lines(proj, d.faults, FAULT)
      for (const e of d.events) {
        const [x, y] = proj.px(e)
        out += `<circle cx="${n(x)}" cy="${n(y)}" r="${n(eqRadius(e.magnitude))}" fill="rgba(179,18,27,0.18)" stroke="#b3121b" stroke-width="1.4"/>`
      }
      out += places(proj, d.places)
      out += star(...proj.px(d.mainshock), 11)
      return out
    },
  })
}

// ---- ash_advisory_map -----------------------------------------------------------------------

const ASH_KINDS = ['observed', 'forecast6', 'forecast12', 'forecast18'] as const
const ASH_NAMES: Record<(typeof ASH_KINDS)[number], string> = {
  observed: 'Observed ash',
  forecast6: 'Forecast +6 h',
  forecast12: 'Forecast +12 h',
  forecast18: 'Forecast +18 h',
}

export const AshMapData = z.object({
  title: Title,
  volcano: NamedPlace,
  advisory: z.string().max(80).optional(),
  colorCode: z.enum(['GREEN', 'YELLOW', 'ORANGE', 'RED']).optional(),
  areas: z
    .array(
      z.object({
        kind: z.enum(ASH_KINDS),
        ring: GeoRing,
        levels: z.string().max(40).optional(),
        validAt: z.string().max(40).optional(),
      }),
    )
    .min(1)
    .max(8),
  airports: z.array(NamedPlace).max(15).default([]),
})
type AshMapData = z.infer<typeof AshMapData>

function ashMap(d: AshMapData, o: { width: number; height: number }): FigureResult {
  const style = (k: (typeof ASH_KINDS)[number]): SeriesStyle => seriesStyle(ASH_KINDS.indexOf(k))
  const summary =
    `${d.title ?? 'Volcanic ash advisory map'}${d.advisory ? ` (advisory ${d.advisory})` : ''}: ` +
    `${d.volcano.name} at ${coord(d.volcano)}${d.colorCode ? `, aviation color code ${d.colorCode}` : ''}. ` +
    d.areas
      .map(
        (a) =>
          `${ASH_NAMES[a.kind]}${a.validAt ? ` at ${a.validAt}` : ''}${a.levels ? `, ${a.levels}` : ''}`,
      )
      .join('; ') +
    '.' +
    (d.airports.length ? ` Airports: ${d.airports.map((a) => a.name).join(', ')}.` : '')
  return renderMap({
    title: d.title,
    width: o.width,
    height: o.height,
    points: [d.volcano, ...d.areas.flatMap((a) => a.ring), ...d.airports],
    idKey: JSON.stringify(d),
    key: [
      ...ASH_KINDS.filter((k) => d.areas.some((a) => a.kind === k)).map((k) => ({
        name: ASH_NAMES[k],
        swatch: (x: number, y: number) =>
          `<rect x="${n(x)}" y="${n(y - 8)}" width="22" height="16" fill="${style(k).color}" opacity="0.8" stroke="${INK}"/>`,
      })),
      { name: 'Volcano', swatch: (x, y) => marker('triangle', x + 11, y, '#14100c') },
    ],
    summary,
    table: {
      caption: 'Ash areas',
      columns: ['Area', 'Valid at', 'Levels'],
      rows: d.areas.map((a) => [ASH_NAMES[a.kind], a.validAt ?? '', a.levels ?? '']),
    },
    defs: (id) => ASH_KINDS.map((k) => patternDef(`a${id}${k}`, style(k))).join(''),
    draw: (proj, id) => {
      let out = ''
      for (const a of d.areas) {
        out += polyline(
          proj,
          a.ring,
          `fill="url(#a${id}${a.kind})" fill-opacity="0.55" stroke="${style(a.kind).color}" stroke-width="2"`,
          true,
        )
        if (a.levels) {
          const east = a.ring.map((q) => proj.px(q)).sort((u, v) => v[0] - u[0])[0]!
          out += label(
            east[0] - 6,
            east[1] + 14 * ASH_KINDS.indexOf(a.kind) - 14,
            `${ASH_NAMES[a.kind]} ${a.levels}`,
            { anchor: 'end' },
          )
        }
      }
      out += places(proj, d.airports)
      const [vx, vy] = proj.px(d.volcano)
      out += marker('triangle', vx, vy, '#14100c') + label(vx + 8, vy + 4, d.volcano.name)
      return out
    },
  })
}

// ---- lahar_travel_map -----------------------------------------------------------------------

export const LaharMapData = z.object({
  title: Title,
  source: NamedPlace,
  path: z
    .array(GeoPoint.extend({ minutes: z.number().finite().min(0).max(10000).optional() }))
    .min(2)
    .max(500),
  communities: z
    .array(NamedPlace.extend({ minutes: z.number().finite().min(0).max(10000) }))
    .min(1)
    .max(20),
  hazardZone: GeoRing.optional(),
})
type LaharMapData = z.infer<typeof LaharMapData>

function laharMap(d: LaharMapData, o: { width: number; height: number }): FigureResult {
  const sorted = [...d.communities].sort((a, b) => a.minutes - b.minutes)
  const summary =
    `${d.title ?? 'Lahar travel time'}: valley path from ${d.source.name} at ${coord(d.source)}. ` +
    `Estimated travel time from detection: ${sorted.map((c) => `${c.name} ${c.minutes} minutes`).join('; ')}.`
  return renderMap({
    title: d.title,
    width: o.width,
    height: o.height,
    points: [d.source, ...d.path, ...d.communities, ...(d.hazardZone ?? [])],
    idKey: JSON.stringify(d),
    key: [
      {
        name: 'Lahar path (minutes after detection)',
        swatch: (x, y) =>
          `<line x1="${n(x)}" y1="${n(y)}" x2="${n(x + 22)}" y2="${n(y)}" stroke="#b3121b" stroke-width="4"/>`,
      },
      { name: 'Community', swatch: (x, y) => marker('square', x + 11, y, '#14100c') },
      ...(d.hazardZone
        ? [
            {
              name: 'Hazard zone',
              swatch: (x: number, y: number) =>
                `<rect x="${n(x)}" y="${n(y - 8)}" width="22" height="16" fill="none" stroke="#b3121b" stroke-width="2" stroke-dasharray="5 3"/>`,
            },
          ]
        : []),
    ],
    summary,
    table: {
      caption: 'Travel time by community',
      columns: ['Community', 'Minutes after detection'],
      rows: sorted.map((c) => [c.name, String(c.minutes)]),
    },
    draw: (proj) => {
      let out = d.hazardZone
        ? polyline(
            proj,
            d.hazardZone,
            `fill="rgba(179,18,27,0.08)" stroke="#b3121b" stroke-width="2" stroke-dasharray="5 3"`,
            true,
          )
        : ''
      out += polyline(
        proj,
        d.path,
        `fill="none" stroke="#b3121b" stroke-width="4" stroke-linejoin="round"`,
      )
      const named = new Set(d.communities.map((c) => c.minutes))
      for (const p of d.path.filter(
        (q) => q.minutes !== undefined && q.minutes > 0 && !named.has(q.minutes),
      )) {
        const [x, y] = proj.px(p)
        out +=
          `<circle cx="${n(x)}" cy="${n(y)}" r="4" fill="#ffffff" stroke="#b3121b" stroke-width="2"/>` +
          label(x + 7, y - 6, `${p.minutes} min`)
      }
      out += places(proj, d.communities, (c) => `(${c.minutes} min)`)
      out +=
        marker('triangle', ...proj.px(d.source), '#14100c') +
        label(proj.px(d.source)[0] + 8, proj.px(d.source)[1] + 4, d.source.name)
      return out
    },
  })
}

// ---- tsunami_travel_map ---------------------------------------------------------------------

export const TsunamiMapData = z.object({
  title: Title,
  source: NamedPlace,
  isochrones: z
    .array(
      z.object({
        minutes: z.number().finite().min(1).max(10000),
        radiusKm: z.number().finite().min(1).max(20000).optional(),
        points: z.array(GeoPoint).min(2).max(1000).optional(),
      }),
    )
    .max(8)
    .default([]),
  places: z
    .array(NamedPlace.extend({ minutes: z.number().finite().min(0).max(10000) }))
    .min(1)
    .max(20),
})
type TsunamiMapData = z.infer<typeof TsunamiMapData>

const dur = (m: number): string => (m >= 120 ? `${round1(m / 60)} h` : `${Math.round(m)} min`)

function tsunamiMap(d: TsunamiMapData, o: { width: number; height: number }): FigureResult {
  const sorted = [...d.places].sort((a, b) => a.minutes - b.minutes)
  const summary =
    `${d.title ?? 'Tsunami travel time'}: source ${d.source.name} at ${coord(d.source)}. ` +
    `Estimated first wave arrival: ${sorted.map((p) => `${p.name} ${dur(p.minutes)}`).join('; ')}.` +
    (d.isochrones.length
      ? ` Travel-time lines at ${d.isochrones.map((i) => dur(i.minutes)).join(', ')}.`
      : '')
  const extent: GeoPoint[] = [d.source, ...d.places, ...d.isochrones.flatMap((i) => i.points ?? [])]
  for (const i of d.isochrones.filter((x) => x.radiusKm)) {
    const dLat = i.radiusKm! / 111.32
    const dLon = dLat / Math.max(0.2, Math.cos((d.source.lat * Math.PI) / 180))
    extent.push(
      { lon: d.source.lon - dLon, lat: d.source.lat - dLat },
      { lon: d.source.lon + dLon, lat: d.source.lat + dLat },
    )
  }
  return renderMap({
    title: d.title,
    width: o.width,
    height: o.height,
    points: extent.map((p) => ({
      lon: Math.max(-180, Math.min(180, p.lon)),
      lat: Math.max(-90, Math.min(90, p.lat)),
    })),
    idKey: JSON.stringify(d),
    key: [
      { name: 'Source', swatch: (x, y) => star(x + 11, y, 8) },
      {
        name: 'Travel-time line',
        swatch: (x, y) =>
          `<line x1="${n(x)}" y1="${n(y)}" x2="${n(x + 22)}" y2="${n(y)}" stroke="#1f5fbf" stroke-width="2" stroke-dasharray="7 4"/>`,
      },
      { name: 'Place (first arrival)', swatch: (x, y) => marker('square', x + 11, y, '#14100c') },
    ],
    summary,
    table: {
      caption: 'Estimated first wave arrival',
      columns: ['Place', 'Distance from source (km)', 'Arrival after source event'],
      rows: sorted.map((p) => [
        p.name,
        String(Math.round(distanceKm(d.source, p))),
        dur(p.minutes),
      ]),
    },
    draw: (proj) => {
      let out = ''
      for (const i of d.isochrones) {
        const attrs = `fill="none" stroke="#1f5fbf" stroke-width="2" stroke-dasharray="7 4"`
        if (i.points) out += polyline(proj, i.points, attrs)
        else if (i.radiusKm) out += `${circleKm(proj, d.source, i.radiusKm)} ${attrs}/>`
        const anchor = i.points?.[0]
        const [lx, ly] = anchor
          ? proj.px(anchor)
          : [proj.px(d.source)[0], proj.px(d.source)[1] - i.radiusKm! / proj.kmPerPx]
        out += label(lx, ly - 5, dur(i.minutes), { anchor: 'middle' })
      }
      out += places(proj, d.places, (p) => `(${dur(p.minutes)})`)
      out += star(...proj.px(d.source))
      return out
    },
  })
}

// ---- inundation_zones -----------------------------------------------------------------------

const LEVELS = ['low', 'moderate', 'high', 'extreme'] as const
export const InundationData = z.object({
  title: Title,
  scenario: z.string().max(120).optional(),
  zones: z
    .array(
      z.object({
        name: Name,
        level: z.enum(LEVELS),
        ring: GeoRing,
        note: z.string().max(120).optional(),
      }),
    )
    .min(1)
    .max(30),
  shelters: z.array(NamedPlace).max(20).default([]),
  places: z.array(NamedPlace).max(20).default([]),
})
type InundationData = z.infer<typeof InundationData>

function inundation(d: InundationData, o: { width: number; height: number }): FigureResult {
  const st = (l: (typeof LEVELS)[number]): SeriesStyle => seriesStyle(LEVELS.indexOf(l))
  const summary =
    `${d.title ?? 'Inundation zones'}${d.scenario ? ` (${d.scenario})` : ''}: ${d.zones.length} zones. ` +
    d.zones.map((z) => `${z.name} ${z.level} hazard${z.note ? `, ${z.note}` : ''}`).join('; ') +
    '.' +
    (d.shelters.length
      ? ` Shelters outside the zones: ${d.shelters.map((s) => s.name).join(', ')}.`
      : '')
  return renderMap({
    title: d.title,
    width: o.width,
    height: o.height,
    points: [...d.zones.flatMap((z) => z.ring), ...d.shelters, ...d.places],
    idKey: JSON.stringify(d),
    key: [
      ...LEVELS.filter((l) => d.zones.some((z) => z.level === l)).map((l) => ({
        name: `Zone, ${l} hazard`,
        swatch: (x: number, y: number) =>
          `<rect x="${n(x)}" y="${n(y - 8)}" width="22" height="16" fill="${st(l).color}" opacity="0.75" stroke="${INK}"/>`,
      })),
      ...(d.shelters.length
        ? [
            {
              name: 'Shelter',
              swatch: (x: number, y: number) => marker('diamond', x + 11, y, '#1b7a3a'),
            },
          ]
        : []),
    ],
    summary,
    table: {
      caption: 'Zones',
      columns: ['Zone', 'Hazard', 'Note'],
      rows: d.zones.map((z) => [z.name, z.level, z.note ?? '']),
    },
    defs: (id) => LEVELS.map((l) => patternDef(`i${id}${l}`, st(l))).join(''),
    draw: (proj, id) => {
      let out = ''
      for (const z of d.zones) {
        out += polyline(
          proj,
          z.ring,
          `fill="url(#i${id}${z.level})" fill-opacity="0.5" stroke="${st(z.level).color}" stroke-width="2"`,
          true,
        )
        const [cx, cy] = proj.px({
          lon: z.ring.reduce((s, p) => s + p.lon, 0) / z.ring.length,
          lat: z.ring.reduce((s, p) => s + p.lat, 0) / z.ring.length,
        })
        out += label(cx, cy, z.name, { anchor: 'start' })
      }
      for (const s of d.shelters) {
        const [x, y] = proj.px(s)
        out += marker('diamond', x, y, '#1b7a3a')
        out +=
          x > proj.plot.x + proj.plot.w - 150
            ? label(x - 8, y + 4, s.name, { anchor: 'end' })
            : label(x + 8, y + 4, s.name)
      }
      out += places(proj, d.places)
      return out
    },
  })
}

// ---- debris_flow_hazard_map -----------------------------------------------------------------

const HAZARDS = ['low', 'moderate', 'high'] as const
export const DebrisMapData = z.object({
  title: Title,
  storm: z.string().max(120).optional(),
  burn: GeoRing.optional(),
  basins: z
    .array(z.object({ name: Name, hazard: z.enum(HAZARDS), ring: GeoRing }))
    .min(1)
    .max(100),
  roads: z
    .array(GeoLine.extend({ closed: z.boolean().default(false) }))
    .max(30)
    .default([]),
  places: z.array(NamedPlace).max(20).default([]),
})
type DebrisMapData = z.infer<typeof DebrisMapData>

function debrisMap(d: DebrisMapData, o: { width: number; height: number }): FigureResult {
  const st = (h: (typeof HAZARDS)[number]): SeriesStyle =>
    seriesStyle([2, 3, 1][HAZARDS.indexOf(h)]!)
  const count = (h: string): number => d.basins.filter((b) => b.hazard === h).length
  const closed = d.roads.filter((r) => r.closed)
  const summary =
    `${d.title ?? 'Debris-flow hazard map'}${d.storm ? ` for ${d.storm}` : ''}: ${d.basins.length} basins, ` +
    `${count('high')} high, ${count('moderate')} moderate, ${count('low')} low hazard.` +
    (d.roads.length
      ? ` ${closed.length} of ${d.roads.length} roads closed${closed.length ? `: ${closed.map((r) => r.name ?? 'unnamed').join(', ')}` : ''}.`
      : '') +
    ' The map is for planning and is not a forecast of a flow on a given day.'
  return renderMap({
    title: d.title,
    width: o.width,
    height: o.height,
    points: [
      ...(d.burn ?? []),
      ...d.basins.flatMap((b) => b.ring),
      ...d.roads.flatMap((r) => r.points),
      ...d.places,
    ],
    idKey: JSON.stringify(d),
    key: [
      ...HAZARDS.map((h) => ({
        name: `Basin, ${h} hazard`,
        swatch: (x: number, y: number) =>
          `<rect x="${n(x)}" y="${n(y - 8)}" width="22" height="16" fill="${st(h).color}" opacity="0.75" stroke="${INK}"/>`,
      })),
      {
        name: 'Road open',
        swatch: (x, y) =>
          `<line x1="${n(x)}" y1="${n(y)}" x2="${n(x + 22)}" y2="${n(y)}" stroke="#3b3b3b" stroke-width="2"/>`,
      },
      {
        name: 'Road closed',
        swatch: (x, y) =>
          `<line x1="${n(x)}" y1="${n(y)}" x2="${n(x + 22)}" y2="${n(y)}" stroke="#b3121b" stroke-width="3" stroke-dasharray="4 3"/>`,
      },
    ],
    summary,
    table: {
      caption: 'Basins and roads',
      columns: ['Name', 'Kind', 'Hazard or status'],
      rows: [
        ...d.basins.map((b) => [b.name, 'Basin', b.hazard]),
        ...d.roads.map((r) => [r.name ?? 'Road', 'Road', r.closed ? 'closed' : 'open']),
      ],
    },
    defs: (id) => HAZARDS.map((h) => patternDef(`d${id}${h}`, st(h))).join(''),
    draw: (proj, id) => {
      let out = ''
      for (const b of d.basins)
        out += polyline(
          proj,
          b.ring,
          `fill="url(#d${id}${b.hazard})" fill-opacity="0.5" stroke="${st(b.hazard).color}" stroke-width="1.5"`,
          true,
        )
      if (d.burn)
        out += polyline(
          proj,
          d.burn,
          `fill="none" stroke="${INK}" stroke-width="2" stroke-dasharray="2 4"`,
          true,
        )
      for (const r of d.roads)
        out += polyline(
          proj,
          r.points,
          r.closed
            ? `fill="none" stroke="#b3121b" stroke-width="3.5" stroke-dasharray="4 3"`
            : ROAD,
        )
      out += places(proj, d.places)
      return out
    },
  })
}

const kinds = [
  ['shakemap_intensity', ShakemapData, shakemap],
  ['dyfi_map', DyfiData, dyfi],
  ['epicenter_map', EpicenterData, epicenter],
  ['ash_advisory_map', AshMapData, ashMap],
  ['lahar_travel_map', LaharMapData, laharMap],
  ['tsunami_travel_map', TsunamiMapData, tsunamiMap],
  ['inundation_zones', InundationData, inundation],
  ['debris_flow_hazard_map', DebrisMapData, debrisMap],
] as const

export const GEO_MAP_KINDS: FigureKind<never>[] = kinds.map(
  ([kind, schema, render]) =>
    ({ kind, schema, render, defaultHeight: 520 }) as unknown as FigureKind<never>,
)
