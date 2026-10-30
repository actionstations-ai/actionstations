// Live check (LIVE=1) of the regulation triggers in `msel_phase` (#426, #499) with LM Studio as
// the text provider: a phase of scenario 3 is regenerated with SEC 8-K and CIRCIA switched on, and
// every trigger the model names must be a real trigger of those regulations.
//   LIVE=1 pnpm test src/main/generate/triggers.live.test.ts
// LM Studio: LIVE_LMSTUDIO_URL (default http://127.0.0.1:1234/v1), model LIVE_LMSTUDIO_MODEL.
import { mkdtempSync, readFileSync } from 'node:fs'
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
  const { createProject, updateProject } = await import('../project/store')
  const { createScenario, saveScenario } = await import('../scenario/store')
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
  await updateProject(root, (p) => {
    p.compliance = {
      regulations: { sec_8k_105: true, circia: true },
      frameworks: {},
      modelMapping: false,
    }
  })
  const created = await createScenario(root, { title: 'Flight', brief: ScenarioBrief.parse({}) })
  const scenario = await saveScenario(
    root,
    Scenario.parse({ ...FIXTURE, id: created.id, projectId: created.projectId }),
    { by: 'user' },
  )
  return { root, scenarioId: created.id, scenario }
}

afterAll(async () => {
  if (LIVE) (await import('./deps')).setPipelineDeps(undefined)
})

describe.skipIf(!LIVE)('msel_phase with regulation triggers (live)', () => {
  it('names only real triggers of the enabled regulations', async () => {
    const { root, scenarioId, scenario } = await setup()
    const { jobs } = await import('../jobs/manager')
    const { rerunStep } = await import('./engine')
    const { getScenario } = await import('../scenario/store')
    const { enabledTriggers } = await import('./regulation-triggers-load')
    const { loadProject } = await import('../project/store')
    const phase = scenario.phases[Number(process.env.LIVE_PHASE ?? 2)]!
    const job = await jobs.wait(
      jobs.start(
        'rerun-stage',
        (ctx) =>
          rerunStep(root, scenarioId, { stage: 'msel_phase', itemId: phase.id }, undefined, ctx),
        { projectPath: root, scenarioId },
      ).id,
    )
    expect(job.status, job.error).toBe('done')
    const real = new Set(
      (await enabledTriggers(root, await loadProject(root))).map(
        (t) => `${t.regulationId}:${t.triggerId}`,
      ),
    )
    expect(real.size).toBeGreaterThan(0)
    const rows = (await getScenario(root, scenarioId)).msel.filter((r) => r.phaseId === phase.id)
    const named = rows.flatMap((r) => (r.triggers ?? []).map((t) => ({ row: r, ref: t })))
    for (const { ref } of named) expect(real.has(`${ref.regulationId}:${ref.triggerId}`)).toBe(true)
    console.log(
      `phase ${phase.title}: ${rows.length} rows, ${named.length} with triggers\n` +
        named
          .map((n) => `${n.row.id} ${JSON.stringify(n.ref)}: ${n.row.event.slice(0, 160)}`)
          .join('\n'),
    )
  }, 600_000)
})
