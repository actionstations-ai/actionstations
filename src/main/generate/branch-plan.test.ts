// "Generate branches" (spec 0430 FR-11): the model drafts rows for every option of a decision;
// the result is a proposal checked on a scratch copy, and the saved scenario is not touched.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

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
process.env.TTX_MOCK_PROVIDERS = '1'
process.env.TTX_RESOURCES = resolve(process.cwd())

const { runBranchPlan } = await import('./branch-plan')
const { jobs } = await import('../jobs/manager')
const { resetSettingsCache } = await import('../settings/store')
const { resetResolveState } = await import('../providers/resolve')
const { setPipelineDeps } = await import('./deps')
const { FakeNciaIndex, ScriptedProvider } = await import('../../../tests/fixtures/generate/fakes')
const { createProject } = await import('../project/store')
const { createScenario, saveScenario } = await import('../scenario/store')
const { branchedScenario } = await import('@shared/branching/fixture')
const { BranchPlanResult } = await import('@shared/branching/proposal')
const { ScenarioBrief } = await import('@shared/schemas')

const row = (id: string, time: string, event: string) => ({
  id,
  time,
  from: 'Vendor',
  to: ['all'],
  event,
  expectedAction: 'Decide what to do next.',
  purposeTag: 'PRESSURE',
  format: 'text_message',
  citations: [],
})

const REPLY = {
  branches: [
    {
      optionLabel: 'Pay',
      label: 'Pay the ransom',
      rationale: 'Shows the cost of paying.',
      rows: [
        row('I-20', '1:45', 'The criminals send a key.'),
        row('I-21', '3:50', 'The key fails.'),
      ],
      rejoinRowId: 'I-16',
    },
    {
      optionLabel: 'Rebuild',
      label: 'Rebuild from backups',
      rationale: 'Shows the cost of rebuilding.',
      rows: [row('I-20', '1:45', 'The backup is eleven days old.')],
      rejoinRowId: 'no-such-row',
    },
  ],
}

async function setup(provider: InstanceType<typeof ScriptedProvider>) {
  process.env.TTX_USER_DATA = mkdtempSync(join(tmpdir(), 'ttx-ud-'))
  resetSettingsCache()
  resetResolveState()
  setPipelineDeps({
    openIndex: async () => new FakeNciaIndex(),
    resolveTextProvider: async () => ({ provider, model: 'scripted', providerId: 'scripted' }),
  })
  const parent = mkdtempSync(join(tmpdir(), 'ttx-bplan-'))
  const { path: root } = await createProject({
    parentDir: parent,
    name: 'NCIA',
    orgType: 'airport',
  })
  const created = await createScenario(root, { title: 'Fork', brief: ScenarioBrief.parse({}) })
  const b = branchedScenario()
  await saveScenario(
    root,
    {
      ...created,
      phases: [{ id: 'p1', index: 0, title: 'One', goal: 'g', startTime: '0:00', endTime: '4:00' }],
      msel: b.msel,
      branches: b.branches,
    },
    { by: 'user' },
  )
  return { root, scenarioId: created.id }
}
afterEach(() => setPipelineDeps(undefined))

const plan = (root: string, scenarioId: string, decisionRowId = 'I-10') =>
  jobs.wait(
    jobs.start(
      'generate-injects',
      (ctx) => runBranchPlan(root, scenarioId, { decisionRowId }, ctx),
      { projectPath: root, scenarioId },
    ).id,
  )

describe('runBranchPlan', () => {
  it('drafts rows for each option, suffixes ids with the branch letter and leaves scenario.json alone', async () => {
    const provider = new ScriptedProvider(() => JSON.stringify(REPLY))
    const { root, scenarioId } = await setup(provider)
    const file = join(root, 'scenarios', scenarioId, 'scenario.json')
    const before = readFileSync(file, 'utf8')
    const job = await plan(root, scenarioId)
    expect(job.status, job.error).toBe('done')
    const result = BranchPlanResult.parse(job.result)
    expect(result.branches.map((b) => b.branchId)).toEqual(['b1', 'b2'])
    const [pay, rebuild] = result.branches
    expect(pay!.rows.map((r) => r.id)).toEqual(['I-20a', 'I-21a'])
    expect(rebuild!.rows.map((r) => r.id)).toEqual(['I-20b'])
    expect(pay!.rows.every((r) => r.branchId === 'b1' && r.phaseId === 'p1')).toBe(true)
    expect(pay!.label).toBe('Pay the ransom')
    expect(readFileSync(file, 'utf8')).toBe(before)
  })

  it('keeps a valid rejoin, and falls back to the branch own rejoin when the model names a missing row', async () => {
    const provider = new ScriptedProvider(() => JSON.stringify(REPLY))
    const { root, scenarioId } = await setup(provider)
    const result = BranchPlanResult.parse((await plan(root, scenarioId)).result)
    expect(result.branches[0]!.rejoinRowId).toBe('I-16')
    expect(result.branches[1]!.rejoinRowId).toBe('I-16')
    expect(result.notes.join(' ')).toContain('no-such-row')
  })

  it('re-times a row that falls outside its branch window (decision time to rejoin time)', async () => {
    const provider = new ScriptedProvider(() => JSON.stringify(REPLY))
    const { root, scenarioId } = await setup(provider)
    const result = BranchPlanResult.parse((await plan(root, scenarioId)).result)
    const late = result.branches[0]!.rows.find((r) => r.id === 'I-21a')!
    expect(late.time).not.toBe('3:50')
    expect(result.notes.join(' ')).toContain('I-21a moved from 3:50')
  })

  it('shows the model the decision question and its options as data', async () => {
    const provider = new ScriptedProvider(() => JSON.stringify(REPLY))
    const { root, scenarioId } = await setup(provider)
    await plan(root, scenarioId)
    const user = provider.requests[0]!.messages[0]!.content
    expect(user).toContain('Pay the ransom or rebuild?')
    expect(user).toContain('<decision_state>')
  })

  it('fails without a model call for a row that has no decision', async () => {
    const provider = new ScriptedProvider(() => JSON.stringify(REPLY))
    const { root, scenarioId } = await setup(provider)
    const job = await plan(root, scenarioId, 'I-16')
    expect(job.status).toBe('error')
    expect(provider.requests).toHaveLength(0)
  })
})
