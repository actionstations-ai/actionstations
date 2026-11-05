// The simulated governance incident (spec 0459 FR-6): deterministic, labeled simulated, facts that
// start incomplete and get corrected, a range that widens and then narrows around the final
// figure, and recovery that respects dependencies.
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: {
    getVersion: () => '0.0.1',
    getPath: () => tmpdir(),
    isPackaged: false,
    getAppPath: () => resolve('.'),
  },
  BrowserWindow: { getAllWindows: () => [] },
}))
process.env.TTX_RESOURCES = resolve('.')

const sim = await import('./simulate')
const { governanceIncidentGenerator, GOV_DATASET } = await import('./generators')
await import('./register-generators')
const { generatorIds, runGenerator } = await import('../../case-data/generators')
const { caseDir } = await import('../../case-data/store')
const { readGroundTruth, readModeledSeries } = await import('../../evaluation/metrics/inputs')

const params = (over: Record<string, unknown> = {}) => sim.GovIncidentParams.parse(over)

describe('fact timeline', () => {
  it('starts with an early fact that a later fact corrects, for every incident type', () => {
    for (const incidentType of sim.INCIDENT_TYPES) {
      const facts = sim.factTimeline(params({ incidentType }))
      const wrong = facts.filter((f) => !f.accurate)
      expect(wrong.length, incidentType).toBeGreaterThan(0)
      for (const f of wrong)
        expect(
          facts.some((g) => g.revises === f.id && g.hour > f.hour),
          `${incidentType} ${f.id}`,
        ).toBe(true)
      expect(facts.map((f) => f.hour)).toEqual([...facts.map((f) => f.hour)].sort((a, b) => a - b))
    }
  })
  it('names the number of plants the incident reaches', () => {
    const facts = sim.factTimeline(params({ plantsAffected: 4 }))
    expect(facts.some((f) => /4 plants are affected/.test(f.statement))).toBe(true)
  })
  it('includes the continuing investigation thread', () => {
    const events = sim.factEvents(params())
    expect(events.find((e) => e.kind === 'investigation_continues')!.attrs.note).toMatch(
      /does not wait for it to finish/,
    )
    expect(events.find((e) => e.kind === 'discovered')!.time).toBe('2026-10-22T11:15:00.000Z')
  })
})

describe('impact range', () => {
  it('always contains the final figure, widens when the scope is revised, then narrows', () => {
    const p = params({ financialMidpointUsdM: 10, plantsAffected: 2 })
    const r = sim.impactRange(p)
    for (const x of r) {
      expect(x.low).toBeLessThanOrEqual(10)
      expect(x.high).toBeGreaterThanOrEqual(10)
    }
    const width = (h: number) => {
      const x = r.find((y) => y.hour === h)!
      return x.high - x.low
    }
    expect(width(9)).toBeGreaterThan(width(3) * 0.9)
    expect(width(72)).toBeLessThan(width(0) / 3)
    expect(width(60)).toBeLessThan(width(24))
  })
})

describe('recovery', () => {
  it('starts a function only after its dependencies are back', () => {
    const p = params()
    const rec = new Map(sim.recoverySchedule(p).map((r) => [r.name, r]))
    for (const f of p.functions)
      for (const d of f.dependsOn)
        expect(rec.get(f.name)!.startHour).toBeGreaterThanOrEqual(rec.get(d)!.recoveredHour!)
  })
  it('recovers slower under ransomware than under data theft', () => {
    const slow = sim.recoverySchedule(params({ incidentType: 'ransomware' }))
    const fast = sim.recoverySchedule(params({ incidentType: 'data_theft' }))
    const last = (r: typeof slow) => Math.max(...r.map((x) => x.recoveredHour ?? 999))
    expect(last(slow)).toBeGreaterThan(last(fast))
  })
  it('a third party slows recovery', () => {
    const a = sim.recoverySchedule(params({ incidentType: 'cloud_outage' }))
    const b = sim.recoverySchedule(params({ incidentType: 'cloud_outage', thirdParty: true }))
    expect(Math.max(...b.map((x) => x.recoveredHour ?? 999))).toBeGreaterThan(
      Math.max(...a.map((x) => x.recoveredHour ?? 999)),
    )
  })
  it('series run from 0 to 100 percent and never fall', () => {
    const p = params()
    const t0 = Date.parse(p.startDate)
    for (const s of sim.recoverySeries(p, sim.recoverySchedule(p), t0)) {
      expect(s.points[0]!.value).toBe(0)
      const values = s.points.map((x) => x.value)
      expect(values).toEqual([...values].sort((a, b) => a - b))
    }
  })
  it('flags a function that misses its RTO', () => {
    const p = params({ incidentType: 'ransomware' })
    expect(sim.recoverySchedule(p).some((r) => !r.withinRto)).toBe(true)
  })
})

describe('parameters', () => {
  it('rejects dependencies that name an unknown function or form a cycle', () => {
    const fn = (name: string, dependsOn: string[]) => ({
      name,
      rtoHours: 4,
      workHours: 1,
      dependsOn,
    })
    expect(sim.dependenciesValid([fn('a', ['b']), fn('b', [])])).toBe(true)
    expect(sim.dependenciesValid([fn('a', ['z'])])).toBe(false)
    expect(sim.dependenciesValid([fn('a', ['b']), fn('b', ['a'])])).toBe(false)
    expect(() =>
      governanceIncidentGenerator.params.parse({ functions: [fn('a', ['b']), fn('b', ['a'])] }),
    ).toThrow(/cycle/)
  })
})

describe('generator', () => {
  it('is registered once and deterministic', () => {
    expect(generatorIds().filter((id) => id === 'governance-incident')).toHaveLength(1)
    const p = params({ seed: 11 })
    expect(JSON.stringify(governanceIncidentGenerator.generate(p))).toBe(
      JSON.stringify(governanceIncidentGenerator.generate(p)),
    )
  })
  it('labels every dataset simulated and writes data the metric readers accept', async () => {
    const root = mkdtempSync(join(tmpdir(), 'gov-gen-'))
    const manifest = await runGenerator(
      root,
      's1',
      'governance-incident',
      {},
      { maxMbPerScenario: 50 },
    )
    expect(manifest.datasets.map((d) => d.id).sort()).toEqual(Object.values(GOV_DATASET).sort())
    for (const d of manifest.datasets) {
      expect(d.label).toMatch(/simulated/)
      expect(d.provenance.origin).toBe('simulated')
    }
    const dir = caseDir(root, 's1')
    const facts = await readGroundTruth(dir, 'gov-facts.geojson')
    expect(facts.filter((e) => e.kind === 'fact').length).toBeGreaterThan(4)
    const recovered = await readGroundTruth(dir, 'gov-recovery-events.geojson')
    expect(recovered.filter((e) => e.kind === 'function_recovered').length).toBeGreaterThan(0)
    const series = await readModeledSeries(dir, 'gov-recovery-series.geojson')
    expect(series.map((s) => s.zone)).toContain('Plant scheduling')
    const impact = await readModeledSeries(dir, 'gov-impact-range.geojson')
    expect(impact.map((s) => s.quantity).sort()).toEqual(['impact_high_usd_m', 'impact_low_usd_m'])
  })
})
