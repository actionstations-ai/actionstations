// Catalog client (#267) against a real http server on 127.0.0.1: refresh, cache, skipped
// entries, size cap, redirects, timeout and cancel; plus update detection.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { existsSync, mkdtempSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { PackCatalogEntry, PACK_LIMITS } from '@shared/schemas/pack'
import {
  catalogBody,
  catalogEntry,
  hang,
  json,
  redirect,
  startServer,
  type TestServer,
} from './test-server'

vi.mock('electron', () => ({
  app: { on: vi.fn(), getVersion: () => '0.0.1', getPath: () => tmpdir() },
  BrowserWindow: { getAllWindows: () => [] },
}))

const { getSettings, resetSettingsCache } = await import('../settings/store')
const {
  OFFICIAL_CATALOG_URL,
  addCatalog,
  cachedCatalogs,
  catalogCachePath,
  fetchCatalog,
  findCatalogEntry,
  findUpdates,
  latestInstallable,
  normalizeCatalogUrl,
  readCachedCatalog,
  refreshCatalog,
  refreshCatalogs,
  removeCatalog,
} = await import('./catalog')

let server: TestServer
beforeAll(async () => {
  server = await startServer()
})
afterAll(() => server.close())
beforeEach(() => {
  process.env.TTX_USER_DATA = mkdtempSync(join(tmpdir(), 'ttx-ud-'))
  resetSettingsCache()
})

const entry = (over: Record<string, unknown> = {}) => PackCatalogEntry.parse(catalogEntry(over))

describe('catalog list in settings', () => {
  it('starts empty and adds the official catalog with one constant', async () => {
    expect((await getSettings()).packs.catalogs).toEqual([])
    expect(OFFICIAL_CATALOG_URL).toBe('https://actionstations.ai/packs/index.json')
    const list = await addCatalog(OFFICIAL_CATALOG_URL)
    expect(list).toMatchObject([{ url: OFFICIAL_CATALOG_URL }])
    expect(list[0]!.addedAt).toMatch(/^\d{4}-/)
  })

  it('refuses http off loopback, credentials and duplicates', async () => {
    expect(() => normalizeCatalogUrl('http://packs.example.org/index.json')).toThrow(/https/)
    expect(() => normalizeCatalogUrl('not a url')).toThrow(/https/)
    expect(() => normalizeCatalogUrl('https://u:p@packs.example.org/index.json')).toThrow(
      /user name/,
    )
    expect(normalizeCatalogUrl('http://127.0.0.1:9/index.json#x')).toBe(
      'http://127.0.0.1:9/index.json',
    )
    await addCatalog('https://packs.example.org/index.json')
    await expect(addCatalog('https://packs.example.org/index.json#again')).rejects.toMatchObject({
      code: 'CONFLICT',
    })
  })

  it('removing a catalog drops its cache file', async () => {
    const url = server.url('/remove/index.json')
    server.route('/remove/index.json', json(catalogBody([catalogEntry()])))
    await addCatalog(url)
    await refreshCatalog(url)
    expect(existsSync(catalogCachePath(url))).toBe(true)
    expect(await removeCatalog(url)).toEqual([])
    expect(existsSync(catalogCachePath(url))).toBe(false)
  })
})

describe('refreshCatalog', () => {
  it('fetches, caches for offline display and records lastFetchedAt and the name', async () => {
    const url = server.url('/ok/index.json')
    server.route(
      '/ok/index.json',
      json(catalogBody([catalogEntry(), catalogEntry({ version: '1.1.0' })])),
    )
    await addCatalog(url)
    expect(await refreshCatalog(url)).toEqual({ url, ok: true, entries: 2, skipped: 0 })
    const [source] = (await getSettings()).packs.catalogs
    expect(source).toMatchObject({ url, name: 'Test Catalog' })
    expect(source!.lastFetchedAt).toBeDefined()
    expect(source!.lastError).toBeUndefined()

    // Offline: the cache answers without the server.
    const before = server.hits.length
    const cached = await cachedCatalogs()
    expect(cached).toHaveLength(1)
    expect(cached[0]!.catalog.packs.map((p) => p.version)).toEqual(['1.0.0', '1.1.0'])
    expect(server.hits.length).toBe(before)
    expect((await findCatalogEntry(url, 'org.example.rail', '1.1.0')).version).toBe('1.1.0')
  })

  it('skips and counts invalid and duplicate entries instead of failing', async () => {
    const url = server.url('/skips/index.json')
    server.route(
      '/skips/index.json',
      json(
        catalogBody([
          catalogEntry(),
          catalogEntry({ id: 'org.example.bad', url: 'http://packs.example.org/x.aspack' }),
          catalogEntry(),
          { nonsense: true },
        ]),
      ),
    )
    await addCatalog(url)
    expect(await refreshCatalog(url)).toMatchObject({ ok: true, entries: 1, skipped: 3 })
    expect((await readCachedCatalog(url))!.skipped.map((s) => s.index)).toEqual([1, 2, 3])
  })

  it('refuses an index over 5 MB counted on the bytes, with or without Content-Length', async () => {
    const big = Buffer.alloc(PACK_LIMITS.maxCatalogBytes + 10, 0x20)
    server.route('/big-declared/index.json', (_q, res) => {
      res.writeHead(200, { 'content-length': big.length }).end(big)
    })
    server.route('/big-chunked/index.json', (_q, res) => {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(big) // no Content-Length: Transfer-Encoding chunked
    })
    for (const path of ['/big-declared/index.json', '/big-chunked/index.json']) {
      const url = server.url(path)
      await addCatalog(url)
      const r = await refreshCatalog(url)
      expect(r).toMatchObject({ ok: false, entries: 0 })
      expect(r.error).toMatch(/larger than the 5 MB limit/)
    }
    const errors = (await getSettings()).packs.catalogs.map((c) => c.lastError)
    expect(errors.every((e) => /5 MB/.test(e ?? ''))).toBe(true)
  })

  it('follows a redirect on loopback but refuses one to plain http', async () => {
    server.route('/moved/index.json', redirect('/ok2/index.json', 301))
    server.route('/ok2/index.json', json(catalogBody([catalogEntry()])))
    server.route('/to-http/index.json', redirect('http://packs.example.org/index.json'))
    const moved = server.url('/moved/index.json')
    const toHttp = server.url('/to-http/index.json')
    await addCatalog(moved)
    await addCatalog(toHttp)
    expect(await refreshCatalog(moved)).toMatchObject({ ok: true, entries: 1 })
    const r = await refreshCatalog(toHttp)
    expect(r).toMatchObject({ ok: false })
    expect(r.error).toMatch(/must use https/)
  })

  it('refuses a redirect loop', async () => {
    server.route('/loop/index.json', redirect('/loop/index.json'))
    await expect(fetchCatalog(server.url('/loop/index.json'))).rejects.toThrow(/Too many/)
  })

  it('times out when the server does not answer', async () => {
    server.route('/hang/index.json', hang)
    const url = server.url('/hang/index.json')
    await addCatalog(url)
    const r = await refreshCatalog(url, { timeoutMs: 150 })
    expect(r).toMatchObject({ ok: false })
    expect(r.error).toMatch(/did not respond in time/)
  })

  it('is cancellable', async () => {
    server.route('/cancel/index.json', hang)
    const url = server.url('/cancel/index.json')
    await addCatalog(url)
    const ac = new AbortController()
    const p = refreshCatalog(url, { signal: ac.signal })
    setTimeout(() => ac.abort(), 50)
    await expect(p).rejects.toMatchObject({ code: 'CANCELLED' })
  })

  it('reports an invalid envelope and a newer catalog format', async () => {
    server.route('/notjson/index.json', (_q, res) => void res.writeHead(200).end('<html>'))
    server.route('/newer/index.json', json(catalogBody([], { catalogVersion: 2 })))
    await expect(fetchCatalog(server.url('/notjson/index.json'))).rejects.toThrow(/not valid JSON/)
    await expect(fetchCatalog(server.url('/newer/index.json'))).rejects.toThrow(/newer version/)
  })

  it('only fetches catalogs the user added', async () => {
    await expect(refreshCatalog(server.url('/ok/index.json'))).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
    expect(await refreshCatalogs(undefined)).toEqual([])
  })

  it('treats a damaged cache file as not fetched', async () => {
    const url = 'https://packs.example.org/index.json'
    await addCatalog(url)
    mkdirSync(dirname(catalogCachePath(url)), { recursive: true })
    writeFileSync(catalogCachePath(url), '{oops')
    expect(await readCachedCatalog(url)).toBeUndefined()
    expect(await cachedCatalogs()).toEqual([])
  })
})

describe('update detection', () => {
  const entries = [
    entry({ version: '1.0.0' }),
    entry({ version: '1.2.0' }),
    entry({ version: '2.0.0', minAppVersion: '0.9.0' }), // needs a newer app
    entry({ version: '1.5.0', formatVersion: 2 }), // newer pack format
    entry({ version: '1.3.0-beta.1' }),
    entry({ id: 'org.example.other', version: '0.1.0' }),
  ]

  it('picks the highest installable version per id', () => {
    const latest = latestInstallable(entries, '0.3.0')
    expect(latest.get('org.example.rail')!.version).toBe('1.3.0-beta.1')
    expect(latest.get('org.example.other')!.version).toBe('0.1.0')
    expect(latestInstallable(entries, '1.0.0').get('org.example.rail')!.version).toBe('2.0.0')
    expect(latestInstallable(entries, '0.2.0').size).toBe(0)
  })

  it('compares against installed versions', () => {
    const updates = findUpdates(
      entries,
      [
        { id: 'org.example.rail', version: '1.0.0' },
        { id: 'org.example.other', version: '0.1.0' },
        { id: 'org.example.absent', version: '1.0.0' },
      ],
      '0.3.0',
    )
    expect(updates.map((u) => [u.id, u.installed, u.latest.version])).toEqual([
      ['org.example.rail', '1.0.0', '1.3.0-beta.1'],
    ])
  })
})
