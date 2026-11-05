// Turning data into overlay layers (#652). The input is plain GeoJSON plus raster descriptors, so
// whatever holds the data (case data, a loaded file, a test) plugs in without this module knowing
// about it. A dataset becomes one layer per kind of shape it holds; rows that cannot be drawn
// are reported in `skipped` instead of failing the whole set.
import {
  MAX_FEATURES,
  OVERLAY_TOKENS,
  OverlayLayer,
  type ColorScale,
  type OverlayToken,
  type RasterFrame,
} from '../../schemas/map-overlays'

export interface GeoJsonFeature {
  type: 'Feature'
  id?: string | number | undefined
  geometry: { type: string; coordinates?: unknown } | null
  properties?: Record<string, unknown> | null | undefined
}
export interface GeoJsonFeatureCollection {
  type: 'FeatureCollection'
  features: GeoJsonFeature[]
}

/** Which property of each feature holds what. Each is tried in order; the defaults cover common names. */
export interface FieldNames {
  label?: string[]
  start?: string[]
  end?: string[]
  style?: string[]
  detail?: string[]
  legendLabel?: string[]
}

export interface OverlayDataset {
  id: string
  title: string
  /** The legend text for the layer; defaults to the title. */
  legend?: string
  legendNote?: string
  collection: GeoJsonFeatureCollection
  source?: string
  /** Draw polygons as cones or swaths instead of plain areas. */
  shape?: 'cone' | 'swath'
  /** Show line vertices as a track. */
  track?: boolean
  fields?: FieldNames
  /** Maps a property value (for example a severity) to a style token. */
  styleMap?: Record<string, OverlayToken>
  defaultStyle?: OverlayToken
  opacity?: number
}

export interface RasterDescriptor {
  id: string
  title: string
  legend?: string
  legendNote?: string
  source?: string
  width: number
  height: number
  /** West, south, east, north in degrees. */
  bbox: [number, number, number, number]
  projection?: 'epsg4326' | 'epsg3857'
  colorScale: ColorScale
  frames: RasterFrame[]
  opacity?: number
}

export interface OverlayInput {
  datasets?: OverlayDataset[]
  rasters?: RasterDescriptor[]
}

export interface OverlayBuild {
  layers: OverlayLayer[]
  skipped: { id: string; reason: string }[]
}

const DEFAULT_FIELDS: Required<FieldNames> = {
  label: ['label', 'name', 'title', 'headline'],
  start: ['start', 'begin', 'onset', 'effective', 'valid_from'],
  end: ['end', 'expires', 'ends', 'valid_to'],
  style: ['style', 'severity', 'level'],
  detail: ['detail', 'description', 'summary'],
  legendLabel: ['legendLabel', 'event', 'class', 'category'],
}

/** Words that sources use for severity, mapped to the nearest token. */
const ALIASES: Record<string, OverlayToken> = {
  minor: 'info',
  moderate: 'watch',
  severe: 'warning',
  extreme: 'critical',
  advisory: 'info',
  low: 'info',
  medium: 'watch',
  high: 'warning',
}

const safeId = (s: string): string => {
  const cleaned = s.replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^[^A-Za-z0-9]+/, '')
  return (cleaned || 'layer').slice(0, 120)
}

function pick(props: Record<string, unknown>, names: string[]): string | undefined {
  for (const n of names) {
    const v = props[n]
    if (typeof v === 'string' && v.trim()) return v.trim()
    if (typeof v === 'number' && Number.isFinite(v)) return String(v)
  }
  return undefined
}

const isoOrUndefined = (v: string | undefined): string | undefined => {
  if (!v) return undefined
  const t = Date.parse(v)
  return Number.isNaN(t) ? undefined : new Date(t).toISOString()
}

function tokenFor(raw: string | undefined, d: OverlayDataset): OverlayToken {
  const fallback = d.defaultStyle ?? 'neutral'
  if (!raw) return fallback
  if (d.styleMap?.[raw]) return d.styleMap[raw]
  const lower = raw.toLowerCase()
  if (d.styleMap?.[lower]) return d.styleMap[lower]
  if ((OVERLAY_TOKENS as readonly string[]).includes(lower)) return lower as OverlayToken
  return ALIASES[lower] ?? fallback
}

type Pos = [number, number]

function pos(c: unknown): Pos | null {
  if (!Array.isArray(c) || c.length < 2) return null
  const [lon, lat] = c as unknown[]
  if (typeof lon !== 'number' || typeof lat !== 'number') return null
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null
  if (Math.abs(lon) > 180 || Math.abs(lat) > 90) return null
  return [lon, lat]
}

function path(c: unknown): Pos[] | null {
  if (!Array.isArray(c)) return null
  const out = c.map(pos)
  return out.every((p): p is Pos => p !== null) ? out : null
}

const rings = (c: unknown): Pos[][] | null => {
  if (!Array.isArray(c)) return null
  const out = c.map(path)
  return out.every((r): r is Pos[] => r !== null && r.length >= 3) && out.length
    ? (out as Pos[][])
    : null
}

type Shape =
  | { family: 'polygon'; rings: Pos[][] }
  | { family: 'line'; path: Pos[] }
  | { family: 'point'; at: Pos }

/** The drawable shapes of a geometry (a Multi* geometry gives several). */
function shapesOf(g: GeoJsonFeature['geometry']): Shape[] | null {
  if (!g) return null
  const c = g.coordinates
  const many = <T>(parts: unknown, one: (x: unknown) => T | null): T[] | null => {
    if (!Array.isArray(parts)) return null
    const out = parts.map(one)
    return out.length && out.every((x): x is T => x !== null) ? out : null
  }
  switch (g.type) {
    case 'Polygon': {
      const r = rings(c)
      return r ? [{ family: 'polygon', rings: r }] : null
    }
    case 'MultiPolygon':
      return many(c, rings)?.map((r) => ({ family: 'polygon' as const, rings: r })) ?? null
    case 'LineString': {
      const p = path(c)
      return p && p.length >= 2 ? [{ family: 'line', path: p }] : null
    }
    case 'MultiLineString':
      return (
        many(c, (x) => {
          const p = path(x)
          return p && p.length >= 2 ? p : null
        })?.map((p) => ({ family: 'line' as const, path: p })) ?? null
      )
    case 'Point': {
      const p = pos(c)
      return p ? [{ family: 'point', at: p }] : null
    }
    case 'MultiPoint':
      return many(c, pos)?.map((at) => ({ family: 'point' as const, at })) ?? null
    default:
      return null
  }
}

function featureCommon(
  f: GeoJsonFeature,
  index: number,
  part: number,
  parts: number,
  d: OverlayDataset,
) {
  const props = f.properties ?? {}
  const names = { ...DEFAULT_FIELDS, ...d.fields }
  const start = isoOrUndefined(pick(props, names.start))
  let end = isoOrUndefined(pick(props, names.end))
  if (start && end && Date.parse(end) < Date.parse(start)) end = undefined
  const base = String(f.id ?? props['id'] ?? index + 1)
  const label = pick(props, names.label)
  const detail = pick(props, names.detail)
  const legendLabel = pick(props, names.legendLabel)
  return {
    id: parts > 1 ? `${base}-${part + 1}` : base,
    label: label ?? '',
    ...(detail ? { detail } : {}),
    ...(start || end ? { time: { ...(start ? { start } : {}), ...(end ? { end } : {}) } } : {}),
    style: tokenFor(pick(props, names.style), d),
    ...(legendLabel ? { legendLabel } : {}),
  }
}

function numericProp(props: Record<string, unknown> | null | undefined, name: string) {
  const v = props?.[name]
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined
}

function layerFor(
  d: OverlayDataset,
  family: Shape['family'],
  items: { f: GeoJsonFeature; index: number; part: number; parts: number; shape: Shape }[],
  suffix: string,
): unknown {
  const common = {
    id: safeId(d.id + suffix),
    title: d.title,
    legend: { label: d.legend ?? d.title, ...(d.legendNote ? { note: d.legendNote } : {}) },
    ...(d.source ? { source: d.source } : {}),
    ...(d.opacity !== undefined ? { opacity: d.opacity } : {}),
  }
  const feats = items.slice(0, MAX_FEATURES).map(({ f, index, part, parts, shape }) => {
    const c = featureCommon(f, index, part, parts, d)
    if (shape.family === 'polygon') return { ...c, rings: shape.rings }
    if (shape.family === 'line') return { ...c, path: shape.path }
    const value = numericProp(f.properties, 'value')
    const unit = typeof f.properties?.['unit'] === 'string' ? f.properties['unit'] : undefined
    return {
      ...c,
      at: (shape as Extract<Shape, { family: 'point' }>).at,
      ...(value !== undefined ? { value } : {}),
      ...(unit ? { unit } : {}),
    }
  })
  if (family === 'polygon')
    return d.shape
      ? { kind: 'cone', shape: d.shape, ...common, features: feats }
      : { kind: 'polygon', ...common, features: feats }
  if (family === 'line')
    return { kind: 'line', track: d.track ?? false, ...common, features: feats }
  return { kind: 'point', ...common, features: feats }
}

function datasetLayers(d: OverlayDataset, out: OverlayBuild): void {
  const byFamily = new Map<Shape['family'], Parameters<typeof layerFor>[2]>()
  d.collection.features.forEach((f, index) => {
    const shapes = shapesOf(f.geometry)
    if (!shapes) {
      out.skipped.push({ id: `${d.id}#${index + 1}`, reason: 'No drawable geometry' })
      return
    }
    shapes.forEach((shape, part) => {
      const list = byFamily.get(shape.family) ?? []
      list.push({ f, index, part, parts: shapes.length, shape })
      byFamily.set(shape.family, list)
    })
  })
  for (const [family, items] of byFamily) {
    const suffix = byFamily.size > 1 ? `-${family}` : ''
    const parsed = OverlayLayer.safeParse(layerFor(d, family, items, suffix))
    if (parsed.success) out.layers.push(parsed.data)
    else out.skipped.push({ id: d.id, reason: parsed.error.issues[0]?.message ?? 'Not valid' })
  }
  if (byFamily.size === 0 && d.collection.features.length === 0)
    out.skipped.push({ id: d.id, reason: 'No features' })
}

function rasterLayer(r: RasterDescriptor, out: OverlayBuild): void {
  const parsed = OverlayLayer.safeParse({
    kind: 'raster',
    id: safeId(r.id),
    title: r.title,
    legend: { label: r.legend ?? r.title, ...(r.legendNote ? { note: r.legendNote } : {}) },
    ...(r.source ? { source: r.source } : {}),
    ...(r.opacity !== undefined ? { opacity: r.opacity } : {}),
    width: r.width,
    height: r.height,
    bbox: r.bbox,
    projection: r.projection ?? 'epsg4326',
    colorScale: r.colorScale,
    frames: r.frames,
  })
  if (parsed.success) out.layers.push(parsed.data)
  else out.skipped.push({ id: r.id, reason: parsed.error.issues[0]?.message ?? 'Not valid' })
}

/** Build overlay layers from GeoJSON datasets and raster descriptors. Ids are made unique. */
export function buildOverlayLayers(input: OverlayInput): OverlayBuild {
  const out: OverlayBuild = { layers: [], skipped: [] }
  for (const d of input.datasets ?? []) datasetLayers(d, out)
  for (const r of input.rasters ?? []) rasterLayer(r, out)
  const used = new Set<string>()
  out.layers = out.layers.map((l) => {
    let id = l.id
    for (let n = 2; used.has(id); n++) id = `${l.id}-${n}`
    used.add(id)
    return id === l.id ? l : { ...l, id }
  })
  return out
}
