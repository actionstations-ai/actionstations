// The governance metrics (spec 0459 FR-9): disclosure timing against the four-business-day
// clock, recovery against RTO and the BIA order, and decision documentation.
import { describe, expect, it } from 'vitest'
import type { GroundTruthEvent, MetricDecision } from '@shared/schemas/metrics'
import {
  computeGovDecisionDocumentation,
  GovDecisionDocumentationConfig,
} from './governance-documentation'
import {
  computeGovDisclosureTiming,
  GovDisclosureTimingConfig,
} from './governance-disclosure-timing'
import { computeGovRecoveryRto, GovRecoveryRtoConfig, orderInversions } from './governance-recovery'

const discovered: GroundTruthEvent = {
  id: 'discovered',
  time: '2026-10-22T11:15:00.000Z',
  kind: 'discovered',
  attrs: {},
}
const decision = (
  id: string,
  kind: string,
  time: string,
  fields: Record<string, unknown>,
): MetricDecision => ({ id, kind, time, fields })
const row = (m: { summary: { label: string; value: string }[] }, label: string): string =>
  m.summary.find((s) => s.label === label)!.value

describe('disclosure timing', () => {
  const cfg = GovDisclosureTimingConfig.parse({})
  const determined = decision('d1', 'gov_materiality_determination', '2026-10-23T10:05:00.000Z', {
    determination: 'material',
  })
  const filed = (time: string, item = 'item_1_05') =>
    decision('d2', 'gov_disclosure_decision', time, { item })
  const board = decision('d3', 'gov_escalate_board', '2026-10-22T16:15:00.000Z', {})

  it('times discovery to determination and to board notice', () => {
    const out = computeGovDisclosureTiming(
      { events: [discovered], decisions: [determined, board] },
      cfg,
    )
    expect(row(out, 'Discovery to determination')).toBe('22.8 h')
    expect(row(out, 'Discovery to board notice')).toBe('5 h')
    expect(row(out, 'Determination')).toBe('material')
  })

  it('sets the filing deadline four business days after a material determination', () => {
    const out = computeGovDisclosureTiming({ events: [discovered], decisions: [determined] }, cfg)
    // Friday Oct 23 + 4 business days = Wednesday Oct 29 (Columbus Day was Oct 12).
    expect(row(out, 'Filing deadline')).toBe('2026-10-29T10:05:00.000Z')
    expect(row(out, 'Filing')).toBe('No filing recorded')
  })

  it('says on time or late for an Item 1.05 filing', () => {
    const early = computeGovDisclosureTiming(
      { events: [discovered], decisions: [determined, filed('2026-10-27T08:00:00.000Z')] },
      cfg,
    )
    expect(row(early, 'Filing')).toBe('On time')
    expect(row(early, 'Determination to filing')).toBe('93.9 h')
    const late = computeGovDisclosureTiming(
      { events: [discovered], decisions: [determined, filed('2026-10-30T08:00:00.000Z')] },
      cfg,
    )
    expect(row(late, 'Filing')).toBe('Late')
  })

  it('does not count an Item 8.01 filing as the Item 1.05 report', () => {
    const out = computeGovDisclosureTiming(
      {
        events: [discovered],
        decisions: [determined, filed('2026-10-24T08:00:00.000Z', 'item_8_01')],
      },
      cfg,
    )
    expect(row(out, 'Filing')).toMatch(/not an Item 1.05 report/)
  })

  it('shows a deferral: only "not yet determined" decisions give no determination', () => {
    const out = computeGovDisclosureTiming(
      {
        events: [discovered],
        decisions: [
          decision('p1', 'gov_materiality_determination', '2026-10-22T14:00:00.000Z', {
            determination: 'not_yet_determined',
          }),
        ],
      },
      cfg,
    )
    expect(row(out, 'Discovery to determination')).toBe('n/a')
    expect(out.caveats.join(' ')).toMatch(/only determinations recorded were "not yet determined"/)
  })

  it('compares with a designer target only when one is set', () => {
    const inputs = { events: [discovered], decisions: [determined] }
    expect(
      row(computeGovDisclosureTiming(inputs, cfg), 'Determination against the designer target'),
    ).toBe('No target set')
    const targeted = GovDisclosureTimingConfig.parse({ determinationTargetHours: 12 })
    expect(
      row(
        computeGovDisclosureTiming(inputs, targeted),
        'Determination against the designer target',
      ),
    ).toBe('Over 12 h')
  })

  it('states that it is exercise aid, not legal advice', () => {
    expect(computeGovDisclosureTiming({ events: [], decisions: [] }, cfg).caveats[0]).toMatch(
      /not legal advice/,
    )
  })
})

describe('recovery against RTO', () => {
  const recovered = (name: string, rto: number, at: number | null, dependsOn: string[] = []) =>
    ({
      id: `r-${name}`,
      time: '2026-10-22T20:00:00.000Z',
      kind: at === null ? 'function_not_recovered' : 'function_recovered',
      area: name,
      attrs: { rtoHours: rto, recoveredHour: at, dependsOn },
    }) satisfies GroundTruthEvent
  const events = [
    discovered,
    recovered('Network', 4, 3.5),
    recovered('ERP', 8, 9, ['Network']),
    recovered('Plant', 12, 11, ['Network']),
    recovered('Payroll', 48, null, ['ERP']),
  ]
  it('counts functions restored within RTO at each checkpoint hour', () => {
    const out = computeGovRecoveryRto(
      { events },
      GovRecoveryRtoConfig.parse({ checkpointHours: '4, 12, 48' }),
    )
    const table = out.tables[0]!
    expect(table.rows).toEqual([
      ['4', '1', '0', '0.250'],
      ['12', '2', '1', '0.500'],
      ['48', '2', '2', '0.500'],
    ])
    expect(row(out, 'Restored within RTO (final)')).toBe('2 of 4')
    expect(row(out, 'Never recovered')).toBe('1')
    expect(row(out, 'Recovered after RTO')).toBe('1')
  })
  it('flags recovery against the BIA order unless a dependency explains it', () => {
    const fns = [
      { name: 'A', rto: 4, recovered: 10, dependsOn: [] },
      { name: 'B', rto: 24, recovered: 6, dependsOn: [] },
      { name: 'C', rto: 2, recovered: 12, dependsOn: ['B'] },
    ]
    const pairs = orderInversions(fns).map(([a, b]) => `${a.name}>${b.name}`)
    expect(pairs).toEqual(['A>B', 'C>A'])
  })
  it('says so when there are no recovery events', () => {
    const out = computeGovRecoveryRto({ events: [] }, GovRecoveryRtoConfig.parse({}))
    expect(out.caveats.join(' ')).toMatch(/No recovery events/)
  })
})

describe('decision documentation', () => {
  const cfg = GovDecisionDocumentationConfig.parse({})
  const full = { decided_by: 'CEO', information_known: 'Scope unknown', basis: 'Worksheet v3' }
  it('counts the share of decisions with owner, facts and basis', () => {
    const out = computeGovDecisionDocumentation(
      {
        decisions: [
          decision('a', 'gov_ransom_payment', '2026-10-24T20:15:00.000Z', full),
          decision('b', 'gov_regulator_notice', '2026-10-25T08:00:00.000Z', {
            ...full,
            basis: '  ',
          }),
          decision('c', 'unrelated_form', '2026-10-25T09:00:00.000Z', {}),
        ],
      },
      cfg,
    )
    expect(row(out, 'Decisions fully documented')).toBe('1 of 2')
    expect(out.tables[0]!.rows[1]![2]).toBe('Basis')
  })
  it('reports n/a with no decisions and does not judge quality', () => {
    const out = computeGovDecisionDocumentation({ decisions: [] }, cfg)
    expect(row(out, 'Share fully documented')).toBe('n/a')
    expect(out.caveats.join(' ')).toMatch(/not that the basis is sound/)
  })
})
