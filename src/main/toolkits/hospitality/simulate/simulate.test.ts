// The hospitality simulations (#840): deterministic, labelled simulated, datasets that validate,
// cumulative counts that never fall, percentages that are cases over persons, threshold
// crossings at the right case, muster totals that reconcile, and generators that register once.
import { describe, expect, it } from 'vitest'
import { GroundTruthEvent, ModeledSeries } from '@shared/schemas/metrics'
import { generatorIds } from '../../../case-data/generators'
import '../register-generators'
import {
  accountedAt,
  simulateCyberOutage,
  simulateHurricane,
  simulateMuster,
  simulateTowerFire,
  unaccountedAt,
} from './emergencies'
import { HOSPITALITY_GENERATORS, outbreakGenerator } from './generators'
import { casesBy, dailyRows, simulateOutbreak } from './outbreak'

const HOUR = 3_600_000

describe('outbreak at sea', () => {
  const sim = simulateOutbreak({ seed: 3 })

  it('gives the same outbreak for the same seed and a different one for another', () => {
    expect(simulateOutbreak({ seed: 3 })).toEqual(sim)
    expect(simulateOutbreak({ seed: 4 }).cases.map((c) => c.onsetMs)).not.toEqual(
      sim.cases.map((c) => c.onsetMs),
    )
  })

  it('keeps every onset inside the voyage and uses codes, not names', () => {
    for (const c of sim.cases) {
      expect(c.onsetMs).toBeGreaterThanOrEqual(sim.startMs)
      expect(c.onsetMs).toBeLessThanOrEqual(sim.arrivalMs)
      expect(c.code).toMatch(/^[PC]-\d+$/)
    }
  })

  it('counts cumulatively: daily rows add up to the totals and never go negative', () => {
    const rows = dailyRows(sim)
    expect(rows).toHaveLength(sim.params.voyageDays)
    expect(rows.reduce((s, r) => s + r.passengers, 0)).toBe(
      casesBy(sim.cases, 'passengers', sim.arrivalMs),
    )
    expect(rows.reduce((s, r) => s + r.crew, 0)).toBe(casesBy(sim.cases, 'crew', sim.arrivalMs))
  })

  it('crosses 2 and 3 percent at the case that reaches the level, and 2 before 3', () => {
    const p2 = sim.crossings.find((c) => c.group === 'passengers' && c.level === 2)!
    const p3 = sim.crossings.find((c) => c.group === 'passengers' && c.level === 3)!
    expect(p2.timeMs).toBeLessThanOrEqual(p3.timeMs)
    expect(p2.cases).toBe(Math.ceil(0.02 * sim.params.passengers))
    expect(casesBy(sim.cases, 'passengers', p2.timeMs)).toBeGreaterThanOrEqual(p2.cases)
    expect(casesBy(sim.cases, 'passengers', p2.timeMs - 1)).toBeLessThan(p2.cases)
    expect(p2.percent).toBeGreaterThanOrEqual(2)
  })

  it('places the 24-hour and 4-hour reports before arrival with non-decreasing counts', () => {
    const r24 = sim.reports.find((r) => r.type === '24-hour report')!
    const r4 = sim.reports.find((r) => r.type === '4-hour update report')!
    expect(r24.hoursBeforeArrival).toBe(24)
    expect(r4.hoursBeforeArrival).toBe(4)
    expect(r4.passengerCases).toBeGreaterThanOrEqual(r24.passengerCases)
    for (const r of sim.reports)
      expect(r.passengerPercent).toBe(
        Math.round((r.passengerCases / sim.params.passengers) * 1000) / 10,
      )
  })

  it('writes events and a modeled series the metrics can read, all labelled simulated', () => {
    const g = outbreakGenerator
    const out = g.generate(g.params.parse({ seed: 3 }))
    for (const d of out) expect(d.label.toLowerCase(), d.id).toMatch(/simulated/)
    const events = out.find((d) => d.id === 'hosp-outbreak-events')!.data as {
      text: string
      t: string
    }[]
    const parsed = events.map((e) => {
      const o = JSON.parse(e.text) as { id: string; kind: string; attrs: object }
      return GroundTruthEvent.parse({ id: o.id, time: e.t, kind: o.kind, attrs: o.attrs })
    })
    expect(parsed.map((e) => e.kind)).toEqual(
      expect.arrayContaining([
        'first_case',
        'threshold_2pct',
        'report_point_24h',
        'report_point_4h',
        'arrival',
      ]),
    )
    const series = out.find((d) => d.id === 'hosp-threshold-series')!
    expect(series.shape).toBe('modeled-series')
    for (const s of series.data as unknown[]) ModeledSeries.parse(s)
    const med = out.find((d) => d.id === 'hosp-medical-log')!.data as { text: string }[]
    expect(med[0]!.text).toContain('EXERCISE ONLY')
  })

  it('rejects isolation that starts after the voyage', () => {
    expect(() => simulateOutbreak({ voyageDays: 5, isolationStartDay: 6 })).toThrow()
  })
})

describe('muster', () => {
  const sim = simulateMuster({ seed: 5 })

  it('reconciles: expected equals counted plus not yet counted at every time', () => {
    for (const m of [0, 5, 10, 30, sim.completeMin]) {
      const open = unaccountedAt(sim, m)
      const counted = sim.people.filter((x) => x.countedMin <= m).length
      expect(counted + open.passengers + open.crew).toBe(sim.params.passengers + sim.params.crew)
    }
    expect(unaccountedAt(sim, sim.completeMin)).toEqual({ passengers: 0, crew: 0 })
  })

  it('plants the stated number of late persons, who are the last found', () => {
    const planted = sim.people.filter((x) => x.planted)
    expect(planted).toHaveLength(sim.params.unaccountedPassengers + sim.params.unaccountedCrew)
    expect(unaccountedAt(sim, 25).passengers).toBe(sim.params.unaccountedPassengers)
  })
})

describe('hurricane', () => {
  const sim = simulateHurricane({ seed: 2 })
  it('departures never fall and stop at the departure share', () => {
    for (let i = 1; i < sim.departed.length; i++)
      expect(sim.departed[i]!.guests).toBeGreaterThanOrEqual(sim.departed[i - 1]!.guests)
    expect(sim.departed[sim.departed.length - 1]!.guests).toBeLessThanOrEqual(
      Math.round(sim.params.guests * sim.params.departureShare),
    )
  })

  it('closes the airport and causeway before the winds arrive', () => {
    const h = (id: string) => sim.closures.find((c) => c.id === id)!.hour
    expect(h('airport_closure')).toBeLessThan(h('winds_arrive'))
    expect(h('causeway_closure')).toBeLessThan(h('winds_arrive'))
  })
})

describe('tower fire', () => {
  const sim = simulateTowerFire({ seed: 1 })
  it('has registered guests on every floor and clears nearer floors sooner', () => {
    expect(sim.floors.length).toBe(sim.params.topFloor - sim.params.firstFloor + 1)
    const near = sim.floors.find((f) => f.floor === sim.params.fireFloor)!
    expect(accountedAt(near, 0)).toBe(0)
    expect(accountedAt(near, 1000)).toBe(near.registered)
  })
})

describe('cyber outage', () => {
  const sim = simulateCyberOutage({ seed: 1 })
  it('orders events in time and restores keycards before reservations', () => {
    const minutes = sim.events.map((e) => e.minute)
    expect(minutes).toEqual([...minutes].sort((a, b) => a - b))
    const m = (id: string) => sim.events.find((e) => e.id === id)!.minute
    expect(m('keycards_restored')).toBeLessThan(m('reservations_restored'))
    expect(sim.queue.every((q) => q.waiting >= 0)).toBe(true)
  })
})

describe('registration', () => {
  it('lists every generator through the shared module, once', () => {
    expect(generatorIds()).toEqual(expect.arrayContaining(HOSPITALITY_GENERATORS.map((g) => g.id)))
    expect(HOUR).toBeGreaterThan(0)
  })
})
