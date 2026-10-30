// Infrastructure layers by local file import only (spec 0439): the HIFLD Open portal is offline,
// so the user brings a GeoJSON or CSV file from an archive or the original publisher. The file is
// read and filtered on this computer; nothing is sent anywhere. Parsing is bounded by file size,
// feature count and coordinate checks, and no content is ever evaluated.
import { promises as fs } from 'node:fs'
import type { InfrastructureLayer } from '@shared/schemas'
import { AppError } from '../../lib/errors'
import { csvRecords } from './csv'
import { clip, haversineKm, isRecord, num, oneDecimal, parseJson } from './util'

export const MAX_LAYER_BYTES = 100 * 1024 * 1024
export const MAX_LAYER_FEATURES = 1_000_000
const KEEP = 200
const NAME_KEYS = ['name', 'facility', 'facname', 'site_name', 'title', 'label']
const TYPE_KEYS = ['type', 'category', 'fac_type', 'naics_desc', 'subtype', 'class']
const LAT_KEYS = ['latitude', 'lat', 'y']
const LON_KEYS = ['longitude', 'lon', 'long', 'lng', 'x']

interface Point {
  name: string
  type?: string
  lat: number
  lon: number
}

const pick = (rec: Record<string, unknown>, keys: string[]): string | undefined => {
  const lower = new Map(Object.keys(rec).map((k) => [k.toLowerCase(), k]))
  for (const k of keys) {
    const real = lower.get(k)
    const v = real ? rec[real] : undefined
    if (typeof v === 'string' && v.trim()) return v
    if (typeof v === 'number') return String(v)
  }
  return undefined
}

const validCoord = (lat: number, lon: number): boolean =>
  Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180

/** The first [lon, lat] pair of a GeoJSON geometry (a point, or the start of a line or polygon). */
function firstPosition(geometry: unknown): [number, number] | undefined {
  let c: unknown = isRecord(geometry) ? geometry.coordinates : undefined
  while (Array.isArray(c) && Array.isArray(c[0])) c = c[0]
  if (!Array.isArray(c)) return undefined
  const lon = num(c[0])
  const lat = num(c[1])
  return lon !== undefined && lat !== undefined ? [lon, lat] : undefined
}

export function pointsFromGeoJson(text: string): Point[] {
  const root = parseJson(text, 'The layer file')
  if (!isRecord(root) || root.type !== 'FeatureCollection' || !Array.isArray(root.features))
    throw new AppError('VALIDATION', 'The file is not a GeoJSON FeatureCollection')
  if (root.features.length > MAX_LAYER_FEATURES)
    throw new AppError('VALIDATION', 'The file has too many features')
  const out: Point[] = []
  for (const f of root.features) {
    if (!isRecord(f)) continue
    const pos = firstPosition(f.geometry)
    if (!pos || !validCoord(pos[1], pos[0])) continue
    const props = isRecord(f.properties) ? f.properties : {}
    const type = clip(pick(props, TYPE_KEYS), 80)
    out.push({
      name: clip(pick(props, NAME_KEYS), 160) || 'Unnamed',
      ...(type ? { type } : {}),
      lat: pos[1],
      lon: pos[0],
    })
  }
  return out
}

export function pointsFromCsv(text: string): Point[] {
  const rows = csvRecords(text)
  if (rows.length > MAX_LAYER_FEATURES)
    throw new AppError('VALIDATION', 'The file has too many rows')
  const out: Point[] = []
  for (const r of rows) {
    const lat = Number(pick(r, LAT_KEYS))
    const lon = Number(pick(r, LON_KEYS))
    if (!validCoord(lat, lon)) continue
    const type = clip(pick(r, TYPE_KEYS), 80)
    out.push({
      name: clip(pick(r, NAME_KEYS), 160) || 'Unnamed',
      ...(type ? { type } : {}),
      lat,
      lon,
    })
  }
  return out
}

export interface LayerImport {
  layer: string
  source: string
  radiusKm: number
}

/** Keep the points inside the radius, nearest first, with coordinates rounded to 0.01°. */
export function toLayer(
  points: Point[],
  where: { lat: number; lon: number },
  input: LayerImport,
): InfrastructureLayer {
  const near = points
    .map((p) => ({ p, km: haversineKm(where.lat, where.lon, p.lat, p.lon) }))
    .filter((x) => x.km <= input.radiusKm)
    .sort((a, b) => a.km - b.km)
    .slice(0, KEEP)
  return {
    layer: clip(input.layer, 80) || 'Layer',
    source: clip(input.source, 200),
    features: near.map(({ p, km }) => ({
      name: p.name,
      ...(p.type ? { type: p.type } : {}),
      distanceKm: oneDecimal(km),
      lat: Number(p.lat.toFixed(2)),
      lon: Number(p.lon.toFixed(2)),
    })),
  }
}

export interface LayerRequest {
  file: string
  where: { lat: number; lon: number }
  input: LayerImport
}

/** Read and parse a GeoJSON or CSV file the user chose; the work the layer worker does. */
export async function readLayerFile(
  file: string,
  where: { lat: number; lon: number },
  input: LayerImport,
): Promise<InfrastructureLayer> {
  const text = await fs.readFile(file, 'utf8')
  const isCsv = /\.csv$/i.test(file)
  return toLayer(isCsv ? pointsFromCsv(text) : pointsFromGeoJson(text), where, input)
}
