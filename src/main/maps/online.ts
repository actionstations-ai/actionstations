// Online maps (#436, FR-10 to FR-12). The only module that fetches map tiles for viewing.
// Nothing leaves the computer while online maps are off. Requests carry the app's User-Agent,
// no cookies and no referrer, go only to the chosen provider's host, and are cached on disk
// following Cache-Control, Expires and ETag (a tile is kept at least 7 days when the headers do
// not say). Nothing is prefetched, bulk-saved or exported from this cache.
import { createHash } from 'node:crypto'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import type { MapsSettings } from '@shared/schemas'
import { AppError } from '../lib/errors'
import { ensureDir, writeFileAtomic } from '../lib/fs'
import { OPENFREEMAP_HOST, guardedGet, isLoopback } from './net'
import { mapsDir } from './store'

type OnlineSettings = MapsSettings['online']

export const OSM_DEFAULT_TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
export const OSM_ATTRIBUTION = '© OpenStreetMap contributors'
export const OSM_COPYRIGHT_URL = 'https://www.openstreetmap.org/copyright'
export const OPENFREEMAP_ATTRIBUTION = 'OpenFreeMap © OpenMapTiles Data from OpenStreetMap'
export const MIN_CACHE_MS = 7 * 24 * 3600 * 1000
export const CACHE_CAP_BYTES = 500 * 1024 * 1024
const MAX_ONLINE_BYTES = 8 * 1024 * 1024

export const OFFLINE_MESSAGE =
  'Online maps are off. Turn them on in Settings › Maps or choose offline map data.'

/** The host a request may go to under these settings; undefined when online maps are off. */
export function providerHost(s: OnlineSettings): string | undefined {
  if (!s.enabled) return undefined
  if (s.provider === 'openfreemap') return OPENFREEMAP_HOST
  if (s.provider === 'osm')
    return new URL(s.osmUrl ?? OSM_DEFAULT_TILE_URL.replace(/\{.\}/g, '0')).hostname
  return s.customUrl ? new URL(s.customUrl.replace(/\{[^}]*\}/g, '0')).hostname : undefined
}

export function assertOnlineAllowed(s: OnlineSettings, url: string): void {
  if (!s.enabled) throw new AppError('FORBIDDEN', OFFLINE_MESSAGE)
  const host = providerHost(s)
  if (!host || !URL.canParse(url) || new URL(url).hostname.toLowerCase() !== host.toLowerCase())
    throw new AppError('FORBIDDEN', 'That address is not the map provider you chose')
}

// ---- cache policy (FR-11) ---------------------------------------------------------------------

export interface CacheMeta {
  fetchedAt: number
  expiresAt: number
  etag?: string
  contentType: string
}

/** When a response may be reused until: its headers, but never sooner than 7 days. */
export function expiryFor(headers: Headers, now: number): number {
  const cc = headers.get('cache-control') ?? ''
  const max = /(?:^|,)\s*max-age=(\d+)/i.exec(cc)
  let ms: number | undefined
  if (max) ms = Number(max[1]) * 1000
  else {
    const exp = Date.parse(headers.get('expires') ?? '')
    if (Number.isFinite(exp)) ms = exp - now
  }
  // The OSM policy asks clients to cache for at least 7 days when the server says nothing.
  return now + (ms === undefined ? MIN_CACHE_MS : Math.max(ms, 0))
}

const cacheDir = (): string => mapsDir('http-cache')
const keyOf = (url: string): string => createHash('sha256').update(url).digest('hex')

async function readCached(url: string): Promise<{ meta: CacheMeta; data: Buffer } | undefined> {
  const base = join(cacheDir(), keyOf(url))
  try {
    const [meta, data] = await Promise.all([
      fs.readFile(`${base}.json`, 'utf8').then((t) => JSON.parse(t) as CacheMeta),
      fs.readFile(`${base}.bin`),
    ])
    return { meta, data }
  } catch {
    return undefined
  }
}

async function writeCached(url: string, meta: CacheMeta, data: Uint8Array): Promise<void> {
  await ensureDir(cacheDir())
  const base = join(cacheDir(), keyOf(url))
  await writeFileAtomic(`${base}.bin`, data)
  await writeFileAtomic(`${base}.json`, JSON.stringify(meta))
}

/** Delete the oldest cache files until the cache fits its cap (LRU by modification time). */
export async function pruneCache(cap = CACHE_CAP_BYTES): Promise<void> {
  const names = await fs.readdir(cacheDir()).catch(() => [] as string[])
  const files = await Promise.all(
    names.map(async (n) => {
      const st = await fs.stat(join(cacheDir(), n)).catch(() => undefined)
      return st ? { n, size: st.size, at: st.mtimeMs } : undefined
    }),
  )
  const live = files.filter((f): f is NonNullable<typeof f> => f !== undefined)
  let total = live.reduce((s, f) => s + f.size, 0)
  for (const f of live.sort((a, b) => a.at - b.at)) {
    if (total <= cap) break
    await fs.rm(join(cacheDir(), f.n), { force: true })
    total -= f.size
  }
}

export interface OnlineResponse {
  data: Uint8Array
  contentType: string
}

export interface OnlineFetchOptions {
  settings: OnlineSettings
  fetchImpl?: typeof fetch
  now?: number
  signal?: AbortSignal
}

/** Fetch one resource (tile, style, glyph range or sprite) for viewing, through the cache. */
export async function fetchOnline(url: string, opts: OnlineFetchOptions): Promise<OnlineResponse> {
  assertOnlineAllowed(opts.settings, url)
  // http is accepted only when the provider the user chose is on this computer.
  const loopback = isLoopback(url)
  const now = opts.now ?? Date.now()
  const cached = await readCached(url)
  if (cached && cached.meta.expiresAt > now)
    return { data: cached.data, contentType: cached.meta.contentType }
  const res = await guardedGet(url, {
    allowedHosts: [providerHost(opts.settings) ?? ''],
    ...(opts.fetchImpl ? { fetchImpl: opts.fetchImpl } : {}),
    ...(loopback ? { allowLoopback: true } : {}),
    ...(opts.signal ? { signal: opts.signal } : {}),
    headers: cached?.meta.etag ? { 'if-none-match': cached.meta.etag } : {},
  })
  if (res.status === 304 && cached) {
    const meta = { ...cached.meta, fetchedAt: now, expiresAt: expiryFor(res.headers, now) }
    await writeCached(url, meta, cached.data)
    return { data: cached.data, contentType: meta.contentType }
  }
  if (!res.ok) throw new AppError('PROVIDER', `The map provider answered HTTP ${res.status}`)
  const data = new Uint8Array(await res.arrayBuffer())
  if (data.byteLength > MAX_ONLINE_BYTES)
    throw new AppError('PROVIDER', 'The map provider sent a file that is too large')
  const contentType = res.headers.get('content-type') ?? 'application/octet-stream'
  const noStore = /no-store/i.test(res.headers.get('cache-control') ?? '')
  if (!noStore) {
    const etag = res.headers.get('etag')
    await writeCached(
      url,
      {
        fetchedAt: now,
        expiresAt: expiryFor(res.headers, now),
        contentType,
        ...(etag ? { etag } : {}),
      },
      data,
    )
  }
  return { data, contentType }
}

// ---- what the map engine needs ------------------------------------------------------------------

const b64 = (s: string): string => Buffer.from(s, 'utf8').toString('base64url')
export const unb64 = (s: string): string => Buffer.from(s, 'base64url').toString('utf8')

/** The renderer asks for these by `asmap://` address; main decodes them back to https URLs. */
export const tileAddress = (template: string): string => `asmap://t/${b64(template)}/{z}/{x}/{y}`

export interface OnlineMapSetup {
  provider: OnlineSettings['provider']
  attribution: string
  attributionUrl?: string
  /** A MapLibre style (vector providers) or a raster tile address (OSM and raster custom). */
  style?: Record<string, unknown>
  rasterTiles?: string
  tileSize?: number
  /** Always false: the OSM policy forbids prefetching, and the engine is set up not to. */
  prefetch: false
}

const styleUrl = (s: OnlineSettings): string => `https://${OPENFREEMAP_HOST}/styles/${s.style}`

type Json = Record<string, unknown>

/** Rewrite a remote style so every source, glyph and sprite goes through `asmap://`. */
export async function rewriteStyle(
  styleJson: Json,
  base: string,
  loadJson: (url: string) => Promise<Json>,
): Promise<Json> {
  const out = structuredClone(styleJson)
  const sources = (out.sources ?? {}) as Record<string, Json>
  for (const [name, src] of Object.entries(sources)) {
    let tiles = src.tiles as string[] | undefined
    if (typeof src.url === 'string') {
      const tj = await loadJson(new URL(src.url, base).href)
      tiles = tj.tiles as string[] | undefined
      for (const k of ['minzoom', 'maxzoom', 'bounds', 'attribution'])
        if (tj[k] !== undefined) src[k] = tj[k]
      delete src.url
    }
    if (tiles?.[0])
      src.tiles = [
        tileAddress(new URL(tiles[0], base).href.replace(/%7B/gi, '{').replace(/%7D/gi, '}')),
      ]
    sources[name] = src
  }
  if (typeof out.glyphs === 'string')
    out.glyphs = `asmap://g/${b64(out.glyphs)}/{fontstack}/{range}`
  if (typeof out.sprite === 'string')
    out.sprite = `asmap://s/${b64(new URL(out.sprite, base).href)}`
  return out
}

export async function onlineSetup(
  s: OnlineSettings,
  load: (url: string) => Promise<OnlineResponse>,
): Promise<OnlineMapSetup> {
  if (!s.enabled) throw new AppError('FORBIDDEN', OFFLINE_MESSAGE)
  const loadJson = async (u: string): Promise<Json> =>
    JSON.parse(Buffer.from((await load(u)).data).toString('utf8')) as Json
  if (s.provider === 'osm') {
    return {
      provider: 'osm',
      attribution: OSM_ATTRIBUTION,
      attributionUrl: OSM_COPYRIGHT_URL,
      rasterTiles: tileAddress(s.osmUrl ?? OSM_DEFAULT_TILE_URL),
      tileSize: 256,
      prefetch: false as const,
    }
  }
  if (s.provider === 'openfreemap') {
    const url = styleUrl(s)
    return {
      provider: 'openfreemap',
      attribution: OPENFREEMAP_ATTRIBUTION,
      style: await rewriteStyle(await loadJson(url), url, loadJson),
      prefetch: false as const,
    }
  }
  if (!s.customUrl || !s.customAttribution?.trim())
    throw new AppError('VALIDATION', 'A custom map needs an address and an attribution')
  const attribution = s.customAttribution.trim()
  if (s.customUrl.includes('{z}'))
    return {
      provider: 'custom',
      attribution,
      rasterTiles: tileAddress(s.customUrl),
      tileSize: 256,
      prefetch: false as const,
    }
  return {
    provider: 'custom',
    attribution,
    style: await rewriteStyle(await loadJson(s.customUrl), s.customUrl, loadJson),
    prefetch: false as const,
  }
}
