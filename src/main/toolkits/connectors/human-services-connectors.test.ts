// The human services replay connectors (spec 0464 FR-8): recorded responses (real responses,
// trimmed), the requests they build on their fixed hosts, what they refuse and what they hand
// back. The live checks are in human-services-connectors.live.test.ts and run only with LIVE=1.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import { cdcSvi, SVI_FIELDS } from './cdc-svi'
import { femaOpenShelters } from './fema-open-shelters'
import { hhsEmpower, stateOf } from './hhs-empower'
import {
  durationSeconds,
  GAO_988_FILE,
  jurisdictionOf,
  lifeline988,
  parseLifelineCsv,
  sumMonths,
} from './lifeline-988'
import { clearConnectors, registerConnector } from './registry'
import type { ConnectorQuery, FetchContext } from './registry'

const fixture = (name: string): string =>
  readFileSync(join(__dirname, '__fixtures__', name), 'utf8')

function recorded(body: string | Uint8Array): { ctx: FetchContext; urls: string[] } {
  const urls: string[] = []
  const data = typeof body === 'string' ? new TextEncoder().encode(body) : body
  return {
    urls,
    ctx: {
      async get(url) {
        urls.push(url)
        return { status: 200, data }
      },
    },
  }
}

/** The GAO file is a zip holding one CSV; the fixture is the real CSV cut to six rows. */
async function gaoZip(csv = fixture('gao-988-sample.csv')): Promise<Uint8Array> {
  const zip = new JSZip()
  zip.file('GAO-26-108114_State-by-State_988_Lifeline_Performance.csv', csv)
  return zip.generateAsync({ type: 'uint8array' })
}

const json = (d: Uint8Array | string) =>
  JSON.parse(typeof d === 'string' ? d : new TextDecoder().decode(d))

const range = { start: '2026-11-02T00:00:00Z', end: '2026-11-06T00:00:00Z' }

describe('connector registration', () => {
  it('registers with fixed public hosts and no keys', () => {
    clearConnectors()
    registerConnector(femaOpenShelters)
    registerConnector(hhsEmpower)
    registerConnector(cdcSvi)
    registerConnector(lifeline988)
    expect(femaOpenShelters.hosts).toEqual(['gis.fema.gov'])
    expect(hhsEmpower.hosts).toEqual(['services2.arcgis.com'])
    expect(cdcSvi.hosts).toEqual(['onemap.cdc.gov'])
    expect(lifeline988.hosts).toEqual(['files.gao.gov'])
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

describe('cdc-svi', () => {
  const q: ConnectorQuery = {
    range,
    area: { label: 'Cleveland west side', bbox: [-81.75, 41.45, -81.65, 41.52] },
    options: {},
  }

  it('estimates without a request, smaller for a smaller area, and refuses a large one', () => {
    const small = cdcSvi.estimate(q)
    const big = cdcSvi.estimate({ ...q, area: { label: 'x', bbox: [-82.5, 41, -81, 42] } })
    expect(small.items[0]!.datasetId).toBe('svi-tracts')
    expect(small.items[0]!.bytes).toBeLessThan(big.items[0]!.bytes)
    expect(() => cdcSvi.estimate({ ...q, area: { label: 'x' } })).toThrow(/needs an area/)
    expect(() => cdcSvi.estimate({ ...q, area: { label: 'x', bbox: [-85, 39, -80, 42] } })).toThrow(
      /larger than/,
    )
  })

  it('queries the tract layer on its host with the box, the kept fields and no boundaries', async () => {
    const { ctx, urls } = recorded(fixture('svi-tracts-cuyahoga-sample.json'))
    await cdcSvi.fetch(q, ctx)
    expect(urls.length).toBe(1)
    const u = new URL(urls[0]!)
    expect(u.host).toBe('onemap.cdc.gov')
    expect(u.pathname).toContain(
      'CDC_ATSDR_Social_Vulnerability_Index_2022_USA/FeatureServer/2/query',
    )
    expect(u.searchParams.get('geometry')).toBe('-81.75,41.45,-81.65,41.52')
    expect(u.searchParams.get('outFields')).toBe(SVI_FIELDS.join(','))
    expect(u.searchParams.get('returnGeometry')).toBe('false')
    expect(u.searchParams.get('returnCentroid')).toBe('true')
  })

  it('returns tract points with the percentile ranks and says what was changed', async () => {
    const { ctx } = recorded(fixture('svi-tracts-cuyahoga-sample.json'))
    const out = await cdcSvi.fetch(q, ctx)
    expect(out.datasets[0]).toMatchObject({ id: 'svi-tracts', kind: 'features' })
    const fc = json(out.files[0]!.data)
    expect(fc.features).toHaveLength(3)
    expect(fc.features[0].geometry.type).toBe('Point')
    expect(fc.features[0].properties).toMatchObject({
      kind: 'social_vulnerability',
      tractFips: '39035101101',
      population: 2072,
      sviOverall: 0.8908,
      noVehicle: 266,
    })
    expect(out.modified).toMatch(/centroids/)
  })

  it('keeps -999 (not computed) as empty, not as a rank', async () => {
    const body = JSON.parse(fixture('svi-tracts-cuyahoga-sample.json'))
    body.features[0].attributes.RPL_THEMES = -999
    const { ctx } = recorded(JSON.stringify(body))
    const fc = json((await cdcSvi.fetch(q, ctx)).files[0]!.data)
    expect(fc.features[0].properties.sviOverall).toBeNull()
  })

  it('refuses a response that is not the expected shape', async () => {
    const { ctx } = recorded('{"error":{"code":400}}')
    await expect(cdcSvi.fetch(q, ctx)).rejects.toThrow(/unexpected shape/)
  })
})

describe('lifeline-988-gao', () => {
  const q: ConnectorQuery = { range, area: { label: 'Ohio' }, options: { state: 'oh' } }

  it('takes only a two-letter code or US, so nothing else is matched', () => {
    expect(jurisdictionOf(q)).toBe('OH')
    expect(jurisdictionOf({ ...q, options: { state: 'us' } })).toBe('US')
    for (const s of ['Ohio', '', 'O1', "OH'"])
      expect(() => jurisdictionOf({ ...q, options: { state: s } })).toThrow(/two-letter/)
  })

  it('estimates one request for the fixed file', () => {
    const e = lifeline988.estimate(q)
    expect(e.requests).toBe(1)
    expect(e.items.map((i) => i.datasetId)).toEqual(['lifeline-988-monthly'])
  })

  it('reads the time to answer as seconds', () => {
    expect(durationSeconds('0 days 00:00:35')).toBe(35)
    expect(durationSeconds('0 days 00:01:05.5')).toBe(65.5)
    expect(durationSeconds('')).toBeNull()
  })

  it('parses the real columns and refuses a file whose columns changed', () => {
    const rows = parseLifelineCsv(fixture('gao-988-sample.csv'))
    expect(rows).toHaveLength(6)
    expect(rows[0]).toMatchObject({ state: 'AK', t: '2022-07-01T00:00:00.000Z' })
    expect(rows[0]!.routed).toEqual({ call: 704, text: null, chat: null })
    expect(() => parseLifelineCsv('State,Month,Calls\nOH,July 2022,1')).toThrow(/columns/)
  })

  it('fetches the fixed file and keeps the months of one state as a series', async () => {
    const { ctx, urls } = recorded(await gaoZip())
    const out = await lifeline988.fetch(q, ctx)
    expect(urls).toEqual([GAO_988_FILE])
    expect(new URL(urls[0]!).host).toBe('files.gao.gov')
    expect(out.datasets[0]).toMatchObject({ id: 'lifeline-988-monthly', kind: 'series' })
    expect(out.datasets[0]!.range).toEqual({
      start: '2022-07-01T00:00:00.000Z',
      end: '2025-08-01T00:00:00.000Z',
    })
    const points = json(out.files[0]!.data)
    expect(points).toHaveLength(3)
    expect(points[1].v).toMatchObject({
      callsRouted: 14985,
      callAnswerRate: 0.9134,
      callAnswerSeconds: 22,
      textsRouted: 4779,
      chatsRouted: 3648,
    })
    expect(points[0].v).not.toHaveProperty('textsRouted')
  })

  it('adds the states up for US, weighting rates by routed contacts', async () => {
    const rows = parseLifelineCsv(fixture('gao-988-sample.csv'))
    const july = sumMonths(rows).find((r) => r.t === '2025-07-01T00:00:00.000Z')!
    expect(july.routed.call).toBe(1893 + 14985)
    const expected = (1893 * 0.5869 + 14985 * 0.91338) / (1893 + 14985)
    expect(july.answerRate.call).toBeCloseTo(expected, 6)
    const { ctx } = recorded(await gaoZip())
    const out = await lifeline988.fetch({ ...q, options: { state: 'US' } }, ctx)
    expect(out.modified).toMatch(/added up/)
  })

  it('refuses a download that is not the zip it expects', async () => {
    await expect(lifeline988.fetch(q, recorded('<html></html>').ctx)).rejects.toThrow(/zip/)
    const other = new JSZip()
    other.file('other.csv', 'x')
    const bytes = await other.generateAsync({ type: 'uint8array' })
    await expect(lifeline988.fetch(q, recorded(bytes).ctx)).rejects.toThrow(/no longer holds/)
  })

  it('refuses a state the file does not have', async () => {
    const { ctx } = recorded(await gaoZip())
    await expect(lifeline988.fetch({ ...q, options: { state: 'ZZ' } }, ctx)).rejects.toThrow(
      /no rows for ZZ/,
    )
  })
})
