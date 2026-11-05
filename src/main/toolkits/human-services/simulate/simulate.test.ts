// The human services simulations (spec 0464 FR-9): deterministic, conserving, labeled simulated,
// and behaving the way the knowledge says (wait grows with offered load; rerouting timers move
// contacts; Spanish-language contacts are never rerouted; parents arrive faster than staff verify).
import { describe, expect, it } from 'vitest'
import { GroundTruthEvent, ModeledSeries } from '@shared/schemas/metrics'
import { generatorIds, listGenerators } from '../../../case-data/generators'
import '../register-generators'
import { HS_GENERATORS, HS_DATASETS } from './generators'
import { channelIntervals, runSurge, surgeFactor, surgeTotals, SurgeParams } from './contact-surge'
import { countsAt, runDisplaced, statusAt } from './displaced'
import { flowPoints, runReunification } from './reunification'
import { needCounts, runShelters } from './shelter'

const maxWait = (run: ReturnType<typeof runSurge>, ch: 'calls' | 'texts' | 'chats'): number =>
  Math.max(...channelIntervals(run, ch).map((i) => i.longestWaitSec))

describe('contact surge', () => {
  it('gives the same run for the same seed and a different one for another', () => {
    expect(runSurge({ seed: 4 })).toEqual(runSurge({ seed: 4 }))
    expect(runSurge({ seed: 4 })).not.toEqual(runSurge({ seed: 5 }))
  })

  it('conserves contacts: offered equals answered, abandoned, rerouted and still waiting', () => {
    const run = runSurge({ seed: 2, multiplier: 3 })
    for (const ch of ['calls', 'texts', 'chats'] as const) {
      const t = surgeTotals(run, ch)
      expect(t.offered, ch).toBe(t.answered + t.abandoned + t.rerouted + t.queueEnd)
    }
  })

  it('lets wait grow with offered load', () => {
    const calm = runSurge({ seed: 3, multiplier: 1 })
    const surge = runSurge({ seed: 3, multiplier: 4 })
    expect(maxWait(surge, 'texts')).toBeGreaterThan(maxWait(calm, 'texts'))
    expect(surgeTotals(surge, 'texts').offered).toBeGreaterThan(surgeTotals(calm, 'texts').offered)
  })

  it('surges texts harder than calls and lets the surge decay', () => {
    const p = SurgeParams.parse({ multiplier: 3, surgeStartHour: 2, decayHours: 4 })
    expect(surgeFactor(p, 'texts', 2)).toBeGreaterThan(surgeFactor(p, 'calls', 2))
    expect(surgeFactor(p, 'calls', 1)).toBe(1)
    expect(surgeFactor(p, 'calls', 20)).toBeLessThan(surgeFactor(p, 'calls', 3))
  })

  it('reroutes contacts only when rerouting is on, and never more than the non-Spanish share', () => {
    const off = runSurge({ seed: 6, multiplier: 5, rerouting: { enabled: false } })
    expect(surgeTotals(off, 'texts').rerouted).toBe(0)
    const on = runSurge({ seed: 6, multiplier: 5 })
    expect(surgeTotals(on, 'texts').rerouted).toBeGreaterThan(0)
    const allSpanish = runSurge({ seed: 6, multiplier: 5, rerouting: { spanishShare: 1 } })
    for (const ch of ['calls', 'texts', 'chats'] as const)
      expect(surgeTotals(allSpanish, ch).rerouted).toBe(0)
  })

  it('moves calls to backup sooner than texts, by the timers', () => {
    const run = runSurge({ seed: 8, multiplier: 5 })
    const firstReroute = (ch: 'calls' | 'texts'): number =>
      channelIntervals(run, ch).find((i) => i.rerouted > 0)?.startMin ?? Infinity
    expect(firstReroute('calls')).toBeLessThanOrEqual(firstReroute('texts'))
    expect(run.params.rerouting.callSec).toBe(120)
    expect(run.params.rerouting.textChatSec).toBe(300)
  })

  it('takes counselors off the floor during the shortfall', () => {
    const run = runSurge({ seed: 1, shortfall: { counselors: 4, startHour: 5, durationHours: 2 } })
    const at = (min: number) => channelIntervals(run, 'texts').find((i) => i.startMin === min)!
    expect(at(5 * 60).staffOn).toBeLessThan(at(0).staffOn)
    expect(channelIntervals(run, 'chats')[0]!.staffOn).toBe(run.params.counselors.chats)
  })
})

describe('shelters', () => {
  it('is deterministic and fills the first shelter before the second', () => {
    expect(runShelters({ seed: 3 })).toEqual(runShelters({ seed: 3 }))
    const run = runShelters({ seed: 3, evacuees: 600 })
    const [a, b] = run.params.sites
    const pop = run.population
    expect(Math.max(...pop[a!.name]!)).toBeLessThanOrEqual(a!.capacity)
    expect(Math.max(...pop[b!.name]!)).toBeGreaterThan(0)
  })

  it('reports when demand exceeds the open capacity and turns people away when all are full', () => {
    const run = runShelters({ seed: 1, evacuees: 2000 })
    expect(run.demandExceedsCapacityHour).toBeDefined()
    expect(run.turnedAway).toBeGreaterThan(0)
    const small = runShelters({ seed: 1, evacuees: 100 })
    expect(small.demandExceedsCapacityHour).toBeUndefined()
  })

  it('draws needs from the configured rates and writes none when the rates are zero', () => {
    const zero = runShelters({
      seed: 2,
      needsRates: {
        electricity_for_medical_equipment: 0,
        communication_access: 0,
        personal_assistance: 0,
        medication_support: 0,
        supervision: 0,
      },
    })
    expect(zero.needs).toEqual([])
    const run = runShelters({ seed: 2, evacuees: 400 })
    const counts = needCounts(run)
    expect(counts.medication_support).toBeGreaterThan(counts.supervision)
    expect(new Set(run.needs.map((n) => n.id)).size).toBe(run.needs.length)
  })
})

describe('reunification', () => {
  it('is deterministic and builds a queue when guardians arrive faster than staff verify', () => {
    expect(runReunification({ seed: 5 })).toEqual(runReunification({ seed: 5 }))
    const slow = runReunification({
      seed: 5,
      checkInLeads: 1,
      verifyMedianMin: 4,
      medianArrivalMin: 15,
    })
    const fast = runReunification({
      seed: 5,
      checkInLeads: 20,
      verifyMedianMin: 1,
      medianArrivalMin: 15,
    })
    const lag = (r: ReturnType<typeof runReunification>): number =>
      Math.max(
        ...r.students
          .filter((s) => s.verifiedMin !== undefined)
          .map((s) => s.verifiedMin! - s.arrivalMin!),
      )
    expect(lag(slow)).toBeGreaterThan(lag(fast))
  })

  it('keeps flow counts ordered: released at most verified at most arrived at most the roster', () => {
    const run = runReunification({ seed: 7, students: 80 })
    for (const f of flowPoints(run)) {
      expect(f.released).toBeLessThanOrEqual(f.verified)
      expect(f.verified).toBeLessThanOrEqual(f.arrived)
      expect(f.arrived).toBeLessThanOrEqual(80)
    }
    const end = flowPoints(run).at(-1)!
    const unaccompanied = run.students.filter((s) => s.unaccompanied).length
    expect(end.arrived).toBe(80 - unaccompanied)
    expect(end.released + end.exceptions).toBe(end.arrived)
  })

  it('makes every student an exception, unaccompanied or released', () => {
    const run = runReunification({ seed: 9, unverifiableShare: 1, unaccompaniedShare: 0 })
    expect(run.students.every((s) => s.exception)).toBe(true)
    expect(flowPoints(run).at(-1)!.released).toBe(0)
  })
})

describe('displaced children', () => {
  it('is deterministic and every status count adds up to the children', () => {
    const run = runDisplaced({ seed: 4, children: 86 })
    expect(run).toEqual(runDisplaced({ seed: 4, children: 86 }))
    for (const hour of [0, 24, 72]) {
      const by = countsAt(run, hour)
      const total = Object.values(by).reduce(
        (a, c) => a + c.located + c.contacted + c.placed + c.unknown,
        0,
      )
      expect(total).toBe(86)
    }
  })

  it('locates more children as hours pass and leaves the never-located unknown', () => {
    const run = runDisplaced({ seed: 4, children: 200, neverLocatedShare: 0.1 })
    const unknownAt = (h: number): number =>
      run.children.filter((c) => statusAt(c, h) === 'unknown').length
    expect(unknownAt(0)).toBe(200)
    expect(unknownAt(48)).toBeLessThan(unknownAt(12))
    expect(unknownAt(240)).toBe(run.children.filter((c) => c.locatedHour === undefined).length)
  })
})

describe('generators', () => {
  it('registers the four generators once', () => {
    for (const g of HS_GENERATORS) expect(generatorIds()).toContain(g.id)
    expect(listGenerators().filter((g) => g.id.startsWith('hs-')).length).toBe(4)
  })

  it('writes valid ground truth and modeled series, labeled simulated, under the dataset ids', () => {
    const all = HS_GENERATORS.flatMap((g) => g.generate(g.params.parse({}) as never))
    const ids = all.map((d) => d.id).sort()
    expect(ids).toEqual(Object.values(HS_DATASETS).sort())
    for (const d of all) {
      expect(d.label, d.id).toMatch(/simulated/i)
      if (d.shape === 'ground-truth')
        for (const e of d.data as unknown[]) expect(() => GroundTruthEvent.parse(e)).not.toThrow()
      if (d.shape === 'modeled-series')
        for (const s of d.data as unknown[]) expect(() => ModeledSeries.parse(s)).not.toThrow()
    }
  })

  it('gives unique ground truth event ids inside each dataset', () => {
    for (const g of HS_GENERATORS)
      for (const d of g.generate(g.params.parse({}) as never))
        if (d.shape === 'ground-truth') {
          const ids = (d.data as { id: string }[]).map((e) => e.id)
          expect(new Set(ids).size, d.id).toBe(ids.length)
        }
  })

  it('is deterministic', () => {
    for (const g of HS_GENERATORS) {
      const p = g.params.parse({ seed: 11 }) as never
      expect(g.generate(p)).toEqual(g.generate(p))
    }
  })
})
