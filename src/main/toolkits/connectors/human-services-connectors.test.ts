// The human services replay connectors (spec 0464 FR-8): recorded responses (real responses,
// trimmed), the requests they build on their fixed hosts, what they refuse and what they hand
// back. The live checks are in human-services-connectors.live.test.ts and run only with LIVE=1.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { femaOpenShelters } from './fema-open-shelters'
import { hhsEmpower, stateOf } from './hhs-empower'
import { clearConnectors, registerConnector } from './registry'
import type { ConnectorQuery, FetchContext } from './registry'

const fixture = (name: string): string =>
  readFileSync(join(__dirname, '__fixtures__', name), 'utf8')

function recorded(body: string): { ctx: FetchContext; urls: string[] } {
  const urls: string[] = []
  return {
    urls,
    ctx: {
      async get(url) {
        urls.push(url)
        return { status: 200, data: new TextEncoder().encode(body) }
      },
    },
  }
}

const range = { start: '2026-11-02T00:00:00Z', end: '2026-11-06T00:00:00Z' }

describe('connector registration', () => {
  it('registers with fixed public hosts and no keys', () => {
    clearConnectors()
    registerConnector(femaOpenShelters)
    registerConnector(hhsEmpower)
    expect(femaOpenShelters.hosts).toEqual(['gis.fema.gov'])
    expect(hhsEmpower.hosts).toEqual(['services2.arcgis.com'])
    clearConnectors()
  })
})

describe('fema-open-shelters', () => {
  const q: ConnectorQuery = {
    range,
    area: { label: 'Gulf coast', bbox: [-90.1, 28.9, -86.2, 31.1] },
    options: {},
  }

  it('estimates without a request, smaller for a smaller area', () => {
    const big = femaOpenShelters.estimate(q)
    const small = femaOpenShelters.estimate({
      ...q,
      area: { label: 'x', bbox: [-90.1, 30, -89.9, 30.2] },
    })
    expect(big.items[0]!.datasetId).toBe('open-shelters')
    expect(small.items[0]!.bytes).toBeLessThan(big.items[0]!.bytes)
  })

  it('refuses a missing area and an area larger than ten degrees', () => {
    expect(() => femaOpenShelters.estimate({ ...q, area: { label: 'x' } })).toThrow(/needs an area/)
    expect(() =>
      femaOpenShelters.estimate({ ...q, area: { label: 'x', bbox: [-100, 20, -80, 40] } }),
    ).toThrow(/larger than/)
  })

  it('queries the shelter layer on its host with the box and no address field', async () => {
    const { ctx, urls } = recorded(fixture('fema-open-shelters-sample.json'))
    await femaOpenShelters.fetch(q, ctx)
    expect(urls.length).toBe(1)
    const u = new URL(urls[0]!)
    expect(u.host).toBe('gis.fema.gov')
    expect(u.pathname).toContain('/NSS/OpenShelters/FeatureServer/0/query')
    expect(u.searchParams.get('geometry')).toBe('-90.1,28.9,-86.2,31.1')
    expect(u.searchParams.get('outFields')).not.toMatch(/address/)
  })

  it('returns labeled, valid features and says it is a snapshot with addresses left out', async () => {
    const { ctx } = recorded(fixture('fema-open-shelters-sample.json'))
    const out = await femaOpenShelters.fetch(q, ctx)
    expect(out.datasets[0]).toMatchObject({ id: 'open-shelters', kind: 'features' })
    expect(out.datasets[0]!.label).toMatch(/snapshot/)
    expect(out.modified).toMatch(/street addresses left out/)
    const fc = JSON.parse(new TextDecoder().decode(out.files[0]!.data as Uint8Array))
    expect(fc.type).toBe('FeatureCollection')
    expect(fc.features).toHaveLength(3)
    for (const f of fc.features) {
      expect(f.properties.kind).toBe('open_shelter')
      expect(f.properties).not.toHaveProperty('address')
    }
  })

  it('refuses a response that is not the expected shape', async () => {
    const { ctx } = recorded('{"error":"gone"}')
    await expect(femaOpenShelters.fetch(q, ctx)).rejects.toThrow(/unexpected shape/)
  })
})

describe('hhs-empower', () => {
  const q: ConnectorQuery = { range, area: { label: 'Ohio' }, options: { state: 'oh' } }

  it('takes only a two-letter code, so nothing else reaches the query', () => {
    expect(stateOf(q)).toBe('OH')
    for (const s of ["OH' OR '1'='1", 'Ohio', '', 'O1'])
      expect(() => stateOf({ ...q, options: { state: s } })).toThrow(/two-letter/)
  })

  it('estimates one request and one dataset', () => {
    const e = hhsEmpower.estimate(q)
    expect(e.requests).toBe(1)
    expect(e.items.map((i) => i.datasetId)).toEqual(['empower-counties'])
  })

  it('queries the county layer on its host for one state and asks for no boundaries', async () => {
    const { ctx, urls } = recorded(fixture('hhs-empower-oh-sample.json'))
    await hhsEmpower.fetch(q, ctx)
    const u = new URL(urls[0]!)
    expect(u.host).toBe('services2.arcgis.com')
    expect(u.searchParams.get('where')).toBe("State='OH'")
    expect(u.searchParams.get('returnGeometry')).toBe('false')
    expect(u.searchParams.get('returnCentroid')).toBe('true')
  })

  it('returns county points with counts and says what was changed', async () => {
    const { ctx } = recorded(fixture('hhs-empower-oh-sample.json'))
    const out = await hhsEmpower.fetch(q, ctx)
    const fc = JSON.parse(new TextDecoder().decode(out.files[0]!.data as Uint8Array))
    expect(fc.features).toHaveLength(3)
    expect(fc.features[0].properties).toMatchObject({
      kind: 'electricity_dependent',
      name: 'Adams',
      electricityDependent: 610,
    })
    expect(fc.features[0].geometry.type).toBe('Point')
    expect(out.modified).toMatch(/centroids/)
    expect(out.datasets[0]!.label).toMatch(/aggregate counts/)
  })
})
