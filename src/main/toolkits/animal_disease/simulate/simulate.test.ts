// Premises, spread and capacity simulations (spec 0460 FR-7, FR-8): seeded and deterministic,
// infection only within the kernel distance or along a movement link, worked queue examples,
// and generators whose every label says simulated.
import { describe, expect, it } from 'vitest'
import { generatePremises } from './premises'
import { runSpread, type SpreadRun } from './spread'
import { runDepopulation, runVaccination, workEnd } from './capacity'
import { ANIMAL_GENERATORS } from './generators'
import { haversineKm } from '../geo'

const premises = generatePremises({ seed: 3 })
const spread = (o: Record<string, unknown> = {}): SpreadRun =>
  runSpread(premises, { index: ['P-001'], ...o })

describe('premises', () => {
  it('are fictional, sequential and consistent with the inventory', () => {
    expect(premises).toHaveLength(14 + 6 + 25 + 20 + 40)
    expect(premises[0]!.id).toBe('P-001')
    expect(premises.filter((p) => p.species === 'turkeys')).toHaveLength(14)
    expect(new Set(premises.map((p) => p.id)).size).toBe(premises.length)
    expect(new Set(premises.map((p) => p.name)).size).toBe(premises.length)
  })

  it('stay inside the county radius and repeat for the same seed', () => {
    const center = { lat: 44.3, lon: -93.9 }
    for (const p of premises) expect(haversineKm(center, p)).toBeLessThanOrEqual(40.5)
    expect(generatePremises({ seed: 3 })).toEqual(premises)
    expect(generatePremises({ seed: 4 })).not.toEqual(premises)
  })
})

describe('spread', () => {
  it('is deterministic for a seed', () => {
    expect(spread({ seed: 5 })).toEqual(spread({ seed: 5 }))
  })

  it('infects only the index premises with no kernel and no movement links', () => {
    const run = spread({ baseDailyProb: 0, linksPerPremises: 0 })
    expect(run.infections.map((i) => i.premisesId)).toEqual(['P-001'])
  })

  it('infects only within the kernel distance or along a movement link', () => {
    const run = spread({ seed: 9, baseDailyProb: 0.3, kernelScaleKm: 5, maxKernelKm: 8, days: 60 })
    expect(run.infections.length).toBeGreaterThan(3)
    const byId = new Map(premises.map((p) => [p.id, p]))
    const linked = new Set(run.links.flatMap((l) => [`${l.a}|${l.b}`, `${l.b}|${l.a}`]))
    for (const i of run.infections.filter((x) => x.source)) {
      const d = haversineKm(byId.get(i.source!)!, byId.get(i.premisesId)!)
      if (i.via === 'kernel') expect(d).toBeLessThanOrEqual(8)
      else expect(linked.has(`${i.source}|${i.premisesId}`)).toBe(true)
    }
  })

  it('detects after the latent period and the delay, then removes the premises', () => {
    const run = spread({ latentDays: 2, detectionDelayDays: [3, 3], depopulationDelayDays: 1 })
    const first = run.infections[0]!
    expect(first.detectedDay).toBe(5)
    expect(first.removedDay).toBe(6)
  })

  it('sums the daily confirmed counts to the cumulative curve', () => {
    const run = spread({ seed: 2, baseDailyProb: 0.2, days: 50 })
    const total = run.daily.reduce((n, d) => n + d.newConfirmed, 0)
    expect(run.daily.at(-1)!.cumulativeConfirmed).toBe(total)
  })

  it('cuts movement spread when controls start', () => {
    const base = {
      seed: 4,
      baseDailyProb: 0,
      linksPerPremises: 6,
      movementDailyProb: 0.4,
      days: 40,
    }
    const open = spread({ ...base, controlsFromDay: 99 }).infections.length
    const controlled = spread({ ...base, controlsFromDay: 0, controlEffect: 0 }).infections.length
    expect(controlled).toBe(1)
    expect(open).toBeGreaterThan(controlled)
  })

  it('refuses an unknown index premises', () => {
    expect(() => runSpread(premises, { index: ['NOPE'] })).toThrow(/Unknown index/)
  })
})

describe('depopulation queue (worked examples)', () => {
  const methods = [{ id: 'foam', species: ['turkeys'], headPerCrewHour: 600 }]
  const sites = [
    { id: 'Site 1', capacityHeadPerDay: 60000, travelHours: 1 },
    { id: 'Site 2', capacityHeadPerDay: 120000, travelHours: 2.5 },
  ]
  const base = { crews: 4, methods, disposalSites: sites, mobilizationHours: 4 }

  it('stops work outside the daily window', () => {
    const t = Date.parse('2026-10-21T19:00:00Z')
    expect(new Date(workEnd(t, 5, 6, 16)).toISOString()).toBe('2026-10-22T08:00:00.000Z')
  })

  it('times one premises: 12,000 turkeys, 4 crews at 600 an hour, 4 hour mobilization', () => {
    const run = runDepopulation({
      ...base,
      premises: [
        { id: 'P-1', species: 'turkeys', head: 12000, presumptiveAt: '2026-10-21T15:00:00Z' },
      ],
    })
    const r = run.results[0]!
    expect(new Date(r.startMs).toISOString()).toBe('2026-10-21T19:00:00.000Z')
    expect(new Date(r.completeMs).toISOString()).toBe('2026-10-22T08:00:00.000Z')
    expect(r.hoursFromPresumptive).toBe(17)
    expect(r.withinGoal).toBe(true)
    expect(r.disposalSite).toBe('Site 2')
  })

  it('queues a second premises behind the first and misses the 24 hour goal', () => {
    const run = runDepopulation({
      ...base,
      premises: [
        { id: 'P-1', species: 'turkeys', head: 48000, presumptiveAt: '2026-10-21T15:00:00Z' },
        { id: 'P-2', species: 'turkeys', head: 48000, presumptiveAt: '2026-10-21T16:00:00Z' },
      ],
    })
    const [a, b] = run.results
    expect(b!.startMs).toBe(a!.completeMs)
    expect(a!.withinGoal).toBe(false)
    expect(b!.hoursFromPresumptive).toBeGreaterThan(a!.hoursFromPresumptive)
    expect(run.backlog[0]!.head).toBe(48000)
    expect(Math.max(...run.backlog.map((x) => x.head))).toBe(96000)
  })

  it('follows the team order and lists premises with no approved method', () => {
    const run = runDepopulation({
      ...base,
      order: ['P-2', 'P-1'],
      premises: [
        { id: 'P-1', species: 'turkeys', head: 1000, presumptiveAt: '2026-10-21T15:00:00Z' },
        { id: 'P-2', species: 'turkeys', head: 1000, presumptiveAt: '2026-10-21T15:00:00Z' },
        { id: 'P-3', species: 'goats', head: 10, presumptiveAt: '2026-10-21T15:00:00Z' },
      ],
    })
    expect(run.results.map((r) => r.id)).toEqual(['P-2', 'P-1'])
    expect(run.unscheduled).toEqual([{ id: 'P-3', reason: 'No approved method for goats.' }])
  })

  it('shares disposal sites: a full site pushes later premises to the other', () => {
    const run = runDepopulation({
      ...base,
      disposalSites: [{ id: 'Only', capacityHeadPerDay: 10000, travelHours: 0 }],
      premises: [
        { id: 'P-1', species: 'turkeys', head: 10000, presumptiveAt: '2026-10-21T15:00:00Z' },
        { id: 'P-2', species: 'turkeys', head: 10000, presumptiveAt: '2026-10-21T15:00:00Z' },
      ],
    })
    expect(
      run.results[1]!.disposalCompleteMs - run.results[0]!.disposalCompleteMs,
    ).toBeGreaterThanOrEqual(23 * 3_600_000)
  })
})

describe('vaccination capacity (worked example)', () => {
  it('limits doses by teams, checkpoints and stock', () => {
    const run = runVaccination({
      startAt: '2026-10-25T06:00:00Z',
      premises: [
        { id: 'P-1', head: 2500 },
        { id: 'P-2', head: 1500 },
      ],
      teams: 2,
      dosesPerTeamDay: 1000,
      workHoursPerDay: 10,
      vaccineStock: 3000,
      checkpointEveryDoses: 500,
      checkpointMinutes: 10,
    })
    expect(run.dosesPerDay).toBe(1935)
    expect(run.daily.map((d) => d.given)).toEqual([1935, 1065])
    expect(run.shortfall).toBe(1000)
    expect(run.premises[0]!.completeMs).not.toBeNull()
    expect(run.premises[1]!.completeMs).toBeNull()
  })

  it('counts doses needed but not given before the cold chain ends', () => {
    const run = runVaccination({
      startAt: '2026-10-25T06:00:00Z',
      premises: [{ id: 'P-1', head: 10000 }],
      teams: 1,
      dosesPerTeamDay: 500,
      vaccineStock: 10000,
      coldChainDays: 2,
      checkpointMinutes: 0,
    })
    expect(run.daily.map((d) => d.given)).toEqual([500, 500])
    expect(run.wasted).toBe(9000)
  })
})

describe('generators', () => {
  const ids = ANIMAL_GENERATORS.map((g) => g.id)
  const gen = (id: string) => ANIMAL_GENERATORS.find((g) => g.id === id)!

  it('have lowercase ids and parse empty parameters', () => {
    expect(ids).toEqual(['animal-premises-spread', 'animal-depop-capacity'])
    for (const g of ANIMAL_GENERATORS) expect(g.params.safeParse({}).success, g.id).toBe(true)
  })

  it('repeat for the same parameters and say simulated in every label', () => {
    for (const g of ANIMAL_GENERATORS) {
      const p = g.params.parse({ spread: { baseDailyProb: 0.2 } })
      const a = g.generate(p as never)
      expect(g.generate(p as never)).toEqual(a)
      for (const d of a) expect(d.label.toLowerCase(), d.id).toContain('simulated')
    }
  })

  it('write presumptive positives and depopulation completions for scoring', () => {
    const p = gen('animal-premises-spread').params.parse({
      spread: { baseDailyProb: 0.2, days: 40 },
    })
    const sets = gen('animal-premises-spread').generate(p as never)
    const events = sets.find((d) => d.id === 'animal-events')!.data as { text: string }[]
    expect(events.length).toBeGreaterThan(1)
    expect(JSON.parse(events[0]!.text).kind).toBe('presumptive_positive')
    const features = sets.find((d) => d.id === 'animal-premises')!.data as { features: unknown[] }
    expect(features.features).toHaveLength(premises.length)
    const depop = gen('animal-depop-capacity').generate(
      gen('animal-depop-capacity').params.parse({
        spread: { baseDailyProb: 0.2, days: 40 },
      }) as never,
    )
    const done = depop.find((d) => d.id === 'animal-depop-events')!.data as { text: string }[]
    expect(JSON.parse(done[0]!.text).kind).toBe('depop_complete')
  })
})
