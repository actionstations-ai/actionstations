// Fetching, assembling and keeping snapshots, with a fake HTTP layer. No network.
import { beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { ProjectLocation } from '@shared/schemas'
import { HazardHttpError, type HazardGet } from './http'
import { importLayer } from './layer'
import { planItems, sentPoint } from './plan'
import {
  DEFAULT_FETCH_OPTIONS,
  fetchSnapshot,
  resetHazardCooldowns,
  type FetchOptions,
} from './snapshot'
import * as fx from './sources/fixtures'
import { deleteSnapshot, readIndex, updateSnapshot, getSnapshot, MAX_SNAPSHOTS } from './store'

const KEY = 'firmskeyfortests0001'
const where: ProjectLocation = {
  label: 'Cook County, IL',
  lat: 41.87811,
  lon: -87.62979,
  stateFips: '17',
  countyFips: '031',
  sendPrecision: 0.01,
}
const ALL: FetchOptions['sources'] = [
  'nws_alerts',
  'nws_forecast',
  'usgs_recent',
  'usgs_historical',
  'firms',
  'openfema',
]
const opts = (sources = ALL): FetchOptions => ({ ...DEFAULT_FETCH_OPTIONS, sources })

/** Answers by host and path; records every URL asked. */
function router(overrides: Record<string, () => string | Error> = {}) {
  const urls: string[] = []
  const get: HazardGet = async (url) => {
    urls.push(url)
    const table: [string, () => string | Error][] = [
      ['alerts/active', () => JSON.stringify(fx.NWS_ALERTS)],
      ['/points/', () => JSON.stringify(fx.NWS_POINTS)],
      ['/forecast', () => JSON.stringify(fx.NWS_FORECAST)],
      ['earthquake.usgs.gov', () => JSON.stringify(fx.USGS_QUAKES)],
      ['firms.modaps', () => fx.FIRMS_CSV],
      ['fema.gov', () => JSON.stringify(fx.OPENFEMA)],
    ]
    const hit = [...Object.entries(overrides), ...table].find(([k]) => url.includes(k))
    const out = hit ? hit[1]() : new Error('unexpected ' + url)
    if (out instanceof Error) throw out
    return { status: 200, text: out }
  }
  return { get, urls }
}

let root: string
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'ttx-hazards-'))
  resetHazardCooldowns()
})

describe('fetchSnapshot', () => {
  it('sends only rounded coordinates and writes a dated snapshot', async () => {
    const net = router()
    const snap = await fetchSnapshot(root, where, opts(), { get: net.get, firmsKey: KEY })
    for (const u of net.urls.filter((u) => !u.includes('fema'))) {
      expect(u).not.toContain('41.87811')
      expect(u).not.toContain('87.62979')
    }
    expect(net.urls.some((u) => u.includes('point=41.88,-87.63'))).toBe(true)
    expect(snap.request).toMatchObject({
      lat: 41.88,
      lon: -87.63,
      precision: 0.01,
      stateFips: '17',
    })
    expect(snap.alerts).toHaveLength(2)
    expect(snap.forecast).toHaveLength(2)
    expect(snap.earthquakes.recent).toHaveLength(2)
    expect(snap.earthquakes.historical).toHaveLength(2)
    expect(snap.fires?.count).toBe(2)
    expect(snap.declarations).toHaveLength(2)
    const index = await readIndex(root)
    expect(index.active).toBe(snap.id)
    expect(index.snapshots).toHaveLength(1)
  })

  it('rounds to 0.1 degrees when the project asks for it', async () => {
    const net = router()
    await fetchSnapshot(root, { ...where, sendPrecision: 0.1 }, opts(['nws_alerts']), {
      get: net.get,
    })
    expect(net.urls[0]).toContain('point=41.9,-87.6')
  })

  it('records the attribution for each source, including the exact OpenFEMA statement', async () => {
    const snap = await fetchSnapshot(root, where, opts(['usgs_recent', 'openfema']), {
      get: router().get,
      now: () => new Date('2026-10-29T12:00:00Z'),
    })
    const fema = snap.sources.find((s) => s.id === 'openfema')!
    expect(fema.attribution).toContain(
      "This product uses the Federal Emergency Management Agency's OpenFEMA API, but is not endorsed by FEMA.",
    )
    expect(fema.attribution).toContain('accessed 2026-10-29')
    expect(snap.sources.find((s) => s.id === 'usgs_recent')!.attribution).toBe(
      'Credit: U.S. Geological Survey',
    )
  })

  it('lets one source fail without stopping the others', async () => {
    const net = router({ 'earthquake.usgs.gov': () => new Error('boom') })
    const snap = await fetchSnapshot(root, where, opts(['usgs_recent', 'openfema', 'nws_alerts']), {
      get: net.get,
    })
    const status = Object.fromEntries(snap.sources.map((s) => [s.id, s.status]))
    expect(status).toEqual({ usgs_recent: 'error', openfema: 'ok', nws_alerts: 'ok' })
    expect(snap.declarations).toHaveLength(2)
  })

  it('marks a source with no records as empty', async () => {
    const net = router({ 'alerts/active': () => JSON.stringify({ features: [] }) })
    const snap = await fetchSnapshot(root, where, opts(['nws_alerts']), { get: net.get })
    expect(snap.sources[0]!.status).toBe('empty')
  })

  it('skips US-only sources for a place without a state code', async () => {
    const net = router()
    const abroad: ProjectLocation = {
      label: 'Wellington',
      lat: -41.29,
      lon: 174.78,
      sendPrecision: 0.01,
    }
    const snap = await fetchSnapshot(
      root,
      abroad,
      opts(['nws_alerts', 'openfema', 'usgs_recent']),
      {
        get: net.get,
      },
    )
    const status = Object.fromEntries(snap.sources.map((s) => [s.id, s.status]))
    expect(status).toEqual({ nws_alerts: 'skipped', openfema: 'skipped', usgs_recent: 'ok' })
    expect(net.urls.every((u) => u.includes('usgs.gov'))).toBe(true)
  })

  it('does not retry a rate limit and refuses that source for a minute', async () => {
    let n = 0
    const net = router({
      'fema.gov': () => {
        n++
        throw new HazardHttpError('limit', 429)
      },
    })
    const now = new Date('2026-10-29T12:00:00Z')
    const first = await fetchSnapshot(root, where, opts(['openfema']), {
      get: net.get,
      now: () => now,
    })
    expect(first.sources[0]).toMatchObject({ status: 'error', httpStatus: 429 })
    expect(first.sources[0]!.error).toMatch(/Not retried/)
    const again = await fetchSnapshot(root, where, opts(['openfema']), {
      get: net.get,
      now: () => now,
    })
    expect(again.sources[0]).toMatchObject({ status: 'skipped' })
    expect(n).toBe(1)
    const later = new Date(now.getTime() + 61_000)
    await fetchSnapshot(root, where, opts(['openfema']), { get: net.get, now: () => later })
    expect(n).toBe(2)
  })

  it('asks the alerts endpoint at most once every 30 seconds', async () => {
    const net = router()
    const t0 = new Date('2026-10-29T12:00:00Z')
    await fetchSnapshot(root, where, opts(['nws_alerts']), { get: net.get, now: () => t0 })
    const soon = await fetchSnapshot(root, where, opts(['nws_alerts']), {
      get: net.get,
      now: () => new Date(t0.getTime() + 10_000),
    })
    expect(soon.sources[0]!.status).toBe('skipped')
    expect(net.urls).toHaveLength(1)
  })

  it('keeps the FIRMS map key out of the snapshot, the index and error text', async () => {
    const net = router({
      firms: () => {
        throw new HazardHttpError(
          `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${KEY}/x answered HTTP 500`,
          500,
        )
      },
    })
    const snap = await fetchSnapshot(root, where, opts(['firms']), { get: net.get, firmsKey: KEY })
    expect(snap.sources[0]!.url).toContain('<MAP_KEY>')
    const files = readdirSync(join(root, 'hazards'))
    for (const f of files) expect(readFileSync(join(root, 'hazards', f), 'utf8')).not.toContain(KEY)
    const ok = await fetchSnapshot(root, where, opts(['firms']), {
      get: router().get,
      firmsKey: KEY,
    })
    expect(JSON.stringify(ok)).not.toContain(KEY)
    for (const f of readdirSync(join(root, 'hazards')))
      expect(readFileSync(join(root, 'hazards', f), 'utf8')).not.toContain(KEY)
  })

  it('refuses to run with no source chosen', async () => {
    await expect(fetchSnapshot(root, where, opts([]), { get: router().get })).rejects.toThrow(
      /at least one/,
    )
  })
})

describe('keeping snapshots', () => {
  const one = (get = router().get) => fetchSnapshot(root, where, opts(['openfema']), { get })

  it('keeps 10 and drops the oldest unpinned one', async () => {
    const first = await one()
    for (let i = 0; i < MAX_SNAPSHOTS; i++) await one()
    const index = await readIndex(root)
    expect(index.snapshots).toHaveLength(MAX_SNAPSHOTS)
    expect(index.snapshots.some((s) => s.id === first.id)).toBe(false)
    expect(readdirSync(join(root, 'hazards'))).toHaveLength(MAX_SNAPSHOTS + 1)
  })

  it('never drops a pinned snapshot, and refuses a new one when all ten are pinned', async () => {
    const first = await one()
    await updateSnapshot(root, first.id, { pinned: true })
    for (let i = 0; i < MAX_SNAPSHOTS; i++) await one()
    expect((await readIndex(root)).snapshots.some((s) => s.id === first.id)).toBe(true)
    for (const s of (await readIndex(root)).snapshots)
      await updateSnapshot(root, s.id, { pinned: true })
    await expect(one()).rejects.toThrow(/Unpin or delete/)
  })

  it('labels, activates and deletes', async () => {
    const a = await one()
    const b = await one()
    expect((await readIndex(root)).active).toBe(b.id)
    await updateSnapshot(root, a.id, { label: 'Before the storm', active: true })
    expect((await readIndex(root)).active).toBe(a.id)
    expect((await getSnapshot(root, a.id)).label).toBe('Before the storm')
    const after = await deleteSnapshot(root, a.id)
    expect(after.active).toBeUndefined()
    expect(after.snapshots.map((s) => s.id)).toEqual([b.id])
  })

  it('refuses an id that could leave the folder', async () => {
    await expect(getSnapshot(root, '../project')).rejects.toThrow(/Invalid snapshot id/)
  })
})

describe('imported layers', () => {
  it('adds a layer to the active snapshot and sends nothing', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ttx-layer-'))
    const file = join(dir, 'h.geojson')
    writeFileSync(file, JSON.stringify(fx.LAYER_GEOJSON))
    const snap = await one2()
    const next = await importLayer(root, where, {
      file,
      layer: 'Hospitals',
      source: 'HIFLD archive',
      radiusKm: 50,
    })
    expect(next.id).toBe(snap.id)
    expect(next.infrastructure[0]!.features[0]!.name).toBe('Lakeside General')
    expect(next.sources.some((s) => s.id === 'infrastructure' && s.url === undefined)).toBe(true)
  })

  async function one2() {
    return fetchSnapshot(root, where, opts(['openfema']), { get: router().get })
  }
})

describe('the consent plan', () => {
  it('lists host, rounded values and reasons without any network call', () => {
    const items = planItems(where, DEFAULT_FETCH_OPTIONS, false)
    const alerts = items.find((i) => i.id === 'nws_alerts')!
    expect(alerts).toMatchObject({ host: 'api.weather.gov', available: true })
    expect(alerts.sends).toContain('41.88, -87.63')
    expect(items.find((i) => i.id === 'openfema')!.sends).toContain('17 / 031')
    expect(items.find((i) => i.id === 'firms')).toMatchObject({ available: false })
    expect(sentPoint({ ...where, sendPrecision: 0.1 })).toBe('41.9, -87.6')
  })
})
