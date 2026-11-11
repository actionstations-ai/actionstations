// Reconciliation play (spec 0451 FR-12): progress from unit reports, discrepancies released as the
// work advances, and the close. Fictional data.
import { describe, expect, it } from 'vitest'
import { seedDiscrepancies } from './downtime'
import {
  discrepancyRows,
  discrepancyText,
  dueDiscrepancies,
  isClosed,
  percentComplete,
  progressFigureData,
  progressFromDecisions,
  releaseThreshold,
  type PlayDecision,
} from './reconciliation'
import { generatePatients } from './synthetic'

const at = (hhmm: string) => `2026-10-22T${hhmm}:00Z`
const report = (time: string, unit: string, done: number, remaining: number): PlayDecision => ({
  kind: 'reconcile_unit',
  time: at(time),
  fields: { unit, done, remaining },
})

const patients = generatePatients(4, 8, { asOf: '2026-10-22' })
const discrepancies = seedDiscrepancies(4, patients.length)

describe('progress', () => {
  const decisions = [
    report('09:00', '4 West', 10, 70),
    report('11:00', '4 West', 60, 20),
    report('10:00', 'ED', 30, 90),
  ]

  it('keeps the latest report per unit, in the order units first reported (by time)', () => {
    expect(progressFromDecisions(decisions).map((u) => [u.unit, u.done, u.remaining])).toEqual([
      ['4 West', 60, 20],
      ['ED', 30, 90],
    ])
  })

  it('computes the overall percent and feeds the progress figure', () => {
    const p = progressFromDecisions(decisions)
    expect(percentComplete(p)).toBe(45)
    expect(progressFigureData(p).units).toEqual([
      { name: '4 West', done: 60, remaining: 20 },
      { name: 'ED', done: 30, remaining: 90 },
    ])
    expect(percentComplete([])).toBe(0)
  })

  it('ignores reports with no unit and treats bad numbers as zero', () => {
    const p = progressFromDecisions([
      { kind: 'reconcile_unit', time: at('09:00'), fields: { done: 5 } },
      {
        kind: 'reconcile_unit',
        time: at('09:00'),
        fields: { unit: 'ICU', done: -3, remaining: 'x' },
      },
    ])
    expect(p).toEqual([expect.objectContaining({ unit: 'ICU', done: 0, remaining: 0 })])
  })

  it('knows when reconciliation was closed', () => {
    expect(isClosed(decisions)).toBe(false)
    expect(
      isClosed([...decisions, { kind: 'close_reconciliation', time: at('15:00'), fields: {} }]),
    ).toBe(true)
  })
})

describe('discrepancy release', () => {
  it('spreads thresholds from 10 to 80 percent', () => {
    expect(releaseThreshold(0, 3)).toBe(10)
    expect(releaseThreshold(1, 3)).toBe(45)
    expect(releaseThreshold(2, 3)).toBe(80)
    expect(releaseThreshold(0, 1)).toBe(10)
  })

  it('releases nothing before the first threshold and the rest as progress advances', () => {
    const none = new Set<string>()
    const at5 = progressFromDecisions([report('09:00', 'ED', 5, 95)])
    expect(dueDiscrepancies(discrepancies, at5, none, patients)).toEqual([])
    const at60 = progressFromDecisions([report('10:00', 'ED', 60, 40)])
    expect(
      dueDiscrepancies(discrepancies, at60, none, patients).map((d) => d.discrepancy.id),
    ).toEqual(['D1', 'D2'])
    const at95 = progressFromDecisions([report('11:00', 'ED', 95, 5)])
    expect(
      dueDiscrepancies(discrepancies, at95, new Set(['D1', 'D2']), patients).map(
        (d) => d.discrepancy.id,
      ),
    ).toEqual(['D3'])
  })

  it('releases nothing once reconciliation is closed', () => {
    const p = progressFromDecisions([report('10:00', 'ED', 95, 5)])
    expect(dueDiscrepancies(discrepancies, p, new Set(), patients, true)).toEqual([])
  })

  it('names the synthetic patients in each inject text', () => {
    for (const d of discrepancies) {
      const text = discrepancyText(d, patients)
      expect(text).toMatch(/TESTPATIENT/)
      expect(text).toMatch(/MRN \d{8}/)
    }
  })

  it('lists every discrepancy with its status', () => {
    const rows = discrepancyRows(discrepancies, new Set(['D2']), patients)
    expect(rows.map((r) => r[3])).toEqual(['not yet due', 'delivered', 'not yet due'])
    expect(rows[1]![1]).toBe('wrong patient result')
  })
})
