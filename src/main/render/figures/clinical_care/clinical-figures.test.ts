// The clinical care figure kinds (spec 0452 FR-5): valid data draws an SVG that is the same bytes
// twice, the summary and the table state the values in numbers, alarm and score states are words,
// and bad data fails with a VALIDATION error.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { AppError } from '../../../lib/errors'
import { getFigureKind, listFigureKinds, renderFigure } from '../index'

interface Preview {
  fields: { figures: { main: { kind: string; data: unknown } } }
  variants: Record<string, { fields: Preview['fields'] }>
}
const preview = JSON.parse(
  readFileSync(resolve('templates/injects/clinical_figure/preview.json'), 'utf8'),
) as Preview
const KINDS = [
  'vitals_monitor',
  'vitals_flowsheet',
  'early_warning_score',
  'lab_trend',
  'staffing_vs_demand',
  'unit_census',
  'evacuation_progress',
]
const sample = (kind: string) =>
  (kind === KINDS[0] ? preview.fields : preview.variants[kind]!.fields).figures.main

describe('clinical figure kinds', () => {
  it('registers every kind', () => {
    for (const k of KINDS) expect(getFigureKind(k), k).toBeDefined()
    expect(listFigureKinds()).toEqual(expect.arrayContaining(KINDS))
  })

  it.each(KINDS)('%s draws the same bytes twice with a summary and a table', (kind) => {
    const a = renderFigure(sample(kind))
    const b = renderFigure(sample(kind))
    expect(a.svg).toBe(b.svg)
    expect(a.svg.startsWith('<svg')).toBe(true)
    expect(a.svg).toContain('role="img"')
    expect(a.summary.length).toBeGreaterThan(40)
    expect(a.table?.rows.length).toBeGreaterThan(0)
    expect(a.svg).not.toMatch(/<image|<script|href=/)
  })

  it('vitals_monitor states values and alarm words, and says it is simulated', () => {
    const r = renderFigure(sample('vitals_monitor'))
    expect(r.summary).toContain('Blood pressure 82/50 mmHg (ALARM LOW')
    expect(r.summary).toContain('Heart rate 126 /min (ALARM HIGH')
    expect(r.summary).toContain('Simulated data, not a real patient')
    expect(r.svg).toContain('ALARM HIGH')
    expect(r.table!.columns[0]).toBe('Minutes since 07:40')
  })

  it('vitals_flowsheet marks out-of-limit values with H or L and counts them', () => {
    const r = renderFigure(sample('vitals_flowsheet'))
    expect(r.summary).toMatch(/\d+ values are outside their limits/)
    expect(r.table!.rows.at(-1)).toEqual(
      ['10:40', 'H 126', '82/50', 'H 26', 'L 91', 'H 38.9'].map((c, i) =>
        i === 2 ? 'L 82/50' : c,
      ),
    )
  })

  it('early_warning_score adds the points and names the trigger level and its source', () => {
    const r = renderFigure(sample('early_warning_score'))
    expect(r.summary).toContain('total score 15, trigger level High')
    expect(r.summary).toContain('Source: Neutral configurable score')
    expect(r.table!.rows.at(-1)).toEqual(['Total', '', 'Trigger level: High', '15'])
    expect(r.svg).toContain('Trigger level: HIGH')
  })

  it('lab_trend flags the latest value against the range and the critical limit', () => {
    const r = renderFigure(sample('lab_trend'))
    expect(r.summary).toContain('The latest value is critical')
    expect(r.table!.rows.map((x) => x[2])).toEqual(['', '', '', 'HIGH', 'CRITICAL'])
  })

  it('staffing_vs_demand says which readings are short', () => {
    const r = renderFigure(sample('staffing_vs_demand'))
    expect(r.summary).toContain('Short in 5 of 7 readings, by up to 2 nurses at 11')
    expect(r.table!.rows[2]).toEqual(['11', '5', '3', '2'])
  })

  it('unit_census counts beds by state and gives patients per nurse', () => {
    const r = renderFigure(sample('unit_census'))
    expect(r.summary).toContain(
      '6 patients of 9 beds · 2 empty · 2 isolation · 1 blocked · 3 nurses on duty',
    )
    expect(r.summary).toContain('2 patients per nurse')
  })

  it('evacuation_progress totals the patients moved', () => {
    const r = renderFigure(sample('evacuation_progress'))
    expect(r.summary).toContain('8 of 13 patients moved')
  })

  it('refuses bad data with a VALIDATION error naming the kind', () => {
    const bad = {
      kind: 'evacuation_progress',
      data: { groups: [{ label: 'A', total: 2, moved: 3 }] },
    }
    expect(() => renderFigure(bad)).toThrow(AppError)
    expect(() =>
      renderFigure({
        kind: 'vitals_flowsheet',
        data: { columns: [{ label: 'HR' }], rows: [{ time: '1', values: [1, 2] }] },
      }),
    ).toThrow(/one value per column/)
  })
})
