// Map data (#436): the store, the state map catalog and its downloads, area planning and the
// OpenFreeMap limits, the online cache policy and the archive readers. Every network call goes
// to a loopback fixture server; nothing reaches a real tile server.
import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MapCatalog, MapsSettings } from '@shared/schemas'
import {
  makeMbtiles,
  makePmtiles,
  solidPng,
  startServer,
  type FixtureServer,
} from '../../../tests/fixtures/maps/fixtures'

vi.mock('electron', () => ({
  app: { getVersion: () => '9.9.9', getPath: () => tmpdir(), isPackaged: false },
  BrowserWindow: { getAllWindows: () => [] },
}))

const archives = await import('./archives')
const area = await import('./area')
const catalog = await import('./catalog')
const download = await import('./download')
const net = await import('./net')
const online = await import('./online')
const store = await import('./store')
const { importArchive } = await import('./import-archive')

const sha = (b: Buffer | string): string => createHash('sha256').update(b).digest('hex')
let dir: string
const servers: FixtureServer[] = []

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'maps-test-'))
  process.env.TTX_USER_DATA = join(dir, 'userData')
  net.setMapsAppVersion('1.2.3')
})
afterEach(async () => {
  await archives.closeAllReaders()
  while (servers.length) await servers.pop()!.close()
})

async function serve(route: Parameters<typeof startServer>[0]): Promise<FixtureServer> {
  const s = await startServer(route)
  servers.push(s)
  return s
}

describe('the app-level store', () => {
  it('hashes a file as a stream and lists, adds and removes archives', async () => {
    const file = join(dir, 'a.mbtiles')
    makeMbtiles(file, [{ z: 0, x: 0, y: 0, data: solidPng(8, [1, 2, 3, 255]) }])
    const info = await archives.inspectArchive(file, 'mbtiles')
    expect(await store.sha256File(file)).toMatch(/^[0-9a-f]{64}$/)
    const a = await importArchive({ filePath: file, title: 'Fixture', attribution: 'Test data' })
    expect(a).toMatchObject({ kind: 'file', format: 'mbtiles', bytes: info.bytes })
    expect((await store.readStore()).archives).toHaveLength(1)
    await store.removeArchive(a.sha256)
    expect((await store.readStore()).archives).toHaveLength(0)
  })

  it('refuses a map file without bounds, and one without attribution', async () => {
    const noBounds = join(dir, 'nb.mbtiles')
    makeMbtiles(noBounds, [], { bounds: null })
    await expect(
      importArchive({ filePath: noBounds, title: 'x', attribution: 'y' }),
    ).rejects.toThrow(/no bounds/)
    const noAttr = join(dir, 'na.mbtiles')
    makeMbtiles(noAttr, [])
    await expect(importArchive({ filePath: noAttr, title: 'x' })).rejects.toThrow(/attribution/)
  })
})

describe('archive readers', () => {
  const png = solidPng(16, [200, 10, 10, 255])

  it('flips the MBTiles row (TMS) so XYZ tiles come back', async () => {
    const file = join(dir, 't.mbtiles')
    makeMbtiles(file, [
      { z: 2, x: 1, y: 0, data: solidPng(4, [1, 1, 1, 255]) },
      { z: 2, x: 1, y: 3, data: png },
    ])
    const r = await archives.openArchiveFile(file, 'mbtiles')
    expect((await r.tile(2, 1, 3))?.data).toEqual(new Uint8Array(png))
    expect((await r.tile(2, 1, 1))?.data).toBeUndefined()
    await r.close()
  })

  it('reads a PMTiles file written to the v3 layout', async () => {
    const file = join(dir, 't.pmtiles')
    makePmtiles(file, png, 'Fixture <b>data</b>')
    const info = await archives.inspectArchive(file, 'pmtiles')
    expect(info).toMatchObject({ tileType: 'raster', attribution: 'Fixture data', minZoom: 0 })
    const r = await archives.openArchiveFile(file, 'pmtiles')
    expect((await r.tile(0, 0, 0))?.contentType).toBe('image/png')
    expect(await r.tile(1, 0, 0)).toBeUndefined()
  })

  it('refuses a file that is not a map archive', async () => {
    const file = join(dir, 'x.pmtiles')
    writeFileSync(file, 'not a map')
    await expect(archives.inspectArchive(file, 'pmtiles')).rejects.toThrow()
  })

  it('serves a composite of state files: the first whose bounds hold the tile', async () => {
    const a = join(dir, 'a.mbtiles')
    makeMbtiles(a, [{ z: 0, x: 0, y: 0, data: png }])
    const base = await archives.inspectArchive(a, 'mbtiles')
    const stored = (bounds: [number, number, number, number]) => ({
      sha256: sha('a'),
      kind: 'catalog' as const,
      format: 'mbtiles' as const,
      title: 't',
      bytes: 1,
      bounds,
      minZoom: 0,
      maxZoom: 4,
      tileType: 'raster' as const,
      schema: 'none' as const,
      attribution: 'x',
      addedAt: new Date().toISOString(),
    })
    const parts = [
      { path: a, archive: stored([10, 10, 11, 11]) },
      { path: a, archive: stored(base.bounds) },
    ]
    // z0 tile centre is (0,0), which only the second archive's bounds cover... widen them.
    parts[1]!.archive.bounds = [-180, -85, 180, 85]
    expect((await archives.compositeTile(parts, 0, 0, 0))?.data).toBeDefined()
    expect(await archives.compositeTile([parts[0]!], 3, 0, 0)).toBeUndefined()
  })
})

describe('the state map catalog', () => {
  const part = (url: string, body: Buffer) => ({ url, bytes: body.length, sha256: sha(body) })
  const file = makeFile()

  function makeFile(): Buffer {
    const tmp = mkdtempSync(join(tmpdir(), 'maps-file-'))
    const p = join(tmp, 'f.pmtiles')
    makePmtiles(p, solidPng(8, [9, 9, 9, 255]), 'Fixture data')
    return readFileSync(p)
  }

  const catalogFor = (origin: string, body: Buffer, release = '2026.10') => ({
    formatVersion: 1,
    release,
    generatedAt: '2026-10-01T00:00:00Z',
    source: { name: 'Protomaps', build: '20261001', url: 'https://docs.protomaps.com/' },
    license: 'ODbL-1.0',
    attribution: '© OpenStreetMap contributors',
    entries: [
      {
        id: 'us-dc',
        name: 'District of Columbia',
        kind: 'district',
        bbox: [-77.2, 38.7, -76.9, 39.0],
        minZoom: 0,
        maxZoom: 15,
        parts: [part(`${origin}/dc-${release}.pmtiles`, body)],
      },
    ],
  })

  it('validates the format and refuses another license or a bad hash', () => {
    const good = catalogFor('https://github.com/x', file)
    expect(MapCatalog.safeParse(good).success).toBe(true)
    expect(MapCatalog.safeParse({ ...good, license: 'CC0-1.0' }).success).toBe(false)
    const bad = structuredClone(good)
    bad.entries[0]!.parts[0]!.sha256 = 'abc'
    expect(MapCatalog.safeParse(bad).success).toBe(false)
  })

  it('fetches the catalog from a fixture release, keeps it, and installs a state file', async () => {
    const srv = await serve((req, res) => {
      if (req.url === '/catalog.json') res.end(JSON.stringify(catalogFor(srv.origin, file)))
      else res.end(file)
    })
    const n = { catalogUrl: `${srv.origin}/catalog.json`, allowLoopback: true }
    const cat = await catalog.fetchCatalog(n)
    expect((await catalog.cachedCatalog())?.release).toBe('2026.10')
    expect((await catalog.entryStates(cat))[0]).toMatchObject({ installed: false })
    const installed = await catalog.installEntry(cat, cat.entries[0]!, n)
    expect(installed[0]).toMatchObject({ catalogId: 'us-dc', kind: 'catalog', builtAt: '2026.10' })
    expect((await catalog.entryStates(cat))[0]).toMatchObject({
      installed: true,
      updateAvailable: false,
    })
    expect(srv.seen[0]!.headers['user-agent']).toBe(
      'ActionStations/1.2.3 (+https://actionstations.ai)',
    )
  })

  it('downloads the new version before removing the old one when a newer release exists', async () => {
    const newer = Buffer.from(file)
    newer[newer.length - 1] = newer[newer.length - 1]! ^ 0xff // another file, same layout
    const srv = await serve((req, res) => {
      if (req.url === '/c1.json') res.end(JSON.stringify(catalogFor(srv.origin, file, '2026.10')))
      else if (req.url === '/c2.json')
        res.end(JSON.stringify(catalogFor(srv.origin, newer, '2026.11')))
      else res.end(req.url?.includes('2026.11') ? newer : file)
    })
    const first = await catalog.fetchCatalog({
      catalogUrl: `${srv.origin}/c1.json`,
      allowLoopback: true,
    })
    await catalog.installEntry(first, first.entries[0]!, {
      catalogUrl: `${srv.origin}/c1.json`,
      allowLoopback: true,
    })
    const second = await catalog.fetchCatalog({
      catalogUrl: `${srv.origin}/c2.json`,
      allowLoopback: true,
    })
    const updates = await catalog.updatesFor(second)
    expect(updates).toEqual([
      expect.objectContaining({ id: 'us-dc', installedSha: sha(file), latestSha: sha(newer) }),
    ])
    await catalog.installEntry(second, second.entries[0]!, {
      catalogUrl: `${srv.origin}/c2.json`,
      allowLoopback: true,
    })
    const have = (await store.readStore()).archives
    expect(have.map((a) => a.sha256)).toEqual([sha(newer)])
  })

  it('refuses a catalog over 1 MB', async () => {
    const srv = await serve((_req, res) => res.end('x'.repeat(catalog.CATALOG_MAX_BYTES + 10)))
    await expect(
      catalog.fetchCatalog({ catalogUrl: `${srv.origin}/c.json`, allowLoopback: true }),
    ).rejects.toThrow(/larger|too large|limit/i)
  })
})

describe('resumable downloads', () => {
  const body = Buffer.from('0123456789'.repeat(5000))

  function ranged(
    etag: string,
    cutAt?: { n: number },
  ): (req: IncomingMessage, res: ServerResponse) => void {
    return (req, res) => {
      const range = /bytes=(\d+)-/.exec(String(req.headers.range ?? ''))
      const ifRange = req.headers['if-range']
      const honour = range && (!ifRange || ifRange === etag)
      const start = honour ? Number(range[1]) : 0
      res.writeHead(honour ? 206 : 200, { etag, 'content-length': body.length - start })
      const slice = body.subarray(start)
      if (cutAt && cutAt.n > 0) {
        res.write(slice.subarray(0, cutAt.n))
        cutAt.n = 0
        setTimeout(() => res.destroy(), 20)
      } else res.end(slice)
    }
  }

  const req = (url: string, expected: string, key = 'k1') => ({
    url,
    key,
    expectedSha256: expected,
    maxBytes: body.length,
    allowedHosts: [],
    allowLoopback: true,
  })

  it('resumes with Range and If-Range after an interrupted transfer', async () => {
    const cut = { n: 20_000 }
    const srv = await serve(ranged('"v1"', cut))
    await expect(download.downloadFile(req(`${srv.origin}/f`, sha(body)))).rejects.toThrow()
    const got = await download.downloadFile(req(`${srv.origin}/f`, sha(body)))
    expect(got.resumedFrom).toBeGreaterThan(0)
    expect(got.sha256).toBe(sha(body))
    const second = srv.seen.at(-1)!.headers
    expect(second['range']).toMatch(/^bytes=\d+-$/)
    expect(second['if-range']).toBe('"v1"')
  })

  it('starts again from zero when the ETag changed', async () => {
    const cut = { n: 20_000 }
    let etag = '"v1"'
    const srv = await serve((rq, rs) => ranged(etag, cut)(rq, rs))
    await expect(download.downloadFile(req(`${srv.origin}/f`, sha(body), 'k2'))).rejects.toThrow()
    etag = '"v2"'
    const got = await download.downloadFile(req(`${srv.origin}/f`, sha(body), 'k2'))
    expect(got.resumedFrom).toBe(0)
    expect(got.sha256).toBe(sha(body))
  })

  it('deletes the file and fails on a checksum mismatch', async () => {
    const srv = await serve(ranged('"v1"'))
    await expect(download.downloadFile(req(`${srv.origin}/f`, sha('other'), 'k3'))).rejects.toThrow(
      /checksum/,
    )
    const left = readdirSync(store.partialDir()).filter((f) => f.startsWith('k3'))
    expect(left).toEqual([])
  })

  it('refuses a redirect to an http address that is not on this computer', async () => {
    const srv = await serve((_rq, rs) => {
      rs.writeHead(302, { location: 'http://example.com/f' })
      rs.end()
    })
    await expect(download.downloadFile(req(`${srv.origin}/f`, sha(body), 'k4'))).rejects.toThrow(
      /https/,
    )
  })

  it('refuses a host that is not allowed', () => {
    expect(() =>
      net.assertMapUrl('https://evil.example/x', { allowedHosts: net.GITHUB_HOSTS }),
    ).toThrow(/not an allowed map host/)
    expect(() =>
      net.assertMapUrl('http://github.com/x', { allowedHosts: net.GITHUB_HOSTS }),
    ).toThrow(/https/)
    expect(() =>
      net.assertMapUrl('https://github.com/x', { allowedHosts: net.GITHUB_HOSTS }),
    ).not.toThrow()
  })

  it('stops a body larger than the size the catalog gave', async () => {
    const srv = await serve((_rq, rs) => rs.end(Buffer.alloc(body.length + 5000)))
    await expect(
      download.downloadFile({ ...req(`${srv.origin}/f`, sha(body), 'k5') }),
    ).rejects.toThrow(/larger/)
  })
})

describe('area planning (OpenFreeMap offline limits)', () => {
  const lakeport = {
    bbox: [-83.0, 39.9, -82.9, 40.0] as [number, number, number, number],
    minZoom: 8,
    maxZoom: 12,
  }

  it('counts tiles and estimates size', () => {
    const plan = area.planArea(lakeport)
    expect(plan.tiles).toBe(area.countTiles(lakeport))
    expect(plan.allowed).toBe(true)
    expect(plan.estimatedBytes).toBe(plan.tiles * area.AVG_TILE_BYTES)
  })

  it('refuses above 3,000 tiles and suggests a lower highest zoom', () => {
    const wide = {
      bbox: [-84, 39, -82, 40] as [number, number, number, number],
      minZoom: 8,
      maxZoom: 14,
    }
    const plan = area.planArea(wide)
    expect(plan.allowed).toBe(false)
    expect(plan.reason).toMatch(/3,000/)
    expect(plan.suggestedMaxZoom).toBeLessThan(14)
    expect(area.countTiles({ ...wide, maxZoom: plan.suggestedMaxZoom! })).toBeLessThanOrEqual(3000)
  })

  it('refuses a box over the antimeridian and bad zoom levels', () => {
    expect(area.planArea({ bbox: [170, 10, -170, 20], minZoom: 0, maxZoom: 4 }).allowed).toBe(false)
    expect(area.planArea({ ...lakeport, maxZoom: 16 }).allowed).toBe(false)
    expect(area.planArea({ ...lakeport, minZoom: 9, maxZoom: 8 }).allowed).toBe(false)
  })

  async function tileServer(opts: {
    tileBytes: number
    failOnce?: boolean
    counts?: Map<string, number>
  }) {
    let failed = false
    const srv = await serve((rq, rs) => {
      if (rq.url === '/planet')
        return void rs.end(JSON.stringify({ tiles: [`${srv.origin}/t/{z}/{x}/{y}.pbf`] }))
      const hits = opts.counts
      hits?.set(rq.url!, (hits.get(rq.url!) ?? 0) + 1)
      if (opts.failOnce && !failed && rq.url!.endsWith('.pbf') && hits?.size === 3) {
        failed = true
        rs.statusCode = 500
        return void rs.end()
      }
      rs.end(Buffer.alloc(opts.tileBytes, 1))
    })
    return srv
  }

  const small = {
    bbox: [-83.0, 39.9, -82.99, 39.91] as [number, number, number, number],
    minZoom: 10,
    maxZoom: 12,
  }

  it('downloads into MBTiles with the app User-Agent and installs it', async () => {
    const srv = await tileServer({ tileBytes: 500 })
    const archive = await area.downloadArea(small, {
      title: 'Lakeport',
      tileJsonUrl: `${srv.origin}/planet`,
      allowLoopback: true,
    })
    expect(archive).toMatchObject({ kind: 'area', format: 'mbtiles', schema: 'openmaptiles' })
    expect(archive.attribution).toBe('OpenFreeMap © OpenMapTiles Data from OpenStreetMap')
    for (const s of srv.seen)
      expect(s.headers['user-agent']).toBe('ActionStations/1.2.3 (+https://actionstations.ai)')
    const r = await archives.openArchiveFile(
      join(store.archivesDir(), `${archive.sha256}.mbtiles`),
      'mbtiles',
    )
    expect(await r.tile(10, 0, 0)).toBeUndefined()
    await r.close()
  })

  it('never has more than 4 requests in flight', async () => {
    let live = 0
    let peak = 0
    const srv = await serve(async (rq, rs) => {
      if (rq.url === '/planet')
        return void rs.end(JSON.stringify({ tiles: [`${srv.origin}/t/{z}/{x}/{y}`] }))
      peak = Math.max(peak, ++live)
      await new Promise((r) => setTimeout(r, 15))
      live--
      rs.end(Buffer.alloc(100))
    })
    await area.downloadArea(
      { ...small, maxZoom: 13 },
      { title: 'P', tileJsonUrl: `${srv.origin}/planet`, allowLoopback: true },
    )
    expect(peak).toBeLessThanOrEqual(4)
    expect(peak).toBeGreaterThan(1)
  })

  it('stops at 50 MB and keeps nothing', async () => {
    const srv = await tileServer({ tileBytes: 6 * 1024 * 1024 })
    const wide = {
      bbox: [-83.0, 39.9, -82.8, 40.1] as [number, number, number, number],
      minZoom: 8,
      maxZoom: 10,
    }
    expect(area.planArea(wide).allowed).toBe(true)
    await expect(
      area.downloadArea(wide, {
        title: 'Big',
        tileJsonUrl: `${srv.origin}/planet`,
        allowLoopback: true,
      }),
    ).rejects.toThrow(/50 MB/)
    expect((await store.readStore()).archives).toHaveLength(0)
  })

  it('skips tiles already downloaded when it runs again', async () => {
    const counts = new Map<string, number>()
    const srv = await tileServer({ tileBytes: 200, failOnce: true, counts })
    const opts = { title: 'R', tileJsonUrl: `${srv.origin}/planet`, allowLoopback: true }
    await expect(area.downloadArea(small, opts)).rejects.toThrow()
    await area.downloadArea(small, opts)
    const tileHits = [...counts.entries()].filter(([u]) => u.startsWith('/t/'))
    const repeated = tileHits.filter(([, n]) => n > 1)
    expect(repeated.length).toBeLessThanOrEqual(area.AREA_PARALLEL + 1)
  })
})

describe('online maps and the OpenStreetMap tile policy', () => {
  const osm = (origin: string): MapsSettings['online'] =>
    MapsSettings.parse({
      online: { enabled: true, provider: 'osm', osmUrl: `${origin}/{z}/{x}/{y}.png` },
    }).online

  it('sends nothing while online maps are off', async () => {
    const srv = await serve((_rq, rs) => rs.end('x'))
    const off = MapsSettings.parse({}).online
    expect(off.enabled).toBe(false)
    await expect(online.fetchOnline(`${srv.origin}/1/2/3.png`, { settings: off })).rejects.toThrow(
      /Online maps are off/,
    )
    expect(srv.seen).toHaveLength(0)
  })

  it('refuses a host other than the chosen provider', async () => {
    const srv = await serve((_rq, rs) => rs.end('x'))
    await expect(
      online.fetchOnline('https://elsewhere.example/1/2/3.png', { settings: osm(srv.origin) }),
    ).rejects.toThrow(/not the map provider/)
  })

  it('sends the distinct User-Agent, no cookie or referrer, and caches for 7 days', async () => {
    const srv = await serve((_rq, rs) => {
      rs.setHeader('content-type', 'image/png')
      rs.end(Buffer.from('tile'))
    })
    const s = osm(srv.origin)
    const t0 = 1_000_000
    await online.fetchOnline(`${srv.origin}/3/1/2.png`, { settings: s, now: t0 })
    const h = srv.seen[0]!.headers
    expect(h['user-agent']).toBe('ActionStations/1.2.3 (+https://actionstations.ai)')
    expect(h.cookie).toBeUndefined()
    expect(h.referer).toBeUndefined()
    const again = await online.fetchOnline(`${srv.origin}/3/1/2.png`, {
      settings: s,
      now: t0 + 6 * 24 * 3600 * 1000,
    })
    expect(again.data.toString()).toBe('tile')
    expect(srv.seen).toHaveLength(1)
  })

  it('honours Cache-Control max-age and revalidates with the ETag (304)', async () => {
    const srv = await serve((rq, rs) => {
      if (rq.headers['if-none-match'] === '"t1"') {
        rs.writeHead(304, { 'cache-control': 'max-age=60' })
        return void rs.end()
      }
      rs.writeHead(200, {
        etag: '"t1"',
        'cache-control': 'max-age=60',
        'content-type': 'image/png',
      })
      rs.end(Buffer.from('tile'))
    })
    const s = osm(srv.origin)
    const url = `${srv.origin}/4/1/1.png`
    await online.fetchOnline(url, { settings: s, now: 0 })
    await online.fetchOnline(url, { settings: s, now: 30_000 })
    expect(srv.seen).toHaveLength(1)
    const revalidated = await online.fetchOnline(url, { settings: s, now: 120_000 })
    expect(srv.seen).toHaveLength(2)
    expect(srv.seen[1]!.headers['if-none-match']).toBe('"t1"')
    expect(revalidated.data.toString()).toBe('tile')
  })

  it('computes expiry from max-age, Expires, or the 7-day default', () => {
    const now = 10_000
    expect(online.expiryFor(new Headers({ 'cache-control': 'public, max-age=3600' }), now)).toBe(
      now + 3_600_000,
    )
    const exp = new Date(now + 5000).toUTCString()
    expect(online.expiryFor(new Headers({ expires: exp }), now)).toBeLessThanOrEqual(now + 5000)
    expect(online.expiryFor(new Headers(), now)).toBe(now + online.MIN_CACHE_MS)
  })

  it('serves OSM as raster tiles with attribution, no prefetch, and rewrites OpenFreeMap styles', async () => {
    const setup = await online.onlineSetup(osm('https://tile.example.org'), () =>
      Promise.reject(new Error('no')),
    )
    expect(setup).toMatchObject({
      provider: 'osm',
      attribution: '© OpenStreetMap contributors',
      prefetch: false,
      attributionUrl: 'https://www.openstreetmap.org/copyright',
    })
    const style = await online.rewriteStyle(
      {
        version: 8,
        sources: { omt: { type: 'vector', url: 'https://tiles.openfreemap.org/planet' } },
        glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
        sprite: 'https://tiles.openfreemap.org/sprites/ofm',
        layers: [],
      },
      'https://tiles.openfreemap.org/styles/liberty',
      () => Promise.resolve({ tiles: ['https://tiles.openfreemap.org/planet/v1/{z}/{x}/{y}.pbf'] }),
    )
    const text = JSON.stringify(style)
    expect(text).not.toMatch(/https?:\/\//)
    expect(text).toContain('asmap://t/')
  })

  it('needs an attribution for a custom provider', async () => {
    const custom = MapsSettings.parse({
      online: { enabled: true, provider: 'custom', customUrl: 'https://t.example/{z}/{x}/{y}.png' },
    }).online
    await expect(online.onlineSetup(custom, () => Promise.reject(new Error('no')))).rejects.toThrow(
      /attribution/,
    )
  })
})

describe('tile math', () => {
  it('maps a coordinate to its tile and back into bounds', () => {
    expect(area.tileXY(0, 0, 1)).toEqual({ x: 1, y: 1 })
    expect(archives.tileInBounds([-10, -10, 10, 10], 0, 0, 0)).toBe(true)
    // A low-zoom tile covers much more than its centre: the world tile overlaps a small box.
    expect(archives.tileInBounds([-83, 39, -82, 40], 0, 0, 0)).toBe(true)
    expect(archives.tileInBounds([-83, 39, -82, 40], 3, 0, 0)).toBe(false)
    expect(archives.tileInBounds([20, 20, 30, 30], 3, 0, 0)).toBe(false)
  })
})
