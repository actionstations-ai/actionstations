// The humanitarian figure kinds (spec 0469 FR-8): registered beside the generic ones, drawn from
// the template's sample data, accessible, deterministic, with a summary and table that agree
// with the arithmetic, and refusing bad data.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { breakDay, daysOfStock, latestOrderDay, stockCurve } from '@shared/humanitarian/pipeline'
import { listFigureKinds, renderFigure } from '../index'
import { HUMANITARIAN_FIGURE_KINDS } from './index'

interface Preview {
  fields: { figures: { main: { kind: string; data: unknown } } }
  variants: Record<string, { fields: { figures: { main: { kind: string; data: unknown } } } }>
}
const preview = JSON.parse(
  readFileSync(resolve('templates/injects/humanitarian_figure/preview.json'), 'utf8'),
) as Preview
const samples: Record<string, unknown> = {
  [preview.fields.figures.main.kind]: preview.fields.figures.main.data,
  ...Object.fromEntries(
    Object.values(preview.variants).map((v) => [
      v.fields.figures.main.kind,
      v.fields.figures.main.data,
    ]),
  ),
}

describe('humanitarian figure kinds', () => {
  it('registers all seven beside the generic kinds', () => {
    const ids = HUMANITARIAN_FIGURE_KINDS.map((k) => k.kind)
    expect(ids).toHaveLength(7)
    expect(listFigureKinds()).toEqual(expect.arrayContaining([...ids, 'bar', 'epi_curve']))
    expect(Object.keys(samples).sort()).toEqual([...ids].sort())
  })

  it.each(HUMANITARIAN_FIGURE_KINDS.map((k) => k.kind))(
    '%s is accessible, deterministic and states its table in text',
    (kind) => {
      const a = renderFigure({ kind, data: samples[kind] })
      const b = renderFigure({ kind, data: samples[kind] })
      expect(a.svg).toBe(b.svg)
      expect(a.svg).toMatch(/^<svg [^>]*role="img"/)
      expect(a.svg).toMatch(/<title id="ft-/)
      expect(a.summary.length).toBeGreaterThan(40)
      expect(a.table?.rows.length).toBeGreaterThan(0)
    },
  )

  it('3W matrix draws a missing report as a gap, in words, and says what a blank means', () => {
    const r = renderFigure({ kind: 'humanitarian_3w_matrix', data: samples.humanitarian_3w_matrix })
    expect(r.svg).toContain('no report')
    expect(r.summary).toMatch(/No report: .*Karun South, WASH/)
    expect(r.summary).toMatch(/not proof of no work/)
    expect(r.table!.rows.flat()).toContain('no report')
  })

  it('3W map names the area nobody reports in', () => {
    const r = renderFigure({ kind: 'humanitarian_3w_map', data: samples.humanitarian_3w_map })
    expect(r.summary).toMatch(/No report: Hadar/)
  })

  it('needs coverage computes percentages from the counts and refuses reached above targeted', () => {
    const r = renderFigure({
      kind: 'humanitarian_needs_coverage',
      data: { sectors: [{ sector: 'Health', inNeed: 1000, targeted: 500, reached: 250 }] },
    })
    expect(r.summary).toMatch(/50% of target, 25% of need/)
    expect(() =>
      renderFigure({
        kind: 'humanitarian_needs_coverage',
        data: { sectors: [{ sector: 'Health', inNeed: 1000, targeted: 500, reached: 600 }] },
      }),
    ).toThrow(/VALIDATION|reached/i)
  })

  it('funding bar totals and percent follow from the sector amounts', () => {
    const r = renderFigure({
      kind: 'humanitarian_funding_bar',
      data: samples.humanitarian_funding_bar,
    })
    expect(r.summary).toMatch(/21\.7 received of 62 required, 35% funded, gap 40\.3/)
  })

  it('access map draws status in words as well as line style', () => {
    const r = renderFigure({
      kind: 'humanitarian_access_map',
      data: samples.humanitarian_access_map,
    })
    expect(r.svg).toContain('Route 4: restricted')
    expect(r.svg).toContain('stroke-dasharray')
  })
})

describe('pipeline arithmetic', () => {
  const p = {
    stockOnHand: 420,
    dailyConsumption: 28,
    shipments: [
      { day: 12, quantity: 200 },
      { day: 30, quantity: 600 },
    ],
  }
  it('is stock over consumption, with arrivals before the break', () => {
    expect(daysOfStock(420, 28)).toBe(15)
    expect(breakDay({ ...p, shipments: [] }, 60)).toBe(15)
    expect(breakDay(p, 60)).toBeCloseTo(12 + (420 - 12 * 28 + 200) / 28, 6)
  })
  it('has no break when a shipment lands in time', () => {
    expect(breakDay({ ...p, shipments: [{ day: 10, quantity: 2000 }] }, 60)).toBeUndefined()
  })
  it('puts the latest order day lead time before the break and ends the curve at zero', () => {
    expect(latestOrderDay(22, 21)).toBe(1)
    const curve = stockCurve(p, 45)
    expect(curve.at(-1)!.stock).toBe(0)
    expect(curve.at(-1)!.day).toBeCloseTo(breakDay(p, 45)!, 6)
  })
  it('states in the figure that an order is already too late', () => {
    const r = renderFigure({
      kind: 'humanitarian_pipeline',
      data: {
        commodity: 'Rice',
        unit: 'tonnes',
        stockOnHand: 100,
        dailyConsumption: 10,
        leadTimeDays: 30,
      },
    })
    expect(r.summary).toMatch(/10 days of stock/)
    expect(r.summary).toMatch(/any reorder now arrives after the break/)
  })
})
