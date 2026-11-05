// Earth science figure kinds (spec 0450 FR-8): each draws valid SVG from the sample data of the
// geo_figure template, writes a summary with its key values, offers a data table, renders the same
// bytes twice and refuses bad data.
import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

vi.mock('electron', () => ({ app: { isPackaged: false, getAppPath: () => resolve('.') } }))
process.env.TTX_RESOURCES = resolve('.')
const { listFigureKinds, renderFigure } = await import('../index')
const { GEO_FIGURE_KINDS } = await import('./index')

interface Spec {
  kind: string
  data: Record<string, unknown>
}
interface Preview {
  fields: { figures: { main: Spec } }
  variants: Record<string, { fields: Preview['fields'] }>
}
const preview = JSON.parse(
  readFileSync(resolve('templates/injects/geo_figure/preview.json'), 'utf8'),
) as Preview
const sample = (kind: string): Spec =>
  (kind === 'seismogram' ? preview.fields : preview.variants[kind]!.fields).figures.main

describe('earth science figure kinds', () => {
  it('registers thirteen kinds and the template has a sample for each', () => {
    expect(GEO_FIGURE_KINDS).toHaveLength(13)
    for (const k of GEO_FIGURE_KINDS) {
      expect(listFigureKinds()).toContain(k)
      expect(sample(k).kind).toBe(k)
    }
  })

  it.each(GEO_FIGURE_KINDS)('%s draws an accessible, deterministic figure with a table', (kind) => {
    const a = renderFigure(sample(kind))
    const b = renderFigure(sample(kind))
    expect(a.svg).toBe(b.svg)
    expect(a.svg).toMatch(/^<svg [^>]*role="img"/)
    expect(a.svg).toContain('<title')
    expect(a.svg).toContain('<desc')
    expect(a.svg).not.toMatch(/NaN|undefined|Infinity/)
    expect(a.summary.length).toBeGreaterThan(60)
    expect(a.table?.rows.length).toBeGreaterThan(0)
    for (const row of a.table!.rows) expect(row).toHaveLength(a.table!.columns.length)
  })

  it('shakemap labels intensities with Roman numerals and counts every cell', () => {
    const r = renderFigure(sample('shakemap_intensity'))
    expect(r.summary).toMatch(/Highest intensity (VIII|IX)/)
    expect(r.svg).toContain('>VII<')
    const data = sample('shakemap_intensity').data as { grid: { values: number[] } }
    const counted = r.table!.rows.slice(0, 10).reduce((s, row) => s + Number(row[1]), 0)
    expect(counted).toBe(data.grid.values.length)
  })

  it('early warning timeline says which places had no warning', () => {
    const r = renderFigure({
      kind: 'eew_timeline',
      data: {
        origin: '14:22:07 UTC',
        places: [
          { name: 'Near', distanceKm: 8, alertSec: 7, shakingSec: 2.5 },
          { name: 'Far', distanceKm: 120, alertSec: 8, shakingSec: 34 },
        ],
      },
    })
    expect(r.summary).toContain('Near (8 km): alert 4.5 seconds after shaking began')
    expect(r.summary).toContain('Far (120 km): 26 seconds of warning')
    expect(r.table!.rows[0]![4]).toMatch(/late by 4.5/)
  })

  it('aftershock plot counts events at each magnitude threshold', () => {
    const r = renderFigure({
      kind: 'aftershock_plot',
      data: {
        mainshockMagnitude: 6.8,
        events: [
          { t: 0.1, magnitude: 5.2 },
          { t: 0.5, magnitude: 3.1 },
          { t: 2, magnitude: 4.2 },
        ],
      },
    })
    expect(r.summary).toContain('3 aftershocks')
    expect(r.table!.rows.find((x) => x[0] === 'M 5 or larger')![1]).toBe('1')
    expect(r.table!.rows.find((x) => x[0] === 'M 3 or larger')![1]).toBe('3')
  })

  it('seismogram reports the peak and the picks', () => {
    const r = renderFigure({
      kind: 'seismogram',
      data: {
        station: 'ABC',
        sampleRateHz: 10,
        samples: [0, 1, -5, 3, 0],
        picks: [{ phase: 'P', seconds: 0.2 }],
      },
    })
    expect(r.summary).toContain('Peak amplitude -5')
    expect(r.summary).toContain('P at 0.2 s')
  })

  it('refuses a grid whose values do not match its size, and a ring of two points', () => {
    expect(() =>
      renderFigure({
        kind: 'shakemap_intensity',
        data: {
          grid: { west: 0, south: 0, east: 1, north: 1, cols: 2, rows: 2, values: [1, 2, 3] },
        },
      }),
    ).toThrow(/cols x rows/)
    expect(() =>
      renderFigure({
        kind: 'inundation_zones',
        data: {
          zones: [
            {
              name: 'Z',
              level: 'high',
              ring: [
                { lon: 0, lat: 0 },
                { lon: 1, lat: 1 },
              ],
            },
          ],
        },
      }),
    ).toThrow(/not valid/)
  })

  it('debris-flow map states that it is not a forecast and names closed roads', () => {
    const r = renderFigure(sample('debris_flow_hazard_map'))
    expect(r.summary).toMatch(/not a forecast/)
    expect(r.summary).toContain('State Route 12')
  })

  it('tsunami map lists arrival times in order', () => {
    const r = renderFigure(sample('tsunami_travel_map'))
    expect(r.summary.indexOf('Cape Hollis')).toBeLessThan(r.summary.indexOf('Harbor Point'))
  })
})
