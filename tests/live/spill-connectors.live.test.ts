// Live check of the spill toolkit's connectors (LIVE=1): one small real request to each public
// source, so a change in an archive's format shows up here rather than in an exercise. Never runs
// in CI. Requests are tiny (an hour of readings, a day of buoy data, a few hundred meters of
// shoreline) and spaced out, as CO-OPS asks.
//
//   LIVE=1 pnpm test -- tests/live/spill-connectors.live.test.ts
import { tmpdir } from 'node:os'
import { describe, expect, it, vi } from 'vitest'
import { SeriesFile } from '@shared/schemas/case-data'

vi.mock('electron', () => ({
  app: { getVersion: () => '0.0.0-live', getPath: () => tmpdir() },
  BrowserWindow: { getAllWindows: () => [] },
}))

const { createCaseGet } = await import('../../src/main/case-data/http')
const { noaaCoops } = await import('../../src/main/toolkits/connectors/noaa-coops')
const { noaaNdbc } = await import('../../src/main/toolkits/connectors/noaa-ndbc')
const { noaaEsi } = await import('../../src/main/toolkits/connectors/noaa-esi')

const live = process.env.LIVE === '1'
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms))
const ctx = (hosts: readonly string[]) => ({
  get: createCaseGet({
    hosts,
    version: '0.0.0-live',
    maxBytes: () => 20_000_000,
    onResponse: () => {},
  }),
})

describe.skipIf(!live)('spill connectors against the real archives', () => {
  it('CO-OPS: an hour of water level and wind at Dauphin Island, Alabama', async () => {
    const out = await noaaCoops.fetch(
      {
        range: { start: '2024-09-01T00:00:00Z', end: '2024-09-01T01:00:00Z' },
        area: { label: 'Dauphin Island' },
        options: { station: '8735180', products: 'water_level,wind' },
      },
      ctx(noaaCoops.hosts),
    )
    expect(out.datasets.map((d) => d.id)).toEqual([
      'coops-8735180-water-level',
      'coops-8735180-wind',
    ])
    for (const f of out.files) {
      const points = JSON.parse(String(f.data))
      expect(SeriesFile.safeParse(points).success).toBe(true)
      expect(points.length).toBeGreaterThan(5)
    }
    await pause(1000)
  }, 60_000)

  it('NDBC: the last day at buoy 42012 comes from the realtime file', async () => {
    const end = Date.now()
    const out = await noaaNdbc.fetch(
      {
        range: {
          start: new Date(end - 86_400_000).toISOString(),
          end: new Date(end).toISOString(),
        },
        area: { label: 'Orange Beach' },
        options: { station: '42012' },
      },
      ctx(noaaNdbc.hosts),
    )
    expect(out.datasets.map((d) => d.id)).toContain('ndbc-42012-wind')
    for (const f of out.files)
      expect(SeriesFile.safeParse(JSON.parse(String(f.data))).success).toBe(true)
    await pause(1000)
  }, 60_000)

  it('NDBC: a past year file unpacks (42012, January 2023)', async () => {
    const out = await noaaNdbc.fetch(
      {
        range: { start: '2023-01-01T00:00:00Z', end: '2023-01-02T00:00:00Z' },
        area: { label: 'Orange Beach' },
        options: { station: '42012' },
      },
      ctx(noaaNdbc.hosts),
    )
    expect(JSON.parse(String(out.files[0]!.data)).length).toBeGreaterThan(100)
    await pause(1000)
  }, 90_000)

  it('ESI: shoreline lines near Dauphin Island, Alabama, with classes', async () => {
    const out = await noaaEsi.fetch(
      {
        range: { start: '2024-09-01T00:00:00Z', end: '2024-09-02T00:00:00Z' },
        area: { label: 'Dauphin Island', bbox: [-88.12, 30.24, -88.08, 30.27] },
        options: { region: 'alabama' },
      },
      ctx(noaaEsi.hosts),
    )
    const fc = JSON.parse(String(out.files[0]!.data)) as {
      features: { properties: { esi: string } }[]
    }
    expect(fc.features.length).toBeGreaterThan(5)
    expect(fc.features.some((f) => f.properties.esi.length > 0)).toBe(true)
  }, 90_000)
})
