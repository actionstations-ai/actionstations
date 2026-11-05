// The humanitarian replay connectors (#911): recorded responses (HDX HAPI and data.humdata.org
// are real, trimmed; the ReliefWeb response is built from the documented v2 shape because the
// service needs an approved application name), the URLs they build, what they refuse, and the
// licence handling. The live test is in humanitarian-connectors.live.test.ts (LIVE=1).
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { TextFile } from '@shared/schemas/case-data'
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
