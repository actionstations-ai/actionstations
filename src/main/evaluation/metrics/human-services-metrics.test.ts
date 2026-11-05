// Worked examples for the generic metrics the human services toolkits configure (spec 0464
// FR-11): service level, time to completion and needs coverage. The numbers are small enough to
// check by hand.
import { describe, expect, it } from 'vitest'
import type { GroundTruthEvent, MetricDecision, ModeledSeries } from '@shared/schemas/metrics'
import { metricIds, runMetric } from './registry'

const T0 = Date.parse('2026-11-03T12:00:00Z')
const at = (min: number): string => new Date(T0 + min * 60_000).toISOString()

describe('registration', () => {
  it('registers the three generic metrics', () => {
    for (const id of ['service_level', 'time_to_completion', 'needs_coverage'])
      expect(metricIds()).toContain(id)
  })
})

function series(zone: string, quantity: string, values: number[]): ModeledSeries {
  return { zone, quantity, points: values.map((value, i) => ({ time: at(i * 15), value })) }
}

describe('service level', () => {
  // Texts over four 15 minute intervals: 40 offered, 30 answered, 6 abandoned, 4 rerouted.
  const texts = [
    series('Texts', 'offered', [10, 10, 10, 10]),
    series('Texts', 'answered', [10, 8, 6, 6]),
    series('Texts', 'abandoned', [0, 1, 2, 3]),
    series('Texts', 'rerouted', [0, 1, 2, 1]),
    series('Texts', 'avg_wait_sec', [60, 120, 300, 300]),
    series('Texts', 'longest_wait_sec', [90, 200, 400, 420]),
  ]
  const run = (extra: Record<string, unknown> = {}, s = texts) =>
    runMetric({ id: 'service_level', config: { ...extra } }, { series: s })
  type Zone = Record<string, number | boolean | null>
  const zone = (r: ReturnType<typeof run>): Zone =>
    (r.data as { zones: Record<string, Zone> }).zones.Texts!

  it('computes answer rate, abandonment, mean wait and longest wait', () => {
    const z = zone(run())
    expect(z.offered).toBe(40)
    expect(z.answered).toBe(30)
    expect(z.answerRate).toBeCloseTo(0.75)
    expect(z.abandonRate).toBeCloseTo(0.15)
    // (10*60 + 8*120 + 6*300 + 6*300) / 30 = 172 s
    expect(z.meanWaitSec).toBeCloseTo(172)
    expect(z.longestWaitSec).toBe(420)
  })

  it('estimates the share answered promptly from intervals within the threshold', () => {
    // Only the first interval has a longest wait within 120 s: 10 of 30 answered.
    expect(zone(run({ thresholdSec: 120 })).promptShare).toBeCloseTo(10 / 30)
    // Within 300 s: the first two intervals, 18 of 30.
    expect(zone(run({ thresholdSec: 300 })).promptShare).toBeCloseTo(18 / 30)
  })

  it('compares the answer rate with a target and prints where the default target comes from', () => {
    const r = run()
    expect(zone(r).meetsTarget).toBe(false)
    expect(JSON.stringify(r.inputs)).toContain('Federal goal for texts and chats')
    expect(zone(run({ answerRateTargetPct: 70 })).meetsTarget).toBe(true)
    expect(r.caveats.join(' ')).toMatch(/rerouted to a backup center/)
  })

  it('counts intervals past a rerouting timer when one is given', () => {
    const r = run({ rerouteTimerSec: 300 })
    expect(r.tables[0]!.rows[0]![10]).toBe('2')
  })

  it('scores only the zones asked for and says so when none are found', () => {
    expect(run({ zones: 'Calls' }).data).toEqual({ zones: {} })
    expect(run({ zones: 'Calls' }).caveats.join(' ')).toMatch(/nothing was scored/)
  })

  it('shows n/a, not zero, with nothing offered', () => {
    const r = run({}, [series('Texts', 'offered', [0, 0]), series('Texts', 'answered', [0, 0])])
    expect(zone(r).answerRate).toBeNull()
  })
})

describe('time to completion', () => {
  const ev = (
    id: string,
    kind: string,
    min: number,
    attrs: Record<string, unknown> = {},
  ): GroundTruthEvent => ({
    id,
    kind,
    time: at(min),
    attrs,
  })
  const dec = (
    id: string,
    kind: string,
    min: number,
    fields: Record<string, unknown>,
  ): MetricDecision => ({
    id,
    kind,
    time: at(min),
    fields,
  })
  const events = [
    ev('start', 'site_activated', 0),
    ev('s1', 'student', 0, { ref: 'S-001' }),
    ev('s2', 'student', 0, { ref: 'S-002' }),
    ev('s3', 'student', 0, { ref: 'S-003' }),
    ev('s4', 'student', 0, { ref: 'S-004', unaccompanied: true }),
  ]
  const config = {
    populationLabel: 'students released',
    startEventKind: 'site_activated',
    completionDecisionKind: 'hs_release_student',
    memberField: 'student',
    completionRequires: 'identity_check:verified',
    populationEventKind: 'student',
    populationKey: 'ref',
    excludeAttr: 'unaccompanied',
    targetMin: 45,
  }

  it('reports the median and slowest among completed members and lists the open ones', () => {
    const r = runMetric(
      { id: 'time_to_completion', config },
      {
        events,
        decisions: [
          dec('d1', 'hs_release_student', 20, {
            student: 'S-001',
            identity_check: 'verified_photo_identification',
          }),
          dec('d2', 'hs_release_student', 50, {
            student: 's-002',
            identity_check: 'verified_photo_identification',
          }),
        ],
      },
    )
    const d = r.data as Record<string, number>
    expect(d.population).toBe(3)
    expect(d.completed).toBe(2)
    expect(d.open).toBe(1)
    expect(d.medianMin).toBe(35)
    expect(d.slowestMin).toBe(50)
    expect(d.withinTarget).toBe(1)
    const rows = r.tables[0]!.rows
    expect(rows[0]).toEqual(['S-003', 'n/a', 'Open'])
  })

  it('uses the first qualifying completion of a member and skips unqualified ones', () => {
    const r = runMetric(
      { id: 'time_to_completion', config },
      {
        events,
        decisions: [
          dec('d0', 'hs_release_student', 10, {
            student: 'S-001',
            identity_check: 'not_verified_sent_to_exceptions',
          }),
          dec('d1', 'hs_release_student', 30, {
            student: 'S-001',
            identity_check: 'verified_photo_identification',
          }),
          dec('d2', 'hs_release_student', 25, {
            student: 'S-001',
            identity_check: 'verified_photo_identification',
          }),
        ],
      },
    )
    expect((r.data as { completed: number; slowestMin: number }).completed).toBe(1)
    expect((r.data as { slowestMin: number }).slowestMin).toBe(25)
  })

  it('has no times when the start is missing, and never averages open members in', () => {
    const r = runMetric({ id: 'time_to_completion', config }, { events: [], decisions: [] })
    expect((r.data as { medianMin: number | null }).medianMin).toBeNull()
    expect(r.caveats.join(' ')).toMatch(/start was not found/)
  })

  it('works from decisions alone, one member per decision', () => {
    const r = runMetric(
      {
        id: 'time_to_completion',
        config: {
          populationLabel: 'shelters opened',
          startDecisionKind: 'hs_open_shelter',
          completionDecisionKind: 'hs_report_shelter_doors_open',
          memberField: 'site',
        },
      },
      {
        events: [],
        decisions: [
          dec('a', 'hs_open_shelter', 0, {}),
          dec('b', 'hs_report_shelter_doors_open', 90, { site: 'Eastside' }),
          dec('c', 'hs_report_shelter_doors_open', 150, { site: 'Ridge' }),
        ],
      },
    )
    expect((r.data as { medianMin: number }).medianMin).toBe(120)
  })

  it('requires a start kind in the config', () => {
    expect(() =>
      runMetric({ id: 'time_to_completion', config: { completionDecisionKind: 'x' } }, {}),
    ).toThrow()
  })
})

describe('needs coverage', () => {
  const need = (id: string, min: number, label: string, area: string): GroundTruthEvent => ({
    id,
    kind: 'need_recorded',
    time: at(min),
    area,
    attrs: { label },
  })
  const events = [
    need('n1', 0, 'Personal assistance', 'Eastside'),
    need('n2', 10, 'Personal assistance', 'Eastside'),
    need('n3', 20, 'Supervision', 'Eastside'),
    need('n4', 30, 'Personal assistance', 'Ridge'),
  ]
  const config = { decisionKind: 'hs_assign_fnss_support', targetMin: 30 }
  const assign = (min: number, needId: string, area: string, count?: number): MetricDecision => ({
    id: `d${min}`,
    kind: 'hs_assign_fnss_support',
    time: at(min),
    area,
    fields: { need: needId, ...(count === undefined ? {} : { count }) },
  })

  it('meets the earliest unmet need of the category and place first, by count', () => {
    const r = runMetric(
      { id: 'needs_coverage', config },
      {
        events,
        decisions: [
          assign(25, 'personal_assistance', 'Eastside', 2),
          assign(40, 'supervision', 'Eastside'),
        ],
      },
    )
    const d = r.data as {
      recorded: number
      met: number
      medianMin: number
      byCategory: Record<string, { met: number }>
    }
    expect(d.recorded).toBe(4)
    expect(d.met).toBe(3)
    expect(d.byCategory['Personal assistance']!.met).toBe(2)
    // n1: 25 min, n2: 15 min, n3: 20 min; median 20.
    expect(d.medianMin).toBe(20)
    expect(r.summary.find((s) => s.label === 'Met within target')!.value).toBe('3 of 4')
  })

  it('does not meet a need in another place or before it was recorded', () => {
    const r = runMetric(
      { id: 'needs_coverage', config },
      {
        events,
        decisions: [
          assign(5, 'supervision', 'Eastside'),
          assign(60, 'personal_assistance', 'Elsewhere'),
        ],
      },
    )
    expect((r.data as { met: number }).met).toBe(0)
  })

  it('says so when no needs were recorded', () => {
    const r = runMetric({ id: 'needs_coverage', config }, { events: [], decisions: [] })
    expect(r.caveats.join(' ')).toMatch(/No needs were recorded/)
    expect(r.summary.find((s) => s.label === 'Share met')!.value).toBe('n/a')
  })
})
