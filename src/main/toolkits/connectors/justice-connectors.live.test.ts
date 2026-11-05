// Opt-in live checks of the justice services (LIVE=1): the response shapes the connectors expect.
// Never run in CI. The FBI check uses DATA_GOV_API_KEY when set and api.data.gov's shared
// DEMO_KEY otherwise (rate limited, so it may answer 429). The county jail file is about 62 MB, so
// only the state file is checked.
import { describe, expect, it } from 'vitest'
import { createCaseGet } from '../../case-data/http'
import { createFbiCdeConnector } from './fbi-cde-crime'
import { openCadCalls } from './open-cad-calls'
import type { FetchContext } from './registry'
import { veraJailTrends } from './vera-jail-trends'

const live = process.env.LIVE === '1'

const ctxFor = (hosts: readonly string[]): FetchContext => ({
  get: createCaseGet({
    hosts,
    version: 'live-test',
    maxBytes: () => 20_000_000,
    onResponse: () => undefined,
  }),
})

const day = { start: '2025-07-04T07:00:00Z', end: '2025-07-04T13:00:00Z' }
const series = (d: Uint8Array | string) =>
  JSON.parse(typeof d === 'string' ? d : new TextDecoder().decode(d))

describe.skipIf(!live)('live justice services', () => {
  it.each(['seattle', 'san_francisco'])(
    'the %s calls for service dataset answers an hourly query',
    async (city) => {
      const r = await openCadCalls.fetch(
        { range: day, area: { label: '' }, options: { city } },
        ctxFor(openCadCalls.hosts),
      )
      const points = series(r.files[0]!.data)
      expect(points.length).toBeGreaterThan(3)
      expect(points[0].v.calls).toBeGreaterThan(0)
    },
    60_000,
  )

  it('the Vera state file has the columns the connector reads', async () => {
    const r = await veraJailTrends.fetch(
      { range: day, area: { label: '' }, options: { state: 'OH' } },
      ctxFor(veraJailTrends.hosts),
    )
    const years = series(r.files[0]!.data)
    expect(years.length).toBeGreaterThan(20)
    expect(years.at(-1).v.jailPopulation).toBeGreaterThan(1000)
  }, 60_000)

  it('the FBI Crime Data Explorer answers a state query', async () => {
    const key = process.env.DATA_GOV_API_KEY || 'DEMO_KEY'
    const fbi = createFbiCdeConnector({ getKey: async () => key })
    const r = await fbi.fetch(
      {
        range: { start: '2023-01-01T00:00:00Z', end: '2023-03-31T00:00:00Z' },
        area: { label: '' },
        options: { state: 'OH' },
      },
      ctxFor(fbi.hosts),
    )
    const points = series(r.files[0]!.data)
    expect(points).toHaveLength(3)
    expect(points[0].v.violentOffenses).toBeGreaterThan(0)
    expect(points[0].v.propertyOffenses).toBeGreaterThan(0)
  }, 60_000)
})
