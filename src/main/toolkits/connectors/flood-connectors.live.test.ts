// Opt-in live checks of the flood services (LIVE=1): the response shapes the connectors expect.
// Never run in CI; each test makes one or two small requests, within the services' rate limits.
import { describe, expect, it } from 'vitest'
import { createCaseGet } from '../../case-data/http'
import type { FetchContext } from './registry'
import { nwpsConnector } from './nwps'
import { usgsWaterdataConnector } from './usgs-waterdata'

const live = process.env.LIVE === '1'

const ctxFor = (hosts: string[]): FetchContext => ({
  get: createCaseGet({
    hosts,
    version: 'live-test',
    maxBytes: () => 5_000_000,
    onResponse: () => undefined,
  }),
})

describe.skipIf(!live)('live flood services', () => {
  it('NWPS answers for a long-running gauge with category stages', async () => {
    const now = new Date()
    const r = await nwpsConnector.fetch(
      {
        range: {
          start: new Date(now.getTime() - 5 * 86_400_000).toISOString(),
          end: now.toISOString(),
        },
        area: { label: '' },
        options: { gauge: 'EADM7' },
      },
      ctxFor(['api.water.noaa.gov']),
    )
    expect(r.datasets.map((d) => d.id)).toContain('gauge-eadm7')
  }, 60_000)

  it('USGS Water Data answers for daily stage at St. Louis', async () => {
    const r = await usgsWaterdataConnector.fetch(
      {
        range: { start: '2019-06-01T00:00:00Z', end: '2019-06-15T00:00:00Z' },
        area: { label: '' },
        options: { sites: '07010000', interval: 'daily' },
      },
      ctxFor(['api.waterdata.usgs.gov']),
    )
    expect(r.datasets[0]!.id).toBe('usgs-07010000-stage')
  }, 60_000)
})
