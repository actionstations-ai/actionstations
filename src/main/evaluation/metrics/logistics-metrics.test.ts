// The logistics metrics (#814): worked examples with known answers, the inputs and caveats each
// result shows, and what each says when the data is missing.
import { describe, expect, it } from 'vitest'
import type { GroundTruthEvent, MetricDecision, ModeledSeries } from '@shared/schemas/metrics'
import { computeLogisticsNotification, namedAccounts } from './logistics-notification'
import { computeLogisticsSupply } from './logistics-supply'
import { computeLogisticsTrace } from './logistics-trace'

const T0 = Date.parse('2026-11-04T12:00:00Z')
const at = (min: number): string => new Date(T0 + min * 60_000).toISOString()
const dec = (kind: string, min: number, fields: Record<string, unknown> = {}): MetricDecision => ({
  id: `${kind}-${min}`,
  time: at(min),
  kind,
  fields,
})
const events: GroundTruthEvent[] = [
  { id: 'signal', time: at(0), kind: 'recall_signal', attrs: {} },
  { id: 'answer', time: at(0), kind: 'trace_answer', attrs: { accounts: 20, gaps: 3 } },
]
const value = (r: { summary: { label: string; value: string }[] }, label: string): string =>
  r.summary.find((s) => s.label === label)!.value

describe('logistics_trace_completeness', () => {
  const config = { clockHours: 24, startFrom: 'signal' as const }

  it('scores time, completeness and whether gaps were reported', () => {
    const r = computeLogisticsTrace(
      {
        events,
        decisions: [
          dec('logistics_submit_trace_result', 90, {
            consignees_found: 15,
            gaps: 'two missing BOLs',
          }),
        ],
      },
      config,
    )
    expect(value(r, 'Time to trace')).toBe('90 min')
    expect(value(r, 'Within the clock')).toBe('yes')
    expect(value(r, 'Share of the real list found')).toBe('0.750')
    expect(value(r, 'Gaps reported')).toBe('yes (the records have 3)')
  })

  it('does not credit more accounts than exist and uses the last submission', () => {
    const r = computeLogisticsTrace(
      {
        events,
        decisions: [
          dec('logistics_submit_trace_result', 60, { consignees_found: 5 }),
          dec('logistics_submit_trace_result', 2000, { consignees_found: 25 }),
        ],
      },
      config,
    )
    expect(value(r, 'Share of the real list found')).toBe('1.000')
    expect(value(r, 'Within the clock')).toBe('no')
    expect(r.caveats.join(' ')).toMatch(/last submitted/)
  })

  it('can start the clock at the recall decision', () => {
    const r = computeLogisticsTrace(
      {
        events,
        decisions: [
          dec('logistics_declare_recall', 30),
          dec('logistics_submit_trace_result', 90, { consignees_found: 20 }),
        ],
      },
      { clockHours: 24, startFrom: 'recall_decision' },
    )
    expect(value(r, 'Time to trace')).toBe('60 min')
  })

  it('says n/a when nothing was submitted', () => {
    const r = computeLogisticsTrace({ events, decisions: [] }, config)
    expect(value(r, 'Time to trace')).toBe('n/a')
    expect(r.caveats.join(' ')).toMatch(/No trace result/)
  })
})

describe('logistics_notification_timeliness', () => {
  const config = { targetMin: 120 }

  it('counts each account once at its first notice and splits on time from late', () => {
    const r = computeLogisticsNotification(
      {
        events,
        decisions: [
          dec('logistics_declare_recall', 10),
          dec('logistics_notify_customers', 60, { customers: 'Store A, Store B' }),
          dec('logistics_notify_customers', 300, { customers: 'store a; Store C' }),
        ],
      },
      config,
    )
    expect(value(r, 'Accounts named in notices')).toBe('3')
    expect(value(r, 'Named within the target')).toBe('2')
    expect(value(r, 'Named late')).toBe('1')
    expect(value(r, 'Accounts never named')).toBe('17')
    expect(value(r, 'Share of the real list notified on time')).toBe('0.100')
  })

  it('cannot score on time without a recall decision', () => {
    const r = computeLogisticsNotification(
      { events, decisions: [dec('logistics_notify_customers', 60, { customers: 'Store A' })] },
      config,
    )
    expect(value(r, 'Named late')).toBe('n/a')
    expect(r.caveats.join(' ')).toMatch(/No recall decision/)
  })

  it('splits free-text account lists', () => {
    expect(namedAccounts('A, B;C\nD ,, ')).toEqual(['A', 'B', 'C', 'D'])
  })
})

describe('logistics_supply_protection', () => {
  const series: ModeledSeries[] = [
    {
      zone: 'Motor @ DC 1',
      quantity: 'days_of_supply',
      points: [
        { time: at(0), value: 10 },
        { time: at(1440), value: 2 },
        { time: at(2880), value: 0 },
      ],
    },
    {
      zone: 'Board @ DC 1',
      quantity: 'days_of_supply',
      points: [
        { time: at(0), value: 12 },
        { time: at(2880), value: 9 },
      ],
    },
    { zone: 'Other', quantity: 'on_hand', points: [{ time: at(0), value: 0 }] },
  ]
  const config = {
    quantity: 'days_of_supply',
    floorDays: 3,
    actionKinds: ['logistics_switch_source', 'logistics_allocate_supply'],
  }

  it('finds the zones below the floor and the lead of the first protective decision', () => {
    const r = computeLogisticsSupply(
      { series, decisions: [dec('logistics_switch_source', 0)] },
      config,
    )
    expect(value(r, 'Zones that stay above the floor')).toBe('1 of 2')
    expect(value(r, 'Zones that run out in the baseline')).toBe('1')
    expect(value(r, 'Lead of the first protective decision before that')).toBe('1 days')
  })

  it('reports a negative lead for a decision that came after the shortfall', () => {
    const r = computeLogisticsSupply(
      { series, decisions: [dec('logistics_switch_source', 3000)] },
      config,
    )
    expect(
      Number.parseFloat(value(r, 'Lead of the first protective decision before that')),
    ).toBeLessThan(0)
  })

  it('ignores other series quantities and says n/a without a decision', () => {
    const r = computeLogisticsSupply({ series, decisions: [] }, config)
    expect(r.tables[0]!.rows).toHaveLength(2)
    expect(value(r, 'Lead of the first protective decision before that')).toBe('n/a')
    expect(r.caveats.join(' ')).toMatch(/baseline/)
  })
})
