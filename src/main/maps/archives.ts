// Reading map archives (#436, FR-16): PMTiles through the `pmtiles` library with a local file
// source, MBTiles through better-sqlite3 (read-only, query_only, TMS row flip). A source with
// several state files is served as one composite: the first archive whose bounds hold the tile.
import { promises as fs } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import Database from 'better-sqlite3'
import { PMTiles, type Header, type RangeResponse, type Source } from 'pmtiles'
import type { Bbox, StoredArchive } from '@shared/schemas'
import { AppError } from '../lib/errors'

export const MAX_ARCHIVE_BYTES = 4 * 1024 ** 3
export const MAX_TILE_BYTES = 2 * 1024 * 1024
export const MAX_INFLATED_BYTES = 8 * 1024 * 1024
const OPEN_HANDLES = 4

export interface TileResult {
  data: Uint8Array
  contentType: string
}

export interface ArchiveInfo {
  format: 'pmtiles' | 'mbtiles'
  bytes: number
  bounds: Bbox
  minZoom: number
  maxZoom: number
  tileType: 'vector' | 'raster'
  /** From the archive's own metadata; empty when it has none. */
  attribution: string
  name: string
  /** False when an MBTiles file has no usable bounds metadata. */
  hasBounds?: boolean
  /** Which vector layer names the tiles use; picks the bundled style. */
  schema: MapSchema
}

export interface TileReader {
  info(): Promise<ArchiveInfo>
  tile(z: number, x: number, y: number): Promise<TileResult | undefined>
  close(): Promise<void>
}

export type MapSchema = 'protomaps' | 'openmaptiles' | 'none'

/** Guess the vector schema from the layer ids in the archive's metadata. */
export function schemaOf(vectorLayers: unknown): MapSchema {
  if (!Array.isArray(vectorLayers)) return 'none'
  const ids = new Set(vectorLayers.map((l) => (l as { id?: unknown } | null)?.id))
  if (ids.has('transportation') || ids.has('waterway')) return 'openmaptiles'
  if (ids.has('roads') || ids.has('earth')) return 'protomaps'
  return 'none'
}

const RASTER_TYPES: Record<number, string> = { 2: 'image/png', 3: 'image/jpeg', 4: 'image/webp' }

export function inflateTile(data: Uint8Array): Uint8Array {
  if (data.byteLength > MAX_TILE_BYTES)
    throw new AppError('VALIDATION', 'A tile in this map file is too large')
  if (data[0] === 0x1f && data[1] === 0x8b)
    return gunzipSync(data, { maxOutputLength: MAX_INFLATED_BYTES })
  return data
}

function sniffContentType(data: Uint8Array): string {
  if (data[0] === 0x89 && data[1] === 0x50) return 'image/png'
  if (data[0] === 0xff && data[1] === 0xd8) return 'image/jpeg'
  if (data[0] === 0x52 && data[1] === 0x49) return 'image/webp'
  return 'application/x-protobuf'
}

// ---- PMTiles --------------------------------------------------------------------------------

class FileSource implements Source {
  constructor(
    private readonly path: string,
    private readonly size: number,
  ) {}
  getKey(): string {
    return this.path
  }
  async getBytes(offset: number, length: number): Promise<RangeResponse> {
    if (offset < 0 || length < 0 || offset > this.size)
      throw new AppError('VALIDATION', 'This map file points outside itself')
    // The library asks for a fixed first read (16 KB), which may be longer than a small file.
    const want = Math.min(length, this.size - offset)
    const fh = await fs.open(this.path, 'r')
    try {
      const buf = new Uint8Array(want)
      await fh.read(buf, 0, want, offset)
      return { data: buf.buffer }
    } finally {
      await fh.close()
    }
  }
}

function checkHeader(h: Header, size: number): void {
  const ends = [
    h.rootDirectoryOffset + h.rootDirectoryLength,
    h.jsonMetadataOffset + h.jsonMetadataLength,
    h.leafDirectoryOffset + (h.leafDirectoryLength ?? 0),
    h.tileDataOffset + (h.tileDataLength ?? 0),
  ]
  if (ends.some((e) => e > size) || h.rootDirectoryLength > 16 * 1024 * 1024)
    throw new AppError('VALIDATION', 'This PMTiles file is damaged or not a PMTiles file')
}

function attributionOf(meta: unknown): string {
  const a = (meta as { attribution?: unknown } | null)?.attribution
  // Attribution in PMTiles metadata is HTML; keep the text.
  return typeof a === 'string'
    ? a
        .replace(/<[^>]*>/g, '')
        .trim()
        .slice(0, 500)
    : ''
}

async function openPmtiles(path: string): Promise<TileReader> {
  const size = (await fs.stat(path)).size
  const pm = new PMTiles(new FileSource(path, size))
  const header = await pm.getHeader().catch(() => {
    throw new AppError('VALIDATION', 'This is not a PMTiles file')
  })
  checkHeader(header, size)
  return {
    async info() {
      const meta = await pm.getMetadata().catch(() => null)
      const raster = header.tileType in RASTER_TYPES
      if (!raster && header.tileType !== 1)
        throw new AppError('VALIDATION', 'This PMTiles file has an unsupported tile type')
      return {
        format: 'pmtiles',
        bytes: size,
        bounds: [header.minLon, header.minLat, header.maxLon, header.maxLat],
        minZoom: header.minZoom,
        maxZoom: header.maxZoom,
        tileType: raster ? 'raster' : 'vector',
        attribution: attributionOf(meta),
        name: String((meta as { name?: unknown } | null)?.name ?? ''),
        schema: schemaOf((meta as { vector_layers?: unknown } | null)?.vector_layers),
      }
    },
    async tile(z, x, y) {
      const got = await pm.getZxy(z, x, y)
      if (!got) return undefined
      const data = inflateTile(new Uint8Array(got.data))
      return { data, contentType: RASTER_TYPES[header.tileType] ?? 'application/x-protobuf' }
    },
    close: () => Promise.resolve(),
  }
}

// ---- MBTiles --------------------------------------------------------------------------------

function parseBounds(raw: string | undefined): Bbox | undefined {
  const n = raw?.split(',').map((s) => Number(s.trim()))
  if (!n || n.length !== 4 || n.some((v) => !Number.isFinite(v))) return undefined
  return [n[0]!, n[1]!, n[2]!, n[3]!]
}

function jsonMeta(raw: string | undefined): unknown {
  try {
    return (JSON.parse(raw ?? '{}') as { vector_layers?: unknown }).vector_layers
  } catch {
    return undefined
  }
}

async function openMbtiles(path: string): Promise<TileReader> {
  const size = (await fs.stat(path)).size
  let db: Database.Database
  try {
    db = new Database(path, { readonly: true, fileMustExist: true })
    db.pragma('query_only = ON')
    db.prepare('SELECT 1 FROM tiles LIMIT 1').get()
  } catch {
    throw new AppError('VALIDATION', 'This is not an MBTiles file')
  }
  const meta = new Map<string, string>(
    (db.prepare('SELECT name, value FROM metadata').all() as { name: string; value: string }[]).map(
      (r) => [r.name, r.value],
    ),
  )
  const get = db.prepare(
    'SELECT tile_data FROM tiles WHERE zoom_level = ? AND tile_column = ? AND tile_row = ?',
  )
  return {
    info() {
      const bounds = parseBounds(meta.get('bounds'))
      const format = (meta.get('format') ?? 'pbf').toLowerCase()
      const raster = ['png', 'jpg', 'jpeg', 'webp'].includes(format)
      if (!raster && format !== 'pbf')
        throw new AppError('VALIDATION', 'This MBTiles file has an unsupported tile format')
      return Promise.resolve({
        format: 'mbtiles' as const,
        bytes: size,
        bounds: bounds ?? ([0, 0, 0, 0] as Bbox),
        minZoom: Number(meta.get('minzoom') ?? 0),
        maxZoom: Number(meta.get('maxzoom') ?? 0),
        tileType: raster ? ('raster' as const) : ('vector' as const),
        attribution: (meta.get('attribution') ?? '')
          .replace(/<[^>]*>/g, '')
          .trim()
          .slice(0, 500),
        name: meta.get('name') ?? '',
        hasBounds: bounds !== undefined,
        schema: schemaOf(jsonMeta(meta.get('json'))),
      })
    },
    tile(z, x, y) {
      const row = get.get(z, x, 2 ** z - 1 - y) as { tile_data: Buffer } | undefined
      if (!row) return Promise.resolve(undefined)
      const data = inflateTile(new Uint8Array(row.tile_data))
      return Promise.resolve({ data, contentType: sniffContentType(data) })
    },
    close() {
      db.close()
      return Promise.resolve()
    },
  }
}

export function openArchiveFile(path: string, format: 'pmtiles' | 'mbtiles'): Promise<TileReader> {
  return format === 'pmtiles' ? openPmtiles(path) : openMbtiles(path)
}

/** Read an archive's header for import (FR-16): refuses a file without bounds or over 4 GB. */
export async function inspectArchive(
  path: string,
  format: 'pmtiles' | 'mbtiles',
): Promise<ArchiveInfo> {
  const size = (await fs.stat(path)).size
  if (size > MAX_ARCHIVE_BYTES)
    throw new AppError('VALIDATION', 'Map files over 4 GB cannot be imported')
  const reader = await openArchiveFile(path, format)
  try {
    const info = await reader.info()
    const [w, s, e, n] = info.bounds
    if (info.hasBounds === false || (w === 0 && s === 0 && e === 0 && n === 0))
      throw new AppError(
        'VALIDATION',
        'This map file has no bounds, so it cannot be placed on a map',
      )
    return info
  } finally {
    await reader.close()
  }
}

/** Whether the tile's area overlaps the bounds (a low-zoom tile covers much more than its centre). */
export const tileInBounds = (b: Bbox, z: number, x: number, y: number): boolean => {
  const n = 2 ** z
  const lonOf = (tx: number): number => (tx / n) * 360 - 180
  const latOf = (ty: number): number =>
    (Math.atan(Math.sinh(Math.PI * (1 - (2 * ty) / n))) * 180) / Math.PI
  const west = lonOf(x)
  const east = lonOf(x + 1)
  const north = latOf(y)
  const south = latOf(y + 1)
  return west <= b[2] && east >= b[0] && south <= b[3] && north >= b[1]
}

// ---- open handles and composite sources -------------------------------------------------------

const handles = new Map<string, TileReader>()

/** An LRU of open readers keyed by file path (4 at most). */
export async function readerFor(path: string, format: 'pmtiles' | 'mbtiles'): Promise<TileReader> {
  const hit = handles.get(path)
  if (hit) {
    handles.delete(path)
    handles.set(path, hit)
    return hit
  }
  const reader = await openArchiveFile(path, format)
  handles.set(path, reader)
  while (handles.size > OPEN_HANDLES) {
    const oldest = handles.keys().next().value as string
    await handles.get(oldest)?.close()
    handles.delete(oldest)
  }
  return reader
}

export async function closeAllReaders(): Promise<void> {
  for (const r of handles.values()) await r.close()
  handles.clear()
}

/** First archive whose bounds hold the tile and which has it (state files in parts). */
export async function compositeTile(
  parts: { path: string; archive: StoredArchive }[],
  z: number,
  x: number,
  y: number,
): Promise<TileResult | undefined> {
  for (const { path, archive } of parts) {
    if (z < archive.minZoom || !tileInBounds(archive.bounds, z, x, y)) continue
    const got = await (await readerFor(path, archive.format)).tile(Math.min(z, 30), x, y)
    if (got) return got
  }
  return undefined
}
