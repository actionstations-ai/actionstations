// The epidemiology simulations (#838): closed-form and independent checks for the solver,
// conservation, determinism per seed, and the findability of the true vehicle.
import { describe, expect, it } from 'vitest'
import { SeriesFile, TextFile } from '@shared/schemas/case-data'
import { DAY_MS, finalSize } from '@shared/epidemiology/arithmetic'
import { runCompartment } from './compartment'
import { generateCommonSource } from './common-source'
import { generateContactNetwork } from './contacts'
import { EPI_GENERATORS } from './generators'
import { makeRng } from './rng'
import { generateWastewater, runDispensing } from './wastewater-dispensing'

describe('seeded random numbers', () => {
  it('repeats for a seed and differs between seeds', () => {
    const a = makeRng(7)
    const b = makeRng(7)
    expect([a.next(), a.next(), a.int(100)]).toEqual([b.next(), b.next(), b.int(100)])
    expect(makeRng(8).next()).not.toBe(makeRng(7).next())
  })

  it('draws a binomial and a poisson near their means', () => {
    const rng = makeRng(3)
    const bin = Array.from({ length: 2000 }, () => rng.binomial(50, 0.3))
    const poi = Array.from({ length: 2000 }, () => rng.poisson(4))
    const mean = (x: number[]) => x.reduce((s, v) => s + v, 0) / x.length
    expect(mean(bin)).toBeGreaterThan(14.5)
    expect(mean(bin)).toBeLessThan(15.5)
    expect(mean(poi)).toBeGreaterThan(3.85)
    expect(mean(poi)).toBeLessThan(4.15)
  })
})

describe('compartment model', () => {
  const sir = {
    model: 'sir' as const,
    population: 1_000_000,
    r0: 2,
    infectiousDays: 5,
    initialInfected: 10,
    days: 200,
  }

  it('matches the final size relation for a no-intervention SIR run', () => {
    const run = runCompartment(sir)
    expect(run.finalAttackFraction).toBeCloseTo(finalSize(2), 2)
  })

  it('matches an independent fine-step Euler integration day by day', () => {
    const N = 1_000_000
    const gamma = 1 / 5
    const beta = 2 * gamma
    let S = N - 10
    let I = 10
    const dt = 0.0005
    const ref: number[] = []
    for (let day = 1; day <= 60; day++) {
      for (let k = 0; k < 1 / dt; k++) {
        const inf = (beta * S * I) / N
        S -= inf * dt
        I += (inf - gamma * I) * dt
      }
      ref.push(I)
    }
    const run = runCompartment({ ...sir, days: 60 })
    for (const day of [10, 20, 30, 40, 50, 60]) {
      const got = run.days[day - 1]!.prevalence
      expect(Math.abs(got - ref[day - 1]!) / ref[day - 1]!).toBeLessThan(0.01)
    }
  })

  it('conserves the population in every compartment sum', () => {
    for (const model of ['sir', 'seir'] as const) {
      const run = runCompartment({
        model,
        population: 5000,
        r0: 3,
        days: 80,
        interventionStartDay: 20,
        interventionEffect: 0.4,
      })
      for (const d of run.days)
        expect(
          Math.abs(d.susceptible + d.exposed + d.infectious + d.recovered - 5000),
        ).toBeLessThan(1e-6)
    }
  })

  it('is a pure function of its parameters', () => {
    expect(runCompartment({ days: 40 })).toEqual(runCompartment({ days: 40 }))
  })

  it('peaks later and lower with an earlier, stronger intervention', () => {
    const base = runCompartment({ population: 20_000, r0: 2.5, days: 150 })
    const act = runCompartment({
      population: 20_000,
      r0: 2.5,
      days: 150,
      interventionStartDay: 15,
      interventionEffect: 0.6,
    })
    expect(act.finalAttackFraction).toBeLessThan(base.finalAttackFraction)
    const peak = (r: typeof base) => Math.max(...r.days.map((d) => d.newOnsets))
    expect(peak(act)).toBeLessThan(peak(base))
  })

  it('stops an outbreak once immunity passes 1 - 1/R0', () => {
    const run = runCompartment({
      population: 100_000,
      r0: 2,
      vaccinationCoverage: 0.55,
      days: 200,
      initialInfected: 20,
    })
    expect(run.finalAttackFraction).toBeLessThan(0.01)
  })

  it('delays onsets behind infections in SEIR by about the latent period', () => {
    const run = runCompartment({ model: 'seir', population: 100_000, latentDays: 4, days: 120 })
    const peakInfections = run.days.reduce((b, d) =>
      d.newInfections > b.newInfections ? d : b,
    ).day
    expect(run.peakDay).toBeGreaterThan(peakInfections)
    expect(run.peakDay - peakInfections).toBeLessThanOrEqual(6)
  })

  it('runs the stochastic variant with integer counts, conserved and repeatable per seed', () => {
    const p = {
      model: 'seir' as const,
      population: 500,
      r0: 2.5,
      days: 80,
      stochasticSeed: 11,
      initialInfected: 3,
    }
    const a = runCompartment(p)
    expect(a).toEqual(runCompartment(p))
    for (const d of a.days) {
      expect(Number.isInteger(d.susceptible + d.exposed + d.infectious + d.recovered)).toBe(true)
      expect(d.susceptible + d.exposed + d.infectious + d.recovered).toBe(500)
    }
    expect(runCompartment({ ...p, stochasticSeed: 12 }).days).not.toEqual(a.days)
  })

  it('averages the stochastic runs near the deterministic final size', () => {
    const det = runCompartment({
      model: 'seir',
      population: 2000,
      r0: 2,
      days: 160,
      initialInfected: 10,
    })
    let sum = 0
    let n = 0
    for (let seed = 1; seed <= 20; seed++) {
      const r = runCompartment({
        model: 'seir',
        population: 2000,
        r0: 2,
        days: 160,
        initialInfected: 10,
        stochasticSeed: seed,
      })
      sum += r.finalAttackFraction
      n++
    }
    expect(Math.abs(sum / n - det.finalAttackFraction)).toBeLessThan(0.05)
  })
})

describe('common-source outbreak', () => {
  it('makes the true vehicle the food with the highest odds ratio across seeds', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const o = generateCommonSource({ seed })
      const best = [...o.associations].sort((a, b) => (b.oddsRatio ?? 0) - (a.oddsRatio ?? 0))[0]!
      expect(best.food, `seed ${seed}`).toBe('chicken salad')
    }
  })

  it('keeps a plausible distractor: a companion dish has an elevated odds ratio too', () => {
    const o = generateCommonSource({ seed: 4 })
    const cake = o.associations.find((a) => a.food === 'wedding cake')!
    const roll = o.associations.find((a) => a.food === 'dinner rolls')!
    expect(cake.oddsRatio!).toBeGreaterThan(roll.oddsRatio!)
  })

  it('gives each case an onset inside the pathogen window and a later report', () => {
    const o = generateCommonSource({ seed: 2, pathogenId: 'norovirus' })
    const start = Date.parse('2026-10-17T18:00:00Z')
    expect(o.cases.length).toBeGreaterThan(20)
    for (const c of o.cases) {
      expect(c.onsetMs! - start).toBeGreaterThanOrEqual(12 * 3_600_000)
      expect(c.onsetMs! - start).toBeLessThanOrEqual(48 * 3_600_000 + 5 * 3_600_000)
      expect(c.reportedMs!).toBeGreaterThan(c.onsetMs!)
    }
    expect(o.cases.map((c) => c.onsetMs)).toEqual(
      [...o.cases.map((c) => c.onsetMs)].sort((a, b) => a! - b!),
    )
  })

  it('mixes status tiers and is repeatable', () => {
    const a = generateCommonSource({ seed: 5 })
    expect(new Set(a.cases.map((c) => c.status)).size).toBeGreaterThanOrEqual(2)
    expect(generateCommonSource({ seed: 5 })).toEqual(a)
    expect(generateCommonSource({ seed: 6 }).cases.length).not.toBe(0)
  })

  it('refuses a vehicle that is not a food and an unknown pathogen', () => {
    expect(() => generateCommonSource({ vehicle: 'tacos' })).toThrow()
    expect(() => generateCommonSource({ pathogenId: 'unknown' })).toThrow()
  })
})

describe('contact network', () => {
  it('classifies close contacts by overlap with the infectious period', () => {
    const net = generateContactNetwork({ seed: 3 })
    const early = net.contacts.filter((c) => c.setting.startsWith('Riverbend Urgent Care'))
    // The clinic visit on Oct 16 is inside the measles infectious period (rash Oct 19, 4 days before).
    expect(early.some((c) => c.close)).toBe(true)
    const none = generateContactNetwork({
      seed: 3,
      settings: [
        {
          kind: 'workplace',
          name: 'Office',
          people: 10,
          from: '2026-10-01T09:00:00Z',
          to: '2026-10-01T17:00:00Z',
        },
      ],
    })
    expect(none.close).toBe(0)
    for (const c of none.contacts) expect(c.overlapMinutes).toBe(0)
  })

  it('leaves some close contacts unreachable and reports the counts consistently', () => {
    const net = generateContactNetwork({ seed: 9, unreachableFraction: 0.3 })
    expect(net.unreachable).toBeGreaterThan(0)
    expect(net.reachable + net.unreachable).toBe(net.close)
    expect(generateContactNetwork({ seed: 9, unreachableFraction: 0 }).unreachable).toBe(0)
  })

  it('sets the monitoring span from exposure plus the incubation period', () => {
    const net = generateContactNetwork({ seed: 1 })
    const c = net.contacts[0]!
    expect((c.monitorFromMs - c.exposureEndMs) / DAY_MS).toBe(7)
    expect((c.monitorToMs - c.exposureEndMs) / DAY_MS).toBe(21)
    expect(net.followUpChecks).toBeGreaterThan(0)
  })

  it('is repeatable and seed dependent', () => {
    expect(generateContactNetwork({ seed: 2 })).toEqual(generateContactNetwork({ seed: 2 }))
    expect(generateContactNetwork({ seed: 2 }).contacts[0]!.name).not.toBe(
      generateContactNetwork({ seed: 3 }).contacts[0]!.name,
    )
  })
})

describe('wastewater series', () => {
  const incidence = runCompartment({ population: 50_000, r0: 2.2, days: 120 }).days.map(
    (d) => d.newOnsets,
  )
  const peakOf = (xs: number[]) => xs.indexOf(Math.max(...xs))

  it('peaks after the case curve by about the shedding lag', () => {
    const series = generateWastewater({
      incidence,
      lagDays: 4,
      noiseSigma: 0,
      baseline: 5,
      scale: 0.2,
    })
    const lag = peakOf(series.map((s) => s.concentration)) - peakOf(incidence)
    expect(lag).toBeGreaterThanOrEqual(2)
    expect(lag).toBeLessThanOrEqual(6)
  })

  it('has no lag when lagDays is zero and noise is off', () => {
    const series = generateWastewater({ incidence, lagDays: 0, noiseSigma: 0 })
    expect(peakOf(series.map((s) => s.concentration))).toBe(peakOf(incidence))
  })

  it('names levels from the designer scale and rises through them with the curve', () => {
    const series = generateWastewater({
      incidence,
      lagDays: 3,
      noiseSigma: 0,
      baseline: 10,
      scale: 0.05,
    })
    expect(series[0]!.level).toBe('very low')
    const names = new Set(series.map((s) => s.level))
    expect(names.size).toBeGreaterThan(2)
  })

  it('is repeatable per seed', () => {
    expect(generateWastewater({ incidence, seed: 4 })).toEqual(
      generateWastewater({ incidence, seed: 4 }),
    )
  })
})

describe('dispensing site', () => {
  it('conserves people: arrivals equal served plus the queue left', () => {
    const run = runDispensing({ seed: 2, hoursOpen: 6 })
    const left = run.intervals[run.intervals.length - 1]!.queueEnd
    expect(run.totalArrivals).toBe(run.totalServed + left)
  })

  it('never serves faster than the station capacity allows', () => {
    const run = runDispensing({
      seed: 3,
      stations: 4,
      serviceMinutes: 6,
      arrivalsPerHour: 600,
      pattern: 'constant',
      hoursOpen: 4,
    })
    expect(run.throughputPerHour).toBeLessThanOrEqual(run.capacityPerHour * 1.15)
    expect(run.peakQueue).toBeGreaterThan(50)
  })

  it('keeps the queue short when stations have room', () => {
    const run = runDispensing({
      seed: 3,
      stations: 30,
      serviceMinutes: 4,
      arrivalsPerHour: 120,
      pattern: 'constant',
    })
    expect(run.peakQueue).toBeLessThan(10)
  })

  it('is repeatable per seed', () => {
    expect(runDispensing({ seed: 5 })).toEqual(runDispensing({ seed: 5 }))
  })
})

describe('case-data generators', () => {
  it('produce data that fits the case file schemas', () => {
    expect(EPI_GENERATORS.map((g) => g.id)).toEqual([
      'epi-compartment',
      'epi-common-source',
      'epi-contacts',
      'epi-wastewater',
      'epi-dispensing',
    ])
    for (const g of EPI_GENERATORS) {
      const raw = g.id === 'epi-wastewater' ? { incidence: [0, 1, 4, 9, 4, 1, 0] } : {}
      const params = g.params.parse(raw)
      for (const d of (
        g as unknown as { generate(p: unknown): { kind: string; data: unknown }[] }
      ).generate(params)) {
        const schema = d.kind === 'series' ? SeriesFile : TextFile
        expect(schema.safeParse(d.data).success, `${g.id} ${d.kind}`).toBe(true)
      }
    }
  })

  it('marks every line list entry as exercise material', () => {
    const g = EPI_GENERATORS.find((x) => x.id === 'epi-common-source')!
    const out = (
      g as unknown as { generate(p: unknown): { id: string; data: { text: string }[] }[] }
    ).generate(g.params.parse({}))
    const list = out.find((d) => d.id === 'epi-line-list')!
    expect(list.data.length).toBeGreaterThan(0)
    for (const e of list.data) expect(e.text).toContain('EXERCISE ONLY')
  })
})
