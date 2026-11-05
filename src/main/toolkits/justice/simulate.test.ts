// Simulated justice events (spec 0465 FR-10): deterministic, labeled simulated, honoring the
// configured times, with a jail count recoverable from the movement log and a court outage whose
// restoration order respects dependencies.
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: { on: vi.fn(), getPath: () => tmpdir(), isPackaged: false },
  BrowserWindow: { getAllWindows: () => [], fromWebContents: () => null },
}))
process.env.TTX_RESOURCES = resolve('.')

const sim = await import('./simulate')
const { readGroundTruth } = await import('../../evaluation/metrics/inputs')
const { generatorIds } = await import('../../case-data/generators')
await import('../generator-modules')

type Gen = {
  id: string
  params: { parse(p: unknown): unknown; safeParse(p: unknown): { success: boolean } }
  generate(p: unknown): { id: string; label: string; data: unknown }[]
}
const run = (g: unknown, params: unknown = {}) => {
  const gen = g as Gen
  return gen.generate(gen.params.parse(params))
}

async function readEvents(
  datasets: { id: string; data: unknown }[],
  id: string,
): Promise<Awaited<ReturnType<typeof readGroundTruth>>> {
  const dir = mkdtempSync(join(tmpdir(), 'justice-events-'))
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, `${id}.json`), JSON.stringify(datasets.find((d) => d.id === id)!.data))
  return readGroundTruth(dir, `${id}.json`)
}

describe('all generators', () => {
  it('are registered through the shared module', () => {
    expect(generatorIds()).toEqual(expect.arrayContaining(sim.JUSTICE_GENERATORS.map((g) => g.id)))
  })

  it.each(sim.JUSTICE_GENERATORS.map((g) => [g.id, g] as const))(
    '%s is deterministic and labels its data simulated',
    (_id, g) => {
      const a = run(g)
      expect(run(g)).toEqual(a)
      for (const d of a) expect(d.label).toMatch(/simulated/)
    },
  )
})

describe('call surge', () => {
  it('writes one call and one arrival per call, and response grows when units are scarce', async () => {
    const few = await readEvents(
      run(sim.justiceCallSurgeGenerator, { calls: 30, units: 2 }),
      'justice-call-events',
    )
    const many = await readEvents(
      run(sim.justiceCallSurgeGenerator, { calls: 30, units: 30 }),
      'justice-call-events',
    )
    expect(few.filter((e) => e.kind === 'call_received')).toHaveLength(30)
    const mean = (es: typeof few) => {
      const r = es.filter((e) => e.kind === 'unit_arrival').map((e) => Number(e.attrs.responseMin))
      return r.reduce((a, b) => a + b, 0) / r.length
    }
    expect(mean(few)).toBeGreaterThan(mean(many))
  })
})

describe('incident timeline', () => {
  it('honors the configured arrival and command times', async () => {
    const events = await readEvents(
      run(sim.justiceIncidentTimelineGenerator, {
        startTime: '2026-10-28T14:00:00Z',
        firstArrivalMin: 5,
        commandNamedMin: 20,
      }),
      'justice-incident-events',
    )
    const at = (kind: string) => events.find((e) => e.kind === kind)!.time
    expect(at('first_report')).toBe('2026-10-28T14:00:00.000Z')
    expect(at('first_arrival')).toBe('2026-10-28T14:05:00.000Z')
    expect(at('command_named')).toBe('2026-10-28T14:20:00.000Z')
    expect(events.filter((e) => e.kind === 'agency_joined_unified_command')).toHaveLength(4)
  })

  it('refuses an agency that joins unified command before it arrives', () => {
    const g = sim.justiceIncidentTimelineGenerator as unknown as Gen
    expect(
      g.params.safeParse({ agencies: [{ agency: 'X', arrivalMin: 10, joinMin: 5 }] }).success,
    ).toBe(false)
  })
})

describe('jail count', () => {
  it('writes a short count that the movement log explains', async () => {
    const events = await readEvents(run(sim.justiceJailCountGenerator), 'justice-count-events')
    const unit4 = events.find((e) => e.kind === 'count_taken' && e.attrs.area === 'Housing Unit 4')!
    expect(unit4.attrs).toMatchObject({ expected: 64, counted: 62 })
    const diffs = sim.unexplainedDifferences(
      events.map((e) => ({ kind: e.kind as 'count_taken' | 'movement', attrs: e.attrs })),
    )
    expect(Object.values(diffs).every((d) => d === 0)).toBe(true)
  })

  it('leaves a difference when a move is not logged', async () => {
    const events = await readEvents(
      run(sim.justiceJailCountGenerator, {
        moves: [{ from: 'Housing Unit 4', to: 'Medical', people: 2, atMin: 8, logged: false }],
      }),
      'justice-count-events',
    )
    const diffs = sim.unexplainedDifferences(
      events.map((e) => ({ kind: e.kind as 'count_taken' | 'movement', attrs: e.attrs })),
    )
    expect(diffs['Housing Unit 4']).toBe(-2)
    expect(diffs['Medical']).toBe(2)
  })
})

describe('court outage', () => {
  it('restores in dependency order with each system down at the start', async () => {
    const events = await readEvents(run(sim.justiceCourtOutageGenerator), 'justice-court-events')
    expect(events.filter((e) => e.kind === 'system_down')).toHaveLength(4)
    const restored = events.filter((e) => e.kind === 'system_restored').map((e) => e.attrs.system)
    expect(restored).toEqual(['telephones', 'public_website', 'case_management', 'e_filing'])
  })

  it('refuses an order that restores e-filing before case management', () => {
    const g = sim.justiceCourtOutageGenerator as unknown as Gen
    expect(
      g.params.safeParse({
        restorationOrder: ['telephones', 'public_website', 'e_filing', 'case_management'],
      }).success,
    ).toBe(false)
    expect(sim.dependencyViolations(['e_filing', 'case_management'])).toEqual([
      expect.stringMatching(/E-filing cannot return before Case management system/),
    ])
  })
})

describe('evidence audit', () => {
  it('writes the configured number of discrepancies, each on a different item', async () => {
    const events = await readEvents(
      run(sim.justiceEvidenceAuditGenerator, { missing: 3, notLogged: 2 }),
      'justice-audit-events',
    )
    const items = events.filter((e) => e.kind === 'audit_discrepancy').map((e) => e.attrs.item)
    expect(items).toHaveLength(5)
    expect(new Set(items).size).toBe(5)
    expect(events.find((e) => e.kind === 'audit_complete')!.attrs).toMatchObject({
      expected: 412,
      counted: 409,
      discrepancies: 5,
    })
  })
})
