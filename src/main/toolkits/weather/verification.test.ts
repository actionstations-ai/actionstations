// Warning verification and the hurricane decision timeline (#664): the weather toolkit configures
// the built-in metrics; a worked contingency table gives the numbers the NWS definitions give, and
// the simulated events score as the generators say they should.
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { GroundTruthEvent, MetricDecision } from '@shared/schemas/metrics'
import { isCoreCapability } from '@shared/core-capabilities'
import { DomainProfile } from '@shared/domains'
import { ToolkitSchema } from '@shared/toolkits'
import { metricIds, runMetric } from '../../evaluation/metrics/registry'
import { ConvectiveParams, generateConvective } from './simulate'
import { TropicalParams, generateTropical } from './simulate-tropical'

const root = resolve(__dirname, '../../../..')
const toolkit = ToolkitSchema.parse(
  JSON.parse(readFileSync(join(root, 'packs/toolkits/weather.json'), 'utf8')),
)
const profile = DomainProfile.parse(
  JSON.parse(readFileSync(join(root, 'packs/domains/meteorology.json'), 'utf8')),
)
const ref = (id: string) => {
  const m = toolkit.metrics.find((x) => x.id === id)!
  return { id: m.id, config: m.config }
}

const t = (hhmm: string): string => `2026-05-12T${hhmm.slice(0, 2)}:${hhmm.slice(2)}:00.000Z`
const tornado = (id: string, hhmm: string): GroundTruthEvent => ({
  id,
  time: t(hhmm),
  kind: 'tornado',
  attrs: {},
})
const warning = (id: string, hhmm: string): MetricDecision => ({
  id,
  time: t(hhmm),
  kind: 'issue_warning',
  fields: {},
})

describe('the weather toolkit metrics', () => {
  it('names only built-in metrics, with configs the metrics accept', () => {
    expect(toolkit.metrics.map((m) => m.id)).toEqual([
      'decision_timing',
      'threshold_timing',
      'message_consistency',
    ])
    for (const m of toolkit.metrics) expect(metricIds()).toContain(m.id)
    for (const m of toolkit.metrics) expect(() => runMetric(ref(m.id), {})).not.toThrow()
  })

  it('verifies warnings against reports: a worked contingency table', () => {
    // Five tornado reports; six warnings. Warnings 1-4 each precede a report within 45 minutes;
    // an event's lead time is measured from the earliest warning that matches it.
    // Warning 5 and 6 verify nothing (false alarms); the 20:15 report has no warning before it.
    const events = [
      tornado('E1', '1810'),
      tornado('E2', '1840'),
      tornado('E3', '1905'),
      tornado('E4', '1930'),
      tornado('E5', '2015'),
    ]
    const decisions = [
      warning('W1', '1750'),
      warning('W2', '1820'),
      warning('W3', '1850'),
      warning('W4', '1925'),
      warning('W5', '2130'),
      warning('W6', '1600'),
    ]
    const r = runMetric(ref('decision_timing'), { events, decisions })
    expect(r.data).toMatchObject({ hits: 4, misses: 1, falseAlarms: 2 })
    expect((r.data as { pod: number }).pod).toBeCloseTo(4 / 5, 5)
    expect((r.data as { far: number }).far).toBeCloseTo(2 / 6, 5)
    expect((r.data as { csi: number }).csi).toBeCloseTo(4 / 7, 5)
    expect((r.data as { meanLeadMin: number }).meanLeadMin).toBe(31.25)
    expect((r.data as { leadMinByEvent: Record<string, number | null> }).leadMinByEvent).toEqual({
      E1: 20,
      E2: 20,
      E3: 45,
      E4: 40,
      E5: null,
    })
    expect(r.title).toBe('Decision timing')
    expect(r.caveats.join(' ')).toMatch(/unverified warning never shortens or lengthens the mean/)
  })

  it('does not let an unverified warning change lead time (the known caveat)', () => {
    const events = [tornado('E1', '1810')]
    const base = runMetric(ref('decision_timing'), { events, decisions: [warning('W1', '1750')] })
    const withExtra = runMetric(ref('decision_timing'), {
      events,
      decisions: [warning('W1', '1750'), warning('W2', '2200')],
    })
    expect((withExtra.data as { meanLeadMin: number }).meanLeadMin).toBe(
      (base.data as { meanLeadMin: number }).meanLeadMin,
    )
    expect((withExtra.data as { far: number }).far).toBeGreaterThan(
      (base.data as { far: number }).far,
    )
  })

  it('scores only the decision kinds the toolkit names', () => {
    const r = runMetric(ref('decision_timing'), {
      events: [tornado('E1', '1810')],
      decisions: [{ id: 'S1', time: t('1750'), kind: 'issue_statement', fields: {} }],
    })
    expect(r.data).toMatchObject({ hits: 0, misses: 1, falseAlarms: 0 })
  })
})

describe('simulated events scored as designed', () => {
  const sim = generateConvective(
    ConvectiveParams.parse({
      start: '2026-05-12T19:00:00Z',
      durationMin: 120,
      stepMin: 10,
      radar: { lat: 39.42, lon: -83.82 },
      extentKm: 100,
      storm: {
        mode: 'supercell',
        startBearingDeg: 250,
        startRangeKm: 90,
        motionFromDeg: 280,
        speedKt: 30,
        tornado: { startMin: 60, endMin: 80 },
      },
      warningLeadMin: 12,
    }),
  )
  const events = (sim.find((d) => d.id === 'storm-reports')!.data as { events: GroundTruthEvent[] })
    .events
  const w = (
    sim.find((d) => d.id === 'warnings')!.data as { features: { properties: { start: string } }[] }
  ).features

  it('gives the simulated warning the lead time the generator set, plus the report delay', () => {
    const decision: MetricDecision = {
      id: 'sim-warning',
      time: w[0]!.properties.start,
      kind: 'issue_warning',
      fields: {},
    }
    const r = runMetric(
      {
        id: 'decision_timing',
        config: { ...ref('decision_timing').config, eventKinds: 'tornado' },
      },
      { events, decisions: [decision] },
    )
    // The first tornado report comes 4 minutes after the tornado starts, 12 minutes after the warning.
    expect(r.data).toMatchObject({ hits: 3, misses: 0, falseAlarms: 0, pod: 1, far: 0, csi: 1 })
    expect(
      (r.data as { leadMinByEvent: Record<string, number> }).leadMinByEvent['tornado-001'],
    ).toBe(16)
  })

  it('scores a late warning as a miss when it comes after the reports', () => {
    const late: MetricDecision = {
      id: 'late',
      time: '2026-05-12T20:30:00.000Z',
      kind: 'issue_warning',
      fields: {},
    }
    const r = runMetric(
      {
        id: 'decision_timing',
        config: { ...ref('decision_timing').config, eventKinds: 'tornado' },
      },
      { events, decisions: [late] },
    )
    expect(r.data).toMatchObject({ hits: 0, misses: 3, falseAlarms: 1 })
  })
})

describe('hurricane decision timeline', () => {
  const sim = generateTropical(
    TropicalParams.parse({
      start: '2026-09-10T00:00:00Z',
      hours: 72,
      track: {
        startLat: 24,
        startLon: -90,
        landfallLat: 29.4,
        landfallLon: -89.2,
        landfallHour: 48,
      },
      intensity: { startKt: 50, peakKt: 115, peakHour: 40 },
      places: [{ name: 'Coastal Zone A', lat: 29.2, lon: -89.5 }],
    }),
  )
  const wind = sim.find((d) => d.id === 'wind-at-places')!.data as {
    series: never[]
    events: GroundTruthEvent[]
  }
  const arrival = Date.parse(wind.events[0]!.time)

  it('is on time when the evacuation starts before the arrival minus the clearance time', () => {
    const order = (offsetMin: number): MetricDecision => ({
      id: 'order',
      time: new Date(arrival - 720 * 60_000 - offsetMin * 60_000).toISOString(),
      kind: 'order_evacuation',
      area: 'Coastal Zone A',
      fields: {},
    })
    const early = runMetric(ref('threshold_timing'), {
      series: wind.series,
      decisions: [order(60)],
    })
    const late = runMetric(ref('threshold_timing'), {
      series: wind.series,
      decisions: [order(-90)],
    })
    const text = (r: typeof early) => JSON.stringify(r.tables)
    expect(text(early)).toContain('On time')
    expect(text(late)).toContain('Late')
  })
})

describe('meteorology evaluation guidance', () => {
  it('shows the four capabilities the spec names first', () => {
    expect(profile.coreCapabilities!.slice(0, 4)).toEqual([
      'public_information_and_warning',
      'situational_assessment',
      'operational_communications',
      'planning',
    ])
    for (const c of profile.coreCapabilities!) expect(isCoreCapability(c), c).toBe(true)
  })

  it('writes checkable critical tasks into the families the writer reads', () => {
    for (const id of [
      'wx_convective_outbreak',
      'wx_tropical_cyclone',
      'wx_service_degradation',
      'wx_flash_flood',
    ]) {
      const guidance = profile.addedThreatFamilies!.find((f) => f.id === id)!.promptGuidance!
      expect(guidance, id).toMatch(/critical tasks/)
      expect(guidance.length).toBeLessThanOrEqual(2000)
    }
    expect(
      profile.addedThreatFamilies!.find((f) => f.id === 'wx_tropical_cyclone')!.promptGuidance,
    ).toMatch(/minus the zone clearance time/)
  })
})
