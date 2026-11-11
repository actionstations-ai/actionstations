// Simulated downtime model and consequence rules (spec 0451 FR-7, FR-11): worked examples.
import { describe, expect, it } from 'vitest'
import {
  CONSEQUENCE_RULES,
  DRAIN_MULTIPLE,
  SIMULATED_LABEL,
  applyDecisions,
  hourlyArrivals,
  initialState,
  seedDiscrepancies,
  simulateDowntime,
  type DowntimeParams,
} from './downtime'

const params: DowntimeParams = {
  seed: 5,
  beds: 200,
  startHour: 6,
  durationHours: 4,
  failedFeeds: ['lab_results'],
  dataLost: false,
}

describe('simulateDowntime', () => {
  const c = simulateDowntime(params)

  it('is labeled simulated and shows the bed multiplier', () => {
    expect(c.label).toBe(SIMULATED_LABEL)
    expect(c.bedMultiplier).toBe(2)
  })

  it('scales arrivals by bed count and time of day', () => {
    expect(hourlyArrivals(100, 8, 'lab_results')).toBe(312)
    expect(hourlyArrivals(200, 8, 'lab_results')).toBe(624)
    expect(hourlyArrivals(200, 2, 'lab_results')).toBeLessThan(
      hourlyArrivals(200, 8, 'lab_results'),
    )
  })

  it('grows the failed feed queue by exactly the arrivals while it is down', () => {
    let expected = 0
    for (const row of c.hours.filter((h) => h.down)) {
      expected += row.arrivals.lab_results!
      expect(row.queue.lab_results).toBe(expected)
    }
    expect(c.backlogAtRecovery.lab_results).toBe(expected)
  })

  it('leaves feeds that did not fail empty', () => {
    for (const row of c.hours) expect(row.queue.orders).toBe(0)
  })

  it('drains after recovery at the drain multiple and reports hours to drain', () => {
    const back = c.backlogAtRecovery.lab_results!
    const rate = hourlyArrivals(200, 10, 'lab_results') * DRAIN_MULTIPLE
    expect(c.drainHours.lab_results).toBe(Math.ceil(back / rate))
    const last = c.hours[c.hours.length - 1]!
    expect(last.queue.lab_results).toBe(0)
  })

  it('records lost messages instead of queueing them when data is lost', () => {
    const lost = simulateDowntime({ ...params, dataLost: true })
    expect(lost.backlogAtRecovery.lab_results).toBe(0)
    expect(lost.lost.lab_results).toBe(c.backlogAtRecovery.lab_results)
  })

  it('is deterministic', () => {
    expect(simulateDowntime(params)).toEqual(simulateDowntime(params))
  })
})

describe('seedDiscrepancies', () => {
  it('always includes one of each kind and repeats for the same seed', () => {
    const d = seedDiscrepancies(9, 12)
    expect(d.map((x) => x.kind)).toEqual([
      'duplicate_record',
      'wrong_patient_result',
      'order_sent_twice',
    ])
    expect(seedDiscrepancies(9, 12)).toEqual(d)
    expect(seedDiscrepancies(9, 12, 4)).toHaveLength(7)
    for (const x of d) for (const p of x.patients) expect(p).toBeLessThan(12)
  })
})

describe('consequence rules', () => {
  const start = initialState(simulateDowntime(params))

  it('ehr before the lab interface enlarges the backlog', () => {
    const { state, fired } = applyDecisions(start, [
      { kind: 'restore_order', order: ['identity_check', 'ehr', 'lab_interface'] },
    ])
    expect(state.resultsBacklog).toBe(Math.round(start.resultsBacklog * 1.5))
    expect(state.wrongPatientRisk).toBe(start.wrongPatientRisk)
    expect(fired.map((f) => f.ruleId)).toEqual(['ehr_before_lab_interface'])
  })

  it('results before the identity check raise the wrong-patient risk', () => {
    const { state, fired } = applyDecisions(start, [
      { kind: 'restore_order', order: ['lab_interface', 'identity_check', 'ehr'] },
    ])
    expect(state.wrongPatientRisk).toBe(start.wrongPatientRisk + 20)
    expect(state.resultsBacklog).toBe(start.resultsBacklog)
    expect(fired.map((f) => f.ruleId)).toEqual(['lab_interface_before_identity_check'])
  })

  it('the default clinician priority fires nothing', () => {
    const { state, fired } = applyDecisions(start, [
      {
        kind: 'restore_order',
        order: ['identity_check', 'lab_interface', 'ehr', 'pharmacy_interface'],
      },
    ])
    expect(state).toEqual(start)
    expect(fired).toEqual([])
  })

  it('discarding a class records the orders at risk', () => {
    const { state } = applyDecisions(start, [
      { kind: 'message_disposition', feed: 'lab', action: 'discard', queued: 300 },
    ])
    expect(state.ordersAtRisk).toBe(300)
  })

  it('replaying adds expected duplicates', () => {
    const { state } = applyDecisions(start, [
      { kind: 'message_disposition', feed: 'lab', action: 'replay', queued: 1000 },
    ])
    expect(state.duplicatesExpected).toBe(5)
  })

  it('holding results delays care and lowers the wrong-patient risk', () => {
    const risky = { ...start, wrongPatientRisk: 50 }
    const { state } = applyDecisions(risky, [
      { kind: 'result_release', action: 'hold_until_validated', holdHours: 3 },
    ])
    expect(state.resultHoldHours).toBe(3)
    expect(state.wrongPatientRisk).toBe(20)
  })

  it('a facilitator override lists the rule but changes nothing', () => {
    const { state, fired } = applyDecisions(
      start,
      [{ kind: 'restore_order', order: ['identity_check', 'ehr', 'lab_interface'] }],
      ['ehr_before_lab_interface'],
    )
    expect(state).toEqual(start)
    expect(fired[0]).toMatchObject({ ruleId: 'ehr_before_lab_interface', overridden: true })
  })

  it('every rule explains itself and has a unique id', () => {
    const ids = CONSEQUENCE_RULES.map((r) => r.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const r of CONSEQUENCE_RULES) expect(r.explanation.length).toBeGreaterThan(40)
  })
})
