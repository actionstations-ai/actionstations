// Worked examples for the epidemiology metrics (#842, spec 0457 FR-12).
import { describe, expect, it } from 'vitest'
import { computeContactReach, ContactReachConfig, type ContactRecord } from './contact-reach'
import { computeCurveAccuracy, CurveAccuracyConfig } from './curve-accuracy'
import {
  computeDispensingThroughput,
  DispensingThroughputConfig,
  peakHourServed,
} from './dispensing-throughput'
import { registerEpidemiologyMetrics } from '../../toolkits/epidemiology/register'
import type { GroundTruthEvent, MetricDecision } from '@shared/schemas/metrics'
import { contactsFromBag } from './contact-reach'
import { curvesFromBag } from './curve-accuracy'
import { sitesFromBag } from './dispensing-throughput'
import { runMetric } from './registry'

const T0 = Date.parse('2026-10-22T08:00:00Z')
const at = (min: number): string => new Date(T0 + min * 60_000).toISOString()
const field = (out: { summary: { label: string; value: string }[] }, label: string) =>
  out.summary.find((s) => s.label.startsWith(label))?.value

describe('contact reach', () => {
  const contact = (
    id: string,
    reachedMin: number | null,
    extra: Partial<ContactRecord> = {},
  ): ContactRecord => ({
    id,
    listedAt: at(0),
    reachedAt: reachedMin === null ? null : at(reachedMin),
    ...extra,
  })
  const hours = (h: number) => h * 60

  it('counts reached on time, late, unreachable and open for ten close contacts', () => {
    const contacts: ContactRecord[] = [
      ...[2, 5, 8, 12, 20, 24].map((h, i) => contact(`on${i}`, hours(h))),
      contact('late1', hours(30)),
      contact('gone1', null, { unreachable: true }),
      contact('gone2', null, { unreachable: true }),
      contact('open1', null),
    ]
    const out = computeContactReach({ contacts }, ContactReachConfig.parse({ targetHours: 24 }))
    expect(out.data).toMatchObject({ counted: 10, onTime: 6, late: 1, unreachable: 2, open: 1 })
    expect(out.data.shareOnTime).toBeCloseTo(0.6, 10)
    expect(out.data.shareUnreachable).toBeCloseTo(0.2, 10)
    expect(field(out, 'Share reached within target')).toBe('0.600')
    expect(field(out, 'Share unreachable')).toBe('0.200')
    // Mean of the seven reached: (2+5+8+12+20+24+30)/7 hours.
    expect(out.data.meanMinutes).toBeCloseTo((101 / 7) * 60, 6)
    expect(out.data.medianMinutes).toBe(hours(12))
  })

  it('treats exactly the target as on time and honors a stricter target', () => {
    const contacts = [contact('a', hours(24)), contact('b', hours(24) + 1)]
    expect(computeContactReach({ contacts }, ContactReachConfig.parse({})).data).toMatchObject({
      onTime: 1,
      late: 1,
    })
    expect(
      computeContactReach({ contacts }, ContactReachConfig.parse({ targetHours: 12 })).data,
    ).toMatchObject({ onTime: 0, late: 2 })
  })

  it('leaves out contacts that are not close unless asked, and says the target is not national', () => {
    const contacts = [contact('a', 60), contact('b', 60, { close: false })]
    expect(computeContactReach({ contacts }, ContactReachConfig.parse({})).data.counted).toBe(1)
    const all = computeContactReach({ contacts }, ContactReachConfig.parse({ closeOnly: false }))
    expect(all.data.counted).toBe(2)
    expect(all.caveats.join(' ')).toMatch(/not a national standard/)
  })

  it('reads n/a with no contacts', () => {
    const out = computeContactReach({ contacts: [] }, ContactReachConfig.parse({}))
    expect(field(out, 'Share reached within target')).toBe('n/a')
    expect(out.caveats.join(' ')).toMatch(/No contacts/)
  })
})

describe('dispensing throughput', () => {
  const site = {
    id: 'POD 1',
    decidedAt: at(0),
    openedAt: at(90),
    served: Array.from({ length: 16 }, (_, i) => ({ time: at(105 + i * 15), count: 75 })),
  }

  it('reaches the plan rate: 1,200 people in four hours is 300 per hour', () => {
    const out = computeDispensingThroughput(
      { sites: [site] },
      DispensingThroughputConfig.parse({ planPerHour: 300, openTargetMin: 120 }),
    )
    expect(out.data.sites).toMatchObject({
      'POD 1': { toOpenMin: 90, served: 1200, perHour: 300, peakHour: 300 },
    })
    expect(field(out, 'Share of plan')).toBe('1.000')
    expect(field(out, 'Sites open within target')).toBe('1 of 1')
  })

  it('shows a shortfall and a site that opened late or never', () => {
    const slow = {
      ...site,
      id: 'POD 2',
      openedAt: at(200),
      served: [
        { time: at(260), count: 100 },
        { time: at(320), count: 100 },
      ],
    }
    const never = { id: 'POD 3', decidedAt: at(0), served: [] }
    const out = computeDispensingThroughput(
      { sites: [site, slow, never] },
      DispensingThroughputConfig.parse({}),
    )
    const s = out.data.sites as Record<string, { toOpenMin: number | null; perHour: number | null }>
    expect(s['POD 2']!.toOpenMin).toBe(200)
    expect(s['POD 2']!.perHour).toBeCloseTo(200 / 2, 10)
    expect(s['POD 3']!.toOpenMin).toBeNull()
    expect(s['POD 3']!.perHour).toBeNull()
    expect(field(out, 'Sites open within target')).toBe('1 of 3')
  })

  it('finds the best 60 minutes with a sliding window', () => {
    const served = [0, 10, 20, 30, 70, 75, 80].map((m, i) => ({
      time: at(m),
      count: [10, 10, 10, 10, 50, 50, 50][i]!,
    }))
    expect(peakHourServed(served)).toBe(160)
  })
})

describe('curve accuracy', () => {
  const day = (d: number, h = 6): string =>
    new Date(Date.parse('2026-10-17T00:00:00Z') + d * 86_400_000 + h * 3_600_000).toISOString()
  const lineList = [
    { onset: day(0), reported: day(1) },
    { onset: day(0, 9), reported: day(1, 2) },
    { onset: day(1), reported: day(2) },
    { onset: day(2), reported: day(2, 10) },
    { onset: day(2, 8), reported: day(3) },
    { onset: day(2, 12), reported: day(3, 5) },
  ]
  const start = '2026-10-17T00:00:00Z'
  const run = (counts: number[]) =>
    computeCurveAccuracy(
      { lineList, drawn: [{ label: 'Team A', start, counts }] },
      CurveAccuracyConfig.parse({}),
    )

  it('accepts the onset histogram: 2, 1, 3 per day', () => {
    const out = run([2, 1, 3, 0])
    expect(out.data.byCurve).toMatchObject({ 'Team A': { matches: true, absError: 0 } })
    expect(out.tables[0]!.rows[0]![7]).toBe('Matches')
  })

  it('names a curve drawn by report date: 0, 2, 2, 2', () => {
    const out = run([0, 2, 2, 2])
    expect(out.data.byCurve).toMatchObject({ 'Team A': { matches: false, byReportDate: true } })
    expect(out.tables[0]!.rows[0]![7]).toBe('Drawn by report date')
  })

  it('counts bins correct and the absolute error of a wrong curve', () => {
    const out = run([2, 2, 2, 0])
    expect(out.data.byCurve).toMatchObject({
      'Team A': { matches: false, byReportDate: false, absError: 2, binsCorrect: 2 },
    })
    expect(out.tables[0]!.rows[0]![7]).toBe('Does not match')
  })
})

const event = (
  id: string,
  min: number,
  kind: string,
  attrs: Record<string, unknown> = {},
): GroundTruthEvent => ({
  id,
  time: at(min),
  kind,
  attrs,
})
const decision = (
  id: string,
  min: number,
  kind: string,
  fields: Record<string, unknown>,
): MetricDecision => ({
  id,
  time: at(min),
  kind,
  fields,
})

describe('inputs from events and decisions', () => {
  it("reads contacts from listing events and the team's recorded outcomes", () => {
    const events = [
      event('c1', 0, 'contact_listed', { contact: 'K001', close: true }),
      event('c2', 0, 'contact_listed', { contact: 'K002', close: true }),
      event('c3', 0, 'contact_listed', { contact: 'K003', close: false }),
      event('x', 0, 'something_else'),
    ]
    const decisions = [
      decision('d1', 90, 'record_contact_outcome', { contact: 'K001', outcome: 'reached' }),
      decision('d2', 120, 'record_contact_outcome', { contact: 'K002', outcome: 'unreachable' }),
    ]
    const c = contactsFromBag(events, decisions)
    expect(c).toHaveLength(3)
    expect(c[0]).toMatchObject({ id: 'K001', close: true, reachedAt: at(90) })
    expect(c[1]).toMatchObject({ id: 'K002', unreachable: true })
    expect(c[1]!.reachedAt).toBeUndefined()
    expect(c[2]).toMatchObject({ id: 'K003', close: false })
  })

  it('reads a site from its activation, its opening decision and its counts', () => {
    const events = [event('a', 0, 'mcm_activation', { site: 'POD 1' })]
    const decisions = [
      decision('o', 100, 'open_dispensing_site', { site: 'POD 1', action: 'open' }),
      decision('n1', 160, 'record_dispensing_count', { site: 'POD 1', served: 150 }),
      decision('n2', 220, 'record_dispensing_count', { site: 'POD 1', served: 160 }),
      decision('n3', 220, 'record_dispensing_count', { site: 'POD 2', served: 99 }),
    ]
    const [site] = sitesFromBag(events, decisions)
    expect(site).toMatchObject({ id: 'POD 1', decidedAt: at(0), openedAt: at(100) })
    expect(site!.served).toEqual([
      { time: at(160), count: 150 },
      { time: at(220), count: 160 },
    ])
  })

  it('reads the line list from onset events and curves from submissions, dropping bad ones', () => {
    const events = [
      event('o1', 0, 'case_onset', { reportedAt: at(600) }),
      event('o2', 30, 'case_onset'),
    ]
    const decisions = [
      decision('s1', 1, 'submit_epi_curve', {
        team: 'Team A',
        start: '2026-10-22',
        counts: '2, 0, 1',
      }),
      decision('s2', 1, 'submit_epi_curve', { team: 'Team B', start: 'nope', counts: '1' }),
      decision('s3', 1, 'submit_epi_curve', {
        team: 'Team C',
        start: '2026-10-22',
        counts: 'a, b',
      }),
    ]
    const c = curvesFromBag(events, decisions)
    expect(c.lineList).toEqual([{ onset: at(0), reported: at(600) }, { onset: at(30) }])
    expect(c.drawn).toEqual([{ label: 'Team A', start: '2026-10-22', counts: [2, 0, 1] }])
  })
})

describe('registry (metrics go through registerMetric)', () => {
  registerEpidemiologyMetrics()

  it('runs each new metric by id from the shared bag and rejects a bad config', () => {
    const events = [event('c1', 0, 'contact_listed', { contact: 'K001' })]
    const decisions = [
      decision('d1', 60, 'record_contact_outcome', { contact: 'K001', outcome: 'reached' }),
    ]
    const r = runMetric({ id: 'contact_reach', config: { targetHours: 2 } }, { events, decisions })
    expect(r.data).toMatchObject({ counted: 1, onTime: 1 })
    expect(() => runMetric({ id: 'contact_reach', config: { targetHours: -1 } }, {})).toThrow()
    expect(runMetric({ id: 'curve_accuracy', config: {} }, {}).metricId).toBe('curve_accuracy')
    expect(runMetric({ id: 'dispensing_throughput', config: {} }, {}).metricId).toBe(
      'dispensing_throughput',
    )
  })

  it('is safe to register twice', () => {
    expect(() => registerEpidemiologyMetrics()).not.toThrow()
  })
})
