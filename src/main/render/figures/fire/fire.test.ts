// The wildfire figure kinds (spec 0461 FR-7): registered beside the generic ones, drawn the same
// way twice, accessible (a name, a description, status words and a data table that agrees with
// the drawing) and strict about bad data.
import { describe, expect, it } from 'vitest'
import { listFigureKinds, renderFigure } from '../index'
import { wildfireFigureSamples } from '../../../toolkits/wildfire/figure-samples'

const samples = wildfireFigureSamples()
const KINDS = Object.keys(samples)
const draw = (kind: string, data: unknown = samples[kind]) => renderFigure({ kind, data })

describe('registration', () => {
  it('registers the five wildfire kinds beside the generic and flood kinds', () => {
    const all = listFigureKinds()
    for (const k of [...KINDS, 'time_series', 'hydrograph', 'status_board'])
      expect(all).toContain(k)
  })
})

describe.each(KINDS)('%s', (kind) => {
  it('draws identical output twice', () => {
    expect(draw(kind).svg).toBe(draw(kind).svg)
  })
  it('is an image with a name and a description that is the summary', () => {
    const r = draw(kind)
    expect(r.svg).toMatch(/role="img"/)
    expect(r.svg).toMatch(/<title id="[^"]+">[^<]+<\/title>/)
    expect(r.svg).toContain('<desc')
    expect(r.summary.length).toBeGreaterThan(60)
  })
  it('has a data table with a header and rows', () => {
    const t = draw(kind).table!
    expect(t.columns.length).toBeGreaterThan(1)
    expect(t.rows.length).toBeGreaterThan(0)
    for (const row of t.rows) expect(row).toHaveLength(t.columns.length)
  })
  it('states where its data comes from', () => {
    expect(draw(kind).summary).toMatch(/[Ss]imulated/)
  })
})

describe('wildfire_fire_map', () => {
  it('labels zones with their status word in the picture, legend and table', () => {
    const r = draw('wildfire_fire_map')
    expect(r.svg).toMatch(/C-1: Evacuation order/)
    expect(r.svg).toContain('Evacuation zone status')
    expect(r.table!.rows.some((row) => row.join(' ').includes('Evacuation order'))).toBe(true)
    expect(r.summary).toMatch(/not a fire behavior prediction/)
  })
  it('shows fewer perimeters at an earlier moment (the time slider)', () => {
    const data = samples.wildfire_fire_map as { at: string; perimeters: unknown[] }
    const rowsAt = (at: string) =>
      draw('wildfire_fire_map', { ...data, at }).table!.rows.filter(
        (row) => row[0] === 'Fire perimeter',
      ).length
    const early = rowsAt('2026-09-12T20:00:00Z')
    const late = rowsAt('2026-09-13T06:00:00Z')
    expect(early).toBeLessThan(late)
  })
  it('refuses a ring with fewer than three points and an unknown status', () => {
    const data = samples.wildfire_fire_map as { zones: Record<string, unknown>[] }
    expect(() =>
      draw('wildfire_fire_map', {
        ...data,
        zones: [
          {
            ...data.zones[0],
            ring: [
              [0, 0],
              [1, 1],
            ],
          },
        ],
      }),
    ).toThrow(/VALIDATION|not valid/)
    expect(() =>
      draw('wildfire_fire_map', { ...data, zones: [{ ...data.zones[0], status: 'Mandatory' }] }),
    ).toThrow(/not valid/)
  })
})

describe('wildfire_evacuation_board', () => {
  it('computes the order margin from arrival, clearance and the order time', () => {
    const r = draw('wildfire_evacuation_board', {
      basis: 'simulated',
      rows: [
        {
          zone: 'Z-1',
          status: 'Evacuation order',
          orderedAt: '2026-09-12T20:00:00Z',
          clearanceMin: 60,
          arrivalAt: '2026-09-12T22:00:00Z',
        },
        {
          zone: 'Z-2',
          status: 'Evacuation warning',
          orderedAt: '2026-09-12T21:30:00Z',
          clearanceMin: 60,
          arrivalAt: '2026-09-12T22:00:00Z',
        },
        { zone: 'Z-3', status: 'No status', clearanceMin: 30, arrivalAt: '2026-09-12T23:00:00Z' },
      ],
    })
    const margins = r.table!.rows.map((row) => row[row.length - 1])
    expect(margins[0]).toBe('Ordered 60 min before the latest time')
    expect(margins[1]).toBe('Ordered 30 min after the latest time')
    expect(margins[2]).toMatch(/^No order yet; latest/)
    expect(r.summary).toMatch(/1 zone ordered after the latest time/)
  })
  it('writes every status as a word beside its symbol', () => {
    const r = draw('wildfire_evacuation_board')
    for (const row of r.table!.rows) expect(r.svg).toContain(row[1]!)
  })
})

describe('wildfire_psps_board', () => {
  it('totals customers and names circuits without power', () => {
    const r = draw('wildfire_psps_board')
    expect(r.summary).toMatch(/circuits without power now/)
    expect(r.summary).toMatch(/medical baseline customers/)
    expect(r.table!.columns).toEqual([
      'Circuit',
      'Customers',
      'Medical baseline',
      'Critical facilities',
      'Status',
      'Notified',
    ])
  })
})

describe('wildfire_aqi_series', () => {
  it('draws the six category names in the bands and the local threshold', () => {
    const r = draw('wildfire_aqi_series', {
      basis: 'historical',
      series: [
        {
          name: 'Town',
          points: [
            { x: 0, aqi: 20 },
            { x: 1, aqi: 320 },
          ],
        },
      ],
      thresholds: [{ value: 150, label: 'Closure trigger' }],
    })
    for (const name of [
      'Good',
      'Moderate',
      'Unhealthy for Sensitive Groups',
      'Very Unhealthy',
      'Hazardous',
    ])
      expect(r.svg).toContain(name)
    expect(r.svg).toContain('Closure trigger (AQI 150)')
    expect(r.summary).toMatch(/Town peaks at AQI 320 \(Hazardous\)/)
    expect(r.summary).toMatch(/reaches Closure trigger/)
  })
  it('puts a category name beside every AQI in the table', () => {
    const t = draw('wildfire_aqi_series').table!
    const categories = new Set([
      'Good',
      'Moderate',
      'Unhealthy for Sensitive Groups',
      'Unhealthy',
      'Very Unhealthy',
      'Hazardous',
    ])
    for (const row of t.rows)
      for (let i = 2; i < row.length; i += 2) if (row[i]) expect(categories.has(row[i]!)).toBe(true)
  })
  it('refuses an AQI above 500', () => {
    expect(() =>
      draw('wildfire_aqi_series', {
        basis: 'historical',
        series: [{ name: 'A', points: [{ x: 0, aqi: 900 }] }],
      }),
    ).toThrow(/not valid/)
  })
})

describe('wildfire_smoke_map', () => {
  it('names the density and the AQI category of each place in the table', () => {
    const r = draw('wildfire_smoke_map')
    expect(
      r.table!.rows.some((row) => /heavy smoke|medium smoke|light smoke/.test(row.join(' '))),
    ).toBe(true)
    expect(
      r.table!.rows.some((row) =>
        /AQI \d+, (Unhealthy|Moderate|Very Unhealthy|Hazardous)/.test(row.join(' ')),
      ),
    ).toBe(true)
  })
})
