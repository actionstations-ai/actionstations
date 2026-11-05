// Opt-in live checks of the human services services (LIVE=1): the response shapes the connectors
// expect. Never run in CI; each test makes one or two small requests.
import { describe, expect, it } from 'vitest'
import { createCaseGet } from '../../case-data/http'
import { cdcSvi } from './cdc-svi'
import { femaOpenShelters } from './fema-open-shelters'
import { hhsEmpower } from './hhs-empower'
import { lifeline988 } from './lifeline-988'
import type { FetchContext } from './registry'

const live = process.env.LIVE === '1'

const ctxFor = (hosts: string[]): FetchContext => ({
  get: createCaseGet({
    hosts,
    version: 'live-test',
    maxBytes: () => 5_000_000,
    onResponse: () => undefined,
  }),
})

const range = { start: '2026-11-01T00:00:00Z', end: '2026-11-02T00:00:00Z' }

describe.skipIf(!live)('live human services services', () => {
  it('the FEMA open shelters service answers a box query with the fields we keep', async () => {
    const r = await femaOpenShelters.fetch(
      { range, area: { label: 'Gulf coast', bbox: [-90.5, 28.5, -85.5, 31.5] }, options: {} },
      ctxFor(['gis.fema.gov']),
    )
    expect(r.datasets[0]!.id).toBe('open-shelters')
    const fc = JSON.parse(new TextDecoder().decode(r.files[0]!.data as Uint8Array))
    expect(fc.type).toBe('FeatureCollection')
  }, 60_000)

  it('the emPOWER service answers a county query for one state', async () => {
    const r = await hhsEmpower.fetch(
      { range, area: { label: 'Ohio' }, options: { state: 'OH' } },
      ctxFor(['services2.arcgis.com']),
    )
    const fc = JSON.parse(new TextDecoder().decode(r.files[0]!.data as Uint8Array))
    expect(fc.features.length).toBeGreaterThan(50)
  }, 60_000)

  it('the SVI service answers a tract query for a box with centroids and ranks', async () => {
    const r = await cdcSvi.fetch(
      { range, area: { label: 'Cleveland', bbox: [-81.75, 41.45, -81.65, 41.52] }, options: {} },
      ctxFor(['onemap.cdc.gov']),
    )
    const fc = JSON.parse(new TextDecoder().decode(r.files[0]!.data as Uint8Array))
    expect(fc.features.length).toBeGreaterThan(5)
    expect(typeof fc.features[0].properties.tractFips).toBe('string')
  }, 60_000)

  it('the GAO 988 file downloads, unzips and parses for one state', async () => {
    const r = await lifeline988.fetch(
      { range, area: { label: 'Ohio' }, options: { state: 'OH' } },
      ctxFor(['files.gao.gov']),
    )
    const points = JSON.parse(new TextDecoder().decode(r.files[0]!.data as Uint8Array))
    expect(points.length).toBeGreaterThan(30)
    expect(points[0].v.callsRouted).toBeGreaterThan(0)
  }, 60_000)
})
