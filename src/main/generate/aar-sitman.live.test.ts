// Live checks (LIVE=1) for the `aar` (#419), `sitman` (#420) and `eeg` (#421) stages with LM Studio as the
// text provider: the shipped prompts, the scenario-3 fixture and the sample live-play log.
//   LIVE=1 pnpm test src/main/generate/aar-sitman.live.test.ts
// LM Studio: LIVE_LMSTUDIO_URL (default http://127.0.0.1:1234/v1), model LIVE_LMSTUDIO_MODEL.
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterAll, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: {
    on: vi.fn(),
    getVersion: () => '0.0.1',
    getPath: () => tmpdir(),
    getAppPath: () => process.cwd(),
    isPackaged: false,
  },
  BrowserWindow: { getAllWindows: () => [] },
}))
process.env.TTX_RESOURCES = resolve(process.cwd())

const LIVE = process.env.LIVE === '1'
const URL = process.env.LIVE_LMSTUDIO_URL ?? 'http://127.0.0.1:1234/v1'
const MODEL = process.env.LIVE_LMSTUDIO_MODEL ?? 'qwen/qwen3-30b-a3b-2507'
const FIXTURE = JSON.parse(
  readFileSync(resolve('tests/fixtures/scenarios/scenario-3.json'), 'utf8'),
) as Record<string, unknown>

async function setup() {
  process.env.TTX_USER_DATA = mkdtempSync(join(tmpdir(), 'ttx-ud-'))
  const { setPipelineDeps } = await import('./deps')
  const { createTextProvider } = await import('../providers/registry')
  const { FakeNciaIndex } = await import('../../../tests/fixtures/generate/fakes')
  const { createProject } = await import('../project/store')
  const { createScenario, saveScenario } = await import('../scenario/store')
  const { writeFacilitatorState } = await import('../facilitator/state')
  const { Scenario, ScenarioBrief } = await import('@shared/schemas')
  const provider = createTextProvider({
    id: 'lmstudio',
    kind: 'openai-compatible',
    label: 'LM Studio',
    baseUrl: URL,
    defaultModel: MODEL,
    options: {},
    enabled: true,
  })
  setPipelineDeps({
    openIndex: async () => new FakeNciaIndex(),
    resolveTextProvider: async () => ({ provider, model: MODEL, providerId: 'lmstudio' }),
  })
  const { path: root } = await createProject({
    parentDir: mkdtempSync(join(tmpdir(), 'ttx-live-')),
    name: 'NCIA',
    orgType: 'airport',
  })
  const created = await createScenario(root, { title: 'Flight', brief: ScenarioBrief.parse({}) })
  const scenario = await saveScenario(
    root,
    Scenario.parse({ ...FIXTURE, id: created.id, projectId: created.projectId }),
    { by: 'user' },
  )
  await writeFacilitatorState(root, created.id, {
    elapsedMin: 225,
    delivered: {},
    notes: { 'I-06': 'PA silenced in four minutes.', 'I-09': 'Go Dark decided in the IT room.' },
    generalNotes: 'Room started late.',
    hotwash: [],
    decisions: [],
  })
  const live = join(root, 'scenarios', created.id, 'live', 'run1')
  mkdirSync(live, { recursive: true })
  writeFileSync(
    join(live, 'log.jsonl'),
    readFileSync(resolve('tests/fixtures/live/session-scenario-3.jsonl')),
  )
  return { root, scenarioId: created.id, scenario }
}

afterAll(async () => {
  if (LIVE) (await import('./deps')).setPipelineDeps(undefined)
})

describe.skipIf(!LIVE)('aar and sitman stages with LM Studio (live)', () => {
  it('sitman: one module per phase, with questions and 3+ assumptions', async () => {
    const { root, scenarioId, scenario } = await setup()
    const { jobs } = await import('../jobs/manager')
    const { rerunStep } = await import('./engine')
    const { getScenario } = await import('../scenario/store')
    const job = await jobs.wait(
      jobs.start(
        'rerun-stage',
        (ctx) => rerunStep(root, scenarioId, { stage: 'sitman' }, undefined, ctx),
        { projectPath: root, scenarioId },
      ).id,
    )
    expect(job.status, job.error).toBe('done')
    const sitman = (await getScenario(root, scenarioId)).sitman!
    expect(sitman.modules.length).toBeGreaterThanOrEqual(scenario.phases.length - 1)
    expect(sitman.assumptions.length).toBeGreaterThanOrEqual(3)
    for (const m of sitman.modules) {
      expect(m.narrativeMd.length).toBeGreaterThan(40)
      expect(m.discussionQuestions.length).toBeGreaterThan(0)
    }
  }, 600_000)

  it('eeg: capabilities with three or more critical tasks each', async () => {
    const { root, scenarioId } = await setup()
    const { jobs } = await import('../jobs/manager')
    const { rerunStep } = await import('./engine')
    const { getScenario } = await import('../scenario/store')
    const job = await jobs.wait(
      jobs.start(
        'rerun-stage',
        (ctx) => rerunStep(root, scenarioId, { stage: 'eeg' }, undefined, ctx),
        { projectPath: root, scenarioId },
      ).id,
    )
    expect(job.status, job.error).toBe('done')
    const eegs = (await getScenario(root, scenarioId)).evaluation!.eegs
    expect(eegs.length).toBeGreaterThan(0)
    for (const e of eegs) expect(e.criticalTasks.length).toBeGreaterThanOrEqual(3)
  }, 600_000)

  it('aar: drafts an executive summary and capability analyses from the record', async () => {
    const { root, scenarioId } = await setup()
    const { jobs } = await import('../jobs/manager')
    const { draftAar } = await import('../aar/draft')
    const { readAar } = await import('../aar/store')
    const job = await jobs.wait(
      jobs.start('draft-aar', (ctx) => draftAar(root, scenarioId, {}, ctx), {
        projectPath: root,
        scenarioId,
      }).id,
    )
    expect(job.status, job.error).toBe('done')
    const aar = (await readAar(root, scenarioId))!
    expect(aar.executiveSummaryMd.length).toBeGreaterThan(100)
    expect(aar.capabilities.length).toBeGreaterThan(0)
    expect(aar.provenance[0]).toMatchObject({ stage: 'aar', status: 'ok' })
  }, 600_000)
})
