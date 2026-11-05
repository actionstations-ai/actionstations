// The governance figure kinds (spec 0459 FR-5): each draws valid SVG, writes a summary with the key
// values, offers a data table, never relies on color alone, and renders the same bytes twice.
import { describe, expect, it } from 'vitest'
import { listFigureKinds, renderFigure } from '../index'
import { GOVERNANCE_FIGURE_KINDS } from './index'
import { recoveryStatus } from './recovery-tracker'

const impact = (a: string, b: string, c: string) => ({ h4: a, h24: b, h72: c })

const FIXTURES: Record<string, unknown> = {
  gov_bia_table: {
    title: 'Business impact analysis',
    asOf: 'Reviewed March 2026',
    functions: [
      {
        name: 'Order entry',
        owner: 'VP Sales',
        rtoHours: 4,
        rpoHours: 1,
        impact: impact('Low', 'High', 'Severe'),
        dependencies: ['ERP'],
      },
      {
        name: 'Payroll',
        owner: 'CFO',
        rtoHours: 48,
        impact: impact('Low', 'Low', 'High'),
        dependencies: [],
      },
    ],
  },
  gov_recovery_tracker: {
    elapsedHours: 14,
    horizonHours: 48,
    functions: [
      { name: 'Network', rtoHours: 4, startHour: 1, recoveredHour: 6.5 },
      { name: 'ERP and billing', rtoHours: 12, startHour: 6.5, recoveredHour: 11 },
      { name: 'Plant scheduling', rtoHours: 12, startHour: 6.5 },
      { name: 'Shipping', rtoHours: 24 },
    ],
  },
  gov_decision_timeline: {
    events: [
      { hour: 0, kind: 'discovery' },
      { hour: 22.8, kind: 'determination' },
      { hour: 24, kind: 'board_notice' },
      { hour: 110, kind: 'filing' },
    ],
    clocks: [{ label: 'Form 8-K: four business days', fromHour: 22.8, toHour: 118.8 }],
  },
}

describe('governance figure kinds', () => {
  it('registers every kind the toolkit names, once', () => {
    const ids = GOVERNANCE_FIGURE_KINDS.map((k) => k.kind)
    expect(ids).toEqual(Object.keys(FIXTURES))
    for (const id of ids) expect(listFigureKinds()).toContain(id)
  })

  it.each(Object.keys(FIXTURES))('%s draws valid, repeatable, accessible output', (kind) => {
    const spec = { kind, data: FIXTURES[kind] }
    const a = renderFigure(spec)
    expect(a.svg.startsWith('<svg')).toBe(true)
    expect(a.svg).toContain('role="img"')
    expect(a.svg).toMatch(/<title id="[^"]+">/)
    expect(a.svg).not.toMatch(/<image|<script|href=|onload|data:/)
    expect(a.summary.length).toBeGreaterThan(40)
    expect(a.table?.rows.length).toBeGreaterThan(0)
    for (const row of a.table!.rows) expect(row).toHaveLength(a.table!.columns.length)
    expect(renderFigure(spec).svg).toBe(a.svg)
  })

  it('the recovery tracker states each status in words and counts them', () => {
    const r = renderFigure({ kind: 'gov_recovery_tracker', data: FIXTURES.gov_recovery_tracker })
    expect(r.summary).toMatch(/1 of 4 functions recovered within their RTO, 1 recovered after it/)
    expect(r.summary).toMatch(/1 past RTO/)
    expect(r.summary).toMatch(/Past RTO: Plant scheduling/)
    for (const word of ['Recovered within RTO', 'Past RTO', 'Not started'])
      expect(r.svg).toContain(word)
  })

  it('judges status by what had happened at the elapsed hour', () => {
    const f = { name: 'x', rtoHours: 8, startHour: 2, recoveredHour: 10 }
    expect(recoveryStatus(f, 5)).toBe('in_progress')
    expect(recoveryStatus(f, 9)).toBe('past_rto')
    expect(recoveryStatus(f, 11)).toBe('recovered_late')
    expect(recoveryStatus({ ...f, recoveredHour: 7 }, 8)).toBe('recovered')
    expect(recoveryStatus({ name: 'y', rtoHours: 8 }, 1)).toBe('not_started')
  })

  it('the decision timeline gives the intervals a debrief asks about', () => {
    const r = renderFigure({ kind: 'gov_decision_timeline', data: FIXTURES.gov_decision_timeline })
    expect(r.summary).toMatch(/Discovery to determination: 22\.8 h/)
    expect(r.summary).toMatch(/Determination to filing: 87\.2 h/)
    expect(r.table!.rows.some((row) => row[2] === 'Clock')).toBe(true)
  })

  it('the BIA names the shortest RTO and the functions reaching severe impact', () => {
    const r = renderFigure({ kind: 'gov_bia_table', data: FIXTURES.gov_bia_table })
    expect(r.summary).toMatch(/Shortest recovery time objective: Order entry, 4 hours/)
    expect(r.summary).toMatch(/Severe impact by 72 hours: Order entry/)
  })

  it('refuses data that does not fit a kind', () => {
    expect(() =>
      renderFigure({ kind: 'gov_recovery_tracker', data: { elapsedHours: 1, functions: [] } }),
    ).toThrow(/not valid/)
    expect(() =>
      renderFigure({
        kind: 'gov_bia_table',
        data: {
          functions: [{ name: 'A', rtoHours: 1, impact: impact('Low', 'Low', 'Nope') }],
        },
      }),
    ).toThrow(/not valid/)
    expect(() =>
      renderFigure({
        kind: 'gov_decision_timeline',
        data: {
          events: [{ hour: 1, kind: 'discovery' }],
          clocks: [{ label: 'x', fromHour: 5, toHour: 1 }],
        },
      }),
    ).toThrow(/not valid/)
  })
})
