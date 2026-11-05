// Worked examples for the field metrics (spec 0448 FR-12): the numbers a reader can check by hand.
import { describe, expect, it } from 'vitest'
import type { GroundTruthEvent, MetricDecision, ModeledSeries } from '@shared/schemas/metrics'
import { computeDecisionTiming, DecisionTimingConfig } from './decision-timing'
import { computeMessageConsistency, MessageConsistencyConfig } from './message-consistency'
import { runMetric } from './registry'
import { computeThresholdTiming, crossingTime, ThresholdTimingConfig } from './threshold-timing'

const T0 = Date.parse('2026-09-01T12:00:00.000Z')
const at = (min: number): string => new Date(T0 + min * 60_000).toISOString()

const event = (id: string, min: number, area?: string, kind = 'tornado'): GroundTruthEvent => ({
  id,
  time: at(min),
  kind,
  attrs: {},
  ...(area ? { area } : {}),
})
const decision = (id: string, min: number, area?: string, kind = 'warning'): MetricDecision => ({
  id,
  time: at(min),
  kind,
  fields: {},
  ...(area ? { area } : {}),
})
const dtConfig = (over: Partial<DecisionTimingConfig> = {}) => DecisionTimingConfig.parse(over)
const field = (out: { summary: { label: string; value: string }[] }, label: string) =>
  out.summary.find((s) => s.label.startsWith(label))?.value

describe('decision timing', () => {
  it('reproduces a contingency table with known POD, FAR and CSI (28 hits, 23 misses, 72 false alarms)', () => {
    const events = Array.from({ length: 51 }, (_, i) => event(`e${i}`, 600, `z${i}`))
    const hits = Array.from({ length: 28 }, (_, i) => decision(`h${i}`, 590, `z${i}`))
    const alarms = Array.from({ length: 72 }, (_, i) => decision(`f${i}`, 590, `other${i}`))
    const out = computeDecisionTiming({ events, decisions: [...hits, ...alarms] }, dtConfig())
    expect(out.data).toMatchObject({ hits: 28, misses: 23, falseAlarms: 72 })
    expect(out.data.pod).toBeCloseTo(28 / 51, 6)
    expect(out.data.far).toBeCloseTo(0.72, 6)
    expect(out.data.csi).toBeCloseTo(28 / 123, 6)
    expect(field(out, 'POD')).toBe('0.549')
    expect(field(out, 'FAR')).toBe('0.720')
    expect(field(out, 'CSI')).toBe('0.228')
  })

  it('measures lead time per event from the earliest matching decision and averages hits', () => {
    const out = computeDecisionTiming(
      {
        events: [event('a', 100, 'north'), event('b', 200, 'south'), event('c', 300, 'east')],
        decisions: [
          decision('d1', 70, 'north'),
          decision('d2', 90, 'north'),
          decision('d3', 190, 'south'),
        ],
      },
      dtConfig(),
    )
    expect(out.data.leadMinByEvent).toEqual({ a: 30, b: 10, c: null })
    expect(out.data.meanLeadMin).toBe(20)
    expect(field(out, 'Mean lead time')).toBe('20 min')
  })

  it('states that unverified warnings do not change lead time, and they do not', () => {
    const base = computeDecisionTiming(
      { events: [event('a', 100, 'north')], decisions: [decision('d1', 70, 'north')] },
      dtConfig(),
    )
    const withAlarm = computeDecisionTiming(
      {
        events: [event('a', 100, 'north')],
        decisions: [decision('d1', 70, 'north'), decision('x', 20, 'west')],
      },
      dtConfig(),
    )
    expect(withAlarm.data.meanLeadMin).toBe(base.data.meanLeadMin)
    expect(withAlarm.data.falseAlarms).toBe(1)
    expect(base.caveats.join(' ')).toMatch(/unverified warning never shortens or lengthens/)
  })

  it('applies the lead and grace windows', () => {
    const events = [event('a', 100)]
    const run = (min: number, over: Partial<DecisionTimingConfig>) =>
      computeDecisionTiming({ events, decisions: [decision('d', min)] }, dtConfig(over))
    expect(run(-30, { leadWindowMin: 120 }).data.hits).toBe(0) // 130 min ahead: too early
    expect(run(-20, { leadWindowMin: 120 }).data.hits).toBe(1) // exactly 120 min ahead
    expect(run(-30, { leadWindowMin: 180 }).data.hits).toBe(1)
  })

  it('treats a decision outside the lead window as a false alarm and a miss', () => {
    const out = computeDecisionTiming(
      { events: [event('a', 300)], decisions: [decision('d', 0)] },
      dtConfig({ leadWindowMin: 120 }),
    )
    expect(out.data).toMatchObject({ hits: 0, misses: 1, falseAlarms: 1 })
  })

  it('counts a decision inside the grace window as a hit with negative lead', () => {
    const out = computeDecisionTiming(
      { events: [event('a', 100)], decisions: [decision('d', 110)] },
      dtConfig({ graceWindowMin: 15 }),
    )
    expect(out.data.hits).toBe(1)
    expect(out.data.leadMinByEvent).toEqual({ a: -10 })
  })

  it('does not call a decision covering two events a false alarm (overlapping windows)', () => {
    const out = computeDecisionTiming(
      { events: [event('a', 100, 'n'), event('b', 130, 'n')], decisions: [decision('d', 90, 'n')] },
      dtConfig(),
    )
    expect(out.data).toMatchObject({ hits: 2, misses: 0, falseAlarms: 0 })
    expect(out.data.leadMinByEvent).toEqual({ a: 10, b: 40 })
  })

  it('filters by decision and event kind and can ignore areas', () => {
    const out = computeDecisionTiming(
      {
        events: [event('a', 100, 'n', 'flood'), event('b', 100, 'n', 'tornado')],
        decisions: [decision('d', 90, 'zzz', 'warning'), decision('e', 90, 'n', 'advisory')],
      },
      dtConfig({ eventKinds: ['tornado'], decisionKinds: ['warning'], matchArea: false }),
    )
    expect(out.data).toMatchObject({ hits: 1, misses: 0, falseAlarms: 0 })
  })

  it('reports n/a with no events', () => {
    const out = computeDecisionTiming({ events: [], decisions: [decision('d', 1)] }, dtConfig())
    expect(out.data).toMatchObject({ hits: 0, misses: 0, falseAlarms: 1, pod: null, csi: 0 })
    expect(field(out, 'POD')).toBe('n/a')
    expect(field(out, 'FAR')).toBe('1.000')
    expect(out.caveats.join(' ')).toMatch(/No ground-truth events/)
  })

  it('reports every event as a miss with no decisions', () => {
    const out = computeDecisionTiming({ events: [event('a', 5)], decisions: [] }, dtConfig())
    expect(out.data).toMatchObject({ hits: 0, misses: 1, pod: 0, far: null, csi: 0 })
    expect(field(out, 'Mean lead time')).toBe('n/a')
    expect(out.caveats.join(' ')).toMatch(/No decisions were recorded/)
  })

  it('shows the inputs it used', () => {
    const out = computeDecisionTiming({ events: [event('a', 5)], decisions: [] }, dtConfig())
    expect(out.inputs.map((i) => i.label)).toContain('Lead window')
  })
})

describe('threshold timing', () => {
  const series = (zone: string, values: [number, number][]): ModeledSeries => ({
    zone,
    quantity: 'sustained wind (kt)',
    points: values.map(([min, value]) => ({ time: at(min), value })),
  })
  const evac = (min: number, area?: string) =>
    decision(`ev${min}${area ?? ''}`, min, area, 'evacuation')
  const cfg = (over = {}) =>
    ThresholdTimingConfig.parse({ actionKind: 'evacuation', threshold: 34, ...over })

  it('interpolates the crossing between samples', () => {
    expect(
      crossingTime(
        series('a', [
          [0, 20],
          [600, 40],
        ]),
        34,
      ),
    ).toBe(T0 + 420 * 60_000)
    expect(crossingTime(series('a', [[0, 40]]), 34)).toBe(T0)
    expect(
      crossingTime(
        series('a', [
          [0, 10],
          [60, 20],
        ]),
        34,
      ),
    ).toBeNull()
  })

  it('scores evacuation start against winds arriving minus clearance, per zone', () => {
    const out = computeThresholdTiming(
      {
        series: [
          series('Zone A', [
            [0, 10],
            [1200, 50],
          ]), // crosses 34 at 720 min
          series('Zone B', [
            [0, 10],
            [600, 40],
          ]), // crosses 34 at 480 min
          series('Zone C', [
            [0, 10],
            [600, 40],
          ]),
        ],
        decisions: [evac(100, 'Zone A'), evac(400, 'Zone B')],
      },
      cfg({ clearanceMin: 600, clearanceMinByZone: { 'Zone C': 120 } }),
    )
    // Zone A needed by 720-600=120, acted at 100: 20 min spare. Zone B needed by -120: late.
    expect(out.data.zones).toMatchObject({
      'Zone A': { status: 'on_time', marginMin: 20 },
      'Zone B': { status: 'late', marginMin: -520 },
      'Zone C': { status: 'no_action', marginMin: null },
    })
    expect(field(out, 'Zones on time')).toBe('1')
    expect(field(out, 'Zones late')).toBe('1')
  })

  it('applies an area-less action to every zone and handles a threshold never crossed', () => {
    const out = computeThresholdTiming(
      {
        series: [
          series('A', [
            [0, 10],
            [100, 40],
          ]),
          series('B', [
            [0, 1],
            [100, 2],
          ]),
        ],
        decisions: [evac(0)],
      },
      cfg(),
    )
    expect(out.data.zones).toMatchObject({
      A: { status: 'on_time' },
      B: { status: 'no_crossing' },
    })
  })

  it('handles no zones', () => {
    const out = computeThresholdTiming({ series: [], decisions: [] }, cfg())
    expect(field(out, 'Mean margin')).toBe('n/a')
    expect(out.caveats.join(' ')).toMatch(/No zones/)
  })
})

describe('message consistency', () => {
  const facts = [
    { id: 'eta', label: 'Landfall time' },
    { id: 'zone', label: 'Evacuation zone' },
    { id: 'shelter', label: 'Shelter location' },
    { id: 'phone', label: 'Hotline' },
  ]
  const cfg = (over = {}) => MessageConsistencyConfig.parse(over)

  it('compares evaluator-entered values deterministically', () => {
    const out = computeMessageConsistency(
      {
        facts,
        statements: [
          { factId: 'eta', partner: 'County', value: '14:00' },
          { factId: 'eta', partner: 'City', value: ' 14:00 ' },
          { factId: 'zone', partner: 'County', value: 'Zone A' },
          { factId: 'zone', partner: 'City', value: 'zone a.' },
          { factId: 'shelter', partner: 'County', value: 'High School' },
          { factId: 'shelter', partner: 'City', value: 'Arena' },
          { factId: 'phone', partner: 'City', value: '555-0100' },
        ],
      },
      cfg({ partners: ['County', 'City'] }),
    )
    expect(out.data).toMatchObject({ consistent: 2, conflict: 1, single: 1, none: 0 })
    expect(out.data.score).toBeCloseTo(2 / 3, 6)
    expect(out.tables[0]!.rows.at(-1)![3]).toBe('County')
  })

  it('uses a numeric tolerance only for numbers', () => {
    const statements = [
      { factId: 'a', partner: 'X', value: '10.0' },
      { factId: 'a', partner: 'Y', value: '10.4' },
    ]
    const f = [{ id: 'a', label: 'Surge feet' }]
    expect(computeMessageConsistency({ facts: f, statements }, cfg()).data.conflict).toBe(1)
    expect(
      computeMessageConsistency({ facts: f, statements }, cfg({ numericTolerance: 0.5 })).data
        .consistent,
    ).toBe(1)
  })

  it('leaves unconfirmed model suggestions out of the score and says so', () => {
    const out = computeMessageConsistency(
      {
        facts: [{ id: 'a', label: 'Fact' }],
        statements: [
          { factId: 'a', partner: 'X', value: '1' },
          { factId: 'a', partner: 'Y', value: '2', suggested: true },
        ],
      },
      cfg(),
    )
    expect(out.data).toMatchObject({ single: 1, conflict: 0 })
    expect(out.caveats.join(' ')).toMatch(/1 model-suggested/)
  })

  it('has no score with nothing to compare', () => {
    const out = computeMessageConsistency({ facts: [], statements: [] }, cfg())
    expect(field(out, 'Consistency')).toBe('n/a')
  })
})

describe('registry', () => {
  it('runs a named metric, validates its config and stamps the result', () => {
    const r = runMetric(
      { id: 'decision_timing', config: { leadWindowMin: 30 } },
      { events: [], decisions: [] },
      { sessionId: 's1', now: () => new Date(T0) },
    )
    expect(r).toMatchObject({ metricId: 'decision_timing', sessionId: 's1', computedAt: at(0) })
    expect(r.config).toMatchObject({ leadWindowMin: 30 })
  })

  it('rejects an unknown metric and a bad config', () => {
    expect(() => runMetric({ id: 'nope', config: {} }, {})).toThrow(/Unknown metric/)
    expect(() => runMetric({ id: 'threshold_timing', config: {} }, {})).toThrow(/could not run/)
  })
})
