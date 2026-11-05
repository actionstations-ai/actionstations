// Clinical systems metrics (spec 0451 FR-13): worked timelines through the shared registry, read
// from ground-truth events and recorded decisions. Fictional data.
import { describe, expect, it } from 'vitest'
import type { GroundTruthEvent, MetricDecision } from '@shared/schemas/metrics'
import { pairAgreement, rankCorrelation } from './clinical'
import { isMetricId, runMetric } from './registry'

const at = (hhmm: string) => `2026-10-21T${hhmm}:00Z`
const get = (r: { summary: { label: string; value: string }[] }, label: string) =>
  r.summary.find((s) => s.label === label)?.value

let n = 0
const ev = (
  kind: string,
  time: string,
  area?: string,
  attrs: Record<string, unknown> = {},
): GroundTruthEvent => ({ id: `e${++n}`, time, kind, ...(area ? { area } : {}), attrs })
const dec = (kind: string, time: string, fields: Record<string, unknown> = {}): MetricDecision => ({
  id: `d${++n}`,
  time,
  kind,
  fields,
})

describe('registration', () => {
  it('registers the six clinical metrics', () => {
    for (const id of [
      'time_to_downtime_procedures',
      'safe_care_losses',
      'critical_result_communication',
      'reconciliation_progress',
      'duplicate_records_created',
      'restore_order_score',
    ])
      expect(isMetricId(id), id).toBe(true)
  })
})

describe('time_to_downtime_procedures', () => {
  const bag = () => ({
    decisions: [dec('declare_downtime', at('06:42'))],
    events: [
      ev('unit_on_downtime', at('07:12'), '4 West'),
      ev('unit_on_downtime', at('07:57'), 'ED'),
      ev('unit_listed', at('06:00'), 'ICU'),
    ],
  })

  it('reports minutes per unit, units within target and units not yet ready', () => {
    const r = runMetric({ id: 'time_to_downtime_procedures', config: { target: 45 } }, bag())
    expect(get(r, 'Units within target')).toBe('1 of 3')
    expect(get(r, 'Units not yet on procedures')).toBe('1')
    expect(get(r, 'All units on procedures')).toBe('n/a')
    expect(r.tables[0]!.rows).toEqual([
      ['4 West', '30 min', 'yes'],
      ['ED', '75 min', 'no'],
      ['ICU', 'n/a', 'n/a'],
    ])
  })

  it('gives the slowest unit as the all-units time once every unit is ready', () => {
    const b = bag()
    b.events.push(ev('unit_on_downtime', at('08:12'), 'ICU'))
    const r = runMetric({ id: 'time_to_downtime_procedures', config: {} }, b)
    expect(get(r, 'All units on procedures')).toBe('90 min')
  })

  it('says so when nothing was declared', () => {
    const r = runMetric({ id: 'time_to_downtime_procedures', config: {} }, {})
    expect(r.caveats[0]).toMatch(/No downtime declaration/)
  })
})

describe('safe_care_losses', () => {
  it('counts outcomes and groups by message class', () => {
    const r = runMetric(
      { id: 'safe_care_losses', config: {} },
      {
        events: [
          ev('order_result_record', at('08:00'), undefined, {
            messageClass: 'lab results',
            outcome: 'lost',
          }),
          ev('order_result_record', at('08:00'), undefined, {
            messageClass: 'lab results',
            outcome: 'ok',
          }),
          ev('order_result_record', at('08:00'), undefined, {
            messageClass: 'orders',
            outcome: 'duplicated',
          }),
          ev('order_result_record', at('08:00'), undefined, {
            messageClass: 'orders',
            outcome: 'delayed',
          }),
        ],
      },
    )
    expect(get(r, 'Lost')).toBe('1')
    expect(get(r, 'Affected share')).toBe('75%')
    expect(r.tables[0]!.rows[1]).toEqual(['orders', '0', '1', '1', '0'])
  })
})

describe('critical_result_communication', () => {
  it('counts results communicated inside the target', () => {
    const r = runMetric(
      { id: 'critical_result_communication', config: { targetMinutes: 30 } },
      {
        events: [
          ev('critical_result', at('13:40'), undefined, { communicatedAt: at('13:58') }),
          ev('critical_result', at('14:00'), undefined, { communicatedAt: at('14:50') }),
          ev('critical_result', at('14:10')),
        ],
      },
    )
    expect(get(r, 'Within target')).toBe('1 of 3')
    expect(get(r, 'Not communicated')).toBe('1')
  })
})

describe('reconciliation_progress from the decision forms', () => {
  it('reads unit reports and the close decision', () => {
    const r = runMetric(
      { id: 'reconciliation_progress', config: {} },
      {
        decisions: [
          dec('reconcile_unit', at('10:00'), { unit: 'ED', done: 40, remaining: 60 }),
          dec('reconcile_unit', at('12:00'), { unit: 'ED', done: 100, remaining: 0 }),
          dec('close_reconciliation', at('12:30')),
        ],
      },
    )
    expect(get(r, 'Percent complete')).toBe('100%')
    expect(get(r, 'Time to close')).toBe('150 min')
  })
})

describe('reconciliation_progress', () => {
  it('uses the latest count per unit and the closing decision for the time', () => {
    const r = runMetric(
      { id: 'reconciliation_progress', config: {} },
      {
        events: [
          ev('reconciliation', at('10:00'), '4 West', { done: 10, remaining: 70 }),
          ev('reconciliation', at('12:00'), '4 West', { done: 60, remaining: 20 }),
          ev('reconciliation', at('12:00'), 'ED', { done: 30, remaining: 90 }),
        ],
        decisions: [dec('return_to_normal', at('14:30'))],
      },
    )
    expect(get(r, 'Percent complete')).toBe('45%')
    expect(get(r, 'Time to close')).toBe('270 min')
  })

  it('has no time while open', () => {
    const r = runMetric(
      { id: 'reconciliation_progress', config: {} },
      { events: [ev('reconciliation', at('10:00'), 'ED', { done: 1, remaining: 1 })] },
    )
    expect(get(r, 'Time to close')).toBe('n/a')
    expect(r.caveats[0]).toMatch(/not been closed/)
  })
})

describe('restore_order_score', () => {
  const priority = ['identity', 'lab_interface', 'ehr', 'pharmacy']

  it('is 1 for the same order and -1 for the reverse', () => {
    expect(rankCorrelation(priority, priority)).toBe(1)
    expect(rankCorrelation([...priority].reverse(), priority)).toBe(-1)
    expect(pairAgreement([...priority].reverse(), priority)).toBe(0)
  })

  it('scores the players latest decision against the configured priority', () => {
    const r = runMetric(
      { id: 'restore_order_score', config: { priority: priority.join(', ') } },
      {
        decisions: [
          dec('set_restore_order', at('09:00'), { ranking: 'pharmacy, ehr' }),
          dec('set_restore_order', at('09:30'), { ranking: 'ehr, lab_interface, identity' }),
        ],
      },
    )
    expect(get(r, 'Pairs in the same order')).toBe('0%')
    expect(get(r, 'Priority items left out')).toBe('1')
    expect(r.caveats.join(' ')).toMatch(/pharmacy/)
  })

  it('has no score for fewer than two shared items', () => {
    expect(rankCorrelation(['ehr'], priority)).toBeNull()
  })
})

describe('duplicate_records_created', () => {
  it('counts the duplicate-record events', () => {
    const r = runMetric(
      { id: 'duplicate_records_created', config: {} },
      {
        events: [
          ev('duplicate_record_created', at('11:00')),
          ev('duplicate_record_created', at('11:30')),
        ],
      },
    )
    expect(get(r, 'Duplicate records created')).toBe('2')
  })
})
