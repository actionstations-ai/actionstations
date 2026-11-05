// Flood figure kinds (spec 0454 FR-5): each draws accessible SVG from the sample data of the
// figure template's preview variants, states the point's own categories in words, and refuses
// stage tables that do not rise.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: { isPackaged: false, getAppPath: () => resolve('.') } }))
process.env.TTX_RESOURCES = resolve('.')
const { renderFigure, listFigureKinds, tableHtml } = await import('../index')

interface Spec {
  kind: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any
}
const preview = JSON.parse(
  readFileSync(resolve('templates/injects/figure/preview.json'), 'utf8'),
) as { variants: Record<string, { fields: { figures: { main: Spec } } }> }
const sample = (k: string): Spec => preview.variants[k]!.fields.figures.main

const KINDS = ['hydrograph', 'flood_gauge_summary', 'river_profile', 'rain_stage']

it('registers the flood kinds beside the generic ones', () => {
  expect(listFigureKinds()).toEqual(expect.arrayContaining(KINDS))
})

describe.each(KINDS)('%s', (kind) => {
  const spec = sample(kind)
  const r = renderFigure(spec)
  it('draws an accessible SVG, the same bytes twice, with a table and a plain summary', () => {
    expect(r.svg).toMatch(/^<svg [^>]*role="img"/)
    expect(r.svg).not.toMatch(/NaN|undefined|Infinity|<script/)
    expect(renderFigure(spec).svg).toBe(r.svg)
    expect(r.table!.rows.length).toBeGreaterThan(1)
    for (const row of r.table!.rows) expect(row).toHaveLength(r.table!.columns.length)
    expect(tableHtml(r.table!)).toContain('<th scope="row">')
    expect(r.summary).not.toMatch(/[<>]/)
  })
})

describe('hydrograph', () => {
  const r = renderFigure(sample('hydrograph'))
  it('names the crest, its category and the category change from the last forecast', () => {
    expect(r.summary).toMatch(
      /crest 17\.8 ft at \w{3} \w{3} \d+ \d\d:\d\d C[SD]T, moderate flooding/,
    )
    expect(r.summary).toContain('the category changed to moderate flooding')
    expect(r.summary).toContain("This point's stages: action stage 12.0 ft, flood stage 14.0 ft")
  })
  it('puts the category words and the stage lines on the drawing', () => {
    for (const word of [
      'Minor',
      'Moderate',
      'Major',
      'Flood stage 14.0 ft',
      'Action stage 12.0 ft',
    ])
      expect(r.svg).toContain(word)
    expect(r.svg).toContain('Forecast crest 17.8 ft')
    expect(r.svg).toContain('Record crest 24.1 ft')
  })
  it('says which categories do not exist at a point', () => {
    const d = structuredClone(sample('hydrograph').data)
    d.categories = { action: 12, flood: 14, moderate: 17 }
    const out = renderFigure({ kind: 'hydrograph', data: d })
    expect(out.summary).toContain('Categories not listed do not exist at this point')
    expect(out.svg).not.toContain('>Minor<')
  })
  it('draws flow in cfs without categories in the table', () => {
    const out = renderFigure({
      kind: 'hydrograph',
      data: {
        gauge: { name: 'Mill Creek', unit: 'cfs' },
        observed: [
          { time: '2026-11-05T12:00:00Z', value: 800 },
          { time: '2026-11-05T15:00:00Z', value: 2400 },
        ],
      },
    })
    expect(out.summary).toContain('flow at Mill Creek')
    expect(out.summary).toContain('2,400 cfs')
    expect(out.table!.rows[1]![3]).toBe('n/a')
  })
  it('refuses stages that do not rise and empty data', () => {
    expect(() =>
      renderFigure({
        kind: 'hydrograph',
        data: {
          gauge: { name: 'x' },
          observed: [{ time: '2026-11-05T12:00:00Z', value: 1 }],
          categories: { minor: 10, action: 12 },
        },
      }),
    ).toThrow(/stages must rise/)
    expect(() => renderFigure({ kind: 'hydrograph', data: { gauge: { name: 'x' } } })).toThrow(
      /observed or forecast/,
    )
  })
  it('thins a long series in the table but keeps the first and last readings', () => {
    const d = structuredClone(sample('hydrograph').data)
    d.observed = Array.from({ length: 300 }, (_, i) => ({
      time: new Date(Date.parse('2026-11-01T00:00:00Z') + i * 900e3).toISOString(),
      value: 5 + i / 100,
    }))
    d.forecast = []
    d.previousForecast = []
    const out = renderFigure({ kind: 'hydrograph', data: d })
    expect(out.table!.rows).toHaveLength(48)
  })
})

describe('flood_gauge_summary', () => {
  const r = renderFigure(sample('flood_gauge_summary'))
  it('states the reading, category, trend and the stage table with undefined levels', () => {
    expect(r.summary).toContain('14.6 ft')
    expect(r.summary).toContain('minor flooding, rising')
    expect(r.table!.rows.at(-1)![2]).toBe('Minor flooding; rising')
  })
  it('lists a level the point lacks as not defined', () => {
    const d = structuredClone(sample('flood_gauge_summary').data)
    d.categories = { action: 12, flood: 14, moderate: 17, major: 21 }
    const out = renderFigure({ kind: 'flood_gauge_summary', data: d })
    expect(out.summary).toContain('minor flood stage not defined at this point')
  })
})

describe('river_profile', () => {
  const r = renderFigure(sample('river_profile'))
  it('orders gauges upstream to downstream and uses each gauge own flood stage', () => {
    expect(r.table!.rows.map((row) => row[0])).toEqual([
      'Milford',
      'Haldane Falls',
      'Riverbend',
      'Marlow Landing',
    ])
    expect(r.summary).toContain(
      'Riverbend (mile 41) 14.6 ft, minor flooding, 0.6 ft above flood stage',
    )
  })
  it('does not call a gauge minor when the point has no minor category', () => {
    expect(r.summary).toContain(
      'Marlow Landing (mile 68) 17.9 ft, action, 0.1 ft below flood stage',
    )
  })
})

describe('rain_stage', () => {
  const r = renderFigure(sample('rain_stage'))
  it('totals the rain and compares the peak with flood stage', () => {
    expect(r.summary).toContain('inches of rain in 24 periods')
    expect(r.summary).toContain('flood stage is 14.0 ft')
  })
})
