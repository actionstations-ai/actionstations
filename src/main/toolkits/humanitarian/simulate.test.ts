// The humanitarian simulations (#913): deterministic, labeled simulated, valid case data, and
// each behaves as its description says (3W coverage responds to partner reports, the pipeline
// break date matches stock and consumption, arrivals match the configured rate).
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { GroundTruthEvent, ModeledSeries } from '@shared/schemas/metrics'
import { generatorIds, runGenerator } from '../../case-data/generators'
import './register-generators'
import {
  ArrivalsParams,
  HUMANITARIAN_GENERATORS,
  PipelineParams,
  ThreeWParams,
  simulateArrivals,
  simulatePipeline,
  simulateThreeW,
} from './simulate'

const gen = (id: string) => HUMANITARIAN_GENERATORS.find((g) => g.id === id)!
const run = (id: string, params: unknown = {}) => {
  const g = gen(id)
  return g.generate(g.params.parse(params))
}

describe('registration', () => {
  it('registers every generator through the shared module', () => {
    expect(generatorIds()).toEqual(expect.arrayContaining(HUMANITARIAN_GENERATORS.map((g) => g.id)))
  })
})

describe.each(HUMANITARIAN_GENERATORS.map((g) => g.id))('%s', (id) => {
  it('is deterministic and its datasets validate as the shape they claim', () => {
    expect(JSON.stringify(run(id))).toBe(JSON.stringify(run(id)))
    for (const d of run(id)) {
      expect(d.label.length).toBeGreaterThan(5)
      if (d.shape === 'ground-truth') for (const e of d.data as unknown[]) GroundTruthEvent.parse(e)
      if (d.shape === 'modeled-series') for (const s of d.data as unknown[]) ModeledSeries.parse(s)
    }
  })

  it('writes through the framework with origin simulated and no retrieval date', async () => {
    const root = mkdtempSync(join(tmpdir(), 'hum-sim-'))
    const manifest = await runGenerator(root, 'scn1', id, {}, { maxMbPerScenario: 50 })
    for (const d of manifest.datasets) {
      expect(d.provenance.origin).toBe('simulated')
      expect(d.provenance.generator).toBe(id)
      expect(d.provenance.retrieved).toBeUndefined()
    }
  })
})

describe('arrivals', () => {
  it('averages near the configured rate and builds a backlog when registration is slower', () => {
    const rows = simulateArrivals(
      ArrivalsParams.parse({ days: 60, surgeDays: 0, arrivalsPerDay: 800 }),
    )
    const mean = rows.reduce((s, r) => s + r.arrivals, 0) / rows.length
    expect(mean).toBeGreaterThan(740)
    expect(mean).toBeLessThan(860)
    const slow = simulateArrivals(ArrivalsParams.parse({ registrationPerDay: 400, days: 10 }))
    expect(slow.at(-1)!.backlog).toBeGreaterThan(slow[0]!.backlog)
  })
  it('writes a registration backlog event only when the threshold is crossed', () => {
    const events = run('humanitarian-arrivals', { registrationPerDay: 300 })[1]!.data as {
      kind: string
    }[]
    expect(events[0]!.kind).toBe('registration_backlog')
    expect(run('humanitarian-arrivals', { registrationPerDay: 99_000 })[1]!.data).toEqual([])
  })
})

describe('3W reporting', () => {
  it('coverage rises as partners report and gap events are the cells nobody works in', () => {
    const [, gaps, coverage] = run('humanitarian-3w', { presence: 0.15 })
    const series = coverage!.data as { zone: string; points: { value: number }[] }[]
    for (const s of series) {
      const v = s.points.map((p) => p.value)
      expect(v).toEqual([...v].sort((a, b) => a - b))
    }
    const empty = series.filter((s) => s.points.at(-1)!.value === 0).map((s) => s.zone)
    expect((gaps!.data as { attrs: { gap: string } }[]).map((e) => e.attrs.gap).sort()).toEqual(
      empty
        .map((z) => z.replace(' / ', ' / '))
        .map((z) => z.split(' / ').reverse().join(' / '))
        .sort(),
    )
  })
  it('more partners reporting means fewer gaps', () => {
    const few = simulateThreeW(ThreeWParams.parse({ partners: 1, presence: 0.2 }))
    const many = simulateThreeW(ThreeWParams.parse({ partners: 8, presence: 0.2 }))
    const gaps = (r: typeof few) => r.cells.filter((c) => c.mine.length === 0).length
    expect(gaps(many)).toBeLessThan(gaps(few))
  })
})

describe('pipeline', () => {
  it('puts the break date where stock and consumption say, and the order day a lead time before', () => {
    const sim = simulatePipeline(PipelineParams.parse({}))
    expect(sim.brk).toBeCloseTo(12 + (420 - 12 * 28 + 200) / 28, 6)
    expect(sim.lastOrder).toBeCloseTo(sim.brk! - 21, 6)
    const events = run('humanitarian-pipeline')[2]!.data as {
      kind: string
      attrs: { day: number }
    }[]
    expect(events.find((e) => e.kind === 'pipeline_break')!.attrs.day).toBeCloseTo(sim.brk!, 6)
  })
  it('a customs hold on the first shipment moves the break earlier', () => {
    const base = simulatePipeline(PipelineParams.parse({ shipments: [{ day: 12, quantity: 200 }] }))
    const held = simulatePipeline(
      PipelineParams.parse({
        shipments: [{ day: 12, quantity: 200 }],
        customsHoldShipmentIndex: 0,
        holdDays: 10,
      }),
    )
    expect(held.brk!).toBeLessThan(base.brk!)
    const out = run('humanitarian-pipeline', { customsHoldShipmentIndex: 0, holdDays: 10 })
    expect((out[2]!.data as { kind: string }[]).map((e) => e.kind)).toContain('customs_hold')
  })
  it('stock series ends at zero when the pipeline breaks', () => {
    const stock = run('humanitarian-pipeline')[0]!.data as { v: number }[]
    expect(stock[0]!.v).toBe(420)
    expect(stock.at(-1)!.v).toBeGreaterThanOrEqual(0)
  })
})

describe('outbreak and threat', () => {
  it('an outbreak writes a first report before the declaration threshold', () => {
    const events = run('humanitarian-camp-outbreak', { seed: 3 })[1]!.data as {
      kind: string
      time: string
    }[]
    const t = (k: string) => Date.parse(events.find((e) => e.kind === k)!.time)
    expect(t('first_report')).toBeLessThanOrEqual(t('declaration_threshold'))
  })
  it('the threat level rises from 0 to 3 at the stated hours', () => {
    const [series, events] = run('humanitarian-security-threat', {
      onsetHours: 6,
      escalationHours: 8,
    })
    const pts = (series!.data as { points: { value: number }[] }[])[0]!.points
    expect(pts[0]!.value).toBe(0)
    expect(pts[6]!.value).toBe(1)
    expect(pts[14]!.value).toBe(3)
    expect((events!.data as { kind: string }[]).map((e) => e.kind)).toEqual([
      'threat_onset',
      'threat_serious',
    ])
  })
  it('keeps the files readable as JSON', () => {
    const root = mkdtempSync(join(tmpdir(), 'hum-file-'))
    expect(() => readFileSync(join(root, 'none'))).toThrow()
  })
})
