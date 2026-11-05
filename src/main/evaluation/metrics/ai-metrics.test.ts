// The AI incident metrics (spec 0467 FR-9) on worked examples: each shows its inputs and caveats,
// handles missing decisions, and reads the option ids the toolkit forms produce.
import { describe, expect, it } from 'vitest'
import type { GroundTruthEvent, MetricDecision } from '@shared/schemas/metrics'
import {
  fraudEvents,
  modelIncidentEvents,
  ModelIncidentParams,
  SyntheticFraudParams,
} from '../../toolkits/ai/generators'
import { computeAiContainment, AiContainmentConfig } from './ai-containment'
import { computeAiDisclosures, AiDisclosuresConfig } from './ai-disclosures-on-time'
import { computeAiPaymentsStopped, AiPaymentsStoppedConfig } from './ai-payments-stopped'
import { computeAiTimeToDetect, AiTimeToDetectConfig } from './ai-time-to-detect'

const T0 = Date.parse('2026-11-03T14:00:00Z')
const at = (min: number): string => new Date(T0 + min * 60_000).toISOString()
const decision = (
  id: string,
  min: number,
  kind: string,
  fields: Record<string, unknown> = {},
): MetricDecision => ({ id, time: at(min), kind, fields })

const fraud = fraudEvents(SyntheticFraudParams.parse({})) as GroundTruthEvent[]

describe('ai_time_to_detect', () => {
  const run = (decisions: MetricDecision[]) =>
    computeAiTimeToDetect({ events: fraud, decisions }, AiTimeToDetectConfig.parse({}))

  it('measures from the first exposure to the first flag and to the declaration', () => {
    const r = run([
      decision('a', 95, 'ai_verify_callback', { result: 'not_genuine' }),
      decision('b', 140, 'ai_declare_incident', { severity: 'high' }),
    ])
    expect(r.data).toMatchObject({ toFlagMin: 95, toDeclarationMin: 140 })
    expect(r.summary.find((s) => s.label.includes('First flag to declaration'))?.value).toBe(
      '45 min',
    )
  })

  it('does not count a genuine callback result as a flag, and says what is missing', () => {
    const r = run([decision('a', 20, 'ai_verify_callback', { result: 'confirmed_genuine' })])
    expect(r.data.toFlagMin).toBeNull()
    expect(r.caveats.join(' ')).toMatch(/No flag was recorded/)
    expect(r.caveats.join(' ')).toMatch(/No incident was declared/)
  })

  it('counts a hold or a takedown as a flag', () => {
    expect(
      run([decision('a', 50, 'ai_hold_release_payment', { action: 'hold' })]).data.toFlagMin,
    ).toBe(50)
    expect(run([decision('a', 70, 'ai_request_takedown', {})]).data.toFlagMin).toBe(70)
  })
})

describe('ai_payments_stopped', () => {
  const run = (decisions: MetricDecision[]) =>
    computeAiPaymentsStopped({ events: fraud, decisions }, AiPaymentsStoppedConfig.parse({}))

  it('holds everything when the hold comes before the first settlement', () => {
    const r = run([
      decision('h', 60, 'ai_hold_release_payment', { action: 'hold', amount: 480000 }),
    ])
    expect(r.data).toMatchObject({
      heldCount: 3,
      attemptedCount: 3,
      heldValue: 1_440_000,
      heldShare: 1,
    })
  })

  it('records a late recall request apart from a hold, and never calls it a recovery', () => {
    const r = run([
      decision('b', 400, 'ai_notify_bank_law_enforcement', { request: 'recall_request' }),
    ])
    expect(r.data.heldCount).toBe(0)
    expect(Object.values(r.data.outcomes as Record<string, string>)).toEqual([
      'settled, recall requested',
      'settled, recall requested',
      'settled, recall requested',
    ])
    expect(r.caveats.join(' ')).toMatch(/not a recovery/)
  })

  it('reports the callback and its number source', () => {
    const only = run([
      decision('c', 10, 'ai_verify_callback', {
        number_source: 'the_number_in_the_request',
        result: 'confirmed_genuine',
      }),
    ])
    expect(only.summary.find((s) => s.label.startsWith('Callback'))?.value).toMatch(
      /only the number in the request/,
    )
    const good = run([
      decision('c', 10, 'ai_verify_callback', {
        number_source: 'company_directory',
        result: 'not_genuine',
      }),
    ])
    expect(good.summary.find((s) => s.label.startsWith('Callback'))?.value).toBe('made')
    expect(run([]).summary.find((s) => s.label.startsWith('Callback'))?.value).toBe('none made')
  })

  it('measures the time from the first instruction to the first hold', () => {
    const r = run([decision('h', 75, 'ai_hold_release_payment', { action: 'hold' })])
    expect(r.data.instructionToHoldMin).toBe(75)
  })
})

describe('ai_disclosures_on_time', () => {
  const params = ModelIncidentParams.parse({})
  const events = modelIncidentEvents(params) as GroundTruthEvent[]
  const run = (decisions: MetricDecision[], evs = events) =>
    computeAiDisclosures({ events: evs, decisions }, AiDisclosuresConfig.parse({}))
  const dayMin = (d: number): number => (Date.parse(params.start) - T0) / 60_000 + d * 1440
  const onDay = (id: string, d: number, kind: string): MetricDecision => ({
    id,
    time: new Date(Date.parse(params.start) + d * 86_400_000).toISOString(),
    kind,
    fields: {},
  })

  it('meets the 15 day regulator clock on day 34 and misses it on day 36', () => {
    // awareness is day 20, so the regulator is due on day 35 and customers on day 23
    const met = run([onDay('r', 34, 'ai_notify_regulator'), onDay('c', 22, 'ai_notify_customers')])
    expect(met.data).toMatchObject({ clocks: 2, met: 2 })
    const late = run([onDay('r', 36, 'ai_notify_regulator'), onDay('c', 22, 'ai_notify_customers')])
    expect(late.data.status).toEqual({
      'customer-notice-due': 'met',
      'regulator-report-due': 'missed',
    })
    expect(dayMin(0)).toBe(0)
  })

  it('says not made when no notice was recorded', () => {
    expect(run([]).data.status).toEqual({
      'customer-notice-due': 'not made',
      'regulator-report-due': 'not made',
    })
  })

  it('has no clock to score for a victim of fraud, and says that is correct', () => {
    const victim = modelIncidentEvents(
      ModelIncidentParams.parse({ role: 'victim' }),
    ) as GroundTruthEvent[]
    const r = run(
      [],
      victim.filter((e) => e.attrs.recipient !== 'customers'),
    )
    expect(r.data.clocks).toBe(0)
    expect(r.caveats.join(' ')).toMatch(/victim of fraud/)
    expect(r.caveats.join(' ')).toMatch(/not legal advice/)
  })
})

describe('ai_containment', () => {
  const events = modelIncidentEvents(ModelIncidentParams.parse({})) as GroundTruthEvent[]
  const base = Date.parse(ModelIncidentParams.parse({}).start)
  const when = (min: number): string => new Date(base + min * 60_000).toISOString()
  const d = (
    id: string,
    min: number,
    kind: string,
    fields: Record<string, unknown> = {},
  ): MetricDecision => ({
    id,
    time: when(min),
    kind,
    fields,
  })
  const run = (decisions: MetricDecision[]) =>
    computeAiContainment({ events, decisions }, AiContainmentConfig.parse({}))

  it('measures declaration to kill switch and credits evidence preserved first', () => {
    const r = run([
      d('a', 30_000, 'ai_declare_incident'),
      d('b', 30_030, 'ai_preserve_evidence', { what: 'all_of_these' }),
      d('c', 30_060, 'ai_pause_feature', { action: 'pause_for_everyone', evidence_first: 'no' }),
    ])
    expect(r.data).toMatchObject({ toContainMin: 60, evidenceFirst: true })
  })

  it('does not credit evidence recorded after the change, nor keeping the system running', () => {
    const late = run([
      d('a', 30_000, 'ai_declare_incident'),
      d('c', 30_060, 'ai_pause_feature', {
        action: 'roll_back_to_an_earlier_version',
        evidence_first: 'no',
      }),
      d('b', 30_090, 'ai_preserve_evidence', {}),
    ])
    expect(late.data.evidenceFirst).toBe(false)
    const kept = run([
      d('a', 30_000, 'ai_declare_incident'),
      d('c', 30_060, 'ai_pause_feature', { action: 'keep_running', evidence_first: 'yes' }),
    ])
    expect(kept.data.toContainMin).toBeNull()
    expect(kept.caveats.join(' ')).toMatch(/never paused/)
  })

  it('measures onset to declaration from the scenario ground truth', () => {
    const r = run([d('a', 30_000, 'ai_declare_incident')])
    expect(typeof r.data.onsetToDeclareMin).toBe('number')
  })
})
