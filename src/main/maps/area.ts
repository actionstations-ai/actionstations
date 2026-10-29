// Small-area offline download from OpenFreeMap (#436, FR-15). OpenFreeMap allows offline use of
// a small area: at most 3,000 tiles and 50 MB per download, 4 parallel requests, and a
// User-Agent that names the app. The plan is refused above 3,000 tiles; the download stops at
// 50 MB. Tiles are written into a local MBTiles file, in a transaction per 100 tiles, and a
// restart skips the tiles already there.
import { createHash } from 'node:crypto'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import type { Bbox, StoredArchive } from '@shared/schemas'
import { AppError } from '../lib/errors'
import { nowIso } from '../lib/ids'
import { ensureDir } from '../lib/fs'
import { abortError, idleAbort, redact } from '../packs/fetch'
import { inspectArchive } from './archives'
import { OPENFREEMAP_HOST, guardedGet, type GuardedGetOptions } from './net'
import { addArchive, moveIntoStore, partialDir, sha256File } from './store'

export const AREA_MAX_TILES = 3000
export const AREA_MAX_BYTES = 50 * 1024 * 1024
export const AREA_PARALLEL = 4
export const AREA_MAX_ZOOM = 14
/** A planning figure for the size estimate; OpenFreeMap vector tiles average about this. */
export const AVG_TILE_BYTES = 12_000
export const OPENFREEMAP_TILEJSON = `https://${OPENFREEMAP_HOST}/planet`
export const OPENFREEMAP_ATTRIBUTION = 'OpenFreeMap © OpenMapTiles Data from OpenStreetMap'
const COMMIT_EVERY = 100

export interface AreaRequest {
  bbox: Bbox
  minZoom: number
  maxZoom: number
}

export interface AreaPlan {
  tiles: number
  estimatedBytes: number
  allowed: boolean
  reason?: string
  /** The highest max zoom that fits the tile limit, when the plan does not. */
  suggestedMaxZoom?: number
}

const clampLat = (lat: number): number => Math.max(-85.0511, Math.min(85.0511, lat))

export function tileXY(lon: number, lat: number, z: number): { x: number; y: number } {
  const n = 2 ** z
  const rad = (clampLat(lat) * Math.PI) / 180
  const x = Math.floor(((lon + 180) / 360) * n)
  const y = Math.floor(((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n)
  return { x: Math.min(n - 1, Math.max(0, x)), y: Math.min(n - 1, Math.max(0, y)) }
}

function tileRange(bbox: Bbox, z: number): { x0: number; x1: number; y0: number; y1: number } {
  const nw = tileXY(bbox[0], bbox[3], z)
  const se = tileXY(bbox[2], bbox[1], z)
  return { x0: nw.x, x1: se.x, y0: nw.y, y1: se.y }
}

export function countTiles(req: AreaRequest): number {
  let total = 0
  for (let z = req.minZoom; z <= req.maxZoom; z++) {
    const r = tileRange(req.bbox, z)
    total += (r.x1 - r.x0 + 1) * (r.y1 - r.y0 + 1)
  }
  return total
}

export function* tileList(req: AreaRequest): Generator<{ z: number; x: number; y: number }> {
  for (let z = req.minZoom; z <= req.maxZoom; z++) {
    const r = tileRange(req.bbox, z)
    for (let x = r.x0; x <= r.x1; x++) for (let y = r.y0; y <= r.y1; y++) yield { z, x, y }
  }
}

function invalid(req: AreaRequest): string | undefined {
  const [w, s, e, n] = req.bbox
  if (![w, s, e, n].every(Number.isFinite)) return 'The box has a value that is not a number.'
  if (w < -180 || e > 180 || s < -85.06 || n > 85.06) return 'The box is outside the map.'
  if (w >= e) return 'The box crosses the 180° line or is empty. Draw two boxes, one on each side.'
  if (s >= n) return 'The box is empty: south must be below north.'
  if (req.minZoom < 0 || req.maxZoom > AREA_MAX_ZOOM || req.minZoom > req.maxZoom)
    return `Zoom levels must be between 0 and ${AREA_MAX_ZOOM}, lowest first.`
  return undefined
}

/** What a download would fetch, and whether OpenFreeMap's offline limits allow it. */
export function planArea(req: AreaRequest): AreaPlan {
  const bad = invalid(req)
  if (bad) return { tiles: 0, estimatedBytes: 0, allowed: false, reason: bad }
  const tiles = countTiles(req)
  const estimatedBytes = tiles * AVG_TILE_BYTES
  if (tiles <= AREA_MAX_TILES) {
    if (estimatedBytes > AREA_MAX_BYTES)
      return {
        tiles,
        estimatedBytes,
        allowed: false,
        reason: 'The estimate is over the 50 MB limit.',
      }
    return { tiles, estimatedBytes, allowed: true }
  }
  let fit = req.maxZoom
  while (fit > req.minZoom && countTiles({ ...req, maxZoom: fit }) > AREA_MAX_TILES) fit--
  const fits = countTiles({ ...req, maxZoom: fit }) <= AREA_MAX_TILES
  return {
    tiles,
    estimatedBytes,
    allowed: false,
    reason: `${tiles.toLocaleString('en-US')} tiles is over OpenFreeMap's limit of ${AREA_MAX_TILES.toLocaleString('en-US')} for offline use.`,
    ...(fits ? { suggestedMaxZoom: fit } : {}),
  }
}

// ---- download -------------------------------------------------------------------------------

export interface AreaDownloadOptions extends Omit<GuardedGetOptions, 'allowedHosts' | 'headers'> {
  title: string
  tileJsonUrl?: string
  onProgress?: (fraction: number, message: string) => void
}

const keyOf = (req: AreaRequest): string =>
  'area-' + createHash('sha256').update(JSON.stringify(req)).digest('hex').slice(0, 16)

function openWriter(path: string, req: AreaRequest, title: string): Database.Database {
  const db = new Database(path)
  db.exec(`CREATE TABLE IF NOT EXISTS metadata (name TEXT PRIMARY KEY, value TEXT);
    CREATE TABLE IF NOT EXISTS tiles (zoom_level INTEGER, tile_column INTEGER, tile_row INTEGER, tile_data BLOB,
      PRIMARY KEY (zoom_level, tile_column, tile_row)) WITHOUT ROWID;`)
  const meta: Record<string, string> = {
    name: title,
    format: 'pbf',
    type: 'baselayer',
    minzoom: String(req.minZoom),
    maxzoom: String(req.maxZoom),
    bounds: req.bbox.join(','),
    attribution: OPENFREEMAP_ATTRIBUTION,
  }
  const put = db.prepare('INSERT OR REPLACE INTO metadata (name, value) VALUES (?, ?)')
  for (const [k, v] of Object.entries(meta)) put.run(k, v)
  return db
}

async function tileTemplate(opts: AreaDownloadOptions, signal: AbortSignal): Promise<string> {
  const res = await guardedGet(opts.tileJsonUrl ?? OPENFREEMAP_TILEJSON, {
    ...opts,
    allowedHosts: [OPENFREEMAP_HOST],
    signal,
    headers: { accept: 'application/json' },
  })
  if (!res.ok) throw new AppError('PROVIDER', `OpenFreeMap answered HTTP ${res.status}`)
  const json = (await res.json()) as { tiles?: unknown }
  const t = Array.isArray(json.tiles) ? json.tiles[0] : undefined
  if (typeof t !== 'string' || !t.includes('{z}') || !t.includes('{x}') || !t.includes('{y}'))
    throw new AppError('PROVIDER', 'OpenFreeMap sent a tile list this version cannot read')
  return t
}

/** Download the area into partial/<key>.mbtiles and install it. Throws at the 50 MB stop. */
export async function downloadArea(
  req: AreaRequest,
  opts: AreaDownloadOptions,
): Promise<StoredArchive> {
  const plan = planArea(req)
  if (!plan.allowed)
    throw new AppError('VALIDATION', plan.reason ?? 'This area cannot be downloaded')
  await ensureDir(partialDir())
  const path = join(partialDir(), `${keyOf(req)}.mbtiles`)
  const idle = idleAbort(30_000, opts.signal)
  const db = openWriter(path, req, opts.title)
  try {
    const template = await tileTemplate(opts, idle.signal)
    await fetchAll(db, req, template, opts, idle, plan.tiles)
    db.pragma('wal_checkpoint(TRUNCATE)')
  } catch (err) {
    db.close()
    if (idle.signal.aborted) throw abortError(idle.timedOut, OPENFREEMAP_TILEJSON)
    // A cap or a refusal leaves nothing worth resuming; a cancel or network error keeps the file.
    if (err instanceof AppError && err.code === 'VALIDATION') await fs.rm(path, { force: true })
    throw err
  } finally {
    idle.dispose()
  }
  db.close()
  return install(path, req, opts.title)
}

async function install(path: string, req: AreaRequest, title: string): Promise<StoredArchive> {
  const info = await inspectArchive(path, 'mbtiles')
  const sha256 = await sha256File(path)
  await moveIntoStore(path, { sha256, format: 'mbtiles' })
  const archive: StoredArchive = {
    sha256,
    kind: 'area',
    format: 'mbtiles',
    title,
    bytes: info.bytes,
    bounds: req.bbox,
    minZoom: req.minZoom,
    maxZoom: req.maxZoom,
    tileType: 'vector',
    schema: 'openmaptiles' as const,
    attribution: OPENFREEMAP_ATTRIBUTION,
    builtAt: nowIso().slice(0, 10),
    addedAt: nowIso(),
  }
  await addArchive(archive)
  return archive
}

async function fetchAll(
  db: Database.Database,
  req: AreaRequest,
  template: string,
  opts: AreaDownloadOptions,
  idle: ReturnType<typeof idleAbort>,
  totalTiles: number,
): Promise<void> {
  const has = db.prepare(
    'SELECT 1 FROM tiles WHERE zoom_level = ? AND tile_column = ? AND tile_row = ?',
  )
  const put = db.prepare('INSERT OR REPLACE INTO tiles VALUES (?, ?, ?, ?)')
  let bytes = (
    db.prepare('SELECT COALESCE(SUM(LENGTH(tile_data)), 0) AS n FROM tiles').get() as { n: number }
  ).n
  let handled = 0
  const pending: { z: number; y: number; x: number; data: Buffer }[] = []
  const flush = db.transaction((rows: typeof pending) => {
    for (const r of rows) put.run(r.z, r.x, 2 ** r.z - 1 - r.y, r.data)
  })
  const commit = (): void => {
    flush(pending.splice(0, pending.length))
  }
  const iter = tileList(req)
  let failure: unknown
  const worker = async (): Promise<void> => {
    while (failure === undefined) {
      const next = iter.next()
      if (next.done) return
      const { z, x, y } = next.value
      try {
        if (!has.get(z, x, 2 ** z - 1 - y)) {
          const data = await getTile(template, { z, x, y }, opts, idle)
          if (data) {
            bytes += data.length
            if (bytes > AREA_MAX_BYTES)
              throw new AppError(
                'VALIDATION',
                'The download reached the 50 MB limit and was stopped. Choose a smaller box or a lower highest zoom.',
              )
            pending.push({ z, x, y, data })
            if (pending.length >= COMMIT_EVERY) commit()
          }
        }
      } catch (err) {
        failure ??= err
        return
      }
      handled++
      opts.onProgress?.(handled / totalTiles, `${handled} of ${totalTiles} tiles`)
    }
  }
  await Promise.all(Array.from({ length: AREA_PARALLEL }, worker))
  // Keep what arrived, so a restart skips it.
  commit()
  if (failure !== undefined) throw failure
}

async function getTile(
  template: string,
  t: { z: number; x: number; y: number },
  opts: AreaDownloadOptions,
  idle: ReturnType<typeof idleAbort>,
): Promise<Buffer | undefined> {
  const url = template
    .replace('{z}', String(t.z))
    .replace('{x}', String(t.x))
    .replace('{y}', String(t.y))
  const res = await guardedGet(url, {
    ...opts,
    allowedHosts: [OPENFREEMAP_HOST],
    signal: idle.signal,
  })
  idle.touch()
  if (res.status === 404 || res.status === 204) return undefined
  if (!res.ok) throw new AppError('PROVIDER', `${redact(url)} answered HTTP ${res.status}`)
  return Buffer.from(await res.arrayBuffer())
}
