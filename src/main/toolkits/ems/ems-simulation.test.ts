// Triage methods, the casualty, release and call load generators (spec 0456 FR-9, Testing):
// counts match the requested mix, the method turns the generated findings into the intended
// category, the timeline is monotonic, destinations respect capability and capacity, the zone
// follows the wind, and everything is deterministic and labeled simulated.
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { createRng } from './rng'
import { simulateFindings } from './findings'
import { triage, triageJumpStart, triageSalt, triageStart, type Findings } from './triage-methods'
import { CasualtyParams, generateCasualties } from './casualties'
import { ReleaseParams, exposures, windSegments, zoneFeatures } from './release'
import { generateCallLoad } from './call-load'

vi.mock('electron', () => ({
  app: { getVersion: () => '0.0.1', getPath: () => tmpdir() },
  BrowserWindow: { getAllWindows: () => [] },
}))

const adult: Findings = {
  ageYears: 34,
  walks: false,
  breathing: true,
  respirationsPerMinute: 20,
  capillaryRefillSeconds: 1,
  radialPulse: true,
  obeysCommands: true,
  respiratoryDistress: false,
  hemorrhageControlled: true,
  lethalInjury: false,
}

describe('triage methods', () => {
  it('START: walkers are Minor, then breathing, perfusion and commands decide', () => {
    expect(triageStart({ ...adult, walks: true })).toBe('Minor')
    expect(triageStart({ ...adult, breathing: false })).toBe('Expectant')
    expect(triageStart({ ...adult, respirationsPerMinute: 31 })).toBe('Immediate')
    expect(triageStart({ ...adult, respirationsPerMinute: 30 })).toBe('Delayed')
    expect(triageStart({ ...adult, capillaryRefillSeconds: 3 })).toBe('Immediate')
    expect(triageStart({ ...adult, radialPulse: false })).toBe('Immediate')
    expect(triageStart({ ...adult, obeysCommands: false })).toBe('Immediate')
    expect(triageStart(adult)).toBe('Delayed')
  })
  it('JumpSTART uses child breathing limits', () => {
    const child = { ...adult, ageYears: 5, respirationsPerMinute: 40 }
    expect(triageJumpStart(child)).toBe('Delayed')
    expect(triageJumpStart({ ...child, respirationsPerMinute: 50 })).toBe('Immediate')
    expect(triageJumpStart({ ...child, respirationsPerMinute: 12 })).toBe('Immediate')
    expect(triage('START', { ...child, respirationsPerMinute: 40 })).toBe('Delayed')
    expect(triageStart({ ...child, respirationsPerMinute: 40 })).toBe('Immediate')
  })
  it('SALT separates deceased and expectant and checks lifesaving needs', () => {
    expect(triageSalt({ ...adult, breathing: false })).toBe('Deceased')
    expect(triageSalt({ ...adult, lethalInjury: true, obeysCommands: false })).toBe('Expectant')
    expect(triageSalt({ ...adult, hemorrhageControlled: false })).toBe('Immediate')
    expect(triageSalt({ ...adult, respiratoryDistress: true })).toBe('Immediate')
    expect(triageSalt(adult)).toBe('Delayed')
  })
  it('SALT assesses walkers too and keeps Expectant for patients who fail a check', () => {
    expect(triageSalt({ ...adult, walks: true })).toBe('Minor')
    expect(triageSalt({ ...adult, walks: true, hemorrhageControlled: false })).toBe('Immediate')
    // A patient who passes every check is Delayed or Minimal, never Expectant.
    expect(triageSalt({ ...adult, lethalInjury: true })).toBe('Delayed')
  })
})

describe('generated findings', () => {
  it.each(['START', 'SALT'] as const)(
    '%s turns the findings into the intended category',
    (method) => {
      const rng = createRng(7)
      for (let i = 0; i < 300; i++)
        for (const target of ['Immediate', 'Delayed', 'Minor', 'Expectant'] as const)
          for (const age of [4, 35])
            expect(triage(method, simulateFindings(target, method, age, rng).findings)).toBe(target)
    },
  )
})

const hospitals = [
  {
    name: 'Rook County Trauma Center',
    trauma: true,
    burn: false,
    pediatric: false,
    receiveLimit: 4,
    driveMinutes: 12,
  },
  {
    name: "Lakeshore Children's Hospital",
    trauma: true,
    burn: false,
    pediatric: true,
    receiveLimit: 6,
    driveMinutes: 25,
  },
  {
    name: 'Mercy Community Hospital',
    trauma: false,
    burn: false,
    pediatric: false,
    receiveLimit: 30,
    driveMinutes: 8,
  },
]
const base: CasualtyParams = CasualtyParams.parse({
  incident: 'Route 9 school bus collision',
  startTime: '2026-10-21T10:11:00Z',
  mix: { immediate: 4, delayed: 9, minor: 12, expectant: 3 },
  hospitals,
  ambulances: [
    { unit: 'Medic 4', arriveMinutes: 8 },
    { unit: 'Medic 9', arriveMinutes: 12 },
    { unit: 'Medic 12', arriveMinutes: 18 },
    { unit: 'Medic 15', arriveMinutes: 25 },
  ],
})

describe('casualty generator', () => {
  const r = generateCasualties(base)
  const count = (pri: string) => r.patients.filter((p) => p.priority === pri).length

  it('matches the requested mix', () => {
    expect(r.patients).toHaveLength(28)
    expect([count('Immediate'), count('Delayed'), count('Minor'), count('Expectant')]).toEqual([
      4, 9, 12, 3,
    ])
    expect(r.counts[r.counts.length - 1]).toMatchObject({
      immediate: 4,
      delayed: 9,
      minor: 12,
      expectant: 3,
    })
  })
  it('gives every patient a monotonic timeline', () => {
    for (const p of r.patients) {
      const t = [p.reachedAt, p.triagedAt, p.treatedAt, p.transportAt].map(Date.parse)
      expect(t).toEqual([...t].sort((a, b) => a - b))
    }
    expect(Date.parse(r.triageCompleteAt)).toBe(
      Math.max(...r.patients.map((p) => Date.parse(p.triagedAt))),
    )
    expect(Date.parse(r.patients[0]!.reachedAt)).toBeGreaterThanOrEqual(
      Date.parse(base.startTime) + 8 * 60_000,
    )
  })
  it('sends Immediate patients first and leaves no expectant patient behind', () => {
    const left = (pri: string) =>
      r.patients.filter((p) => p.priority === pri).map((p) => Date.parse(p.transportAt))
    expect(Math.min(...left('Immediate'))).toBeLessThanOrEqual(Math.min(...left('Delayed')))
    expect(r.patients.every((p) => p.transportAt && p.transportUnit)).toBe(true)
  })
  it('picks capable hospitals within their stated capacity', () => {
    for (const p of r.patients.filter((x) => x.priority === 'Immediate')) {
      expect(p.appropriateHospitals).toContain(p.bestDestination)
      if (p.ageYears < 8) expect(p.bestDestination).toBe("Lakeshore Children's Hospital")
    }
    for (const h of hospitals)
      expect(r.hospitalReceived[h.name] ?? 0).toBeLessThanOrEqual(h.receiveLimit)
    expect(r.patients.some((p) => p.capacityShortfall)).toBe(false)
  })
  it('keeps the trauma center free for patients who need it', () => {
    const minorsAtTrauma = r.patients.filter(
      (p) => p.priority === 'Minor' && p.bestDestination === hospitals[0]!.name,
    )
    expect(minorsAtTrauma).toHaveLength(0)
  })
  it('flags a shortfall when no capable hospital has room', () => {
    const tight = generateCasualties({
      ...base,
      mix: { immediate: 6, delayed: 0, minor: 0, expectant: 0 },
      childShare: 0,
      hospitals: [{ ...hospitals[0]!, receiveLimit: 2 }, hospitals[2]!],
    })
    expect(tight.patients.some((p) => p.capacityShortfall)).toBe(true)
  })
  it('is deterministic and changes with the seed', () => {
    expect(generateCasualties(base)).toEqual(r)
    expect(generateCasualties({ ...base, seed: 2 }).patients.map((p) => p.injuries)).not.toEqual(
      r.patients.map((p) => p.injuries),
    )
  })
  it('works for SALT too', () => {
    const salt = generateCasualties({ ...base, method: 'SALT' })
    expect(salt.patients.filter((p) => p.priority === 'Expectant')).toHaveLength(3)
    for (const p of salt.patients) expect(triage('SALT', p.findings)).toBe(p.priority)
  })
  it('asks for at least one patient', () => {
    expect(() =>
      CasualtyParams.parse({ ...base, mix: { immediate: 0, delayed: 0, minor: 0, expectant: 0 } }),
    ).toThrow(/mix/)
  })
})

const release = ReleaseParams.parse({
  incident: 'Tank car at Harlan Spur',
  material: 'Exercise material X-17 (fictional)',
  container: 'Rail tank car',
  amount: '20,000 gallons',
  distanceSource: 'fictional',
  isolationDistance: 300,
  protectiveDistance: 1500,
  unit: 'ft',
  lat: 41.5,
  lon: -81.7,
  startTime: '2026-10-21T11:00:00Z',
  durationMinutes: 120,
  wind: { fromDeg: 270, speed: 8, unit: 'mph' },
  shifts: [{ atMinutes: 20, fromDeg: 225 }],
  places: [
    { name: 'Elm Street school', bearingDeg: 90, distance: 1400 },
    { name: 'Mill Street clinic', bearingDeg: 20, distance: 1200 },
  ],
})

describe('release generator', () => {
  it('splits the wind at each shift', () => {
    const segs = windSegments(release)
    expect(segs).toHaveLength(2)
    expect(segs[0]).toMatchObject({ startMinutes: 0, endMinutes: 20, fromDeg: 270, speed: 8 })
    expect(segs[1]).toMatchObject({ startMinutes: 20, endMinutes: 120, fromDeg: 225, speed: 8 })
  })
  it('moves the protective zone with the wind shift', () => {
    const f = zoneFeatures(release).features as { properties: { zone: string; segment: number } }[]
    expect(f).toHaveLength(4)
    expect(
      f.filter((x) => x.properties.zone === 'protective_action').map((x) => x.properties.segment),
    ).toEqual([0, 1])
  })
  it('puts places in a zone only while the wind points at them', () => {
    const ex = exposures(release)
    expect(ex.filter((e) => e.place === 'Elm Street school').map((e) => e.segment)).toEqual([0])
    expect(ex.filter((e) => e.place === 'Mill Street clinic').map((e) => e.segment)).toEqual([1])
  })
  it('works out when the plume front arrives from distance and wind speed', () => {
    // 1400 ft = 426.7 m; 8 mph = 3.5763 m/s; 426.7 / 3.5763 = 119.3 s = 2.0 min.
    const school = exposures(release).find((e) => e.place === 'Elm Street school')!
    expect(school.arrivesAtMinutes).toBeCloseTo(2.0, 1)
  })
  it('gives no arrival in calm wind', () => {
    const calm = ReleaseParams.parse({
      ...release,
      wind: { fromDeg: 270, speed: 0, unit: 'mph' },
      shifts: [],
    })
    expect(exposures(calm)[0]!.arrivesAtMinutes).toBeNull()
  })
  it('needs an edition for distances entered from a guidebook', () => {
    expect(() => ReleaseParams.parse({ ...release, distanceSource: 'entered' })).toThrow(/edition/)
  })
})

describe('call load generator', () => {
  const p = {
    startTime: '2026-10-21T10:00:00Z',
    minutes: 60,
    baselinePerMinute: 0.5,
    seed: 3,
    surge: { atMinute: 20, lengthMinutes: 10, multiplier: 6 },
  }
  const r = generateCallLoad(p as never)
  it('surges when asked and is deterministic', () => {
    const mean = (a: number, b: number) =>
      r.perMinute.slice(a, b).reduce((s, m) => s + m.calls, 0) / (b - a)
    expect(mean(20, 30)).toBeGreaterThan(mean(0, 20) * 2)
    expect(generateCallLoad(p as never)).toEqual(r)
  })
  it('lists each call with a type, priority and an invented address', () => {
    expect(r.calls.length).toBe(r.perMinute.reduce((s, m) => s + m.calls, 0))
    expect(r.calls[0]).toMatchObject({
      type: expect.any(String),
      priority: expect.stringMatching(/^P\d$/),
    })
  })
})

describe('registered generators', () => {
  it('run through the framework, labeled simulated, with valid datasets', async () => {
    await import('./generators')
    const { runGenerator, generatorIds } = await import('../../case-data/generators')
    expect(generatorIds()).toEqual(
      expect.arrayContaining(['mci-casualties', 'hazmat-release', 'dispatch-call-load']),
    )
    const root = mkdtempSync(join(tmpdir(), 'ems-gen-'))
    const m = await runGenerator(root, 'scn-1', 'mci-casualties', base, { maxMbPerScenario: 50 })
    expect(m.datasets.map((d) => d.id)).toEqual([
      'mci-triage-counts',
      'mci-timeline',
      'mci-hospital-load',
      'mci-ground-truth',
    ])
    expect(
      m.datasets.every((d) => d.provenance.origin === 'simulated' && !d.provenance.retrieved),
    ).toBe(true)
    const m2 = await runGenerator(root, 'scn-2', 'hazmat-release', release, {
      maxMbPerScenario: 50,
    })
    expect(m2.datasets.map((d) => d.id)).toEqual([
      'release-zones',
      'release-wind',
      'release-exposure',
      'release-ground-truth',
    ])
    const file = join(root, 'scenarios', 'scn-2', 'case', 'release-zones.geojson')
    expect(JSON.parse(readFileSync(file, 'utf8')).type).toBe('FeatureCollection')
    await runGenerator(
      root,
      'scn-3',
      'dispatch-call-load',
      { startTime: '2026-10-21T10:00:00Z' },
      { maxMbPerScenario: 50 },
    )
  })
})

describe('ground truth for the metrics', () => {
  it('reads back as events and scores the simulated best choices as fully appropriate', async () => {
    await import('./generators')
    const { runGenerator } = await import('../../case-data/generators')
    const { readGroundTruth } = await import('../../evaluation/metrics/inputs')
    const { runMetric } = await import('../../evaluation/metrics/registry')
    const root = mkdtempSync(join(tmpdir(), 'ems-truth-'))
    await runGenerator(root, 'scn-1', 'mci-casualties', base, { maxMbPerScenario: 50 })
    const events = await readGroundTruth(
      join(root, 'scenarios', 'scn-1', 'case'),
      'mci-ground-truth.geojson',
    )
    expect(events.filter((e) => e.kind === 'patient')).toHaveLength(28)
    expect(events.filter((e) => e.kind === 'hospital')).toHaveLength(3)
    const decisions = events
      .filter((e) => e.kind === 'patient')
      .map((e) => ({
        id: e.id,
        time: e.time,
        kind: 'assign_patient_destination',
        fields: { tag_number: e.attrs.tag, hospital: e.attrs.best },
      }))
    const r = runMetric({ id: 'destination_fit', config: {} }, { events, decisions })
    expect(r.summary.find((x) => x.label === 'Share sent to a capable hospital')?.value).toBe(
      '1.000',
    )
    expect(
      r.summary.find((x) => x.label === 'Hospitals sent more than their stated limit')?.value,
    ).toBe('none')
  })
})
