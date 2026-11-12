// The downtime model in play (issue #1130): the generator's events carry the case, decisions run
// through the consequence rules, and the seeded discrepancies fall due as back-entry advances.
import { describe, expect, it } from 'vitest'
import {
  DOWNTIME_EVENTS_DATASET,
  backEntry,
  clinicalDecisionsOf,
  downtimeCaseEvents,
  downtimeDerivedEvents,
  downtimePlayStatus,
  downtimeSetupFrom,
  feedOf,
  overridesOf,
  systemOf,
  type DowntimeSetupParams,
  type PlayDecisionLike,
} from './downtime-play'
import { SIMULATED_LABEL } from './downtime'

const START = '2026-11-12T02:00:00.000Z'
const params: DowntimeSetupParams = {
  seed: 9,
  beds: 200,
  start: START,
  durationHours: 4,
  failedFeeds: ['lab_results', 'orders'],
  dataLost: false,
  units: ['4 West', 'ICU'],
  patientCount: 10,
  extraDiscrepancies: 0,
  criticalResults: 2,
}
const at = (min: number) => new Date(Date.parse(START) + min * 60_000).toISOString()
const d = (kind: string, min: number, fields: Record<string, unknown>): PlayDecisionLike => ({
  id: `${kind}-${min}`,
  kind,
  time: at(min),
  fields,
})

const events = downtimeCaseEvents(params)
const setup = downtimeSetupFrom(events)!

describe('the generator events', () => {
  it('is named for the dataset the measures read', () => {
    expect(DOWNTIME_EVENTS_DATASET).toBe('clinical-systems-events')
  })

  it('starts with the outage, which carries the setup, and labels every event simulated', () => {
    expect(events[0]).toMatchObject({ kind: 'downtime_start', time: START })
    expect(events[0]!.attrs.label).toBe(SIMULATED_LABEL)
    for (const e of events) expect(e.attrs.simulated).toBe(true)
  })

  it('lists the units, critical results while down, the recovery and the paper to enter', () => {
    expect(events.filter((e) => e.kind === 'unit_listed').map((e) => e.area)).toEqual([
      '4 West',
      'ICU',
    ])
    const results = events.filter((e) => e.kind === 'critical_result')
    expect(results).toHaveLength(2)
    for (const r of results) {
      expect(Date.parse(r.time)).toBeLessThan(Date.parse(at(240)))
      expect(String(r.attrs.patient)).toMatch(/^TESTPATIENT, /)
    }
    expect(events.find((e) => e.kind === 'system_recovered')?.time).toBe(at(240))
    const paper = events.filter((e) => e.kind === 'reconciliation')
    expect(paper.map((e) => e.area)).toEqual(['4 West', 'ICU'])
    expect(paper[0]!.attrs.remaining).toBeGreaterThan(0)
  })

  it('rebuilds the same case from the events, deterministically', () => {
    expect(downtimeSetupFrom(downtimeCaseEvents(params))).toEqual(setup)
    expect(setup.case.backlogAtRecovery.lab_results).toBeGreaterThan(0)
    expect(setup.discrepancies.map((x) => x.kind)).toEqual([
      'duplicate_record',
      'wrong_patient_result',
      'order_sent_twice',
    ])
  })

  it('gives no setup when the scenario has no downtime start with one', () => {
    expect(downtimeSetupFrom([])).toBeUndefined()
    expect(
      downtimeSetupFrom([{ id: 'x', time: START, kind: 'downtime_start', attrs: {} }]),
    ).toBeUndefined()
  })
})

describe('reading the forms', () => {
  it('names systems and feeds loosely', () => {
    expect(
      ['Identity check', 'MPI', 'Lab interface', 'EHR', 'Pharmacy interface'].map(systemOf),
    ).toEqual(['identity_check', 'identity_check', 'lab_interface', 'ehr', 'pharmacy_interface'])
    expect(feedOf('Lab results ORU')).toBe('lab_results')
    expect(feedOf('Pharmacy orders')).toBe('pharmacy')
    expect(feedOf('ADT')).toBe('adt')
    expect(feedOf('CPOE orders')).toBe('orders')
    expect(feedOf('something else')).toBeUndefined()
  })

  it('uses the latest restore order and the latest disposition of each feed', () => {
    const { decisions } = clinicalDecisionsOf(setup, [
      d('set_restore_order', 10, { ranking: 'EHR, lab interface' }),
      d('set_restore_order', 20, { ranking: 'identity check > lab interface > EHR' }),
      d('message_disposition', 30, { feed: 'Lab', message_class: 'ORU', action: 'replay' }),
      d('message_disposition', 40, { feed: 'Lab', message_class: 'ORU', action: 'hold' }),
    ])
    expect(decisions).toEqual([
      { kind: 'restore_order', order: ['identity_check', 'lab_interface', 'ehr'] },
      {
        kind: 'message_disposition',
        feed: 'lab_results',
        action: 'hold',
        queued: setup.case.backlogAtRecovery.lab_results,
      },
    ])
  })

  it('reads overrides by the option id live play stores, the latest per rule winning', () => {
    const o = (min: number, action: string) =>
      d('override_consequence', min, {
        rule: 'ehr_opened_to_clinicians_before_the_lab_', // the 40-character option id
        action,
      })
    expect(overridesOf([o(1, 'override_the_rule')])).toEqual(['ehr_before_lab_interface'])
    expect(overridesOf([o(1, 'override_the_rule'), o(2, 'let_the_rule_apply')])).toEqual([])
  })
})

describe('consequences', () => {
  it('fires no rule for the clinician priority order', () => {
    const s = downtimePlayStatus(setup, [
      d('set_restore_order', 250, {
        ranking: 'identity check, lab interface, EHR, pharmacy interface',
      }),
    ])
    expect(s.fired).toEqual([])
    expect(s.state).toEqual(s.baseline)
  })

  it('makes the results backlog larger when the EHR opens before the lab interface', () => {
    const s = downtimePlayStatus(setup, [
      d('set_restore_order', 250, { ranking: 'EHR, lab interface, identity check' }),
    ])
    expect(s.fired.map((r) => r.ruleId)).toEqual([
      'ehr_before_lab_interface',
      'lab_interface_before_identity_check',
    ])
    expect(s.state.resultsBacklog).toBe(Math.round(s.baseline.resultsBacklog * 1.5))
    expect(s.state.wrongPatientRisk).toBe(30)
  })

  it('lists an overridden rule but leaves the case alone', () => {
    const s = downtimePlayStatus(setup, [
      d('set_restore_order', 250, { ranking: 'EHR, lab interface' }),
      d('override_consequence', 251, { rule: 'ehr_before_lab_interface', action: 'override' }),
    ])
    expect(s.fired[0]).toMatchObject({ ruleId: 'ehr_before_lab_interface', overridden: true })
    expect(s.state.resultsBacklog).toBe(s.baseline.resultsBacklog)
  })
})

describe('reconciliation', () => {
  const total = setup.paperItems['4 West']!
  const report = (min: number, unit: string, done: number, remaining: number) =>
    d('reconcile_unit', min, { unit, done, remaining })

  it('shows the simulated paper count until a unit reports', () => {
    const units = backEntry(setup, [report(300, '4 west', 5, total - 5)])
    expect(units).toEqual([
      { unit: '4 West', done: 5, remaining: total - 5, reported: true },
      { unit: 'ICU', done: 0, remaining: total, reported: false },
    ])
  })

  it('makes each discrepancy due at the report that reaches its threshold, once', () => {
    const tenth = Math.ceil(total * 0.2)
    const s = downtimePlayStatus(setup, [
      report(300, '4 West', tenth, total - tenth), // 10%
      report(310, 'ICU', 0, total),
      report(330, '4 West', total, 0), // 50%
    ])
    expect(s.discrepancies.map((x) => [x.threshold, x.dueAt])).toEqual([
      [10, at(300)],
      [45, at(330)],
      [80, undefined],
    ])
    expect(s.discrepancies[0]!.text).toMatch(/two records/)
  })

  it('makes nothing due after reconciliation is closed', () => {
    const s = downtimePlayStatus(setup, [
      d('close_reconciliation', 290, {}),
      report(300, '4 West', total, 0),
      report(301, 'ICU', total, 0),
    ])
    expect(s.closedAt).toBe(at(290))
    expect(s.discrepancies.every((x) => !x.dueAt)).toBe(true)
  })
})

describe('events for the measures', () => {
  const kinds = (list: { kind: string }[]) => list.map((e) => e.kind)

  it('marks queued messages delayed until a disposition is recorded', () => {
    const out = downtimeDerivedEvents(setup, [])
    const records = out.filter((e) => e.kind === 'order_result_record')
    expect(records.map((e) => e.attrs.outcome)).toEqual(['delayed', 'delayed'])
    expect(records[0]!.attrs.count).toBe(setup.case.backlogAtRecovery.lab_results)
    expect(kinds(out)).toContain('duplicate_records_expected')
  })

  it('records discarded messages as lost and re-ordered tests as duplicated', () => {
    const out = downtimeDerivedEvents(setup, [
      d('set_restore_order', 245, { ranking: 'EHR, lab interface' }),
      d('message_disposition', 246, { feed: 'orders', action: 'discard' }),
    ])
    const byClass = out
      .filter((e) => e.kind === 'order_result_record')
      .map((e) => [e.attrs.messageClass, e.attrs.outcome])
    expect(byClass).toEqual([
      ['Laboratory results', 'delayed'],
      ['Orders', 'lost'],
      ['Laboratory results', 'duplicated'],
    ])
  })

  it('counts a surfaced duplicate registration as created and the model total as expected', () => {
    const total = setup.paperItems['4 West']!
    const out = downtimeDerivedEvents(setup, [
      d('message_disposition', 246, { feed: 'ADT', action: 'replay', orders_at_risk: 400 }),
      d('reconcile_unit', 300, { unit: '4 West', done: total, remaining: 0 }),
    ])
    expect(out.filter((e) => e.kind === 'duplicate_record_created')).toHaveLength(1)
    expect(out.find((e) => e.kind === 'duplicate_records_expected')?.attrs.count).toBe(1 + 2)
  })
})
