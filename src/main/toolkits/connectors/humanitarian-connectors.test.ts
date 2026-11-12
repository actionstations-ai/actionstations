// The humanitarian replay connectors (#911): recorded responses (HDX HAPI, data.humdata.org and
// the Aid Worker Security Database are real, trimmed; the AWSD fixture has its incident details,
// places and coordinates removed; the ReliefWeb response is built from the documented v2 shape
// because the service needs an approved application name), the URLs they build, what they
// refuse, and the licence handling. The live test is in humanitarian-connectors.live.test.ts (LIVE=1).
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { SeriesFile, TextFile } from '@shared/schemas/case-data'
import { awsdIncidentCounts, awsdUrl, countryOf, yearsOf } from './humanitarian-awsd'
import { eventsUrl, gdacsEvents } from './humanitarian-gdacs'
import { figuresUrls, hdxKeyFigures } from './humanitarian-hapi-figures'
import { hdxOperationalPresence, identifier, presenceUrl } from './humanitarian-hdx'
import { appnameOf, reliefwebReports, reportsUrl } from './humanitarian-reliefweb'
import type { ConnectorQuery, FetchContext } from './registry'

const fixture = (name: string): string =>
  readFileSync(join(__dirname, '__fixtures__', name), 'utf8')

const range = { start: '2026-10-13T00:00:00Z', end: '2026-10-20T00:00:00Z' }
const hdxQ: ConnectorQuery = {
  range,
  area: { label: 'Afghanistan' },
  options: {
    location: 'afg',
    sector: 'HEA',
    applicationName: 'exercise-app',
    contactEmail: 'contact@example.org',
  },
}
const rwQ: ConnectorQuery = {
  range,
  area: { label: 'Haiti' },
  options: { applicationName: 'approved-name' },
}

function recorded(
  map: Record<string, string>,
  status = 200,
): { ctx: FetchContext; urls: string[] } {
  const urls: string[] = []
  return {
    urls,
    ctx: {
      async get(url) {
        urls.push(url)
        const key = Object.keys(map).find((k) => url.includes(k))
        return {
          status: key ? status : 404,
          data: new TextEncoder().encode(key ? map[key]! : '{}'),
        }
      },
    },
  }
}

describe('hdx-operational-presence', () => {
  it('builds a query for one country with the application identifier', () => {
    const url = new URL(presenceUrl(hdxQ, 0))
    expect(url.host).toBe('hapi.humdata.org')
    expect(url.searchParams.get('location_code')).toBe('AFG')
    expect(url.searchParams.get('sector_code')).toBe('HEA')
    expect(Buffer.from(url.searchParams.get('app_identifier')!, 'base64').toString()).toBe(
      'exercise-app:contact@example.org',
    )
  })

  it('sends the app name and contact when none is entered, and refuses bad values and codes', () => {
    expect(
      Buffer.from(identifier({ ...hdxQ, options: { location: 'AFG' } }), 'base64').toString(),
    ).toBe('ActionStations:help@actionstations.ai')
    expect(() =>
      identifier({ ...hdxQ, options: { location: 'AFG', contactEmail: 'not-an-email' } }),
    ).toThrow(/not valid/)
    expect(() =>
      hdxOperationalPresence.estimate({
        ...hdxQ,
        options: { ...hdxQ.options, location: "A'; --" },
      }),
    ).toThrow(/three-letter/)
    expect(() => presenceUrl({ ...hdxQ, options: { ...hdxQ.options, sector: 'x y' } }, 0)).toThrow(
      /sector/,
    )
  })

  it('estimates without a request', () => {
    const e = hdxOperationalPresence.estimate(hdxQ)
    expect(e.items.map((i) => i.datasetId)).toEqual(['hdx-3w-rows', 'hdx-3w-summary'])
    expect(e.items[0]!.bytes).toBeGreaterThan(100_000)
  })

  it('fetches from its two fixed hosts and stores the licence it read', async () => {
    const { ctx, urls } = recorded({
      'operational-presence': fixture('hdx-hapi-presence-afg.json'),
      'metadata/resource': fixture('hdx-hapi-resource.json'),
      package_show: fixture('hdx-package-show.json'),
    })
    const out = await hdxOperationalPresence.fetch(hdxQ, ctx)
    for (const u of urls)
      expect(['hapi.humdata.org', 'data.humdata.org']).toContain(new URL(u).host)
    expect(TextFile.safeParse(JSON.parse(String(out.files[0]!.data))).success).toBe(true)
    const summary = JSON.parse(String(out.files[1]!.data)) as { title: string; text: string }[]
    expect(summary[0]!.text).toMatch(/organizations reporting/)
    expect(out.citation).toMatch(/CC BY-IGO/)
    expect(out.citation).not.toMatch(/scenario only/)
  })

  it('marks data under an unreadable or closed licence as scenario only', async () => {
    const { ctx } = recorded({
      'operational-presence': fixture('hdx-hapi-presence-afg.json'),
      'metadata/resource': fixture('hdx-hapi-resource.json'),
      package_show: JSON.stringify({ result: { license_title: 'Other (not open)' } }),
    })
    const out = await hdxOperationalPresence.fetch(hdxQ, ctx)
    expect(out.citation).toMatch(/Used in this scenario only; not exported in packs/)
  })

  it('never puts the application name in an error message', async () => {
    const { ctx } = recorded({ 'operational-presence': '{}' }, 500)
    await expect(hdxOperationalPresence.fetch(hdxQ, ctx)).rejects.not.toThrow(
      /exercise-app|contact@example/,
    )
  })
})

describe('gdacs-events', () => {
  // A real GDACS search (orange and red alerts, February and March 2023), trimmed to the fields
  // the connector reads: Cyclone Freddy and the Kahramanmaraş earthquakes among others.
  const gdQ: ConnectorQuery = {
    range: { start: '2023-02-01T00:00:00Z', end: '2023-03-31T00:00:00Z' },
    area: { label: 'Türkiye' },
    options: { location: 'tur' },
  }
  const search = { 'geteventlist/SEARCH': fixture('gdacs-events-2023-02.json') }

  it('asks for orange and red alerts in the period, with no key and no place in the request', () => {
    const url = new URL(eventsUrl(gdQ, 1))
    expect(url.host).toBe('www.gdacs.org')
    expect(url.searchParams.get('fromDate')).toBe('2023-02-01')
    expect(url.searchParams.get('toDate')).toBe('2023-03-31')
    expect(url.searchParams.get('alertlevel')).toBe('Orange;Red')
    expect(url.searchParams.has('country')).toBe(false)
    expect(
      new URL(
        eventsUrl({ ...gdQ, options: { ...gdQ.options, includeGreen: true } }, 2),
      ).searchParams.get('alertlevel'),
    ).toBe('Green;Orange;Red')
    expect(() => gdacsEvents.estimate({ ...gdQ, options: {} })).toThrow(/three-letter/)
  })

  it('keeps the events that affect the country, oldest first', async () => {
    const { ctx, urls } = recorded(search)
    const out = await gdacsEvents.fetch(gdQ, ctx)
    expect(urls).toHaveLength(1)
    const entries = JSON.parse(String(out.files[0]!.data)) as {
      t: string
      title: string
      text: string
    }[]
    expect(TextFile.safeParse(entries).success).toBe(true)
    expect(entries.map((e) => e.t)).toEqual([
      '2023-02-06T01:17:35Z',
      '2023-02-06T01:28:17Z',
      '2023-02-06T10:24:49Z',
      '2023-02-06T12:02:11Z',
      '2023-02-20T17:04:29Z',
    ])
    expect(entries[0]).toMatchObject({ title: 'Earthquake: Earthquake in Türkiye' })
    expect(entries[0]!.text).toMatch(
      /^Red alert\. Magnitude 7\.8M, Depth:17\.925km\. Countries: Türkiye\./,
    )
    expect(entries[0]!.text).toMatch(/GLIDE EQ-2023-\d+-TUR/)
    expect(out.datasets[0]).toMatchObject({ id: 'gdacs-timeline', kind: 'text' })
    expect(out.modified).toMatch(/^Orange and red alerts/)
    expect(out.citation).toMatch(/Joint Research Centre and UN OCHA/)
  })

  it('records an event that lasts by its onset and its last update', async () => {
    const out = await gdacsEvents.fetch(
      { ...gdQ, options: { location: 'MOZ' } },
      recorded(search).ctx,
    )
    const entries = JSON.parse(String(out.files[0]!.data)) as { t: string; title: string }[]
    const freddy = entries.filter((e) => e.title.includes('FREDDY'))
    expect(freddy.map((e) => e.t)).toEqual(['2023-02-06T06:00:00Z', '2023-03-12T00:00:00Z'])
    expect(freddy[0]!.title).toMatch(/^Tropical cyclone: /)
  })

  it('reads further pages only while they are full, and says when it stopped early', async () => {
    const full = JSON.stringify({
      type: 'FeatureCollection',
      features: Array.from({ length: 100 }, (_, i) => ({
        properties: {
          eventtype: 'EQ',
          eventid: i,
          alertlevel: 'Green',
          fromdate: '2023-02-10T00:00:00',
          affectedcountries: [{ iso3: 'TUR' }],
        },
      })),
    })
    const green = { ...gdQ, options: { ...gdQ.options, includeGreen: true } }
    const many = recorded({ 'geteventlist/SEARCH': full })
    const out = await gdacsEvents.fetch(green, many.ctx)
    expect(many.urls).toHaveLength(10)
    expect(out.modified).toMatch(/stopped there/)
    expect(JSON.parse(String(out.files[0]!.data))).toHaveLength(100)
    const none = recorded({ 'geteventlist/SEARCH': '' }, 204)
    const empty = await gdacsEvents.fetch(gdQ, none.ctx)
    expect(none.urls).toHaveLength(1)
    expect(JSON.parse(String(empty.files[0]!.data))).toEqual([])
  })

  it('refuses an answer that is not the event list', async () => {
    await expect(gdacsEvents.fetch(gdQ, recorded(search, 500).ctx)).rejects.toThrow(
      /GDACS answered 500/,
    )
    await expect(
      gdacsEvents.fetch(gdQ, recorded({ 'geteventlist/SEARCH': '{"features":3}' }).ctx),
    ).rejects.toThrow(/unexpected shape/)
  })
})

describe('reliefweb-reports', () => {
  it('refuses without an application name, with the settings hint', () => {
    expect(() => appnameOf({ ...rwQ, options: {} })).toThrow(/application name \(Settings\)/)
    expect(() => reliefwebReports.estimate({ ...rwQ, area: { label: "Haiti' OR 1=1" } })).toThrow(
      /country/,
    )
  })

  it('builds a v2 reports query on the fixed host', () => {
    const url = new URL(reportsUrl(rwQ))
    expect(url.host).toBe('api.reliefweb.int')
    expect(url.pathname).toBe('/v2/reports')
    expect(url.searchParams.get('appname')).toBe('approved-name')
    expect(url.searchParams.get('filter[conditions][0][value]')).toBe('Haiti')
  })

  it('keeps titles, dates, sources and links only', async () => {
    const { ctx } = recorded({ '/v2/reports': fixture('reliefweb-reports-example.json') })
    const out = await reliefwebReports.fetch(rwQ, ctx)
    const entries = JSON.parse(String(out.files[0]!.data)) as {
      t: string
      title: string
      text: string
    }[]
    expect(TextFile.safeParse(entries).success).toBe(true)
    expect(entries).toHaveLength(2)
    expect(entries[1]!.text).toMatch(/Source: Example Relief NGO, Example Agency/)
    expect(out.modified).toMatch(/titles, dates, sources and links only/)
  })

  it('explains a refused application name without repeating it', async () => {
    const { ctx } = recorded({ '/v2/reports': '{}' }, 403)
    await expect(reliefwebReports.fetch(rwQ, ctx)).rejects.toThrow(/refused the application name/)
    await expect(reliefwebReports.fetch(rwQ, ctx)).rejects.not.toThrow(/approved-name/)
  })
})

const kfQ: ConnectorQuery = {
  range: { start: '2024-12-01T00:00:00Z', end: '2024-12-20T00:00:00Z' },
  area: { label: 'Sudan' },
  options: { location: 'sdn' },
}
const kfRecorded = (packageShow = fixture('hdx-package-show.json')) =>
  recorded({
    'humanitarian-needs': fixture('hdx-hapi-needs-sdn.json'),
    'refugees-persons-of-concern': fixture('hdx-hapi-refugees-sdn.json'),
    'affected-people/idps': fixture('hdx-hapi-idps-sdn.json'),
    'coordination-context/funding': fixture('hdx-hapi-funding-sdn.json'),
    'metadata/resource': fixture('hdx-hapi-resource.json'),
    package_show: packageShow,
  })

describe('hdx-key-figures', () => {
  it('builds four national queries on HAPI with the app identity and a ten-year window', () => {
    const u = figuresUrls(kfQ)
    const needs = new URL(u.needs)
    expect(needs.host).toBe('hapi.humdata.org')
    expect(needs.pathname).toBe('/api/v2/affected-people/humanitarian-needs')
    expect(needs.searchParams.get('location_code')).toBe('SDN')
    expect(needs.searchParams.get('admin_level')).toBe('0')
    expect(needs.searchParams.get('start_date')).toBe('2015-01-01')
    expect(needs.searchParams.get('end_date')).toBe('2024-12-31')
    expect(new URL(u.refugees).searchParams.get('asylum_location_code')).toBe('SDN')
    expect(new URL(u.funding).pathname).toBe('/api/v2/coordination-context/funding')
    for (const url of Object.values(u))
      expect(
        Buffer.from(new URL(url).searchParams.get('app_identifier')!, 'base64').toString(),
      ).toBe('ActionStations:help@actionstations.ai')
  })

  it('refuses a bad country and estimates without a request', () => {
    expect(() => hdxKeyFigures.estimate({ ...kfQ, options: { location: 'Sudan' } })).toThrow(
      /three-letter/,
    )
    const e = hdxKeyFigures.estimate(kfQ)
    expect(e.items.map((i) => i.datasetId)).toEqual(['hdx-key-figures', 'hdx-key-figures-trend'])
  })

  it('summarises needs, refugees hosted, displacement and appeals for the year', async () => {
    const { ctx, urls } = kfRecorded()
    const out = await hdxKeyFigures.fetch(kfQ, ctx)
    for (const u of urls)
      expect(['hapi.humdata.org', 'data.humdata.org']).toContain(new URL(u).host)
    const entries = JSON.parse(String(out.files[0]!.data)) as { title: string; text: string }[]
    expect(TextFile.safeParse(entries).success).toBe(true)
    expect(entries[0]!.title).toBe('People in need and targeted, SDN 2024')
    expect(entries[0]!.text).toMatch(
      /^All sectors: population 50,990,034, affected 28,928,873, in need 24,786,370, targeted 14,657,114, reached 14,000,000/,
    )
    expect(entries[0]!.text).toMatch(/Food Security: in need 19,325,222, targeted 11,409,615/)
    expect(entries[1]!.text).toMatch(/refugees: 790,861/)
    expect(entries[1]!.text).toMatch(/asylum seekers: 44,522/)
    expect(entries[1]!.text).toMatch(/by origin: South Sudan 613,052, Eritrea 132,013/)
    expect(entries[2]!.text).toBe(
      'Armed Clashes in Sudan (Overview): 11,532,774 people, as of 2024-12-17',
    )
    expect(entries[3]!.text).toBe(
      'Sudan Humanitarian Needs and Response Plan 2024 (Humanitarian needs and response plan): requirements US$2695.7 million, funding US$1889.3 million, 70% funded',
    )
    const trend = JSON.parse(String(out.files[1]!.data)) as {
      t: string
      v: Record<string, number>
    }[]
    expect(SeriesFile.safeParse(trend).success).toBe(true)
    expect(trend.find((p) => p.t.startsWith('2023'))!.v.refugees_and_asylum_seekers).toBe(958_768)
    expect(trend.find((p) => p.t.startsWith('2024'))!.v).toMatchObject({
      people_in_need: 24_786_370,
      requirements_usd: 2_695_680_744,
    })
    expect(out.citation).toMatch(/Licence read at fetch: Creative Commons/)
    expect(out.citation).not.toMatch(/scenario only/)
  })

  it('marks the figures as scenario only when a licence is not open', async () => {
    const { ctx } = kfRecorded(JSON.stringify({ result: { license_title: 'Other (not open)' } }))
    const out = await hdxKeyFigures.fetch(kfQ, ctx)
    expect(out.citation).toMatch(/Used in this scenario only; not exported in packs/)
  })

  it('says so when HAPI has no figures for the country', async () => {
    const empty = JSON.stringify({ data: [] })
    const { ctx } = recorded({
      'humanitarian-needs': empty,
      'refugees-persons-of-concern': empty,
      'affected-people/idps': empty,
      'coordination-context/funding': empty,
    })
    const out = await hdxKeyFigures.fetch(kfQ, ctx)
    const entries = JSON.parse(String(out.files[0]!.data)) as { text: string }[]
    expect(entries.map((e) => e.text)).toEqual([
      'No response plan figures for SDN in HAPI.',
      'No refugee figures for SDN as a host country in HAPI.',
      'No national displacement figures for SDN in HAPI up to 2024-12-20.',
      'No appeal for SDN in 2024 in HAPI.',
    ])
    expect(out.citation).toMatch(/scenario only/)
  })
})

const awsdQ: ConnectorQuery = {
  range: { start: '2024-04-15T00:00:00Z', end: '2024-05-15T00:00:00Z' },
  area: { label: 'Sudan' },
  options: { country: 'sd' },
}

describe('awsd-incident-counts', () => {
  it('asks for one country on the fixed host, or the whole table without one', () => {
    expect(awsdUrl(awsdQ)).toBe(
      'https://www.aidworkersecurity.org/incidents/search?format=csv&country=SD',
    )
    expect(awsdUrl({ ...awsdQ, options: {} })).toBe(
      'https://www.aidworkersecurity.org/incidents/search?format=csv',
    )
    expect(countryOf({ ...awsdQ, options: {} })).toBeUndefined()
    expect(() => countryOf({ ...awsdQ, options: { country: 'SD&x=1' } })).toThrow(/two-letter/)
    expect(yearsOf(awsdQ)).toEqual([2015, 2024])
  })

  it('estimates the download without a request', () => {
    const e = awsdIncidentCounts.estimate(awsdQ)
    expect(e.requests).toBe(1)
    expect(e.items[0]!.label).toMatch(/downloads about 0.2 MB, keeps counts only/)
    expect(awsdIncidentCounts.estimate({ ...awsdQ, options: {} }).items[0]!.label).toMatch(
      /worldwide.*2.4 MB/,
    )
  })

  it('keeps yearly counts only, never incident details', async () => {
    const { ctx, urls } = recorded({ 'incidents/search': fixture('awsd-incidents-sd.csv') })
    const out = await awsdIncidentCounts.fetch(awsdQ, ctx)
    expect(urls.map((u) => new URL(u).host)).toEqual(['www.aidworkersecurity.org'])
    const series = JSON.parse(String(out.files[0]!.data)) as {
      t: string
      v: Record<string, number>
    }[]
    expect(SeriesFile.safeParse(series).success).toBe(true)
    expect(series).toHaveLength(10)
    expect(series.find((p) => p.t.startsWith('2023'))!.v).toMatchObject({
      incidents: 12,
      killed: 9,
    })
    const summary = JSON.parse(String(out.files[1]!.data)) as { title: string; text: string }[]
    expect(TextFile.safeParse(summary).success).toBe(true)
    const y2024 = summary.find((s) => s.title === 'Aid worker security, Sudan, 2024')!
    expect(y2024.text).toMatch(/^12 major incidents in Sudan in 2024, affecting 19 aid workers/)
    expect(y2024.text).toMatch(/2 of these incidents are not yet verified/)
    expect(summary[0]!.text).toBe(
      'No major incidents affecting aid workers recorded in Sudan in 2015.',
    )
    const all = out.files.map((f) => String(f.data)).join('')
    expect(all).not.toMatch(/details removed|Khartoum|Darfur/)
    expect(out.modified).toMatch(/Incident details, places, coordinates and actor names left out/)
  })

  it('refuses a browser check page and explains a 403', async () => {
    const page = '<!DOCTYPE html><title>Just a moment...</title>'
    await expect(
      awsdIncidentCounts.fetch(awsdQ, recorded({ 'incidents/search': page }).ctx),
    ).rejects.toThrow(/expected incident table/)
    await expect(
      awsdIncidentCounts.fetch(awsdQ, recorded({ 'incidents/search': page }, 403).ctx),
    ).rejects.toThrow(/browser check/)
  })
})
