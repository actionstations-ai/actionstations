// The pharmacy figure kinds (spec 0463 FR-5): valid data draws an SVG that is the same bytes
// twice, the summary and the table state the numbers the drawing shows, excursions and
// shortages are words as well as shading, and bad data fails with a VALIDATION error.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { AppError } from '../../../lib/errors'
import { getFigureKind, listFigureKinds, renderFigure } from '../index'
import { PHARMACY_FIGURE_KIND_IDS } from './index'

interface Preview {
  fields: { figures: { main: { kind: string; data: unknown } } }
  variants: Record<string, { fields: Preview['fields'] }>
}
const preview = JSON.parse(
  readFileSync(resolve('templates/injects/pharmacy_figure/preview.json'), 'utf8'),
) as Preview
const sample = (kind: string) =>
  (kind === PHARMACY_FIGURE_KIND_IDS[0] ? preview.fields : preview.variants[kind]!.fields).figures
    .main

describe('pharmacy figure kinds', () => {
  it('registers every kind beside the generic ones', () => {
    for (const k of PHARMACY_FIGURE_KIND_IDS) expect(getFigureKind(k), k).toBeDefined()
    expect(listFigureKinds()).toEqual(expect.arrayContaining(['time_series', 'bar']))
    expect(PHARMACY_FIGURE_KIND_IDS.every((k) => k.startsWith('pharmacy_'))).toBe(true)
  })

  it.each([...PHARMACY_FIGURE_KIND_IDS])(
    '%s draws the same bytes twice with a summary and table',
    (kind) => {
      const a = renderFigure(sample(kind))
      const b = renderFigure(sample(kind))
      expect(a.svg).toBe(b.svg)
      expect(a.svg.startsWith('<svg')).toBe(true)
      expect(a.svg).toContain('role="img"')
      expect(a.summary.length).toBeGreaterThan(60)
      expect(a.table?.rows.length).toBeGreaterThan(0)
      expect(a.svg).not.toMatch(/<image|<script|href=/)
    },
  )

  it('cold chain chart shades the excursion, labels it in words and states both scales', () => {
    const r = renderFigure(sample('pharmacy_cold_chain_chart'))
    expect(r.svg).toContain('EXCURSION')
    expect(r.summary).toContain('labeled range 2 to 8 °C (36 to 46 °F)')
    expect(r.summary).toMatch(/1 excursion, \d+ minutes outside the range/)
    expect(r.table!.columns).toEqual(['Minutes from 22:00', '°C', '°F', 'State'])
    expect(r.table!.rows.some((x) => x[3] === 'Out of range')).toBe(true)
  })

  it('cold chain chart reports no excursion for a series inside the range', () => {
    const data = {
      unit: 'R-1',
      lowC: 2,
      highC: 8,
      probe: [
        { x: 0, tempC: 4 },
        { x: 60, tempC: 5 },
      ],
    }
    const r = renderFigure({ kind: 'pharmacy_cold_chain_chart', data })
    expect(r.summary).toContain('No excursion')
    expect(r.svg).not.toContain('EXCURSION')
  })

  it('days on hand states the stockout day of each allocation scenario', () => {
    const r = renderFigure(sample('pharmacy_days_on_hand'))
    expect(r.summary).toContain('4 days on hand')
    expect(r.summary).toContain('No allocation (100% of usage): projected stockout on day 4')
    expect(r.summary).toContain('Allocation at 50% (50% of usage): projected stockout on day 8')
    expect(r.table!.rows[0]).toEqual(['0', '1,840', '1,840', '1,840'])
    expect(r.table!.rows).toHaveLength(11)
  })

  it('queue chart says when the queue is over target and states the peak', () => {
    const r = renderFigure(sample('pharmacy_queue_chart'))
    expect(r.summary).toMatch(/over target at \d+ of \d+ readings/)
    expect(r.table!.rows.some((x) => x[3] === 'Over target')).toBe(true)
  })

  it('usage chart carries the caveat that a pattern is not proof', () => {
    const r = renderFigure(sample('pharmacy_usage_chart'))
    expect(r.summary).toContain('RN-4471 made')
    expect(r.summary).toContain('not proof of diversion')
    expect(r.table!.rows).toHaveLength(24)
  })

  it('recall trace totals what to quarantine and whom to contact', () => {
    const r = renderFigure(sample('pharmacy_recall_trace'))
    expect(r.summary).toContain('228 units are on hand to quarantine')
    expect(r.summary).toContain('653 patients are to be contacted')
    expect(r.svg).toContain('to contact')
  })

  it('inventory names the presentations below par', () => {
    const r = renderFigure(sample('pharmacy_inventory'))
    expect(r.summary).toContain('3 below par')
    expect(r.table!.rows.find((x) => x[0]?.startsWith('Dextrose'))?.[4]).toBe('At or above par')
  })

  it('refuses bad data with a VALIDATION error naming the kind', () => {
    const bad = [
      { kind: 'pharmacy_cold_chain_chart', data: { unit: 'R-1', lowC: 8, highC: 2, probe: [] } },
      {
        kind: 'pharmacy_days_on_hand',
        data: { drug: 'x', onHand: 1, usagePerDay: 0, scenarios: [] },
      },
      { kind: 'pharmacy_usage_chart', data: { user: 'u', byHour: [1], peerMedianByHour: [1] } },
    ]
    for (const spec of bad) {
      try {
        renderFigure(spec)
        throw new Error('expected a failure')
      } catch (e) {
        expect(e).toBeInstanceOf(AppError)
        expect((e as AppError).code).toBe('VALIDATION')
      }
    }
  })
})
