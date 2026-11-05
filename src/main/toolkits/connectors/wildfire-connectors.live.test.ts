// Opt-in live checks of the wildfire services (LIVE=1): the response shapes the connectors expect.
// Never run in CI; each test makes one or two small requests within the services' limits. The
// FIRMS and AirNow checks need a key in FIRMS_MAP_KEY and AIRNOW_API_KEY and skip without one.
import { describe, expect, it } from 'vitest'
import { createCaseGet } from '../../case-data/http'
import type { FetchContext } from './registry'
import { createAirNowConnector } from './wildfire-airnow'
import { createFirmsConnector } from './wildfire-firms'
import { hmsSmokeConnector } from './wildfire-hms'
import { findFires, wfigsPerimetersConnector } from './wildfire-wfigs'

const live = process.env.LIVE === '1'

const ctxFor = (hosts: string[]): FetchContext => ({
  get: createCaseGet({
    hosts,
    version: 'live-test',
    maxBytes: () => 8_000_000,
    onResponse: () => undefined,
  }),
})

describe.skipIf(!live)('live wildfire services', () => {
  it('NIFC lists the 2018 Camp fire and returns its perimeters', async () => {
    const ctx = ctxFor(['services3.arcgis.com'])
    const fires = await findFires(ctx, { name: 'Camp', year: 2018 })
    expect(fires.some((f) => f.uniqueFireId === '2018-CABTU-016737')).toBe(true)
    const r = await wfigsPerimetersConnector.fetch(
      {
        range: { start: '2018-11-08T00:00:00Z', end: '2018-11-09T12:00:00Z' },
        area: { label: 'Butte County' },
        options: { name: 'Camp', year: 2018 },
      },
      ctx,
    )
    expect(r.datasets[0]!.id).toBe('wfigs-perimeters')
  }, 90_000)

  it('NOAA HMS serves a smoke day file', async () => {
    const r = await hmsSmokeConnector.fetch(
      {
        range: { start: '2024-05-10T00:00:00Z', end: '2024-05-10T23:00:00Z' },
        area: { label: 'Southeast', bbox: [-90, 28, -78, 36] },
        options: {},
      },
      ctxFor(['satepsanone.nesdis.noaa.gov']),
    )
    expect(r.datasets[0]!.id).toBe('hms-smoke')
  }, 90_000)

  it.skipIf(!process.env.FIRMS_MAP_KEY)(
    'FIRMS answers a small box',
    async () => {
      const connector = createFirmsConnector({
        getKey: async () => process.env.FIRMS_MAP_KEY,
        now: () => Date.now(),
      })
      const r = await connector.fetch(
        {
          range: { start: '2024-05-10T00:00:00Z', end: '2024-05-12T00:00:00Z' },
          area: { label: 'Test', bbox: [-122, 39, -121.5, 39.5] },
          options: {},
        },
        ctxFor(['firms.modaps.eosdis.nasa.gov']),
      )
      expect(r.datasets[0]!.id).toBe('firms-hotspots')
    },
    90_000,
  )

  it.skipIf(!process.env.AIRNOW_API_KEY)(
    'AirNow answers for a reporting area',
    async () => {
      const connector = createAirNowConnector({ getKey: async () => process.env.AIRNOW_API_KEY })
      const r = await connector.fetch(
        {
          range: { start: '2024-05-10T12:00:00Z', end: '2024-05-10T12:30:00Z' },
          area: { label: 'Test', bbox: [-84.6, 39.0, -84.4, 39.2] },
          options: {},
        },
        ctxFor(['www.airnowapi.org']),
      )
      expect(r.datasets[0]!.id).toBe('airnow-aqi')
    },
    90_000,
  )
})
