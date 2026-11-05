// Opt-in checks against the real space weather services (LIVE=1). A handful of small requests;
// never run in CI. They show whether a service changed its format.
import { describe, expect, it } from 'vitest'
import { createCaseGet } from '../../case-data/http'
import { nceiSwpcArchiveConnector } from './ncei-swpc-archive'
import { swpcRealtimeConnector } from './swpc-realtime'
import { usgsGeomagConnector } from './usgs-geomag'

const LIVE = process.env.LIVE === '1'

const liveGet = (hosts: readonly string[]) =>
  createCaseGet({
    hosts,
    version: 'live-test',
    maxBytes: () => 20_000_000,
    onResponse: () => undefined,
  })

describe.skipIf(!LIVE)('space weather services (live)', () => {
  const area = { label: 'Planetary' }

  it('the NCEI archive still serves the May 2024 daily indices in the layout we read', async () => {
    const r = await nceiSwpcArchiveConnector.fetch(
      { range: { start: '2024-05-10T00:00:00Z', end: '2024-05-12T00:00:00Z' }, area, options: {} },
      { get: liveGet(nceiSwpcArchiveConnector.hosts) },
    )
    const kp = JSON.parse(String(r.files[0]!.data)) as { v: number }[]
    expect(kp).toHaveLength(16)
    expect(Math.max(...kp.map((p) => p.v))).toBe(9)
  })

  it('the USGS service still returns four components for Boulder', async () => {
    const r = await usgsGeomagConnector.fetch(
      {
        range: { start: '2024-05-10T22:00:00Z', end: '2024-05-10T23:00:00Z' },
        area,
        options: { observatory: 'BOU' },
      },
      { get: liveGet(usgsGeomagConnector.hosts) },
    )
    expect(r.datasets).toHaveLength(4)
  })

  it('the SWPC data service still serves recent Kp, X-ray flux and messages in the shapes we read', async () => {
    const now = Date.now()
    const r = await swpcRealtimeConnector.fetch(
      {
        range: {
          start: new Date(now - 3 * 86_400_000).toISOString(),
          end: new Date(now).toISOString(),
        },
        area,
        options: { products: 'kp,xray,alerts' },
      },
      { get: liveGet(swpcRealtimeConnector.hosts) },
    )
    expect(r.datasets.map((d) => d.id)).toEqual(expect.arrayContaining(['swpc-kp', 'swpc-xray']))
  })
})
