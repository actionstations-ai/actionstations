// animal_premises_map and animal_inundation_overlay (spec 0460 FR-5). The premises map draws
// fictional premises as points sized by head count and marked by designation (shape and
// abbreviation, not color alone), with the zone rings the zone calculator produced and optional
// county and road lines. The inundation overlay adds flood zones from the flooding toolkit and
// lists the premises inside them. Both are schematic: no basemap, positions are simulated.
import { z } from 'zod'
import { DESIGNATION_ABBREVIATION } from '@shared/animal-disease/plan-rules'
import { INK, seriesStyle, type SeriesStyle } from '../theme'
import { n, patternDef } from '../svg'
import { GeoRing, label, polyline, type GeoPoint } from '../geo/project'
import type { FigureKind, FigureResult } from '../types'
import {
  BaseLine,
  PremisesPoint,
  Ring,
  Title,
  designationCounts,
  designationKey,
  drawBase,
  drawPremises,
  drawRings,
  presentDesignations,
  renderAnimalMap,
  ringKey,
  ringsInWords,
} from './common'

const PremisesRows = (list: readonly PremisesPoint[], extra?: (p: PremisesPoint) => string[]) =>
  list.map((p) => [
    p.id,
    p.species ?? '',
    String(p.head),
    `${p.designation} (${DESIGNATION_ABBREVIATION[p.designation]})`,
    p.zone ?? '',
    p.lat.toFixed(4),
    p.lon.toFixed(4),
    ...(extra ? extra(p) : []),
  ])

const COLUMNS = ['Premises', 'Species', 'Head', 'Designation', 'Zone', 'Latitude', 'Longitude']

// ---- animal_premises_map ----------------------------------------------------------------------

export const AnimalPremisesMapData = z.object({
  title: Title,
  premises: z.array(PremisesPoint).min(1).max(500),
  rings: z.array(Ring).max(30).default([]),
  baseLines: z.array(BaseLine).max(30).default([]),
  simulated: z.boolean().default(true),
})
export type AnimalPremisesMapData = z.infer<typeof AnimalPremisesMapData>

function premisesMap(d: AnimalPremisesMapData, o: { width: number; height: number }): FigureResult {
  const present = presentDesignations(d.premises)
  const summary =
    `${d.title ?? 'Premises map'}: schematic map of ${d.premises.length} premises (${designationCounts(d.premises)}). ` +
    ringsInWords(d.rings) +
    ` Marks are sized by head count.${d.simulated ? ' Positions are simulated and the premises are fictional.' : ''}`
  return renderAnimalMap({
    title: d.title,
    width: o.width,
    height: o.height,
    points: [
      ...d.premises,
      ...d.rings.flatMap((r) => ringExtent(r.center, r.radiusKm)),
      ...d.baseLines.flatMap((l) => l.points),
    ],
    idKey: JSON.stringify(d),
    key: [...designationKey(present), ...ringKey([...new Set(d.rings.map((r) => r.kind))])],
    summary: summary.trim(),
    table: { caption: d.title, columns: COLUMNS, rows: PremisesRows(d.premises) },
    draw: (proj) =>
      drawBase(proj, d.baseLines) + drawRings(proj, d.rings) + drawPremises(proj, d.premises),
  })
}

/** Four points that bound a circle of `radiusKm`, so the map fits the rings. */
function ringExtent(c: GeoPoint, radiusKm: number): GeoPoint[] {
  const dLat = radiusKm / 111.32
  const dLon = radiusKm / (111.32 * Math.cos((c.lat * Math.PI) / 180))
  return [
    { lat: c.lat + dLat, lon: c.lon },
    { lat: c.lat - dLat, lon: c.lon },
    { lat: c.lat, lon: c.lon + dLon },
    { lat: c.lat, lon: c.lon - dLon },
  ]
}

export const animalPremisesMapKind: FigureKind<AnimalPremisesMapData> = {
  kind: 'animal_premises_map',
  schema: AnimalPremisesMapData,
  render: premisesMap,
  defaultHeight: 560,
}

// ---- animal_inundation_overlay ----------------------------------------------------------------

const LEVELS = ['low', 'moderate', 'high', 'extreme'] as const

export const AnimalInundationData = z.object({
  title: Title,
  scenario: z.string().max(120).optional(),
  premises: z.array(PremisesPoint).min(1).max(500),
  /** Flood zones as drawn by the flooding toolkit's inundation figures. */
  zones: z
    .array(
      z.object({
        name: z.string().min(1).max(80),
        level: z.enum(LEVELS),
        ring: GeoRing,
      }),
    )
    .min(1)
    .max(30),
  simulated: z.boolean().default(true),
})
export type AnimalInundationData = z.infer<typeof AnimalInundationData>

/** True when the point lies inside the ring (ray casting on longitude and latitude). */
export function insideRing(p: GeoPoint, ring: readonly GeoPoint[]): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]!
    const b = ring[j]!
    if (
      a.lat > p.lat !== b.lat > p.lat &&
      p.lon < ((b.lon - a.lon) * (p.lat - a.lat)) / (b.lat - a.lat) + a.lon
    )
      inside = !inside
  }
  return inside
}

const levelStyle = (l: (typeof LEVELS)[number]): SeriesStyle => seriesStyle(LEVELS.indexOf(l))

/** For each premises, the highest flood level of the zones it lies in, if any. */
export function floodedPremises(
  d: AnimalInundationData,
): { premises: PremisesPoint; zone: string; level: string }[] {
  const out: { premises: PremisesPoint; zone: string; level: string }[] = []
  for (const p of d.premises) {
    const hits = d.zones.filter((z) => insideRing(p, z.ring))
    if (!hits.length) continue
    const worst = hits.reduce((a, b) => (LEVELS.indexOf(b.level) > LEVELS.indexOf(a.level) ? b : a))
    out.push({ premises: p, zone: worst.name, level: worst.level })
  }
  return out
}

function inundationOverlay(
  d: AnimalInundationData,
  o: { width: number; height: number },
): FigureResult {
  const flooded = floodedPremises(d)
  const present = presentDesignations(d.premises)
  const summary =
    `${d.title ?? 'Premises and flood zones'}${d.scenario ? ` (${d.scenario})` : ''}: ${flooded.length} of ${d.premises.length} premises lie in a flood zone` +
    (flooded.length
      ? `: ${flooded.map((f) => `${f.premises.id} in ${f.zone}, ${f.level} hazard`).join('; ')}`
      : '') +
    `.${d.simulated ? ' Positions are simulated and the premises are fictional.' : ''}`
  return renderAnimalMap({
    title: d.title,
    width: o.width,
    height: o.height,
    points: [...d.premises, ...d.zones.flatMap((z) => z.ring)],
    idKey: JSON.stringify(d),
    key: [
      ...LEVELS.filter((l) => d.zones.some((z) => z.level === l)).map((l) => ({
        name: `Flood zone, ${l} hazard`,
        swatch: (x: number, y: number) =>
          `<rect x="${n(x)}" y="${n(y - 8)}" width="22" height="16" fill="${levelStyle(l).color}" opacity="0.75" stroke="${INK}"/>`,
      })),
      ...designationKey(present),
    ],
    summary,
    table: {
      caption: d.title,
      columns: [...COLUMNS, 'Flood zone'],
      rows: PremisesRows(d.premises, (p) => [
        flooded.find((f) => f.premises.id === p.id)?.zone ?? 'none',
      ]),
    },
    defs: (id) => LEVELS.map((l) => patternDef(`a${id}${l}`, levelStyle(l))).join(''),
    draw: (proj, id) => {
      let out = ''
      for (const z of d.zones) {
        out += polyline(
          proj,
          z.ring,
          `fill="url(#a${id}${z.level})" fill-opacity="0.45" stroke="${levelStyle(z.level).color}" stroke-width="2"`,
          true,
        )
        const [cx, cy] = proj.px({
          lon: z.ring.reduce((s, p) => s + p.lon, 0) / z.ring.length,
          lat: z.ring.reduce((s, p) => s + p.lat, 0) / z.ring.length,
        })
        out += label(cx, cy, z.name)
      }
      return out + drawPremises(proj, d.premises)
    },
  })
}

export const animalInundationOverlayKind: FigureKind<AnimalInundationData> = {
  kind: 'animal_inundation_overlay',
  schema: AnimalInundationData,
  render: inundationOverlay,
  defaultHeight: 560,
}
