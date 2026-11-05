// Patients, trajectories and the unit model (spec 0452 FR-7, FR-8): deterministic given a seed,
// the learner's actions change the course, values stay plausible, and the unit's numbers agree.
import { describe, expect, it } from 'vitest'
import { computeEws, NEUTRAL_EWS } from '../../../shared/clinical/ews'
import { doseProblem } from '../../../shared/clinical/dose'
import { generatePatient, rng } from './patient'
import {
  DEFINITIONS,
  TRAJECTORY_KINDS,
  VITAL_KEYS,
  VITAL_LIMITS,
  ewsReadingAt,
  generateTrajectory,
  stepAt,
  toMonitorData,
  type TrajectoryParams,
} from './trajectory'
import { applyChange, simulateUnit, toCensusData, toStaffingData, UnitParams } from './unit'
import { clinicalTrajectoryDatasets } from './generators'

const params = (over: Partial<TrajectoryParams> = {}): TrajectoryParams => ({
  kind: 'sepsis',
  seed: 7,
  durationMin: 240,
  stepMin: 15,
  ...over,
})

describe('synthetic patients', () => {
  it('are the same for a seed and labeled simulated', () => {
    const a = generatePatient(11, 'postoperative')
    expect(generatePatient(11, 'postoperative')).toEqual(a)
    expect(a.simulated).toBe(true)
    expect(a.mrn).toMatch(/^SIM-\d{6}$/)
    expect(generatePatient(12, 'postoperative').name).not.toBe('')
  })

  it('differ between seeds', () => {
    const names = new Set(Array.from({ length: 12 }, (_, i) => generatePatient(i, 'medical').name))
    expect(names.size).toBeGreaterThan(6)
  })

  it('are coherent with their story and allergies', () => {
    for (let seed = 0; seed < 60; seed++) {
      const p = generatePatient(seed, 'postoperative')
      expect(p.age).toBeGreaterThanOrEqual(52)
      expect(p.age).toBeLessThanOrEqual(82)
      expect(p.admission).toMatch(/after/)
      expect(p.history.length).toBeGreaterThan(0)
      if (p.allergies[0]!.startsWith('Penicillin'))
        expect(p.medications.map((m) => m.drug)).not.toContain('Piperacillin-tazobactam')
      for (const m of p.medications) expect(doseProblem(m), m.drug).toBeUndefined()
    }
  })

  it('uses a deterministic generator', () => {
    const a = rng(5)
    const b = rng(5)
    expect([a(), a(), a()]).toEqual([b(), b(), b()])
  })
})

describe('trajectories', () => {
  it.each(TRAJECTORY_KINDS)('%s is deterministic and stays in human ranges', (kind) => {
    const a = generateTrajectory(params({ kind }))
    expect(generateTrajectory(params({ kind }))).toEqual(a)
    expect(a.steps).toHaveLength(17)
    for (const s of a.steps)
      for (const k of VITAL_KEYS) {
        const [lo, hi] = VITAL_LIMITS[k]
        expect(s.vitals[k]).toBeGreaterThanOrEqual(lo)
        expect(s.vitals[k]).toBeLessThanOrEqual(hi)
      }
    for (const s of a.steps) expect(s.vitals.diastolic_bp).toBeLessThan(s.vitals.systolic_bp)
    expect(a.source).toMatch(/not a real patient/i)
  })

  it('differs between seeds but follows the same story', () => {
    const a = generateTrajectory(params({ seed: 1 }))
    const b = generateTrajectory(params({ seed: 2 }))
    expect(a.steps[8]!.vitals).not.toEqual(b.steps[8]!.vitals)
    expect(Math.abs(a.steps[16]!.severity - b.steps[16]!.severity)).toBe(0)
  })

  it('follows the sepsis story: heart rate, temperature and lactate up, pressure down', () => {
    const t = generateTrajectory(params())
    const first = t.steps[0]!.vitals
    const last = t.steps.at(-1)!.vitals
    expect(last.heart_rate).toBeGreaterThan(first.heart_rate + 25)
    expect(last.systolic_bp).toBeLessThan(first.systolic_bp - 25)
    expect(last.temperature).toBeGreaterThan(first.temperature + 1)
    expect(t.labs.at(-1)!.labs.lactate!).toBeGreaterThan(t.labs[0]!.labs.lactate! * 3)
  })

  it('follows the hemorrhage story: hemoglobin falls as heart rate rises', () => {
    const t = generateTrajectory(params({ kind: 'hemorrhage', durationMin: 120 }))
    expect(t.labs.at(-1)!.labs.hemoglobin!).toBeLessThan(t.labs[0]!.labs.hemoglobin! - 3)
    expect(t.steps.at(-1)!.vitals.heart_rate).toBeGreaterThan(t.steps[0]!.vitals.heart_rate + 30)
  })

  it('has branch points inside the course for every kind', () => {
    for (const kind of TRAJECTORY_KINDS) {
      const def = DEFINITIONS[kind]
      expect(def.branchPoints.length).toBeGreaterThanOrEqual(2)
      for (const b of def.branchPoints) {
        expect(b.atMin).toBeGreaterThan(0)
        for (const a of ['reassess', 'escalate', 'treat', 'delay'] as const)
          expect(b.effects[a].length).toBeGreaterThan(10)
      }
    }
  })

  const severityAt = (p: Partial<TrajectoryParams>, minute: number) =>
    stepAt(generateTrajectory(params(p)), minute).severity

  it('reassessing changes nothing', () => {
    expect(severityAt({ actions: [{ atMin: 60, action: 'reassess' }] }, 240)).toBe(
      severityAt({}, 240),
    )
  })

  it('delaying worsens the course', () => {
    expect(severityAt({ actions: [{ atMin: 60, action: 'delay' }] }, 180)).toBeGreaterThan(
      severityAt({}, 180),
    )
  })

  it('treating without escalating only slows the course', () => {
    const treated = severityAt({ actions: [{ atMin: 60, action: 'treat' }] }, 240)
    expect(treated).toBeLessThan(severityAt({}, 240))
    expect(treated).toBeGreaterThan(0.3)
  })

  it('escalating then treating reverses the course', () => {
    const t = generateTrajectory(
      params({
        actions: [
          { atMin: 120, action: 'escalate' },
          { atMin: 120, action: 'treat' },
        ],
      }),
    )
    const peak = Math.max(...t.steps.map((s) => s.severity))
    expect(t.steps.at(-1)!.severity).toBeLessThan(peak - 0.3)
    expect(t.log).toHaveLength(2)
    expect(t.log[1]).toMatch(/reverse/)
  })

  it('changes the early warning score along with the course', () => {
    const worse = generateTrajectory(params({ actions: [{ atMin: 60, action: 'delay' }] }))
    const better = generateTrajectory(
      params({
        actions: [
          { atMin: 60, action: 'escalate' },
          { atMin: 60, action: 'treat' },
        ],
      }),
    )
    const score = (t: typeof worse) => computeEws(NEUTRAL_EWS, ewsReadingAt(t, 180)).total
    expect(score(worse)).toBeGreaterThan(score(better))
    expect(
      computeEws(NEUTRAL_EWS, ewsReadingAt(generateTrajectory(params()), 0)).total,
    ).toBeLessThanOrEqual(1)
  })

  it('feeds the monitor figure and the case data generator', () => {
    const t = generateTrajectory(params())
    const data = toMonitorData(t, 0, 120, 'Test Patient')
    expect(data.parameters).toHaveLength(5)
    expect(data.parameters[0]!.points).toHaveLength(9)
    const [vitals, labs] = clinicalTrajectoryDatasets({
      kind: 'sepsis',
      seed: 7,
      start: '2026-11-04T07:00:00.000Z',
      durationMin: 240,
      stepMin: 15,
      actions: [],
    })
    expect(vitals!.kind).toBe('series')
    expect((vitals!.data as unknown[]).length).toBe(17)
    expect((labs!.data as unknown[]).length).toBe(5)
    expect(vitals!.label).toMatch(/simulated/)
  })
})

describe('unit model', () => {
  const base = UnitParams.parse({
    beds: 30,
    startCensus: 22,
    arrivalsPerHour: 2,
    nursesByHour: [5, 5, 5, 5],
    seed: 3,
  })

  it('is deterministic and keeps census within beds', () => {
    const a = simulateUnit(base, 12)
    expect(simulateUnit(base, 12)).toEqual(a)
    for (const r of a) {
      expect(r.census).toBeLessThanOrEqual(30)
      expect(r.census).toBeGreaterThanOrEqual(0)
      expect(r.backlog).toBeGreaterThanOrEqual(0)
    }
  })

  it('puts every arrival in a bed or in the backlog', () => {
    const surge = { ...base, arrivalsPerHour: 10 }
    let census = base.startCensus
    let backlog = 0
    for (const r of simulateUnit(surge, 8)) {
      const waiting = backlog + r.arrivals
      expect(r.census + r.backlog).toBe(census - r.discharges + waiting)
      census = r.census
      backlog = r.backlog
    }
  })

  it('builds a backlog when arrivals exceed free beds and clears it as beds free up', () => {
    const rows = simulateUnit({ ...base, arrivalsPerHour: 12, dischargeShare: 0.05 }, 6)
    expect(rows.at(-1)!.backlog).toBeGreaterThan(0)
    expect(rows.at(-1)!.census).toBe(30)
  })

  it('flags ratios above the target and follows acuity in the nurses needed', () => {
    const rows = simulateUnit({ ...base, nursesByHour: [3] }, 4)
    expect(rows.every((r) => r.ratioExceeded)).toBe(true)
    const sick = simulateUnit({ ...base, meanAcuity: 3.5 }, 2)
    const well = simulateUnit({ ...base, meanAcuity: 1.5 }, 2)
    expect(sick[0]!.nursesNeeded).toBeGreaterThan(well[0]!.nursesNeeded)
  })

  it('uses up supplies with the census', () => {
    const rows = simulateUnit({ ...base, supplies: 100, suppliesPerPatientHour: 2 }, 5)
    expect(rows.at(-1)!.suppliesLeft).toBe(0)
    expect(rows[0]!.suppliesLeft).toBeLessThan(100)
  })

  it('lets the facilitator change parameters and sees the effect', () => {
    const called = applyChange(base, { kind: 'nurses', fromHour: 2, count: 3 })
    expect(called.nursesByHour).toEqual([5, 5, 3, 3])
    const rows = simulateUnit(called, 4)
    expect(rows[0]!.nursesOnDuty).toBe(5)
    expect(rows[3]!.nursesOnDuty).toBe(3)
    expect(applyChange(base, { kind: 'arrivals', perHour: 9 }).arrivalsPerHour).toBe(9)
    expect(applyChange(base, { kind: 'beds', count: 20 }).beds).toBe(20)
    expect(applyChange(base, { kind: 'supplies', add: 50 }).supplies).toBe(450)
  })

  it('feeds the staffing and bed board figures', () => {
    const rows = simulateUnit(base, 4)
    const staffing = toStaffingData('4 West', rows)
    expect(staffing.hours).toHaveLength(4)
    const census = toCensusData('4 West', base, rows[3]!, 2)
    expect(census.beds).toHaveLength(30)
    expect(census.beds.filter((b) => b.state === 'isolation')).toHaveLength(2)
    expect(census.beds.filter((b) => b.state !== 'empty')).toHaveLength(rows[3]!.census)
  })
})
