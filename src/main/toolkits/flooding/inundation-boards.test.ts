// Inundation overlay layers and flood operations boards (spec 0454 FR-6, FR-7).
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: {
    getVersion: () => '0.0.1',
    getPath: () => tmpdir(),
    isPackaged: false,
    getAppPath: () => resolve('.'),
  },
  BrowserWindow: { getAllWindows: () => [] },
}))
process.env.TTX_RESOURCES = resolve('.')

const { OverlayLayer } = await import('@shared/schemas/map-overlays')
const { inundationLayers, gaugePointLayer, exposureRows } = await import('./inundation')
const { roadClosureBoard, facilityStatusBoard, shelterTable, logisticsTracker, leveePatrolLog } =
  await import('./boards')
const { RiverEventParams } = await import('./simulate')
const { registerFloodGenerators } = await import('./index')
const { runGenerator } = await import('../../case-data/generators')
const { readDatasetFile } = await import('../../case-data/store')
const { renderFigure } = await import('../../render/figures')

const ring = (x: number, y: number, s: number): [number, number][] => [
  [x, y],
  [x + s, y],
  [x + s, y + s],
  [x, y + s],
]
const params = RiverEventParams.parse({
  river: 'Cedar River',
  start: '2026-11-05T12:00:00Z',
  crestAtHour: 48,
  recessionHours: 48,
  gauges: [
    {
      id: 'RBDM7',
      name: 'Cedar River at Riverbend',
      mile: 0,
      baseStage: 8,
      crestStage: 17,
      categories: { action: 12, flood: 14, minor: 14, moderate: 17 },
      lonLat: [-90.1, 38],
    },
  ],
  floodplain: [
    { stage: 14, ring: ring(-90.11, 37.99, 0.01) },
    { stage: 16, ring: ring(-90.12, 37.98, 0.03) },
  ],
  assets: [
    { id: 'r', name: 'Mill Road', kind: 'road', floodsAtStage: 14 },
    { id: 'p', name: 'East Bend', kind: 'population', floodsAtStage: 16, count: 300 },
  ],
})

describe('inundation layers', () => {
  it('turns simulated extents into one time-ranged layer with exposure in the detail, valid for the map', async () => {
    registerFloodGenerators()
    const root = mkdtempSync(join(tmpdir(), 'ttx-inund-'))
    const m = await runGenerator(
      root,
      's1',
      'flood-river-event',
      { ...params },
      { maxMbPerScenario: 500 },
    )
    const fc = (await readDatasetFile(
      root,
      's1',
      m.datasets.find((d) => d.id === 'inundation-extent')!,
    )) as never
    const gauge = (await readDatasetFile(
      root,
      's1',
      m.datasets.find((d) => d.id === 'gauge-rbdm7')!,
    )) as never
    const out = inundationLayers([fc])
    expect(out.layers).toHaveLength(1)
    const layer = out.layers[0]!
    expect(() => OverlayLayer.parse(layer)).not.toThrow()
    expect(layer.legend.label).toBe('Simulated flood extent')
    expect(layer.legend.note).toMatch(/not a hazard map/)
    const f = (layer as { features: { detail?: string; time?: { start?: string } }[] }).features
    expect(f.every((x) => x.time?.start)).toBe(true)
    expect(f.some((x) => /Exposed: 1 road, 300 people/.test(x.detail ?? ''))).toBe(true)
    const pts = gaugePointLayer([gauge], { rbdm7: 15.2 })!
    expect(() => OverlayLayer.parse(pts)).not.toThrow()
    const rows = exposureRows(fc)
    expect(rows.at(0)!).toMatchObject({ road: 1, population: 0 })
    expect(Math.max(...rows.map((r) => r.population))).toBe(300)
  })
  it('keeps regulatory zones, modeled extents and simulated extents in separate layers with their own words', () => {
    const poly = { type: 'Polygon', coordinates: [ring(-90, 38, 0.01)] }
    const mk = (kind: string, extra: Record<string, unknown> = {}) => ({
      features: [{ geometry: poly, properties: { kind, ...extra } }],
    })
    const out = inundationLayers([
      mk('regulatory_flood_zone', { FLD_ZONE: 'AE', SFHA_TF: 'T' }),
      mk('modeled_forecast_extent', { streamflow_cfs: 12000.4 }),
      mk('simulated_extent', { stage: 15 }),
    ])
    expect(out.layers.map((l) => l.legend.label)).toEqual([
      'Regulatory flood zone',
      'Modeled forecast extent',
      'Simulated flood extent',
    ])
    const zone = out.layers[0] as { features: { legendLabel?: string; style: string }[] }
    expect(zone.features[0]).toMatchObject({
      legendLabel: 'Zone AE (special flood hazard area)',
      style: 'warning',
    })
    expect((out.layers[1] as { features: { detail?: string }[] }).features[0]!.detail).toContain(
      '12000 cfs',
    )
  })
  it('splits a multipolygon, and counts what cannot be drawn', () => {
    const multi = {
      type: 'MultiPolygon',
      coordinates: [[ring(-90, 38, 0.01)], [ring(-90.1, 38, 0.01)]],
    }
    const huge = {
      type: 'Polygon',
      coordinates: [
        Array.from({ length: 2500 }, (_, i) => [-90 + i * 1e-5, 38] as [number, number]),
      ],
    }
    const out = inundationLayers([
      {
        features: [
          { geometry: multi, properties: { kind: 'simulated_extent' } },
          { geometry: huge, properties: { kind: 'simulated_extent' } },
          {
            geometry: { type: 'Point', coordinates: [0, 0] },
            properties: { kind: 'simulated_extent' },
          },
          { geometry: multi, properties: { kind: 'something_else' } },
        ],
      },
    ])
    expect((out.layers[0] as { features: unknown[] }).features).toHaveLength(2)
    expect(out.skipped).toBe(3)
  })
})

describe('boards', () => {
  const roads = [
    { name: 'Mill Road', floodsAtStage: 14, detour: 'County Road 12' },
    { name: 'River Road', floodsAtStage: 15.5 },
    { name: 'Highway 9', floodsAtStage: 19 },
  ]
  const d = (kind: string, time: string, fields: Record<string, unknown>) => ({
    id: `${kind}${time}`,
    kind,
    time,
    fields,
  })
  it('shows a road under water and not closed differently from a closed one', () => {
    const spec = roadClosureBoard({
      roads,
      stage: 14.6,
      asOf: '2026-11-07T15:00:00Z',
      gaugeLabel: 'Riverbend',
      decisions: [d('close_road', '2026-11-07T13:00:00Z', { road: 'mill road' })],
    })
    const rows = (spec.data as { rows: { name: string; state: string; detail: string }[] }).rows
    expect(rows[0]).toMatchObject({ name: 'Mill Road', state: 'down' })
    expect(rows[0]!.detail).toContain('Closed at 13:00 UTC')
    expect(rows[1]!.state).toBe('degraded')
    expect(rows[1]!.detail).toContain('Within 1 ft')
    expect(rows[2]!.state).toBe('ok')
    const late = roadClosureBoard({
      roads,
      stage: 15.8,
      asOf: '2026-11-07T18:00:00Z',
      decisions: [],
    })
    expect((late.data as { rows: { detail: string }[] }).rows[1]!.detail).toContain('NOT closed')
    expect(renderFigure(spec).summary).toContain('Mill Road: Down')
  })
  it('ignores closures after the time shown', () => {
    const spec = roadClosureBoard({
      roads,
      stage: 10,
      asOf: '2026-11-07T12:00:00Z',
      decisions: [d('close_road', '2026-11-07T13:00:00Z', { road: 'Mill Road' })],
    })
    expect((spec.data as { rows: { state: string }[] }).rows[0]!.state).toBe('ok')
  })
  it('lists facilities with moves, shelters, deliveries and patrols from the decisions', () => {
    const fac = facilityStatusBoard({
      facilities: [{ name: 'Water plant', floodsAtStage: 17, kind: 'Water treatment' }],
      stage: 16.5,
      asOf: '2026-11-07T15:00:00Z',
      decisions: [d('move_assets', '2026-11-07T12:00:00Z', { what: 'Water plant' })],
    })
    expect((fac.data as { rows: { state: string; detail: string }[] }).rows[0]).toMatchObject({
      state: 'degraded',
    })
    const sh = shelterTable({
      asOf: '2026-11-07T15:00:00Z',
      decisions: [
        d('open_shelter', '2026-11-07T14:00:00Z', { site: 'High school', capacity: 200 }),
      ],
      counts: { 'High school': { present: 42, pets: 6 } },
    })
    expect(renderFigure(sh).table!.rows[0]).toEqual([
      'High school',
      '14:00 UTC',
      '200',
      '42',
      '6',
      '',
    ])
    const lg = logisticsTracker({
      asOf: '2026-11-07T15:00:00Z',
      decisions: [
        d('order_resources', '2026-11-07T12:00:00Z', { resource: 'Sandbags', quantity: 5000 }),
      ],
      deliveries: [
        { resource: 'Sandbags', quantity: 1500, at: '2026-11-07T14:00:00Z' },
        { resource: 'Sandbags', quantity: 900, at: '2026-11-07T16:00:00Z' },
      ],
      inTransit: { Sandbags: 1000 },
    })
    expect(renderFigure(lg).table!.rows[0]).toEqual([
      'Sandbags',
      '5000',
      '1000',
      '1500',
      '2500',
      '',
    ])
    const lp = leveePatrolLog({
      asOf: '2026-11-07T15:00:00Z',
      entries: [
        {
          time: '2026-11-07T14:00:00Z',
          segment: 'Unit 3',
          finding: 'Boil',
          severity: 'High',
          action: 'Ringed with sandbags',
        },
        {
          time: '2026-11-07T16:00:00Z',
          segment: 'Unit 4',
          finding: 'Seepage',
          severity: 'Low',
          action: '',
        },
      ],
    })
    expect(renderFigure(lp).table!.rows).toHaveLength(1)
  })
  it('says plainly when nothing has happened yet', () => {
    expect(
      renderFigure(shelterTable({ asOf: '2026-11-07T15:00:00Z', decisions: [] })).summary,
    ).toContain('No shelter opened yet')
  })
})
