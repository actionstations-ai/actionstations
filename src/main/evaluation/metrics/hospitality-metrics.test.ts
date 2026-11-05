// Worked examples for the hospitality metrics (#848, spec 0470 FR-11).
import { describe, expect, it } from 'vitest'
import type { GroundTruthEvent, MetricDecision } from '@shared/schemas/metrics'
import { registerHospitalityMetrics } from '../../toolkits/hospitality/register'
import { runMetric } from './registry'

registerHospitalityMetrics()

const T0 = Date.parse('2026-11-03T20:30:00Z')
const at = (min: number): string => new Date(T0 + min * 60_000).toISOString()
const ev = (
  id: string,
  kind: string,
  min: number,
  attrs: Record<string, unknown> = {},
): GroundTruthEvent => ({ id, kind, time: at(min), attrs })
const dec = (
  id: string,
  kind: string,
  min: number,
  fields: Record<string, unknown>,
): MetricDecision => ({ id, kind, time: at(min), fields })
const summary = (out: { summary: { label: string; value: string }[] }, label: string) =>
  out.summary.find((s) => s.label.startsWith(label))?.value

describe('hospitality accounting', () => {
  const events = [
    ev('start', 'muster_start', 0),
    ev('u1', 'person_unaccounted', 0, { foundAfterMin: 40 }),
    ev('u2', 'person_unaccounted', 0, { foundAfterMin: 60 }),
    ev('end', 'all_accounted', 60),
  ]
  const run = (decisions: MetricDecision[]) =>
    runMetric({ id: 'hospitality_accounting', config: {} }, { events, decisions })

  it('times the declaration and counts persons still missing at that time', () => {
    const out = run([
      dec('a', 'hosp_guest_accounting', 20, {
        status: 'count_in_progress',
        unaccounted: 2,
      }),
      dec('b', 'hosp_guest_accounting', 50, {
        status: 'Count complete, all accounted for',
        unaccounted: 0,
      }),
    ])
    expect(summary(out, 'Time to declare')).toBe('50 min')
    expect(summary(out, 'Declared before')).toBe('Yes')
    expect(summary(out, 'Persons still missing')).toBe('1')
    expect(summary(out, 'Mean error')).toBe('0.5')
  })

  it('accepts the option id the live form stores and a declaration after everyone is found', () => {
    const out = run([
      dec('b', 'hosp_guest_accounting', 65, {
        status: 'count_complete_all_accounted_for',
        unaccounted: 0,
      }),
    ])
    expect(summary(out, 'Declared before')).toBe('No')
    expect(summary(out, 'Persons still missing')).toBe('0')
  })

  it('says so when nobody declared', () => {
    const out = run([])
    expect(summary(out, 'Time to declare')).toBe('n/a')
    expect(summary(out, 'Declared before')).toBe('No declaration')
  })
})

describe('hospitality report timeliness', () => {
  const events = [
    ev('p2', 'threshold_2pct', 100, { group: 'passengers' }),
    ev('p3', 'threshold_3pct', 400, { group: 'passengers' }),
    ev('r24', 'report_point_24h', 1000, { opensAt: at(1000 - 12 * 60) }),
    ev('r4', 'report_point_4h', 1800),
  ]
  const run = (decisions: MetricDecision[]) =>
    runMetric(
      { id: 'hospitality_report_timeliness', config: { specialGraceMin: 60 } },
      { events, decisions },
    )
  const report = (
    id: string,
    min: number,
    which: string,
    authority = 'CDC Vessel Sanitation Program',
  ) => dec(id, 'hosp_report_to_authority', min, { authority, report: which })

  it('scores each report point against its window', () => {
    const out = run([
      report('a', 130, 'Special report, 2 percent'),
      report('b', 500, 'Special report, 3 percent'),
      report('c', 900, '24-hour report'),
      report('d', 1700, '4-hour update report'),
    ])
    expect(summary(out, 'Reports on time')).toBe('3 of 4')
    const rows = out.tables[0]!.rows
    expect(rows.find((r) => r[0]!.startsWith('Special report at 3'))![4]).toBe('Late')
  })

  it('does not count a report filed before the 24-hour window opened', () => {
    const out = run([report('c', 100, '24-hour report')])
    expect(out.tables[0]!.rows.find((r) => r[0] === '24-hour report')![4]).toBe(
      'Filed before the window opened',
    )
  })

  it('counts only reports to a CDC office and accepts option ids', () => {
    const out = run([
      report('a', 130, 'Special report, 2 percent', 'Port health authority'),
      dec('b', 'hosp_report_to_authority', 120, {
        authority: 'cdc_vessel_sanitation_program',
        report: 'special_report_2_percent',
      }),
    ])
    expect(out.tables[0]!.rows[0]![4]).toBe('On time')
    expect(summary(out, 'Not filed')).toBe('3')
  })
})
