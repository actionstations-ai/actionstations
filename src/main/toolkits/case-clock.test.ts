// Every measure that reads case data compares decisions on the case clock (#1136). A session runs
// today, while a scenario's case data (historical or simulated) has its own times, so a decision's
// wall-clock time cannot be set against an event. For each field family's toolkit, one scenario
// gets case data for every measure that reads it, a session log with decisions stamped with the
// exercise clock, and the evaluation run; each measure must receive the decisions moved onto the
// case clock: the scenario's time mapping when it has one, else exercise minute 0 at the start of
// the data. One measure is also scored end to end.
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import type * as Registry from '../evaluation/metrics/registry'
import type { MetricInputBag } from '../evaluation/metrics/registry'

vi.mock('electron', () => ({
  app: { on: vi.fn(), getPath: () => tmpdir(), isPackaged: false },
  BrowserWindow: { getAllWindows: () => [], fromWebContents: () => null },
}))
process.env.TTX_RESOURCES = resolve('.')

const TOOLKIT_DIR = resolve('packs/toolkits')
const ALL_TOOLKITS = readdirSync(TOOLKIT_DIR)
  .filter((f) => f.endsWith('.json'))
  .map((f) => f.slice(0, -'.json'.length))

vi.mock('../packs/layers', async (importOriginal) => {
  const original = (await importOriginal()) as Record<string, unknown>
  const pack = {
    id: 'ai.actionstations.case-clock-test',
    version: '1.0.0',
    name: 'Every toolkit',
    dir: '',
    bundled: true,
    enabled: true,
    manifest: {
      contents: {
        templates: [],
        prompts: [],
        domains: [],
        workflows: [],
        documents: [],
        examples: [],
        regulations: [],
        frameworks: [],
        toolkits: ALL_TOOLKITS,
      },
    },
    items: [],
  }
  return {
    ...original,
    enabledPacks: () => [],
    bundledPacks: () => [pack],
    packsRevision: () => 1,
    packItemPath: (_p: unknown, _k: unknown, id: string) => join(TOOLKIT_DIR, `${id}.json`),
  }
})

// Record what each measure is given, then score it as usual.
const seen: { id: string; bag: MetricInputBag }[] = []
vi.mock('../evaluation/metrics/registry', async (importOriginal) => {
  const original = (await importOriginal()) as typeof Registry
  return {
    ...original,
    runMetric: (ref: { id: string; config?: unknown }, bag: MetricInputBag, opts: object) => {
      seen.push({ id: ref.id, bag })
      return original.runMetric(ref as never, bag, opts as never)
    },
  }
})

const { runToolkitMetrics } = await import('./metrics')
const { caseDir, writeManifest } = await import('../case-data/store')
const { createProject } = await import('../project/store')
const { createScenario, updateScenario } = await import('../scenario/store')
const { sessionFolder } = await import('../live/log-read')
const { ScenarioBrief } = await import('@shared/schemas')

// The field measures, registered as the app does at start.
for (const register of [
  (await import('./geoscience/register')).registerGeoscienceToolkits,
  (await import('./media')).registerMediaToolkit,
  (await import('./flooding')).registerFloodingToolkit,
  (await import('./weather')).registerWeatherToolkit,
  (await import('./epidemiology/register')).registerEpidemiologyToolkit,
  (await import('./ai/register')).registerAiIncidentsToolkit,
  (await import('./hospitality/register')).registerHospitalityToolkit,
  (await import('./justice/register')).registerJusticeToolkit,
  (await import('./lab_safety/register')).registerLabSafetyToolkit,
  (await import('./animal_disease/register')).registerAnimalDiseaseToolkit,
  (await import('./pharmacy/register')).registerPharmacyToolkit,
  (await import('./logistics/register')).registerLogisticsToolkit,
  (await import('./space_weather/register')).registerSpaceWeatherToolkit,
  (await import('./governance/register')).registerGovernanceToolkit,
  (await import('./human-services/register')).registerHumanServicesToolkit,
  (await import('./wildfire/register')).registerWildfireToolkit,
  (await import('./humanitarian/register')).registerHumanitarianToolkit,
  (await import('./structures/register')).registerStructuresToolkit,
])
  register()

/** The case data's own start: a past incident, years before the session. */
const CASE_START = '2019-06-01T08:00:00.000Z'
/** The session's wall clock: when the exercise is run. */
const WALL_START = '2026-11-12T15:00:00.000Z'
const SESSION = 'sess-clock'
const plus = (iso: string, min: number) => new Date(Date.parse(iso) + min * 60_000).toISOString()

interface MetricRef {
  id: string
  label?: string
  groundTruth?: string
  series?: string
}
const toolkitMetrics = (id: string): MetricRef[] =>
  (JSON.parse(readFileSync(join(TOOLKIT_DIR, `${id}.json`), 'utf8')) as { metrics?: MetricRef[] })
    .metrics ?? []
const readsCaseData = (m: MetricRef) => !!(m.groundTruth || m.series)

/** One toolkit per field family whose measures read case data. */
const FAMILIES: [family: string, toolkit: string][] = [
  ['AI incidents', 'ai_incidents'],
  ['animal disease', 'animal_disease'],
  ['human services: crisis lines', 'crisis_line'],
  ['earth sciences: debris flow', 'debris_flow'],
  ['public health: epidemiology', 'epidemiology'],
  ['meteorology: flooding', 'flooding'],
  ['corporate governance', 'governance'],
  ['hospitality: guest emergencies', 'guest_emergency'],
  ['hazardous materials', 'hazmat'],
  ['humanitarian response', 'humanitarian'],
  ['criminal justice', 'justice'],
  ['laboratory safety', 'lab_safety'],
  ['logistics', 'logistics'],
  ['human services: mass care', 'mass_care'],
  ['EMS: mass-casualty triage', 'mci_triage'],
  ['media environment', 'media_environment'],
  ['hospitality: outbreak at sea', 'outbreak_at_sea'],
  ['pharmacy', 'pharmacy'],
  ['human services: reunification', 'reunification_child_welfare'],
  ['earth sciences: seismic', 'seismic'],
  ['space weather', 'space_weather'],
  ['environmental response: spills', 'spill_plume'],
  ['structures', 'structures'],
  ['earth sciences: tsunami', 'tsunami'],
  ['earth sciences: volcanic', 'volcanic'],
  ['wildfire', 'wildfire'],
]

async function scenarioWith(toolkit: string, timeMapping?: object) {
  process.env.TTX_USER_DATA = mkdtempSync(join(tmpdir(), 'ttx-ud-'))
  const parent = mkdtempSync(join(tmpdir(), 'ttx-clock-'))
  const { path: root } = await createProject({ parentDir: parent, name: 'Case clock' })
  const s = await createScenario(root, {
    title: toolkit,
    brief: ScenarioBrief.parse({ userPrompt: 'A test of the case clock.' }),
  })
  await updateScenario(root, s.id, (x) => void (x.toolkits = [toolkit]), { by: 'user' })
  const ids = new Map<string, 'events' | 'series'>()
  for (const m of toolkitMetrics(toolkit)) {
    if (m.groundTruth) ids.set(m.groundTruth, 'events')
    if (m.series) ids.set(m.series, 'series')
  }
  const dir = caseDir(root, s.id)
  mkdirSync(dir, { recursive: true })
  const datasets = [...ids].map(([id, shape]) => {
    const file = `${id}.json`
    const body =
      shape === 'events'
        ? [{ id: `${id}-1`, time: plus(CASE_START, 30), kind: 'case_event', attrs: {} }]
        : [{ zone: 'Zone A', quantity: 'level', points: [{ time: CASE_START, value: 1 }] }]
    writeFileSync(join(dir, file), JSON.stringify(body))
    return {
      id,
      kind: 'series' as const,
      label: id,
      provenance: { origin: 'historical' as const, source: 'test', retrieved: WALL_START },
      range: { start: CASE_START, end: plus(CASE_START, 600) },
      file,
      shape: shape === 'events' ? ('ground-truth' as const) : ('modeled-series' as const),
    }
  })
  await writeManifest(root, s.id, {
    version: 1,
    datasets,
    ...(timeMapping ? { timeMapping } : {}),
  } as never)
  return { root, scenarioId: s.id }
}

/** A decision as the live log records it: wall-clock time, exercise clock, form fields. */
function logged(i: number, kind: string, exMin: number, fields: Record<string, unknown> = {}) {
  const hmm = `${Math.floor(exMin / 60)}:${String(exMin % 60).padStart(2, '0')}`
  return {
    i,
    at: plus(WALL_START, exMin),
    ex: hmm,
    kind: 'decision.submitted',
    actor: { kind: 'controller' },
    data: { structured: { id: `d${i}`, time: plus(WALL_START, exMin), kind, fields } },
  }
}

function writeLog(root: string, scenarioId: string, entries: object[]) {
  const dir = sessionFolder(root, scenarioId, SESSION)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'log.jsonl'), entries.map((e) => JSON.stringify(e)).join('\n') + '\n')
}

describe('measures that read case data compare decisions on the case clock', () => {
  it('covers every toolkit whose measures read case data', () => {
    const covered = new Set(FAMILIES.map(([, t]) => t))
    const reading = ALL_TOOLKITS.filter((t) => toolkitMetrics(t).some(readsCaseData))
    expect(reading.filter((t) => !covered.has(t))).toEqual([])
  })

  it.each(FAMILIES)('%s (%s)', async (_family, toolkit) => {
    const { root, scenarioId } = await scenarioWith(toolkit)
    // Recorded at exercise 0:20; the second gives its own time, 0:45, on the form.
    writeLog(root, scenarioId, [
      logged(1, 'any_decision', 20),
      logged(2, 'any', 25, { time: '0:45' }),
    ])
    seen.length = 0
    await runToolkitMetrics(root, scenarioId, { sessionId: SESSION })
    const reading = toolkitMetrics(toolkit).filter(readsCaseData)
    const given = seen.filter((s) => reading.some((m) => m.id === s.id))
    expect(given.length).toBeGreaterThanOrEqual(reading.length)
    for (const { bag } of given)
      expect(bag.decisions?.map((d) => d.time)).toEqual([
        plus(CASE_START, 20),
        plus(CASE_START, 45),
      ])
  })

  it("follows the scenario's time mapping: offset, speed and jumps", async () => {
    const { root, scenarioId } = await scenarioWith('tsunami', {
      caseStart: CASE_START,
      startOffsetMin: 60,
      speed: 2,
      jumps: [{ atMin: 30, skipMin: 120 }],
    })
    writeLog(root, scenarioId, [logged(1, 'issue_tsunami_message', 10), logged(2, 'x', 40)])
    seen.length = 0
    await runToolkitMetrics(root, scenarioId, { sessionId: SESSION })
    const bag = seen.find((s) => s.id === 'decision_timing')!.bag
    // 60 + 10×2 = 80 case minutes; 60 + 40×2 + 120 skipped = 260.
    expect(bag.decisions?.map((d) => d.time)).toEqual([plus(CASE_START, 80), plus(CASE_START, 260)])
  })

  it('scores a decision against a case event by exercise time, not by the date it was played', async () => {
    const { root, scenarioId } = await scenarioWith('tsunami')
    const dir = caseDir(root, scenarioId)
    // The first wave is observed 30 case minutes in; the message goes out at exercise 0:20.
    writeFileSync(
      join(dir, 'sim-tsunami-events.json'),
      JSON.stringify([
        { id: 'w1', time: plus(CASE_START, 30), kind: 'first_wave_observed', attrs: {} },
      ]),
    )
    writeLog(root, scenarioId, [logged(1, 'issue_tsunami_message', 20)])
    const run = await runToolkitMetrics(root, scenarioId, { sessionId: SESSION })
    const timing = run.results.find((r) => r.metricId === 'decision_timing')!
    expect(timing.data).toMatchObject({ hits: 1, misses: 0, falseAlarms: 0 })
  })

  it('leaves decisions on the session clock for a measure that reads no case data', async () => {
    const { root, scenarioId } = await scenarioWith('dispatch')
    writeLog(root, scenarioId, [logged(1, 'any', 20)])
    seen.length = 0
    await runToolkitMetrics(root, scenarioId, { sessionId: SESSION })
    const bag = seen.find((s) => s.id === 'accountability')!.bag
    expect(bag.decisions?.map((d) => d.time)).toEqual([plus(WALL_START, 20)])
  })
})
