// Opt-in checks against the real archives (LIVE=1). They make a handful of small requests (the
// radar one reads 2 MB), never run in CI, and show whether an archive changed its format.
import { createCaseGet } from '../../case-data/http'
import { describe, expect, it } from 'vitest'
import { registerWeatherToolkit } from '../weather'
import { getConnector } from './registry'

const LIVE = process.env.LIVE === '1'
registerWeatherToolkit()

function liveGet(hosts: readonly string[]) {
  return createCaseGet({
    hosts,
    version: 'live-test',
    maxBytes: () => 50_000_000,
    onResponse: () => undefined,
  })
}

describe.skipIf(!LIVE)('weather archives (live)', () => {
  const area = {
    label: 'Southwest Ohio',
    bbox: [-85.5, 38.5, -82.5, 40.5] as [number, number, number, number],
  }

  it('SPC still serves the convective day file in the format we read', async () => {
    const c = getConnector('spc-storm-reports')
    const r = await c.fetch(
      {
        range: { start: '2024-05-07T12:00:00Z', end: '2024-05-08T12:00:00Z' },
        area: { label: 'US' },
        options: {},
      },
      { get: liveGet(c.hosts) },
    )
    expect(JSON.parse(r.files[0]!.data as string).events.length).toBeGreaterThan(100)
  }, 60_000)

  it('the radar archive lists volumes and serves a range', async () => {
    const c = getConnector('nexrad-level2')
    const r = await c.fetch(
      {
        range: { start: '2024-05-07T20:00:00Z', end: '2024-05-07T20:05:00Z' },
        area,
        options: { site: 'KILN', products: 'reflectivity' },
      },
      { get: liveGet(c.hosts) },
    )
    expect(JSON.parse(r.files[0]!.data as string).features.length).toBeGreaterThan(0)
  }, 120_000)

  it('IEM serves warning polygons and a sounding', async () => {
    const w = getConnector('iem-warnings')
    const warnings = await w.fetch(
      {
        range: { start: '2024-05-07T18:00:00Z', end: '2024-05-07T21:00:00Z' },
        area,
        options: { wfo: 'ILN' },
      },
      { get: liveGet(w.hosts) },
    )
    expect(warnings.files[0]!.data).toContain('FeatureCollection')
    const s = getConnector('iem-soundings')
    const sounding = await s.fetch(
      {
        range: { start: '2024-05-07T12:00:00Z', end: '2024-05-07T13:00:00Z' },
        area,
        options: { station: 'KILN' },
      },
      { get: liveGet(s.hosts) },
    )
    expect(JSON.parse(sounding.files[0]!.data as string).features).toHaveLength(1)
  }, 60_000)

  it('NHC lists a best-track file that holds the storm', async () => {
    const c = getConnector('nhc-hurdat2')
    const r = await c.fetch(
      {
        range: { start: '2022-09-23T00:00:00Z', end: '2022-10-01T00:00:00Z' },
        area: { label: 'Gulf' },
        options: { name: 'Ian', year: 2022 },
      },
      { get: liveGet(c.hosts) },
    )
    expect(r.datasets[0]!.id).toBe('track-ian-2022')
  }, 120_000)
})
